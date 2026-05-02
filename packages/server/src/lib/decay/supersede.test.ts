import { describe, expect, it } from 'vitest';

import type { KnowledgeRecord } from '../store.js';
import { createEmptyStoreData, nowIso } from '../store.js';
import { supersedeEntry } from './supersede.js';

/**
 * Helper to create a mock store with test data.
 */
function makeMockStore() {
  return {
    snapshot: async () => createEmptyStoreData(),
    transact: async <T>(_mutator: (data: ReturnType<typeof createEmptyStoreData>) => T) => {
      throw new Error('not implemented');
    },
    nextId: (data: ReturnType<typeof createEmptyStoreData>, prefix: string) => {
      const nextValue = (data.counters[prefix] ?? 0) + 1;
      data.counters[prefix] = nextValue;
      return `${prefix}_${nextValue}`;
    },
  };
}

/**
 * Helper to create a test knowledge entry.
 */
function makeTestEntry(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  const now = nowIso();
  return {
    id: 'knowledge_1',
    teamId: null,
    scope: 'global',
    labels: ['test'],
    shortcut: 'Test shortcut',
    detail: 'Test detail',
    requiredLevel: 5,
    lifecycleState: 'approved',
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      submittedAt: now,
      submittedByUserId: 'user_1',
      shortcut: 'Test shortcut',
      detail: 'Test detail',
      labels: ['test'],
      reviewNotes: [],
    },
    history: [],
    metadata: {
      scopeLabel: 'global-constraint',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: 'submission_1',
      latestSubmittedAt: now,
      latestReviewedAt: now,
      latestDecision: 'approve',
    },
    latestSubmissionId: 'submission_1',
    submissionHistory: [],
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    embeddingCache: null,
    indexState: null,
    decayMeta: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('supersedeEntry', () => {
  it('successfully supersedes an entry', () => {
    const store = makeMockStore();
    const data = createEmptyStoreData();
    const entry = makeTestEntry({ id: 'knowledge_1' });
    const replacement = makeTestEntry({ id: 'knowledge_2' });
    data.knowledgeEntries.push(entry, replacement);

    const result = supersedeEntry({
      store,
      data,
      entryId: 'knowledge_1',
      replacementId: 'knowledge_2',
      actorId: 'user_admin',
    });

    // Verify decayMeta is set correctly
    expect(result.decayMeta).not.toBeNull();
    expect(result.decayMeta!.supersededById).toBe('knowledge_2');
    expect(result.decayMeta!.decayState).toBe('superseded');

    // Verify lifecycle event was created
    expect(result.lifecycleHistory).toHaveLength(1);
    expect(result.lifecycleHistory[0].type).toBe('deactivated');
    expect(result.lifecycleHistory[0].note).toBe('Superseded by knowledge_2');
    expect(result.lifecycleHistory[0].actorUserId).toBe('user_admin');
  });

  it('rejects when entry not found', () => {
    const store = makeMockStore();
    const data = createEmptyStoreData();
    const replacement = makeTestEntry({ id: 'knowledge_2' });
    data.knowledgeEntries.push(replacement);

    expect(() =>
      supersedeEntry({
        store,
        data,
        entryId: 'knowledge_nonexistent',
        replacementId: 'knowledge_2',
        actorId: 'user_admin',
      }),
    ).toThrow('Knowledge entry not found');
  });

  it('rejects when replacement not found', () => {
    const store = makeMockStore();
    const data = createEmptyStoreData();
    const entry = makeTestEntry({ id: 'knowledge_1' });
    data.knowledgeEntries.push(entry);

    expect(() =>
      supersedeEntry({
        store,
        data,
        entryId: 'knowledge_1',
        replacementId: 'knowledge_nonexistent',
        actorId: 'user_admin',
      }),
    ).toThrow('Replacement entry not found');
  });

  it('rejects when entry is not approved', () => {
    const store = makeMockStore();
    const data = createEmptyStoreData();
    const entry = makeTestEntry({ id: 'knowledge_1', lifecycleState: 'pending' });
    const replacement = makeTestEntry({ id: 'knowledge_2' });
    data.knowledgeEntries.push(entry, replacement);

    expect(() =>
      supersedeEntry({
        store,
        data,
        entryId: 'knowledge_1',
        replacementId: 'knowledge_2',
        actorId: 'user_admin',
      }),
    ).toThrow('Only approved entries can be superseded');
  });

  it('rejects when replacement is not approved', () => {
    const store = makeMockStore();
    const data = createEmptyStoreData();
    const entry = makeTestEntry({ id: 'knowledge_1' });
    const replacement = makeTestEntry({ id: 'knowledge_2', lifecycleState: 'pending' });
    data.knowledgeEntries.push(entry, replacement);

    expect(() =>
      supersedeEntry({
        store,
        data,
        entryId: 'knowledge_1',
        replacementId: 'knowledge_2',
        actorId: 'user_admin',
      }),
    ).toThrow('Replacement must be an approved entry');
  });

  it('rejects self-supersede', () => {
    const store = makeMockStore();
    const data = createEmptyStoreData();
    const entry = makeTestEntry({ id: 'knowledge_1' });
    data.knowledgeEntries.push(entry);

    expect(() =>
      supersedeEntry({
        store,
        data,
        entryId: 'knowledge_1',
        replacementId: 'knowledge_1',
        actorId: 'user_admin',
      }),
    ).toThrow('Cannot supersede an entry with itself');
  });

  it('preserves existing decayMeta.lastVerifiedAt', () => {
    const store = makeMockStore();
    const data = createEmptyStoreData();
    const existingVerifiedAt = '2025-01-01T00:00:00.000Z';
    const entry = makeTestEntry({
      id: 'knowledge_1',
      decayMeta: {
        lastVerifiedAt: existingVerifiedAt,
        decayState: 'active',
        supersededById: null,
        decayStateComputedAt: existingVerifiedAt,
      },
    });
    const replacement = makeTestEntry({ id: 'knowledge_2' });
    data.knowledgeEntries.push(entry, replacement);

    const result = supersedeEntry({
      store,
      data,
      entryId: 'knowledge_1',
      replacementId: 'knowledge_2',
      actorId: 'user_admin',
    });

    // Verify lastVerifiedAt is preserved
    expect(result.decayMeta!.lastVerifiedAt).toBe(existingVerifiedAt);
  });

  it('uses entry.updatedAt as lastVerifiedAt when decayMeta is null', () => {
    const store = makeMockStore();
    const data = createEmptyStoreData();
    const updatedAt = '2025-06-01T00:00:00.000Z';
    const entry = makeTestEntry({
      id: 'knowledge_1',
      updatedAt,
      decayMeta: null,
    });
    const replacement = makeTestEntry({ id: 'knowledge_2' });
    data.knowledgeEntries.push(entry, replacement);

    const result = supersedeEntry({
      store,
      data,
      entryId: 'knowledge_1',
      replacementId: 'knowledge_2',
      actorId: 'user_admin',
    });

    // Verify lastVerifiedAt defaults to updatedAt
    expect(result.decayMeta!.lastVerifiedAt).toBe(updatedAt);
  });
});
