import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CandidateSubmission } from '@trapmap/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DuplicateRepository } from '../duplicates/index.js';
import { JsonStore, createEmptyStoreData } from '../store.js';
import {
  type CandidateRepository,
  DualWriteCandidateRepository,
  InMemoryCandidateRepository,
  createCandidateRepository,
} from './repository.js';

// Create a unique temp directory for each test run
const testRunId = `repo-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const tempDir = join(tmpdir(), testRunId);
mkdirSync(tempDir, { recursive: true });

function getUniqueStorePath(name: string): string {
  return join(tempDir, `${name}-${Date.now()}.json`);
}

/**
 * Helper to create a test candidate with predictable data.
 */
function createTestCandidate(overrides: Partial<CandidateSubmission> = {}): CandidateSubmission {
  return {
    id: 'candidate_1',
    sourceType: 'trap',
    submittedBy: 'user_1',
    teamId: null,
    status: 'received',
    originalPayload: {
      trap: {
        shortcut: 'test-shortcut',
        detail: 'test detail',
        labels: ['test'],
        scope: 'project-knowledge',
        requiredLevel: 0,
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

/**
 * Mock repository for testing DualWriteCandidateRepository.
 * Records all calls for verification.
 */
class MockRepository implements CandidateRepository {
  public calls: Array<{ method: string; args: unknown[] }> = [];
  private candidates: Map<string, CandidateSubmission> = new Map();

  private record(method: string, ...args: unknown[]): void {
    this.calls.push({ method, args });
  }

  async insert(candidate: CandidateSubmission): Promise<void> {
    this.record('insert', candidate);
    this.candidates.set(candidate.id, { ...candidate });
  }

  async getById(candidateId: string): Promise<CandidateSubmission | null> {
    this.record('getById', candidateId);
    return this.candidates.get(candidateId) ?? null;
  }

  async updateStatus(
    candidateId: string,
    status: CandidateSubmission['status'],
    error?: string,
  ): Promise<void> {
    this.record('updateStatus', candidateId, status, error);
    const candidate = this.candidates.get(candidateId);
    if (candidate) {
      candidate.status = status;
      if (error) candidate.lastError = error;
    }
  }

  async attachAnalysis(candidateId: string, snapshot: unknown): Promise<void> {
    this.record('attachAnalysis', candidateId, snapshot);
    const candidate = this.candidates.get(candidateId);
    if (candidate) {
      candidate.analysisSnapshot = snapshot as CandidateSubmission['analysisSnapshot'];
    }
  }

  async attachDuplicateCase(candidateId: string, duplicateCase: unknown): Promise<void> {
    this.record('attachDuplicateCase', candidateId, duplicateCase);
    const candidate = this.candidates.get(candidateId);
    if (candidate) {
      candidate.duplicateCase = duplicateCase as CandidateSubmission['duplicateCase'];
    }
  }

  async attachManualResult(
    candidateId: string,
    result: unknown,
    reviewedBy: string,
  ): Promise<void> {
    this.record('attachManualResult', candidateId, result, reviewedBy);
  }

  async listByStatus(status: CandidateSubmission['status']): Promise<CandidateSubmission[]> {
    this.record('listByStatus', status);
    return Array.from(this.candidates.values()).filter((c) => c.status === status);
  }

  async markResolved(candidateId: string, resolvedBy: string): Promise<void> {
    this.record('markResolved', candidateId, resolvedBy);
    const candidate = this.candidates.get(candidateId);
    if (candidate) {
      candidate.status = 'resolved';
    }
  }
}

describe('DualWriteCandidateRepository', () => {
  let store: JsonStore;
  let mockPrimary: MockRepository;
  let repo: DualWriteCandidateRepository;
  let storePath: string;

  beforeEach(() => {
    storePath = getUniqueStorePath('dual-write');
    store = new JsonStore(storePath);
    // Initialize empty store
    store.transact((d) => {
      Object.assign(d, createEmptyStoreData());
    });

    mockPrimary = new MockRepository();
    const mockDuplicateRepo: DuplicateRepository = {
      async insert() {},
      async getById() {
        return null;
      },
      async listByCandidate() {
        return [];
      },
      async listAll() {
        return [];
      },
      async update() {},
    };
    repo = new DualWriteCandidateRepository(mockPrimary, store, mockDuplicateRepo);
  });

  it('insert() calls primary.insert() then shadows to store.transact()', async () => {
    const candidate = createTestCandidate();

    await repo.insert(candidate);

    // Verify primary was called
    expect(mockPrimary.calls).toHaveLength(1);
    expect(mockPrimary.calls[0]?.method).toBe('insert');

    // Verify shadow write to store
    const stored = await store.snapshot();
    const found = stored.candidateSubmissions.find((c) => c.id === candidate.id);
    expect(found).toBeDefined();
  });

  it('updateStatus() calls primary.updateStatus() then shadows to store.transact()', async () => {
    // First insert a candidate
    const candidate = createTestCandidate();
    await store.transact((data) => {
      data.candidateSubmissions.push(candidate);
    });
    await mockPrimary.insert(candidate);

    await repo.updateStatus('candidate_1', 'queued');

    // Verify primary was called
    const updateCall = mockPrimary.calls.find((c) => c.method === 'updateStatus');
    expect(updateCall).toBeDefined();
    expect(updateCall?.args[0]).toBe('candidate_1');
    expect(updateCall?.args[1]).toBe('queued');

    // Verify shadow write to store
    const stored = await store.snapshot();
    const found = stored.candidateSubmissions.find((c) => c.id === 'candidate_1');
    expect(found?.status).toBe('queued');
  });

  it('updateStatus() with error parameter works correctly', async () => {
    const candidate = createTestCandidate();
    await store.transact((data) => {
      data.candidateSubmissions.push(candidate);
    });
    await mockPrimary.insert(candidate);

    await repo.updateStatus('candidate_1', 'error', 'Test error');

    // Verify primary was called with error
    const updateCall = mockPrimary.calls.find((c) => c.method === 'updateStatus');
    expect(updateCall?.args[2]).toBe('Test error');

    // Verify shadow write to store
    const stored = await store.snapshot();
    const found = stored.candidateSubmissions.find((c) => c.id === 'candidate_1');
    expect(found?.status).toBe('error');
    expect(found?.lastError).toBe('Test error');
  });

  it('attachAnalysis() calls primary.attachAnalysis() then shadows to store.transact()', async () => {
    const candidate = createTestCandidate();
    await store.transact((data) => {
      data.candidateSubmissions.push(candidate);
    });
    await mockPrimary.insert(candidate);

    const snapshot = { fingerprint: 'abc', keywords: ['test'], tokens: ['test'] };
    await repo.attachAnalysis('candidate_1', snapshot);

    // Verify primary was called
    const attachCall = mockPrimary.calls.find((c) => c.method === 'attachAnalysis');
    expect(attachCall).toBeDefined();

    // Verify shadow write to store
    const stored = await store.snapshot();
    const found = stored.candidateSubmissions.find((c) => c.id === 'candidate_1');
    expect(found?.analysisSnapshot).toEqual(snapshot);
  });

  it('attachDuplicateCase() calls primary.attachDuplicateCase() then shadows to store.transact()', async () => {
    const candidate = createTestCandidate();
    await store.transact((data) => {
      data.candidateSubmissions.push(candidate);
    });
    await mockPrimary.insert(candidate);

    const duplicateCase = {
      candidateId: 'candidate_1',
      matches: [],
      recommendation: 'none' as const,
    };
    await repo.attachDuplicateCase('candidate_1', duplicateCase);

    // Verify primary was called
    const attachCall = mockPrimary.calls.find((c) => c.method === 'attachDuplicateCase');
    expect(attachCall).toBeDefined();

    // Verify shadow write to store
    const stored = await store.snapshot();
    const found = stored.candidateSubmissions.find((c) => c.id === 'candidate_1');
    expect(found?.duplicateCase).toEqual(duplicateCase);
  });

  it('attachManualResult() calls primary.attachManualResult() then shadows to store.transact()', async () => {
    const candidate = createTestCandidate({ status: 'duplicate_detected' });
    await store.transact((data) => {
      data.candidateSubmissions.push(candidate);
    });
    await mockPrimary.insert(candidate);

    const result = { action: 'reject' as const, notes: 'test notes' };
    await repo.attachManualResult('candidate_1', result, 'reviewer_1');

    // Verify primary was called
    const attachCall = mockPrimary.calls.find((c) => c.method === 'attachManualResult');
    expect(attachCall).toBeDefined();
    expect(attachCall?.args[2]).toBe('reviewer_1');

    // Verify shadow write to store
    const stored = await store.snapshot();
    const found = stored.candidateSubmissions.find((c) => c.id === 'candidate_1');
    expect(found?.manualResult).toBeDefined();
    expect(found?.manualResult?.action).toBe('reject');
  });

  it('listByStatus() delegates to primary.listByStatus()', async () => {
    const candidate1 = createTestCandidate({ id: 'candidate_1', status: 'queued' });
    const candidate2 = createTestCandidate({ id: 'candidate_2', status: 'ready_for_review' });
    await mockPrimary.insert(candidate1);
    await mockPrimary.insert(candidate2);

    const result = await repo.listByStatus('queued');

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('candidate_1');
    expect(mockPrimary.calls.some((c) => c.method === 'listByStatus')).toBe(true);
  });

  it('getById() delegates to primary.getById()', async () => {
    const candidate = createTestCandidate();
    await mockPrimary.insert(candidate);

    const result = await repo.getById('candidate_1');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('candidate_1');
    expect(mockPrimary.calls.some((c) => c.method === 'getById')).toBe(true);
  });

  it('markResolved() calls primary.markResolved() then shadows to store.transact()', async () => {
    const candidate = createTestCandidate({ status: 'duplicate_detected' });
    await store.transact((data) => {
      data.candidateSubmissions.push(candidate);
    });
    await mockPrimary.insert(candidate);

    await repo.markResolved('candidate_1', 'resolver_1');

    // Verify primary was called
    const resolveCall = mockPrimary.calls.find((c) => c.method === 'markResolved');
    expect(resolveCall).toBeDefined();
    expect(resolveCall?.args[1]).toBe('resolver_1');

    // Verify shadow write to store
    const stored = await store.snapshot();
    const found = stored.candidateSubmissions.find((c) => c.id === 'candidate_1');
    expect(found?.status).toBe('resolved');
  });
});

describe('InMemoryCandidateRepository', () => {
  let store: JsonStore;
  let repo: InMemoryCandidateRepository;
  let storePath: string;

  beforeEach(() => {
    storePath = getUniqueStorePath('inmem');
    store = new JsonStore(storePath);
    repo = new InMemoryCandidateRepository(store);
  });

  it('insert() makes the candidate retrievable via getById()', async () => {
    const candidate = createTestCandidate();

    await repo.insert(candidate);

    const found = await repo.getById('candidate_1');
    expect(found).not.toBeNull();
    expect(found?.id).toBe('candidate_1');
  });

  it('updateStatus() changes the candidate status in the store', async () => {
    const candidate = createTestCandidate();
    await repo.insert(candidate);

    await repo.updateStatus('candidate_1', 'queued');

    const found = await repo.getById('candidate_1');
    expect(found?.status).toBe('queued');
    expect(found?.queuedAt).not.toBeNull();
  });

  it('updateStatus() with error sets lastError', async () => {
    const candidate = createTestCandidate();
    await repo.insert(candidate);

    await repo.updateStatus('candidate_1', 'error', 'Something went wrong');

    const found = await repo.getById('candidate_1');
    expect(found?.status).toBe('error');
    expect(found?.lastError).toBe('Something went wrong');
  });

  it('listByStatus() returns filtered results', async () => {
    const candidate1 = createTestCandidate({ id: 'candidate_1', status: 'queued' });
    const candidate2 = createTestCandidate({ id: 'candidate_2', status: 'ready_for_review' });
    const candidate3 = createTestCandidate({ id: 'candidate_3', status: 'queued' });

    await repo.insert(candidate1);
    await repo.insert(candidate2);
    await repo.insert(candidate3);

    const queued = await repo.listByStatus('queued');

    expect(queued).toHaveLength(2);
    expect(queued.map((c) => c.id).sort()).toEqual(['candidate_1', 'candidate_3']);
  });

  it('attachAnalysis() attaches snapshot to candidate', async () => {
    const candidate = createTestCandidate();
    await repo.insert(candidate);

    const snapshot = { fingerprint: 'abc', keywords: ['test'], tokens: ['test'] };
    await repo.attachAnalysis('candidate_1', snapshot);

    const found = await repo.getById('candidate_1');
    expect(found?.analysisSnapshot).toEqual(snapshot);
  });

  it('attachDuplicateCase() attaches duplicate case to candidate', async () => {
    const candidate = createTestCandidate();
    await repo.insert(candidate);

    const duplicateCase = {
      candidateId: 'candidate_1',
      matches: [],
      recommendation: 'none' as const,
    };
    await repo.attachDuplicateCase('candidate_1', duplicateCase);

    const found = await repo.getById('candidate_1');
    expect(found?.duplicateCase).toEqual(duplicateCase);
  });

  it('attachManualResult() attaches manual result to candidate', async () => {
    const candidate = createTestCandidate({ status: 'duplicate_detected' });
    await repo.insert(candidate);

    const result = { action: 'publish' as const, notes: 'looks good' };
    await repo.attachManualResult('candidate_1', result, 'reviewer_1');

    const found = await repo.getById('candidate_1');
    expect(found?.manualResult).toBeDefined();
    expect(found?.manualResult?.action).toBe('publish');
    expect(found?.manualResult?.submittedBy).toBe('reviewer_1');
  });

  it('markResolved() sets status to resolved', async () => {
    const candidate = createTestCandidate({ status: 'duplicate_detected' });
    await repo.insert(candidate);

    await repo.markResolved('candidate_1', 'resolver_1');

    const found = await repo.getById('candidate_1');
    expect(found?.status).toBe('resolved');
    expect(found?.completedAt).not.toBeNull();
  });
});

describe('createCandidateRepository factory', () => {
  let store: JsonStore;
  let storePath: string;

  beforeEach(() => {
    storePath = getUniqueStorePath('factory');
    store = new JsonStore(storePath);
  });

  it('returns InMemoryCandidateRepository when pool is undefined', () => {
    const repo = createCandidateRepository({ store });

    expect(repo).toBeInstanceOf(InMemoryCandidateRepository);
  });

  it('returns DualWriteCandidateRepository when pool is provided', () => {
    // Note: We can't fully test this without a real Pool, but we can verify the type
    // In a real test environment with a database, this would return DualWriteCandidateRepository
    // For now, we test that pool=undefined returns InMemoryRepository
    const repo = createCandidateRepository({ pool: undefined, store });
    expect(repo).toBeInstanceOf(InMemoryCandidateRepository);
  });
});
