import type { CandidateRepositoryPort, TaskHandler, TaskQueuePort } from '@trapmap/backend-core';
import type { CandidateCorpusReadPort, CandidateProcessingPayload } from '@trapmap/contracts';

import { buildNormalizedDuplicateInput, createCandidateDuplicateDetector } from './domain/index.js';

export const CANDIDATE_PROCESSING_TASK_TYPE = 'candidate_processing' as const;
const MAX_PROCESSING_ATTEMPTS = 3;

export interface CandidateProcessingDeps {
  candidateRepo: CandidateRepositoryPort;
  corpus: CandidateCorpusReadPort;
  now(): string;
  createId(): string;
  logger?: {
    error(payload: unknown, message: string): void;
  };
}

export interface CandidateRecoveryDeps {
  candidateRepo: CandidateRepositoryPort;
  enqueue(
    type: typeof CANDIDATE_PROCESSING_TASK_TYPE,
    payload: CandidateProcessingPayload,
    options: { dedupeKey: string; maxAttempts: number },
  ): Promise<unknown>;
  logger?: CandidateProcessingDeps['logger'];
}

export interface CandidateProcessingRuntimeDeps extends CandidateProcessingDeps {
  queue: Pick<TaskQueuePort, 'enqueue' | 'createConsumer'>;
  ownsWork?: boolean;
}

export interface CandidateProcessingRuntime {
  start(): Promise<void>;
  close(): Promise<void>;
}

function isActionable(status: string): boolean {
  return status === 'received' || status === 'queued' || status === 'error';
}

export async function processCandidate(
  candidateId: string,
  deps: CandidateProcessingDeps,
): Promise<void> {
  const candidate = await deps.candidateRepo.getById(candidateId);
  if (!candidate) throw new Error(`Candidate ${candidateId} not found`);
  if (!isActionable(candidate.status)) return;

  try {
    await deps.candidateRepo.updateStatus(candidateId, 'queued');
    await deps.candidateRepo.updateStatus(candidateId, 'analyzing');

    const normalized = buildNormalizedDuplicateInput(candidate);
    const result = await createCandidateDuplicateDetector(deps.corpus, {
      now: deps.now,
      createId: deps.createId,
    })(candidate, normalized);

    await deps.candidateRepo.attachAnalysis(candidateId, result.analysisSnapshot);
    if (result.duplicateCase) {
      await deps.candidateRepo.attachDuplicateCase(candidateId, result.duplicateCase);
    }
    await deps.candidateRepo.updateStatus(
      candidateId,
      result.duplicateCase ? 'duplicate_detected' : 'ready_for_review',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Candidate processing failed';
    await deps.candidateRepo.updateStatus(candidateId, 'error', message);
    throw error;
  }
}

export function createCandidateProcessingHandler(
  deps: CandidateProcessingDeps,
): TaskHandler<CandidateProcessingPayload> {
  return {
    type: CANDIDATE_PROCESSING_TASK_TYPE,
    async handle(task) {
      await processCandidate(task.payload.candidateId, deps);
    },
    async onDead(task) {
      const candidateId = task.payload.candidateId;
      deps.logger?.error({ candidateId }, 'Candidate processing dead-lettered');
      await deps.candidateRepo.updateStatus(
        candidateId,
        'error',
        'Candidate processing exhausted retries',
      );
    },
  };
}

export function createCandidateProcessingRuntime(
  deps: CandidateProcessingRuntimeDeps,
): CandidateProcessingRuntime {
  let consumer: Awaited<ReturnType<NonNullable<TaskQueuePort['createConsumer']>>> | null = null;
  const ownsWork = deps.ownsWork ?? true;

  return {
    async start() {
      if (consumer) return;
      if (!deps.queue.createConsumer) {
        throw new Error('Candidate task transport does not support consumers');
      }
      const handler = createCandidateProcessingHandler(deps);
      consumer = await deps.queue.createConsumer({
        handlers: [handler as TaskHandler<unknown>],
        ownsWork,
      });
      await recoverInterruptedCandidates({
        candidateRepo: deps.candidateRepo,
        enqueue: (type, payload, options) => deps.queue.enqueue(type, payload, options),
        ...(deps.logger ? { logger: deps.logger } : {}),
      });
      if (ownsWork) void consumer.run();
    },
    async close() {
      await consumer?.stop();
      consumer = null;
    },
  };
}

export async function recoverInterruptedCandidates(
  deps: CandidateRecoveryDeps,
): Promise<{ recovered: number; errors: number }> {
  const [queued, analyzing] = await Promise.all([
    deps.candidateRepo.listByStatus('queued'),
    deps.candidateRepo.listByStatus('analyzing'),
  ]);
  const candidates = new Map(
    [...queued, ...analyzing].map((candidate) => [candidate.id, candidate]),
  );
  let recovered = 0;
  let errors = 0;

  for (const candidate of candidates.values()) {
    try {
      await deps.candidateRepo.updateStatus(
        candidate.id,
        'received',
        'Candidate worker restart recovery',
      );
      await deps.enqueue(
        CANDIDATE_PROCESSING_TASK_TYPE,
        { candidateId: candidate.id, retryCount: 0 },
        { dedupeKey: candidate.id, maxAttempts: MAX_PROCESSING_ATTEMPTS },
      );
      recovered += 1;
    } catch (error) {
      errors += 1;
      deps.logger?.error(
        {
          candidateId: candidate.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Candidate restart recovery failed',
      );
    }
  }

  return { recovered, errors };
}
