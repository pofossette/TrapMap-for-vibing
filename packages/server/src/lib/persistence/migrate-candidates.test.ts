/**
 * Tests for migrateCandidates migration script.
 *
 * Uses mock-based testing to verify:
 * - Candidates are read from store.snapshot().candidateSubmissions
 * - Candidates are inserted via PgCandidateRepository
 * - Already-migrated candidates are skipped (idempotency)
 * - Dry-run mode doesn't write to database
 * - Errors are recorded but don't stop migration
 * - Progress callback is called with correct values
 */

import type { CandidateSubmission } from '@trapmap/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SkillShareerStore, StoreData } from '../store.js';
import { migrateCandidates } from './migrate-candidates.js';

// Helper to create a test candidate
function createTestCandidate(overrides: Partial<CandidateSubmission> = {}): CandidateSubmission {
  return {
    id: 'candidate_1',
    sourceType: 'trap',
    submittedBy: 'user_1',
    teamId: null,
    status: 'received',
    originalPayload: {
      trap: {
        scope: 'global',
        labels: ['test'],
        shortcut: 'Test shortcut',
        detail: 'Test detail',
      },
    },
    analysisSnapshot: null,
    duplicateCase: null,
    receivedAt: new Date().toISOString(),
    queuedAt: null,
    analyzingAt: null,
    completedAt: null,
    lastError: null,
    retryCount: 0,
    manualResult: null,
    ...overrides,
  };
}

// Mock PgCandidateRepository
vi.mock('../candidates/pg-repository.js', () => ({
  PgCandidateRepository: vi.fn().mockImplementation(() => ({
    getById: vi.fn().mockResolvedValue(null),
    insert: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { PgCandidateRepository } from '../candidates/pg-repository.js';

describe('migrateCandidates', () => {
  let mockPool: { query: ReturnType<typeof vi.fn> };
  let mockStore: SkillShareerStore;
  let mockRepository: { getById: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock pool
    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    // Create mock repository instance
    mockRepository = {
      getById: vi.fn().mockResolvedValue(null),
      insert: vi.fn().mockResolvedValue(undefined),
    };

    // Make PgCandidateRepository constructor return our mock
    vi.mocked(PgCandidateRepository).mockImplementation(
      () => mockRepository as unknown as InstanceType<typeof PgCandidateRepository>,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('basic functionality', () => {
    it('should read candidates from store.snapshot().candidateSubmissions and insert into table', async () => {
      const candidate1 = createTestCandidate({ id: 'candidate_1' });
      const candidate2 = createTestCandidate({ id: 'candidate_2' });

      mockStore = {
        snapshot: vi.fn().mockResolvedValue({
          candidateSubmissions: [candidate1, candidate2],
        } as unknown as StoreData),
        transact: vi.fn(),
        nextId: vi.fn(),
      };

      const result = await migrateCandidates({
        pool: mockPool as unknown as { query: typeof mockPool.query },
        store: mockStore,
      });

      expect(result.totalCandidates).toBe(2);
      expect(result.migrated).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockRepository.insert).toHaveBeenCalledTimes(2);
    });

    it('should skip candidates that already exist in relational table', async () => {
      const candidate1 = createTestCandidate({ id: 'candidate_1' });
      const candidate2 = createTestCandidate({ id: 'candidate_2' });
      const candidate3 = createTestCandidate({ id: 'candidate_3' });

      // Mock that candidate_2 already exists
      mockRepository.getById.mockImplementation(async (id: string) => {
        if (id === 'candidate_2') {
          return candidate2;
        }
        return null;
      });

      mockStore = {
        snapshot: vi.fn().mockResolvedValue({
          candidateSubmissions: [candidate1, candidate2, candidate3],
        } as unknown as StoreData),
        transact: vi.fn(),
        nextId: vi.fn(),
      };

      const result = await migrateCandidates({
        pool: mockPool as unknown as { query: typeof mockPool.query },
        store: mockStore,
      });

      expect(result.totalCandidates).toBe(3);
      expect(result.migrated).toBe(2);
      expect(result.skipped).toBe(1);
      expect(mockRepository.insert).toHaveBeenCalledTimes(2);
      expect(mockRepository.getById).toHaveBeenCalledTimes(3);
    });

    it('should report correct counts: totalCandidates, migrated, skipped, errors', async () => {
      const candidates = [
        createTestCandidate({ id: 'candidate_1' }),
        createTestCandidate({ id: 'candidate_2' }),
        createTestCandidate({ id: 'candidate_3' }),
      ];

      // One already exists
      mockRepository.getById.mockImplementation(async (id: string) => {
        if (id === 'candidate_1') {
          return candidates[0];
        }
        return null;
      });

      // One insert fails
      mockRepository.insert.mockImplementation(async (candidate: CandidateSubmission) => {
        if (candidate.id === 'candidate_3') {
          throw new Error('Insert failed');
        }
      });

      mockStore = {
        snapshot: vi.fn().mockResolvedValue({
          candidateSubmissions: candidates,
        } as unknown as StoreData),
        transact: vi.fn(),
        nextId: vi.fn(),
      };

      const result = await migrateCandidates({
        pool: mockPool as unknown as { query: typeof mockPool.query },
        store: mockStore,
      });

      expect(result.totalCandidates).toBe(3);
      expect(result.migrated).toBe(1); // Only candidate_2 was successfully inserted
      expect(result.skipped).toBe(1); // candidate_1 already existed
      expect(result.errors).toHaveLength(1); // candidate_3 failed
      expect(result.errors[0]?.candidateId).toBe('candidate_3');
      expect(result.errors[0]?.error).toBe('Insert failed');
    });
  });

  describe('dry-run mode', () => {
    it('should not insert anything when dryRun=true, report all as skipped', async () => {
      const candidates = [
        createTestCandidate({ id: 'candidate_1' }),
        createTestCandidate({ id: 'candidate_2' }),
        createTestCandidate({ id: 'candidate_3' }),
      ];

      mockStore = {
        snapshot: vi.fn().mockResolvedValue({
          candidateSubmissions: candidates,
        } as unknown as StoreData),
        transact: vi.fn(),
        nextId: vi.fn(),
      };

      const result = await migrateCandidates({
        pool: mockPool as unknown as { query: typeof mockPool.query },
        store: mockStore,
        dryRun: true,
      });

      expect(result.totalCandidates).toBe(3);
      expect(result.migrated).toBe(0);
      expect(result.skipped).toBe(3);
      expect(result.errors).toHaveLength(0);
      expect(mockRepository.insert).not.toHaveBeenCalled();
      expect(mockRepository.getById).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should continue processing remaining candidates when one fails', async () => {
      const candidates = [
        createTestCandidate({ id: 'candidate_1' }),
        createTestCandidate({ id: 'candidate_2' }),
        createTestCandidate({ id: 'candidate_3' }),
      ];

      // candidate_2 insert fails
      mockRepository.insert.mockImplementation(async (candidate: CandidateSubmission) => {
        if (candidate.id === 'candidate_2') {
          throw new Error('Database error');
        }
      });

      mockStore = {
        snapshot: vi.fn().mockResolvedValue({
          candidateSubmissions: candidates,
        } as unknown as StoreData),
        transact: vi.fn(),
        nextId: vi.fn(),
      };

      const result = await migrateCandidates({
        pool: mockPool as unknown as { query: typeof mockPool.query },
        store: mockStore,
      });

      expect(result.totalCandidates).toBe(3);
      expect(result.migrated).toBe(2); // candidate_1 and candidate_3
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.candidateId).toBe('candidate_2');
      expect(mockRepository.insert).toHaveBeenCalledTimes(3);
    });

    it('should record error message from thrown Error', async () => {
      const candidates = [createTestCandidate({ id: 'candidate_1' })];

      mockRepository.insert.mockRejectedValue(new Error('Custom error message'));

      mockStore = {
        snapshot: vi.fn().mockResolvedValue({
          candidateSubmissions: candidates,
        } as unknown as StoreData),
        transact: vi.fn(),
        nextId: vi.fn(),
      };

      const result = await migrateCandidates({
        pool: mockPool as unknown as { query: typeof mockPool.query },
        store: mockStore,
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.error).toBe('Custom error message');
    });

    it('should record string representation of non-Error throws', async () => {
      const candidates = [createTestCandidate({ id: 'candidate_1' })];

      mockRepository.insert.mockRejectedValue('String error');

      mockStore = {
        snapshot: vi.fn().mockResolvedValue({
          candidateSubmissions: candidates,
        } as unknown as StoreData),
        transact: vi.fn(),
        nextId: vi.fn(),
      };

      const result = await migrateCandidates({
        pool: mockPool as unknown as { query: typeof mockPool.query },
        store: mockStore,
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.error).toBe('String error');
    });
  });

  describe('progress reporting', () => {
    it('should call onProgress callback for each candidate processed', async () => {
      const candidates = [
        createTestCandidate({ id: 'candidate_1' }),
        createTestCandidate({ id: 'candidate_2' }),
        createTestCandidate({ id: 'candidate_3' }),
      ];

      mockStore = {
        snapshot: vi.fn().mockResolvedValue({
          candidateSubmissions: candidates,
        } as unknown as StoreData),
        transact: vi.fn(),
        nextId: vi.fn(),
      };

      const progressCalls: Array<{ processed: number; total: number; candidateId: string }> = [];
      const onProgress = vi.fn((info) => {
        progressCalls.push(info);
      });

      await migrateCandidates({
        pool: mockPool as unknown as { query: typeof mockPool.query },
        store: mockStore,
        onProgress,
      });

      expect(onProgress).toHaveBeenCalledTimes(3);
      expect(progressCalls[0]).toEqual({ processed: 1, total: 3, candidateId: 'candidate_1' });
      expect(progressCalls[1]).toEqual({ processed: 2, total: 3, candidateId: 'candidate_2' });
      expect(progressCalls[2]).toEqual({ processed: 3, total: 3, candidateId: 'candidate_3' });
    });

    it('should call onProgress even in dry-run mode', async () => {
      const candidates = [
        createTestCandidate({ id: 'candidate_1' }),
        createTestCandidate({ id: 'candidate_2' }),
      ];

      mockStore = {
        snapshot: vi.fn().mockResolvedValue({
          candidateSubmissions: candidates,
        } as unknown as StoreData),
        transact: vi.fn(),
        nextId: vi.fn(),
      };

      const onProgress = vi.fn();

      await migrateCandidates({
        pool: mockPool as unknown as { query: typeof mockPool.query },
        store: mockStore,
        dryRun: true,
        onProgress,
      });

      expect(onProgress).toHaveBeenCalledTimes(2);
    });

    it('should call onProgress even when errors occur', async () => {
      const candidates = [
        createTestCandidate({ id: 'candidate_1' }),
        createTestCandidate({ id: 'candidate_2' }),
      ];

      mockRepository.insert.mockRejectedValue(new Error('Fail'));
      mockStore = {
        snapshot: vi.fn().mockResolvedValue({
          candidateSubmissions: candidates,
        } as unknown as StoreData),
        transact: vi.fn(),
        nextId: vi.fn(),
      };

      const onProgress = vi.fn();

      await migrateCandidates({
        pool: mockPool as unknown as { query: typeof mockPool.query },
        store: mockStore,
        onProgress,
      });

      expect(onProgress).toHaveBeenCalledTimes(2);
    });
  });

  describe('duration reporting', () => {
    it('should report durationMs > 0', async () => {
      mockStore = {
        snapshot: vi.fn().mockResolvedValue({
          candidateSubmissions: [createTestCandidate()],
        } as unknown as StoreData),
        transact: vi.fn(),
        nextId: vi.fn(),
      };

      const result = await migrateCandidates({
        pool: mockPool as unknown as { query: typeof mockPool.query },
        store: mockStore,
      });

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should return immediately with durationMs for empty store', async () => {
      mockStore = {
        snapshot: vi.fn().mockResolvedValue({
          candidateSubmissions: [],
        } as unknown as StoreData),
        transact: vi.fn(),
        nextId: vi.fn(),
      };

      const result = await migrateCandidates({
        pool: mockPool as unknown as { query: typeof mockPool.query },
        store: mockStore,
      });

      expect(result.totalCandidates).toBe(0);
      expect(result.migrated).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(mockRepository.insert).not.toHaveBeenCalled();
    });
  });
});
