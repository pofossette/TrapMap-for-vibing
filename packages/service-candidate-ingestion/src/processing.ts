import type {
  CandidateRepositoryPort,
  DedupStrategyPort,
  TaskHandler,
  TaskQueuePort,
} from '@trapmap/backend-core';
import {
  buildNormalizedDuplicateInput,
  DEAD_LETTER_MESSAGE,
  isActionableCandidateStatus,
  isInterruptedCandidateStatus,
  MAX_PROCESSING_ATTEMPTS,
  RECOVERY_REASON,
  RECOVERY_STATUS,
  statusAfterAnalysis,
} from '@trapmap/backend-core';
import type { CandidateCorpusReadPort, CandidateProcessingPayload } from '@trapmap/contracts';
import { getGoAcceleratorClient } from '@trapmap/infra/go-accelerator/client.js';
import { dedupFingerprintWithFallback } from '@trapmap/infra/go-accelerator/fallback.js';
import { createRuleDedupStrategy } from './dedup-strategy/rule-dedup-strategy.js';

export const CANDIDATE_PROCESSING_TASK_TYPE = 'candidate_processing' as const;

export interface CandidateProcessingDeps {
  candidateRepo: CandidateRepositoryPort;
  corpus: CandidateCorpusReadPort;
  now(): string;
  createId(): string;
  /**
   * D8 dedup-strategy judgment port (design D8 call-site migration).
   * When absent the rule implementation is used with the caller's
   * now/createId — behavior identical to the pre-contract detector.
   */
  dedupStrategy?: DedupStrategyPort;
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

export async function processCandidate(
  candidateId: string,
  deps: CandidateProcessingDeps,
): Promise<void> {
  const candidate = await deps.candidateRepo.getById(candidateId);
  if (!candidate) throw new Error(`Candidate ${candidateId} not found`);
  if (!isActionableCandidateStatus(candidate.status)) return;

  try {
    await deps.candidateRepo.updateStatus(candidateId, 'queued');
    await deps.candidateRepo.updateStatus(candidateId, 'analyzing');

    let normalized = buildNormalizedDuplicateInput(candidate);
    // Go-accelerated fingerprint (distributed only): try Go for sha256 parts, fallback to JS pure.
    // Host-local stays JS (client disabled) → zero Go dependency.
    const goClient = getGoAcceleratorClient();
    if (goClient.isEnabled) {
      try {
        const parts =
          candidate.sourceType === 'trap' && candidate.originalPayload.trap
            ? [
                candidate.originalPayload.trap.shortcut.trim(),
                candidate.originalPayload.trap.detail.trim(),
                ...[...candidate.originalPayload.trap.labels].sort(),
              ]
            : candidate.originalPayload.skill
              ? [...candidate.originalPayload.skill.files]
                  .sort((a, b) => a.path.localeCompare(b.path))
                  .map((file) => file.sha256)
              : [];
        if (parts.length > 0) {
          const fp = await dedupFingerprintWithFallback(parts, goClient);
          if (fp && fp !== normalized.fingerprint) {
            normalized = { ...normalized, fingerprint: fp };
          }
        }
      } catch {
        // fallback already handled
      }
    }
    // D8 dedup-strategy call-site migration: duplicate detection goes through
    // the judgment port. The rule default wraps the pre-contract detector with
    // the caller's now/createId, so the outcome is unchanged; an llm/hybrid
    // variant can be injected by the host without touching this pipeline.
    const dedupStrategy =
      deps.dedupStrategy ?? createRuleDedupStrategy({ now: deps.now, createId: deps.createId });
    const result = await dedupStrategy.detect({
      candidate,
      normalized,
      corpus: deps.corpus,
    });

    await deps.candidateRepo.attachAnalysis(candidateId, result.analysisSnapshot);
    if (result.duplicateCase) {
      await deps.candidateRepo.attachDuplicateCase(candidateId, result.duplicateCase);
    }
    await deps.candidateRepo.updateStatus(
      candidateId,
      statusAfterAnalysis(Boolean(result.duplicateCase)),
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
      await deps.candidateRepo.updateStatus(candidateId, 'error', DEAD_LETTER_MESSAGE);
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
    [...queued, ...analyzing]
      .filter((candidate) => isInterruptedCandidateStatus(candidate.status))
      .map((candidate) => [candidate.id, candidate]),
  );
  let recovered = 0;
  let errors = 0;

  for (const candidate of candidates.values()) {
    try {
      await deps.candidateRepo.updateStatus(candidate.id, RECOVERY_STATUS, RECOVERY_REASON);
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
