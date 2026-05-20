import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CandidateSubmission } from '@trapmap/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DuplicateRepository } from '../duplicates/index.js';
import { JsonStore, createEmptyStoreData } from '../store.js';
import {
  type CandidateRepository,
  InMemoryCandidateRepository,
  createCandidateRepository,
} from './repository.js';

// Create a unique temp directory for each test run
const testRunId = `repo-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const tempDir = join(tmpdir(), testRunId);
mkdirSync(tempDir, { recursive: true });

function getUniqueStorePath(name: string): string {
  return join(tempDir, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
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

  it('returns InMemoryCandidateRepository when pool is explicitly undefined', () => {
    // Round 2: PG-only repo when pool is provided (no DualWrite).
    // Without a real PG pool in tests, factory returns InMemory.
    const repo = createCandidateRepository({ pool: undefined, store });
    expect(repo).toBeInstanceOf(InMemoryCandidateRepository);
  });
});
