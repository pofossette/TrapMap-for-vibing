import type { CandidateSubmission } from '@trapmap/contracts';
import type { StoreData } from '@trapmap/server/lib/store.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CandidateProcessorServices } from './processor.js';
import type { CandidateRepository } from './repository.js';

// Mock dependencies before importing the module under test
vi.mock('./detector.js', () => ({
  detectDuplicates: vi.fn(),
}));

vi.mock('./fingerprint.js', () => ({
  computeCandidateFingerprint: vi.fn(),
}));

vi.mock('./pg-detector.js', () => ({
  createPgDuplicateDetector: vi.fn(),
}));

import { detectDuplicates } from './detector.js';
import { computeCandidateFingerprint } from './fingerprint.js';
import { createPgDuplicateDetector } from './pg-detector.js';
import {
  CANDIDATE_PROCESSING_TASK_TYPE,
  createCandidateProcessingHandler,
  processCandidate,
  processCandidateWithRetry,
  processPendingCandidates,
  scheduleCandidateProcessing,
} from './processor.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandidate(overrides: Partial<CandidateSubmission> = {}): CandidateSubmission {
  return {
    id: 'cand_1',
    sourceType: 'trap',
    submittedBy: 'user_1',
    teamId: 'team_1',
    status: 'received',
    originalPayload: {
      trap: {
        scope: 'project',
        labels: ['testing'],
        shortcut: 'Avoid nested loops',
        detail: 'Use map or forEach instead of nested for loops',
      },
    },
    analysisSnapshot: null,
    duplicateCase: null,
    receivedAt: '2024-01-01T00:00:00.000Z',
    queuedAt: null,
    analyzingAt: null,
    completedAt: null,
    lastError: null,
    retryCount: 0,
    manualResult: null,
    ...overrides,
  };
}

function makeSkillCandidate(overrides: Partial<CandidateSubmission> = {}): CandidateSubmission {
  return {
    id: 'cand_skill_1',
    sourceType: 'skill',
    submittedBy: 'user_1',
    teamId: 'team_1',
    status: 'received',
    originalPayload: {
      skill: {
        files: [
          {
            path: 'index.ts',
            sha256: 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
            sizeBytes: 100,
            mediaType: 'text/typescript',
          },
        ],
        metadata: {
          title: 'My Skill',
          slug: 'my-skill',
          labels: ['tool'],
        },
      },
    },
    analysisSnapshot: null,
    duplicateCase: null,
    receivedAt: '2024-01-01T00:00:00.000Z',
    queuedAt: null,
    analyzingAt: null,
    completedAt: null,
    lastError: null,
    retryCount: 0,
    manualResult: null,
    ...overrides,
  };
}

function makeMockStoreData(candidates: CandidateSubmission[] = []): StoreData {
  return {
    candidateSubmissions: candidates,
    knowledgeEntries: [],
    skillArtifacts: [],
    duplicateCases: [],
    entityLineage: [],
  } as unknown as StoreData;
}

function makeMockServices(
  candidate: CandidateSubmission,
  opts: {
    pool?: any;
    usePgDuplicateDetection?: () => boolean;
    candidateRepo?: CandidateRepository;
  } = {},
): CandidateProcessorServices & { statusHistory: string[] } {
  const data = makeMockStoreData([candidate]);
  const statusHistory: string[] = [];

  const store = {
    transact: vi.fn(async (fn: (d: StoreData) => Promise<any> | any) => fn(data)),
    nextId: vi.fn(() => 'next_id'),
  } as any;

  const candidateRepo =
    opts.candidateRepo ??
    ({
      updateStatus: vi.fn(async (_id: string, status: string) => {
        statusHistory.push(status);
        candidate.status = status as any;
      }),
      attachAnalysis: vi.fn(async (_id: string, snapshot: any) => {
        candidate.analysisSnapshot = snapshot;
      }),
      attachDuplicateCase: vi.fn(async (_id: string, dc: any) => {
        candidate.duplicateCase = dc;
      }),
    } as any);

  return {
    store,
    getSnapshot: vi.fn().mockResolvedValue(data),
    pool: opts.pool,
    usePgDuplicateDetection: opts.usePgDuplicateDetection,
    candidateRepo,
    statusHistory,
  };
}

// ---------------------------------------------------------------------------
// processCandidate
// ---------------------------------------------------------------------------
describe('processCandidate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(computeCandidateFingerprint).mockReturnValue({
      fingerprint: 'abc123',
      keywords: ['test'],
      tokens: ['test'],
    });
    vi.mocked(detectDuplicates).mockResolvedValue({
      duplicateCase: null,
      analysisSnapshot: {
        fingerprint: 'abc123',
        keywords: ['test'],
        tokens: ['test'],
        normalizedAt: '2024-01-01T00:00:00.000Z',
      },
    });
  });

  it('transitions through queued -> analyzing -> ready_for_review for non-duplicate', async () => {
    const candidate = makeCandidate();
    const services = makeMockServices(candidate);

    await processCandidate('cand_1', services);

    expect(services.statusHistory).toEqual(['queued', 'analyzing', 'ready_for_review']);
  });

  it('transitions to duplicate_detected when duplicate found', async () => {
    const candidate = makeCandidate();
    const services = makeMockServices(candidate);

    vi.mocked(detectDuplicates).mockResolvedValue({
      duplicateCase: {
        candidateId: 'cand_1',
        matches: [],
        detectedAt: '2024-01-01T00:00:00.000Z',
      } as any,
      analysisSnapshot: {
        fingerprint: 'abc123',
        keywords: ['test'],
        tokens: ['test'],
        normalizedAt: '2024-01-01T00:00:00.000Z',
      },
    });

    await processCandidate('cand_1', services);

    expect(services.statusHistory).toEqual(['queued', 'analyzing', 'duplicate_detected']);
    expect(services.candidateRepo.attachDuplicateCase).toHaveBeenCalled();
  });

  it('skips processing if candidate status is not received/queued/error', async () => {
    const candidate = makeCandidate({ status: 'analyzing' });
    const services = makeMockServices(candidate);

    await processCandidate('cand_1', services);

    expect(services.store.transact).not.toHaveBeenCalled();
    expect(services.candidateRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('skips processing if candidate status is ready_for_review', async () => {
    const candidate = makeCandidate({ status: 'ready_for_review' });
    const services = makeMockServices(candidate);

    await processCandidate('cand_1', services);

    expect(services.store.transact).not.toHaveBeenCalled();
  });

  it('throws when candidate not found', async () => {
    const services = makeMockServices(makeCandidate());
    services.getSnapshot = vi.fn().mockResolvedValue(makeMockStoreData([]));

    await expect(processCandidate('nonexistent', services)).rejects.toThrow(/not found/);
  });

  it('sets status to error on exception and re-throws', async () => {
    const candidate = makeCandidate();
    const services = makeMockServices(candidate);

    vi.mocked(detectDuplicates).mockRejectedValue(new Error('Detection failed'));

    await expect(processCandidate('cand_1', services)).rejects.toThrow('Detection failed');

    // Error status should have been set
    expect(services.statusHistory).toContain('error');
  });

  it('builds fingerprint input for trap sourceType', async () => {
    const candidate = makeCandidate();
    const services = makeMockServices(candidate);

    await processCandidate('cand_1', services);

    expect(computeCandidateFingerprint).toHaveBeenCalledWith({
      sourceType: 'trap',
      trapPayload: {
        shortcut: 'Avoid nested loops',
        detail: 'Use map or forEach instead of nested for loops',
        labels: ['testing'],
      },
    });
  });

  it('builds fingerprint input for skill sourceType', async () => {
    const candidate = makeSkillCandidate();
    const services = makeMockServices(candidate);

    await processCandidate('cand_skill_1', services);

    expect(computeCandidateFingerprint).toHaveBeenCalledWith({
      sourceType: 'skill',
      skillPayload: {
        profile: null,
        files: candidate.originalPayload.skill!.files,
      },
    });
  });

  it('throws for candidate with mismatched sourceType payload', async () => {
    const candidate = makeCandidate({
      sourceType: 'skill',
      originalPayload: { trap: undefined, skill: undefined },
    });
    const services = makeMockServices(candidate);

    await expect(processCandidate('cand_1', services)).rejects.toThrow(
      /Cannot build fingerprint input/,
    );
  });

  it('uses candidateRepo when provided (bypasses transact)', async () => {
    const candidate = makeCandidate();
    const services = makeMockServices(candidate);

    await processCandidate('cand_1', services);

    // store.transact should NOT be called when candidateRepo is present
    expect(services.store.transact).not.toHaveBeenCalled();
    expect(services.candidateRepo.updateStatus).toHaveBeenCalledTimes(3); // queued, analyzing, ready_for_review
  });

  it('falls back to store.transact when no candidateRepo', async () => {
    const candidate = makeCandidate();
    const data = makeMockStoreData([candidate]);
    const services: CandidateProcessorServices = {
      store: {
        transact: vi.fn(async (fn: (d: StoreData) => Promise<any> | any) => fn(data)),
        nextId: vi.fn(() => 'next_id'),
      } as any,
      getSnapshot: vi.fn().mockResolvedValue(data),
    };

    await processCandidate('cand_1', services);

    expect(services.store.transact).toHaveBeenCalled();
  });

  it('uses pg-detector when pool and flag are set', async () => {
    const candidate = makeCandidate();
    const mockPool = {} as any;
    const services = makeMockServices(candidate, {
      pool: mockPool,
      usePgDuplicateDetection: () => true,
    });

    const mockPgDetector = vi.fn().mockResolvedValue({
      duplicateCase: null,
      analysisSnapshot: {
        fingerprint: 'abc123',
        keywords: ['test'],
        tokens: ['test'],
        normalizedAt: '2024-01-01T00:00:00.000Z',
      },
    });
    vi.mocked(createPgDuplicateDetector).mockReturnValue(mockPgDetector);

    await processCandidate('cand_1', services);

    expect(createPgDuplicateDetector).toHaveBeenCalledWith({
      pool: mockPool,
      featureFlag: expect.any(Function),
    });
    expect(mockPgDetector).toHaveBeenCalled();
    // In-memory detectDuplicates should NOT be called
    expect(detectDuplicates).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// processCandidateWithRetry
// ---------------------------------------------------------------------------
describe('processCandidateWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(computeCandidateFingerprint).mockReturnValue({
      fingerprint: 'abc123',
      keywords: ['test'],
      tokens: ['test'],
    });
    vi.mocked(detectDuplicates).mockResolvedValue({
      duplicateCase: null,
      analysisSnapshot: {
        fingerprint: 'abc123',
        keywords: ['test'],
        tokens: ['test'],
        normalizedAt: '2024-01-01T00:00:00.000Z',
      },
    });
  });

  it('delegates to processCandidate on first attempt', async () => {
    const candidate = makeCandidate();
    const services = makeMockServices(candidate);

    await processCandidateWithRetry('cand_1', services);

    expect(services.statusHistory).toContain('queued');
    expect(services.statusHistory).toContain('ready_for_review');
  });

  it('marks as permanently failed when max retries exceeded', async () => {
    const candidate = makeCandidate({ retryCount: 3 }); // MAX_RETRIES = 3
    const services = makeMockServices(candidate);

    await processCandidateWithRetry('cand_1', services);

    // Should set error with max retries message and NOT call processCandidate
    expect(services.statusHistory).toEqual(['error']);
    expect(detectDuplicates).not.toHaveBeenCalled();
  });

  it('does not throw when processCandidate fails and candidate is retryable', async () => {
    const candidate = makeCandidate({ retryCount: 0 });
    const services = makeMockServices(candidate);

    // Mock getSnapshot to return the same candidate for both calls
    // (processCandidate check + canRetryCandidate check)
    services.getSnapshot = vi
      .fn()
      .mockResolvedValue(makeMockStoreData([{ ...candidate, status: 'error', retryCount: 1 }]));

    vi.mocked(detectDuplicates).mockRejectedValueOnce(new Error('Temporary failure'));

    // Should NOT throw - error is caught for retry
    await expect(processCandidateWithRetry('cand_1', services)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// processPendingCandidates
// ---------------------------------------------------------------------------
describe('processPendingCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(computeCandidateFingerprint).mockReturnValue({
      fingerprint: 'abc123',
      keywords: ['test'],
      tokens: ['test'],
    });
    vi.mocked(detectDuplicates).mockResolvedValue({
      duplicateCase: null,
      analysisSnapshot: {
        fingerprint: 'abc123',
        keywords: ['test'],
        tokens: ['test'],
        normalizedAt: '2024-01-01T00:00:00.000Z',
      },
    });
  });

  it('processes all received/queued/analyzing candidates', async () => {
    const candidates = [
      makeCandidate({ id: 'c1', status: 'received' }),
      makeCandidate({ id: 'c2', status: 'queued' }),
      makeCandidate({ id: 'c3', status: 'analyzing' }),
    ];
    const data = makeMockStoreData(candidates);

    const services: CandidateProcessorServices = {
      store: {
        transact: vi.fn(async (fn: (d: StoreData) => Promise<any> | any) => fn(data)),
        nextId: vi.fn(() => 'next_id'),
      } as any,
      getSnapshot: vi.fn().mockResolvedValue(data),
    };

    const result = await processPendingCandidates(services);
    expect(result.processed).toBe(3);
    expect(result.errors).toBe(0);
  });

  it('skips candidates in terminal states', async () => {
    const candidates = [
      makeCandidate({ id: 'c1', status: 'ready_for_review' }),
      makeCandidate({ id: 'c2', status: 'resolved' }),
      makeCandidate({ id: 'c3', status: 'error' }),
    ];
    const data = makeMockStoreData(candidates);

    const services: CandidateProcessorServices = {
      store: {
        transact: vi.fn(async (fn: (d: StoreData) => Promise<any> | any) => fn(data)),
        nextId: vi.fn(() => 'next_id'),
      } as any,
      getSnapshot: vi.fn().mockResolvedValue(data),
    };

    const result = await processPendingCandidates(services);
    expect(result.processed).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('counts errors when processing fails', async () => {
    const candidates = [makeCandidate({ id: 'c1', status: 'received' })];
    const data = makeMockStoreData(candidates);

    // Make getSnapshot return different data for different calls
    // First call: returns candidate (for processCandidateWithRetry check)
    // Second call: returns same data for processCandidate
    let _callCount = 0;
    const services: CandidateProcessorServices = {
      store: {
        transact: vi.fn(async (fn: (d: StoreData) => Promise<any> | any) => fn(data)),
        nextId: vi.fn(() => 'next_id'),
      } as any,
      getSnapshot: vi.fn().mockImplementation(async () => {
        _callCount++;
        return data;
      }),
    };

    vi.mocked(detectDuplicates).mockRejectedValue(new Error('Detection failed'));

    const result = await processPendingCandidates(services);
    // processCandidateWithRetry catches the error internally and marks as error
    // The error count tracks when processCandidateWithRetry itself throws
    // Since processCandidateWithRetry catches internally, errors should be 0
    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);
  });

  it('returns {processed: 0, errors: 0} when no pending candidates', async () => {
    const data = makeMockStoreData([]);

    const services: CandidateProcessorServices = {
      store: {
        transact: vi.fn(async (fn: (d: StoreData) => Promise<any> | any) => fn(data)),
        nextId: vi.fn(() => 'next_id'),
      } as any,
      getSnapshot: vi.fn().mockResolvedValue(data),
    };

    const result = await processPendingCandidates(services);
    expect(result).toEqual({ processed: 0, errors: 0 });
  });
});

// ---------------------------------------------------------------------------
// scheduleCandidateProcessing
// ---------------------------------------------------------------------------
describe('scheduleCandidateProcessing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fires and forgets processCandidateWithRetry when no pool', () => {
    const candidate = makeCandidate();
    const services = makeMockServices(candidate);

    // scheduleCandidateProcessing is fire-and-forget
    // It should not throw synchronously
    expect(() => scheduleCandidateProcessing('cand_1', services)).not.toThrow();
  });

  it('enqueues to task queue when pool is available', async () => {
    const candidate = makeCandidate();
    const _mockEnqueue = vi.fn().mockResolvedValue(undefined);
    const mockPool = {
      query: vi.fn(),
    } as any;

    // We need to mock createTaskQueue
    vi.doMock('./processor.js', async () => {
      const actual = await vi.importActual<typeof import('./processor.js')>('./processor.js');
      return actual;
    });

    const services = makeMockServices(candidate, { pool: mockPool });

    // This will try to create a task queue with the pool
    // The actual behavior depends on the createTaskQueue implementation
    // We just verify it doesn't throw
    expect(() => scheduleCandidateProcessing('cand_1', services)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createCandidateProcessingHandler
// ---------------------------------------------------------------------------
describe('createCandidateProcessingHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(computeCandidateFingerprint).mockReturnValue({
      fingerprint: 'abc123',
      keywords: ['test'],
      tokens: ['test'],
    });
    vi.mocked(detectDuplicates).mockResolvedValue({
      duplicateCase: null,
      analysisSnapshot: {
        fingerprint: 'abc123',
        keywords: ['test'],
        tokens: ['test'],
        normalizedAt: '2024-01-01T00:00:00.000Z',
      },
    });
  });

  it('returns handler with correct task type', () => {
    const candidate = makeCandidate();
    const services = makeMockServices(candidate);
    const handler = createCandidateProcessingHandler(services);

    expect(handler.type).toBe(CANDIDATE_PROCESSING_TASK_TYPE);
  });

  it('handle method calls processCandidate', async () => {
    const candidate = makeCandidate();
    const services = makeMockServices(candidate);
    const handler = createCandidateProcessingHandler(services);

    await handler.handle({
      payload: { candidateId: 'cand_1', retryCount: 0 },
    } as any);

    expect(services.statusHistory).toContain('queued');
    expect(services.statusHistory).toContain('ready_for_review');
  });

  it('onDead marks candidate as permanently failed', async () => {
    const candidate = makeCandidate();
    const services = makeMockServices(candidate);
    const handler = createCandidateProcessingHandler(services);

    await handler.onDead!({
      payload: { candidateId: 'cand_1', retryCount: 3 },
      lastError: 'Too many retries',
    } as any);

    expect(services.candidateRepo.updateStatus).toHaveBeenCalledWith(
      'cand_1',
      'error',
      expect.stringContaining('Max retries exceeded'),
    );
  });

  it('onDead uses store.transact when no candidateRepo', async () => {
    const candidate = makeCandidate();
    const data = makeMockStoreData([candidate]);
    const services: CandidateProcessorServices = {
      store: {
        transact: vi.fn(async (fn: (d: StoreData) => Promise<any> | any) => fn(data)),
        nextId: vi.fn(() => 'next_id'),
      } as any,
      getSnapshot: vi.fn().mockResolvedValue(data),
    };
    const handler = createCandidateProcessingHandler(services);

    await handler.onDead!({
      payload: { candidateId: 'cand_1', retryCount: 3 },
      lastError: 'Too many retries',
    } as any);

    expect(services.store.transact).toHaveBeenCalled();
  });
});
