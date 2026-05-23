import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { EntityLineageRecord } from '@trapmap/server/lib/store.js';
import { JsonStore, createEmptyStoreData } from '@trapmap/server/lib/store.js';
import { InMemoryLineageRepository, createLineageRepository } from './repository.js';

// Create a unique temp directory for each test run
const testRunId = `lineage-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const tempDir = join(tmpdir(), testRunId);
mkdirSync(tempDir, { recursive: true });

function getUniqueStorePath(name: string): string {
  return join(tempDir, `${name}-${Date.now()}.json`);
}

/**
 * Helper to create a test lineage record with predictable data.
 */
function createTestLineageRecord(
  overrides: Partial<EntityLineageRecord> = {},
): EntityLineageRecord {
  return {
    id: 'lineage_1',
    candidateId: 'candidate_1',
    relationshipType: 'published_as',
    sourceType: 'candidate',
    sourceId: 'candidate_1',
    targetType: 'trap',
    targetId: 'trap_1',
    createdAt: new Date().toISOString(),
    notes: null,
    ...overrides,
  };
}

describe('InMemoryLineageRepository', () => {
  let store: JsonStore;
  let repo: InMemoryLineageRepository;
  let storePath: string;

  beforeEach(async () => {
    storePath = getUniqueStorePath('lineage');
    store = new JsonStore(storePath);
    // Initialize empty store
    await store.transact((d) => {
      Object.assign(d, createEmptyStoreData());
    });
    repo = new InMemoryLineageRepository(store);
  });

  afterEach(() => {
    if (existsSync(storePath)) {
      unlinkSync(storePath);
    }
  });

  it('insert() makes the lineage retrievable via getById()', async () => {
    const lineage = createTestLineageRecord();

    await repo.insert(lineage);

    const found = await repo.getById('lineage_1');
    expect(found).not.toBeNull();
    expect(found?.id).toBe('lineage_1');
    expect(found?.candidateId).toBe('candidate_1');
    expect(found?.relationshipType).toBe('published_as');
  });

  it('getById() returns null for nonexistent id', async () => {
    const found = await repo.getById('nonexistent');
    expect(found).toBeNull();
  });

  it('listBySource() filters by sourceType and sourceId', async () => {
    const lineage1 = createTestLineageRecord({
      id: 'lineage_1',
      sourceType: 'candidate',
      sourceId: 'candidate_1',
    });
    const lineage2 = createTestLineageRecord({
      id: 'lineage_2',
      sourceType: 'trap',
      sourceId: 'trap_1',
    });
    const lineage3 = createTestLineageRecord({
      id: 'lineage_3',
      sourceType: 'candidate',
      sourceId: 'candidate_1',
    });

    await repo.insert(lineage1);
    await repo.insert(lineage2);
    await repo.insert(lineage3);

    const results = await repo.listBySource('candidate', 'candidate_1');
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id).sort()).toEqual(['lineage_1', 'lineage_3']);
  });

  it('listByTarget() filters by targetType and targetId', async () => {
    const lineage1 = createTestLineageRecord({
      id: 'lineage_1',
      targetType: 'trap',
      targetId: 'trap_1',
    });
    const lineage2 = createTestLineageRecord({
      id: 'lineage_2',
      targetType: 'skill',
      targetId: 'skill_1',
    });

    await repo.insert(lineage1);
    await repo.insert(lineage2);

    const results = await repo.listByTarget('trap', 'trap_1');
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('lineage_1');
  });

  it('listByCandidate() filters by candidateId', async () => {
    const lineage1 = createTestLineageRecord({
      id: 'lineage_1',
      candidateId: 'candidate_1',
    });
    const lineage2 = createTestLineageRecord({
      id: 'lineage_2',
      candidateId: 'candidate_2',
    });
    const lineage3 = createTestLineageRecord({
      id: 'lineage_3',
      candidateId: 'candidate_1',
    });

    await repo.insert(lineage1);
    await repo.insert(lineage2);
    await repo.insert(lineage3);

    const results = await repo.listByCandidate('candidate_1');
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id).sort()).toEqual(['lineage_1', 'lineage_3']);
  });
});

describe('createLineageRepository factory', () => {
  let store: JsonStore;
  let storePath: string;

  beforeEach(() => {
    storePath = getUniqueStorePath('factory');
    store = new JsonStore(storePath);
  });

  afterEach(() => {
    if (existsSync(storePath)) {
      unlinkSync(storePath);
    }
  });

  it('returns InMemoryLineageRepository when pool is undefined', () => {
    const repo = createLineageRepository({ store });
    expect(repo).toBeInstanceOf(InMemoryLineageRepository);
  });
});
