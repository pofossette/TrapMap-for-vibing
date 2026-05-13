import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { GraphIndexDocumentRecord } from '../indexing/graph-lite/documents.js';
import { JsonStore, createEmptyStoreData } from '../store.js';
import { InMemoryGraphIndexRepository, createGraphIndexRepository } from './repository.js';

// Create a unique temp directory for each test run
const testRunId = `graph-index-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const tempDir = join(tmpdir(), testRunId);
mkdirSync(tempDir, { recursive: true });

function getUniqueStorePath(name: string): string {
  return join(tempDir, `${name}-${Date.now()}.json`);
}

/**
 * Helper to create a test graph index document with predictable data.
 */
function createTestGraphIndexDoc(
  overrides: Partial<GraphIndexDocumentRecord> = {},
): GraphIndexDocumentRecord {
  return {
    id: 'graphdoc_1',
    sourceType: 'trap',
    sourceId: 'trap_1',
    revision: 1,
    contentHash: 'abc123',
    teamId: null,
    scope: 'project-knowledge',
    requiredLevel: 0,
    nodes: [],
    edges: [],
    evidence: 'test document',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('InMemoryGraphIndexRepository', () => {
  let store: JsonStore;
  let repo: InMemoryGraphIndexRepository;
  let storePath: string;

  beforeEach(() => {
    storePath = getUniqueStorePath('graph-index');
    store = new JsonStore(storePath);
    // Initialize empty store
    store.transact((d) => {
      Object.assign(d, createEmptyStoreData());
    });
    repo = new InMemoryGraphIndexRepository(store);
  });

  afterEach(() => {
    if (existsSync(storePath)) {
      unlinkSync(storePath);
    }
  });

  it('insert() makes the document retrievable via getById()', async () => {
    const doc = createTestGraphIndexDoc();

    await repo.insert(doc);

    const found = await repo.getById('graphdoc_1');
    expect(found).not.toBeNull();
    expect(found?.id).toBe('graphdoc_1');
    expect(found?.sourceType).toBe('trap');
    expect(found?.sourceId).toBe('trap_1');
  });

  it('getById() returns null for nonexistent id', async () => {
    const found = await repo.getById('nonexistent');
    expect(found).toBeNull();
  });

  it('listBySource() filters by sourceType and sourceId', async () => {
    const doc1 = createTestGraphIndexDoc({
      id: 'graphdoc_1',
      sourceType: 'trap',
      sourceId: 'trap_1',
    });
    const doc2 = createTestGraphIndexDoc({
      id: 'graphdoc_2',
      sourceType: 'skill',
      sourceId: 'skill_1',
    });
    const doc3 = createTestGraphIndexDoc({
      id: 'graphdoc_3',
      sourceType: 'trap',
      sourceId: 'trap_1',
    });

    await repo.insert(doc1);
    await repo.insert(doc2);
    await repo.insert(doc3);

    const results = await repo.listBySource('trap', 'trap_1');
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id).sort()).toEqual(['graphdoc_1', 'graphdoc_3']);
  });

  it('listAll() returns all documents', async () => {
    const doc1 = createTestGraphIndexDoc({ id: 'graphdoc_1' });
    const doc2 = createTestGraphIndexDoc({ id: 'graphdoc_2' });

    await repo.insert(doc1);
    await repo.insert(doc2);

    const results = await repo.listAll();
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id).sort()).toEqual(['graphdoc_1', 'graphdoc_2']);
  });

  it('upsert() inserts a new document', async () => {
    const doc = createTestGraphIndexDoc({ id: 'graphdoc_new' });

    await repo.upsert(doc);

    const found = await repo.getById('graphdoc_new');
    expect(found).not.toBeNull();
    expect(found?.id).toBe('graphdoc_new');
  });

  it('upsert() replaces an existing document', async () => {
    const doc = createTestGraphIndexDoc({
      id: 'graphdoc_1',
      evidence: 'original',
    });
    await repo.insert(doc);

    const updated = createTestGraphIndexDoc({
      id: 'graphdoc_1',
      evidence: 'updated',
    });
    await repo.upsert(updated);

    const found = await repo.getById('graphdoc_1');
    expect(found).not.toBeNull();
    expect(found?.evidence).toBe('updated');

    // Verify only one document exists with this id
    const all = await repo.listAll();
    expect(all.filter((d) => d.id === 'graphdoc_1')).toHaveLength(1);
  });

  it('remove() deletes a document', async () => {
    const doc = createTestGraphIndexDoc({ id: 'graphdoc_1' });
    await repo.insert(doc);

    await repo.remove('graphdoc_1');

    const found = await repo.getById('graphdoc_1');
    expect(found).toBeNull();
  });

  it('remove() is a no-op for nonexistent id', async () => {
    // Should not throw
    await repo.remove('nonexistent');

    const all = await repo.listAll();
    expect(all).toHaveLength(0);
  });

  it('removeBySource() removes all documents for a source', async () => {
    const doc1 = createTestGraphIndexDoc({
      id: 'graphdoc_1',
      sourceType: 'trap',
      sourceId: 'trap_1',
    });
    const doc2 = createTestGraphIndexDoc({
      id: 'graphdoc_2',
      sourceType: 'skill',
      sourceId: 'skill_1',
    });
    const doc3 = createTestGraphIndexDoc({
      id: 'graphdoc_3',
      sourceType: 'trap',
      sourceId: 'trap_1',
    });

    await repo.insert(doc1);
    await repo.insert(doc2);
    await repo.insert(doc3);

    await repo.removeBySource('trap', 'trap_1');

    const remaining = await repo.listAll();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('graphdoc_2');
  });

  it('removeBySource() is a no-op when no matching documents exist', async () => {
    await repo.insert(
      createTestGraphIndexDoc({ id: 'graphdoc_1', sourceType: 'skill', sourceId: 'skill_1' }),
    );

    await repo.removeBySource('trap', 'nonexistent');

    const all = await repo.listAll();
    expect(all).toHaveLength(1);
  });
});

describe('createGraphIndexRepository factory', () => {
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

  it('returns InMemoryGraphIndexRepository when pool is undefined', () => {
    const repo = createGraphIndexRepository({ store });
    expect(repo).toBeInstanceOf(InMemoryGraphIndexRepository);
  });
});
