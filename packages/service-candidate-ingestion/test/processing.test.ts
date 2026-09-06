import type { CandidateRepositoryPort, DedupStrategyResult } from '@trapmap/backend-core';
import type { CandidateCorpusReadPort, CandidateSubmission } from '@trapmap/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  CANDIDATE_PROCESSING_TASK_TYPE,
  createCandidateProcessingHandler,
  createCandidateProcessingRuntime,
  processCandidate,
  recoverInterruptedCandidates,
} from '../src/processing.js';

function candidate(status: CandidateSubmission['status'] = 'received'): CandidateSubmission {
  return {
    id: 'candidate-1',
    sourceType: 'trap',
    submittedBy: 'user-1',
    teamId: 'team-1',
    status,
    originalPayload: {
      trap: {
        scope: 'project',
        shortcut: 'Avoid nested loops',
        detail: 'Prefer map for collection transforms.',
        labels: ['performance'],
      },
    },
    analysisSnapshot: null,
    duplicateCase: null,
    receivedAt: '2026-07-17T00:00:00.000Z',
    queuedAt: null,
    analyzingAt: null,
    completedAt: null,
    lastError: null,
    retryCount: 0,
    manualResult: null,
  };
}

function repository(record = candidate()): CandidateRepositoryPort {
  return {
    insert: vi.fn(),
    getById: vi.fn(async () => record),
    updateStatus: vi.fn(async (_id, status, error) => {
      record.status = status;
      record.lastError = error ?? null;
    }),
    attachAnalysis: vi.fn(async (_id, snapshot) => {
      record.analysisSnapshot = snapshot;
    }),
    attachDuplicateCase: vi.fn(async (_id, duplicateCase) => {
      record.duplicateCase = duplicateCase;
    }),
    attachManualResult: vi.fn(),
    listByStatus: vi.fn(async (status) => (record.status === status ? [record] : [])),
    markResolved: vi.fn(),
    findByFingerprint: vi.fn(),
  };
}

const noMatches: CandidateCorpusReadPort = {
  listApprovedTraps: async () => [],
  listApprovedSkills: async () => [],
};

describe('candidate owner processing', () => {
  it('processes an actionable candidate through owner-local duplicate analysis', async () => {
    const repo = repository();

    await processCandidate('candidate-1', {
      candidateRepo: repo,
      corpus: noMatches,
      now: () => '2026-07-17T00:01:00.000Z',
      createId: () => 'duplicate-1',
    });

    expect(repo.updateStatus).toHaveBeenNthCalledWith(1, 'candidate-1', 'queued');
    expect(repo.updateStatus).toHaveBeenNthCalledWith(2, 'candidate-1', 'analyzing');
    expect(repo.attachAnalysis).toHaveBeenCalledOnce();
    expect(repo.updateStatus).toHaveBeenLastCalledWith('candidate-1', 'ready_for_review');
  });

  it('routes duplicate detection through the injected D8 dedupStrategy port', async () => {
    const repo = repository();
    const detect = vi.fn(
      async (): Promise<DedupStrategyResult> => ({
        duplicateCase: null,
        analysisSnapshot: {
          normalizedAt: '2026-07-17T00:01:00.000Z',
          fingerprint: 'a'.repeat(64),
          keywords: ['loop'],
          tokens: ['loop'],
        },
        strategy: 'rule',
      }),
    );

    await processCandidate('candidate-1', {
      candidateRepo: repo,
      corpus: noMatches,
      now: () => '2026-07-17T00:01:00.000Z',
      createId: () => 'duplicate-1',
      dedupStrategy: { detect },
    });

    expect(detect).toHaveBeenCalledOnce();
    const input = detect.mock.calls[0]![0] as {
      candidate: CandidateSubmission;
      corpus: CandidateCorpusReadPort;
    };
    expect(input.candidate.id).toBe('candidate-1');
    expect(input.corpus).toBe(noMatches);
    expect(repo.attachAnalysis).toHaveBeenCalledOnce();
    expect(repo.updateStatus).toHaveBeenLastCalledWith('candidate-1', 'ready_for_review');
  });

  it('re-enqueues interrupted work once after restart', async () => {
    const queued = candidate('queued');
    const analyzing = candidate('analyzing');
    analyzing.id = 'candidate-2';
    const repo = repository(queued);
    vi.mocked(repo.listByStatus).mockImplementation(async (status) =>
      status === 'queued' ? [queued] : status === 'analyzing' ? [analyzing] : [],
    );
    const enqueue = vi.fn(async () => undefined);

    await expect(recoverInterruptedCandidates({ candidateRepo: repo, enqueue })).resolves.toEqual({
      recovered: 2,
      errors: 0,
    });

    expect(repo.updateStatus).toHaveBeenCalledWith(
      'candidate-1',
      'received',
      'Candidate worker restart recovery',
    );
    expect(enqueue).toHaveBeenCalledWith(
      CANDIDATE_PROCESSING_TASK_TYPE,
      { candidateId: 'candidate-2', retryCount: 0 },
      { dedupeKey: 'candidate-2', maxAttempts: 3 },
    );
  });

  it('marks a dead-lettered candidate as a terminal owner error', async () => {
    const repo = repository();
    const handler = createCandidateProcessingHandler({
      candidateRepo: repo,
      corpus: noMatches,
      now: () => '2026-07-17T00:01:00.000Z',
      createId: () => 'duplicate-1',
    });

    await handler.onDead?.({
      id: 'task-1',
      type: CANDIDATE_PROCESSING_TASK_TYPE,
      payload: { candidateId: 'candidate-1', retryCount: 2 },
    });

    expect(repo.updateStatus).toHaveBeenCalledWith(
      'candidate-1',
      'error',
      'Candidate processing exhausted retries',
    );
  });

  it('registers one owner handler and stops its transport consumer gracefully', async () => {
    const repo = repository();
    const run = vi.fn(async () => undefined);
    const stop = vi.fn(async () => undefined);
    const createConsumer = vi.fn(async () => ({
      run,
      stop,
      isRunning: () => true,
      ownsWork: () => true,
    }));
    const runtime = createCandidateProcessingRuntime({
      candidateRepo: repo,
      corpus: noMatches,
      now: () => '2026-07-17T00:01:00.000Z',
      createId: () => 'duplicate-1',
      queue: {
        enqueue: vi.fn(async () => undefined),
        createConsumer,
      },
    });

    await runtime.start();
    await runtime.close();

    expect(createConsumer).toHaveBeenCalledWith(
      expect.objectContaining({
        ownsWork: true,
        handlers: [expect.objectContaining({ type: CANDIDATE_PROCESSING_TASK_TYPE })],
      }),
    );
    expect(run).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });
});
