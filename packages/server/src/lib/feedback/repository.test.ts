import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JsonStore, createEmptyStoreData } from '../store.js';
import type { FeedbackQueueRecord } from '../store.js';
import {
  type FeedbackRepository,
  InMemoryFeedbackRepository,
  createFeedbackRepository,
} from './repository.js';

// Create a unique temp directory for each test run
const testRunId = `feedback-repo-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const tempDir = join(tmpdir(), testRunId);
mkdirSync(tempDir, { recursive: true });

function getUniqueStorePath(name: string): string {
  return join(tempDir, `${name}-${Date.now()}.json`);
}

/**
 * Helper to create a test feedback record with predictable data.
 */
function createTestFeedbackRecord(
  overrides: Partial<FeedbackQueueRecord> = {},
): FeedbackQueueRecord {
  return {
    id: 'feedback_1',
    entryId: 'entry_1',
    entryType: 'trap',
    problemType: 'incorrect',
    description: 'This knowledge is incorrect',
    context: 'I was trying to fix a bug',
    querySeed: null,
    customAnswers: null,
    submittedAt: new Date().toISOString(),
    submittedByUserId: 'user_1',
    submittedByHandle: 'testuser',
    status: 'new',
    adminNotes: null,
    resolvedAt: null,
    resolvedByUserId: null,
    triggeredTransition: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('InMemoryFeedbackRepository', () => {
  let store: JsonStore;
  let repo: FeedbackRepository;
  let storePath: string;

  beforeEach(() => {
    storePath = getUniqueStorePath('inmem');
    store = new JsonStore(storePath);
    // Initialize empty store
    store.transact((d) => {
      Object.assign(d, createEmptyStoreData());
    });
    repo = new InMemoryFeedbackRepository(store);
  });

  afterEach(() => {
    if (existsSync(storePath)) {
      unlinkSync(storePath);
    }
  });

  it('insert() makes the feedback retrievable via getById()', async () => {
    const feedback = createTestFeedbackRecord();

    await repo.insert(feedback);

    const found = await repo.getById('feedback_1');
    expect(found).not.toBeNull();
    expect(found?.id).toBe('feedback_1');
    expect(found?.entryId).toBe('entry_1');
    expect(found?.problemType).toBe('incorrect');
  });

  it('getById() returns null for nonexistent id', async () => {
    const found = await repo.getById('nonexistent');
    expect(found).toBeNull();
  });

  it('listByEntry() returns feedback for a specific entry', async () => {
    const feedback1 = createTestFeedbackRecord({ id: 'feedback_1', entryId: 'entry_1' });
    const feedback2 = createTestFeedbackRecord({ id: 'feedback_2', entryId: 'entry_2' });
    const feedback3 = createTestFeedbackRecord({ id: 'feedback_3', entryId: 'entry_1' });

    await repo.insert(feedback1);
    await repo.insert(feedback2);
    await repo.insert(feedback3);

    const results = await repo.listByEntry('entry_1');
    expect(results).toHaveLength(2);
    expect(results.map((f) => f.id).sort()).toEqual(['feedback_1', 'feedback_3']);
  });

  it('listByStatus() returns feedback with a specific status', async () => {
    const feedback1 = createTestFeedbackRecord({ id: 'feedback_1', status: 'new' });
    const feedback2 = createTestFeedbackRecord({ id: 'feedback_2', status: 'triaged' });
    const feedback3 = createTestFeedbackRecord({ id: 'feedback_3', status: 'new' });

    await repo.insert(feedback1);
    await repo.insert(feedback2);
    await repo.insert(feedback3);

    const results = await repo.listByStatus('new');
    expect(results).toHaveLength(2);
    expect(results.map((f) => f.id).sort()).toEqual(['feedback_1', 'feedback_3']);
  });

  it('listByFilter() supports combined filters', async () => {
    const feedback1 = createTestFeedbackRecord({
      id: 'feedback_1',
      entryId: 'entry_1',
      status: 'new',
      problemType: 'incorrect',
      entryType: 'trap',
    });
    const feedback2 = createTestFeedbackRecord({
      id: 'feedback_2',
      entryId: 'entry_2',
      status: 'triaged',
      problemType: 'outdated',
      entryType: 'skill',
    });
    const feedback3 = createTestFeedbackRecord({
      id: 'feedback_3',
      entryId: 'entry_1',
      status: 'new',
      problemType: 'incorrect',
      entryType: 'trap',
    });

    await repo.insert(feedback1);
    await repo.insert(feedback2);
    await repo.insert(feedback3);

    // Filter by status + problemType
    const results1 = await repo.listByFilter({
      status: ['new'],
      problemType: ['incorrect'],
    });
    expect(results1).toHaveLength(2);
    expect(results1.map((f) => f.id).sort()).toEqual(['feedback_1', 'feedback_3']);

    // Filter by entryId + entryType
    const results2 = await repo.listByFilter({
      entryId: 'entry_1',
      entryType: 'trap',
    });
    expect(results2).toHaveLength(2);
    expect(results2.map((f) => f.id).sort()).toEqual(['feedback_1', 'feedback_3']);
  });

  it('update() modifies feedback fields and updates updatedAt', async () => {
    const feedback = createTestFeedbackRecord();
    await repo.insert(feedback);

    const originalUpdatedAt = feedback.updatedAt;

    // Small delay to ensure timestamp changes
    await new Promise((resolve) => setTimeout(resolve, 10));

    await repo.update('feedback_1', {
      status: 'triaged',
      adminNotes: 'Looking into this',
    });

    const found = await repo.getById('feedback_1');
    expect(found?.status).toBe('triaged');
    expect(found?.adminNotes).toBe('Looking into this');
    expect(found?.updatedAt).not.toBe(originalUpdatedAt);
  });

  it('nextId() returns a string with correct prefix', async () => {
    const id = await repo.nextId();

    expect(typeof id).toBe('string');
    expect(id).toMatch(/^feedback_/);
  });
});

describe('createFeedbackRepository factory', () => {
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

  it('returns InMemoryFeedbackRepository when pool is undefined', () => {
    const repo = createFeedbackRepository({ store });
    expect(repo).toBeInstanceOf(InMemoryFeedbackRepository);
  });
});
