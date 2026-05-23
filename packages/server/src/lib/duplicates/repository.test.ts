import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore, createEmptyStoreData } from '@trapmap/server/lib/store.js';
import type { DuplicateCaseRecord } from '@trapmap/server/lib/store.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type DuplicateRepository,
  InMemoryDuplicateRepository,
  createDuplicateRepository,
} from './repository.js';

// Create a unique temp directory for each test run
const testRunId = `duplicates-repo-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const tempDir = join(tmpdir(), testRunId);
mkdirSync(tempDir, { recursive: true });

function getUniqueStorePath(name: string): string {
  return join(tempDir, `${name}-${Date.now()}.json`);
}

/**
 * Helper to create a test duplicate case with predictable data.
 */
function createTestDuplicateCase(
  overrides: Partial<DuplicateCaseRecord> = {},
): DuplicateCaseRecord {
  return {
    id: 'dup_case_1',
    candidateId: 'candidate_1',
    detectedAt: new Date().toISOString(),
    detectionVersion: '1.0.0',
    matches: [
      {
        entryId: 'entry_1',
        similarity: 0.95,
        matchType: 'exact',
      },
    ],
    highestSimilarity: 0.95,
    hasExactDuplicate: true,
    duplicateType: 'exact',
    ...overrides,
  };
}

describe('InMemoryDuplicateRepository', () => {
  let store: JsonStore;
  let repo: DuplicateRepository;
  let storePath: string;

  beforeEach(() => {
    storePath = getUniqueStorePath('inmem');
    store = new JsonStore(storePath);
    // Initialize empty store
    store.transact((d) => {
      Object.assign(d, createEmptyStoreData());
    });
    repo = new InMemoryDuplicateRepository(store);
  });

  afterEach(() => {
    if (existsSync(storePath)) {
      unlinkSync(storePath);
    }
  });

  it('insert() makes the case retrievable via getById()', async () => {
    const duplicateCase = createTestDuplicateCase();

    await repo.insert(duplicateCase);

    const found = await repo.getById('dup_case_1');
    expect(found).not.toBeNull();
    expect(found?.id).toBe('dup_case_1');
    expect(found?.candidateId).toBe('candidate_1');
    expect(found?.duplicateType).toBe('exact');
  });

  it('getById() returns null for nonexistent id', async () => {
    const found = await repo.getById('nonexistent');
    expect(found).toBeNull();
  });

  it('listByCandidate() returns cases for a specific candidate', async () => {
    const case1 = createTestDuplicateCase({ id: 'dup_case_1', candidateId: 'candidate_1' });
    const case2 = createTestDuplicateCase({ id: 'dup_case_2', candidateId: 'candidate_2' });
    const case3 = createTestDuplicateCase({ id: 'dup_case_3', candidateId: 'candidate_1' });

    await repo.insert(case1);
    await repo.insert(case2);
    await repo.insert(case3);

    const results = await repo.listByCandidate('candidate_1');
    expect(results).toHaveLength(2);
    expect(results.map((d) => d.id).sort()).toEqual(['dup_case_1', 'dup_case_3']);
  });

  it('listAll() returns all duplicate cases', async () => {
    const case1 = createTestDuplicateCase({ id: 'dup_case_1' });
    const case2 = createTestDuplicateCase({ id: 'dup_case_2' });
    const case3 = createTestDuplicateCase({ id: 'dup_case_3' });

    await repo.insert(case1);
    await repo.insert(case2);
    await repo.insert(case3);

    const results = await repo.listAll();
    expect(results).toHaveLength(3);
    expect(results.map((d) => d.id).sort()).toEqual(['dup_case_1', 'dup_case_2', 'dup_case_3']);
  });

  it('update() modifies case fields', async () => {
    const duplicateCase = createTestDuplicateCase();
    await repo.insert(duplicateCase);

    await repo.update('dup_case_1', {
      duplicateType: 'semantic',
      hasExactDuplicate: false,
    });

    const found = await repo.getById('dup_case_1');
    expect(found?.duplicateType).toBe('semantic');
    expect(found?.hasExactDuplicate).toBe(false);
  });
});

describe('createDuplicateRepository factory', () => {
  let store: JsonStore;
  let storePath: string;

  beforeEach(() => {
    storePath = getUniqueStorePath('factory');
    store = new JsonStore(storePath);
    store.transact((d) => {
      Object.assign(d, createEmptyStoreData());
    });
  });

  afterEach(() => {
    if (existsSync(storePath)) {
      unlinkSync(storePath);
    }
  });

  it('returns InMemoryDuplicateRepository when pool is undefined', () => {
    const repo = createDuplicateRepository({ store });
    expect(repo).toBeInstanceOf(InMemoryDuplicateRepository);
  });
});
