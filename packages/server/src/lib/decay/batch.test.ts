import { describe, expect, it } from 'vitest';

import type { DecayConfig, KnowledgeRecord } from '@trapmap/contracts';

import { createEmptyStoreData, nowIso } from '@trapmap/server/lib/store.js';
import { executeBatchOperation, planBatchOperation } from './batch.js';
import type { BatchOperationInput } from './batch.js';

/**
 * Default decay config for testing.
 */
const TEST_DECAY_CONFIG: DecayConfig = {
  reviewDueDays: 90,
  staleDays: 180,
  expireDays: 365,
  enabled: true,
};

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

/**
 * Helper to create a test entry with decay metadata.
 */
function makeTestEntryWithDecay(
  overrides: Partial<KnowledgeRecord> = {},
  decayMetaOverrides: Partial<KnowledgeRecord['decayMeta']> = {},
): KnowledgeRecord {
  const now = nowIso();
  const entry = makeTestEntry(overrides);
  entry.decayMeta = {
    lastVerifiedAt: decayMetaOverrides.lastVerifiedAt ?? now,
    decayState: decayMetaOverrides.decayState ?? 'active',
    supersededById: decayMetaOverrides.supersededById ?? null,
    decayStateComputedAt: decayMetaOverrides.decayStateComputedAt ?? now,
    freshnessType: decayMetaOverrides.freshnessType ?? 'evergreen',
    ...decayMetaOverrides,
  };
  return entry;
}

describe('planBatchOperation', () => {
  describe('extend action', () => {
    it('returns eligible=true with proposedDecayState=active for approved entry', () => {
      const data = createEmptyStoreData();
      const entry = makeTestEntryWithDecay({ id: 'knowledge_1' }, { decayState: 'stale' });
      data.knowledgeEntries.push(entry);

      const input: BatchOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'extend',
        actorId: 'user_admin',
      };

      const result = planBatchOperation(data, input, TEST_DECAY_CONFIG, new Date());

      expect(result).toHaveLength(1);
      expect(result[0].entryId).toBe('knowledge_1');
      expect(result[0].eligible).toBe(true);
      expect(result[0].proposedDecayState).toBe('active');
      expect(result[0].changeDescription).toBe('Reset verification clock to active state');
    });

    it('returns eligible=false for non-approved entry', () => {
      const data = createEmptyStoreData();
      const entry = makeTestEntry({ id: 'knowledge_1', lifecycleState: 'pending' });
      data.knowledgeEntries.push(entry);

      const input: BatchOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'extend',
        actorId: 'user_admin',
      };

      const result = planBatchOperation(data, input, TEST_DECAY_CONFIG, new Date());

      expect(result).toHaveLength(1);
      expect(result[0].eligible).toBe(false);
      expect(result[0].ineligibilityReason).toBe('Only approved entries can be modified');
    });
  });

  describe('mark-review action', () => {
    it('returns proposedDecayState=review-due for approved entry', () => {
      const data = createEmptyStoreData();
      const entry = makeTestEntryWithDecay({ id: 'knowledge_1' }, { decayState: 'active' });
      data.knowledgeEntries.push(entry);

      const input: BatchOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'mark-review',
        actorId: 'user_admin',
      };

      const result = planBatchOperation(data, input, TEST_DECAY_CONFIG, new Date());

      expect(result).toHaveLength(1);
      expect(result[0].eligible).toBe(true);
      expect(result[0].proposedDecayState).toBe('review-due');
    });
  });

  describe('deactivate action', () => {
    it('returns eligible=true with correct description for approved entry', () => {
      const data = createEmptyStoreData();
      const entry = makeTestEntryWithDecay({ id: 'knowledge_1' });
      data.knowledgeEntries.push(entry);

      const input: BatchOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'deactivate',
        actorId: 'user_admin',
      };

      const result = planBatchOperation(data, input, TEST_DECAY_CONFIG, new Date());

      expect(result).toHaveLength(1);
      expect(result[0].eligible).toBe(true);
      expect(result[0].changeDescription).toBe('Deactivate entry');
    });
  });

  describe('supersede action', () => {
    it('returns proposedDecayState=superseded with valid replacement', () => {
      const data = createEmptyStoreData();
      const entry = makeTestEntryWithDecay({ id: 'knowledge_1' });
      const replacement = makeTestEntryWithDecay({ id: 'knowledge_2' });
      data.knowledgeEntries.push(entry, replacement);

      const input: BatchOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'supersede',
        actorId: 'user_admin',
        replacementId: 'knowledge_2',
      };

      const result = planBatchOperation(data, input, TEST_DECAY_CONFIG, new Date());

      expect(result).toHaveLength(1);
      expect(result[0].eligible).toBe(true);
      expect(result[0].proposedDecayState).toBe('superseded');
      expect(result[0].changeDescription).toBe('Supersede with knowledge_2');
    });

    it('returns all ineligible when replacementId is missing', () => {
      const data = createEmptyStoreData();
      const entry = makeTestEntryWithDecay({ id: 'knowledge_1' });
      data.knowledgeEntries.push(entry);

      const input: BatchOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'supersede',
        actorId: 'user_admin',
        // No replacementId
      };

      const result = planBatchOperation(data, input, TEST_DECAY_CONFIG, new Date());

      expect(result).toHaveLength(1);
      expect(result[0].eligible).toBe(false);
      expect(result[0].ineligibilityReason).toBe('replacementId required for supersede action');
    });

    it('returns ineligible when replacement not found', () => {
      const data = createEmptyStoreData();
      const entry = makeTestEntryWithDecay({ id: 'knowledge_1' });
      data.knowledgeEntries.push(entry);

      const input: BatchOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'supersede',
        actorId: 'user_admin',
        replacementId: 'nonexistent',
      };

      const result = planBatchOperation(data, input, TEST_DECAY_CONFIG, new Date());

      expect(result).toHaveLength(1);
      expect(result[0].eligible).toBe(false);
      expect(result[0].ineligibilityReason).toBe('Replacement entry not found');
    });

    it('returns ineligible when replacement is not approved', () => {
      const data = createEmptyStoreData();
      const entry = makeTestEntryWithDecay({ id: 'knowledge_1' });
      const replacement = makeTestEntry({ id: 'knowledge_2', lifecycleState: 'pending' });
      data.knowledgeEntries.push(entry, replacement);

      const input: BatchOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'supersede',
        actorId: 'user_admin',
        replacementId: 'knowledge_2',
      };

      const result = planBatchOperation(data, input, TEST_DECAY_CONFIG, new Date());

      expect(result).toHaveLength(1);
      expect(result[0].eligible).toBe(false);
      expect(result[0].ineligibilityReason).toBe('Replacement must be approved');
    });

    it('returns ineligible for self-supersede', () => {
      const data = createEmptyStoreData();
      const entry = makeTestEntryWithDecay({ id: 'knowledge_1' });
      data.knowledgeEntries.push(entry);

      const input: BatchOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'supersede',
        actorId: 'user_admin',
        replacementId: 'knowledge_1',
      };

      const result = planBatchOperation(data, input, TEST_DECAY_CONFIG, new Date());

      expect(result).toHaveLength(1);
      expect(result[0].eligible).toBe(false);
      expect(result[0].ineligibilityReason).toBe('Cannot supersede an entry with itself');
    });
  });

  describe('non-existent entry', () => {
    it('returns ineligible with "Entry not found" reason', () => {
      const data = createEmptyStoreData();

      const input: BatchOperationInput = {
        entryIds: ['nonexistent'],
        action: 'extend',
        actorId: 'user_admin',
      };

      const result = planBatchOperation(data, input, TEST_DECAY_CONFIG, new Date());

      expect(result).toHaveLength(1);
      expect(result[0].entryId).toBe('nonexistent');
      expect(result[0].eligible).toBe(false);
      expect(result[0].ineligibilityReason).toBe('Entry not found');
    });
  });

  describe('mixed eligibility', () => {
    it('returns correct eligibility for mixed batch', () => {
      const data = createEmptyStoreData();
      const approved = makeTestEntryWithDecay({ id: 'knowledge_1' });
      const pending = makeTestEntry({ id: 'knowledge_2', lifecycleState: 'pending' });
      const nonexistent = 'knowledge_3';
      data.knowledgeEntries.push(approved, pending);

      const input: BatchOperationInput = {
        entryIds: ['knowledge_1', 'knowledge_2', nonexistent],
        action: 'extend',
        actorId: 'user_admin',
      };

      const result = planBatchOperation(data, input, TEST_DECAY_CONFIG, new Date());

      expect(result).toHaveLength(3);
      expect(result[0].entryId).toBe('knowledge_1');
      expect(result[0].eligible).toBe(true);
      expect(result[1].entryId).toBe('knowledge_2');
      expect(result[1].eligible).toBe(false);
      expect(result[2].entryId).toBe('knowledge_3');
      expect(result[2].eligible).toBe(false);
    });
  });
});

describe('executeBatchOperation', () => {
  describe('extend action', () => {
    it('updates decayMeta.lastVerifiedAt and sets decayState to active', () => {
      const store = makeMockStore();
      const data = createEmptyStoreData();
      const entry = makeTestEntryWithDecay(
        { id: 'knowledge_1' },
        { decayState: 'stale', lastVerifiedAt: '2025-01-01T00:00:00.000Z' },
      );
      data.knowledgeEntries.push(entry);

      const input: BatchOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'extend',
        actorId: 'user_admin',
      };

      const _beforeExtend = nowIso();
      const result = executeBatchOperation(store, data, input, TEST_DECAY_CONFIG, new Date());

      expect(result).toHaveLength(1);
      expect(result[0].decayMeta).not.toBeNull();
      expect(result[0].decayMeta!.decayState).toBe('active');
      // lastVerifiedAt should be updated to now
      expect(result[0].decayMeta!.lastVerifiedAt).not.toBe('2025-01-01T00:00:00.000Z');
    });

    it('creates lifecycle event with type=updated', () => {
      const store = makeMockStore();
      const data = createEmptyStoreData();
      const entry = makeTestEntryWithDecay({ id: 'knowledge_1' });
      data.knowledgeEntries.push(entry);

      const input: BatchOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'extend',
        actorId: 'user_admin',
      };

      executeBatchOperation(store, data, input, TEST_DECAY_CONFIG, new Date());

      expect(entry.lifecycleHistory).toHaveLength(1);
      expect(entry.lifecycleHistory[0].type).toBe('updated');
      expect(entry.lifecycleHistory[0].note).toBe('Lifecycle extended');
      expect(entry.lifecycleHistory[0].actorUserId).toBe('user_admin');
    });

    it('handles entry without decayMeta (initializes it)', () => {
      const store = makeMockStore();
      const data = createEmptyStoreData();
      const entry = makeTestEntry({ id: 'knowledge_1', decayMeta: null });
      data.knowledgeEntries.push(entry);

      const input: BatchOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'extend',
        actorId: 'user_admin',
      };

      const result = executeBatchOperation(store, data, input, TEST_DECAY_CONFIG, new Date());

      expect(result).toHaveLength(1);
      expect(result[0].decayMeta).not.toBeNull();
      expect(result[0].decayMeta!.decayState).toBe('active');
      expect(result[0].decayMeta!.freshnessType).toBe('evergreen');
    });
  });

  describe('mark-review action', () => {
    it('sets decayMeta.decayState to review-due', () => {
      const store = makeMockStore();
      const data = createEmptyStoreData();
      const entry = makeTestEntryWithDecay({ id: 'knowledge_1' }, { decayState: 'active' });
      data.knowledgeEntries.push(entry);

      const input: BatchOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'mark-review',
        actorId: 'user_admin',
      };

      const result = executeBatchOperation(store, data, input, TEST_DECAY_CONFIG, new Date());

      expect(result).toHaveLength(1);
      expect(result[0].decayMeta!.decayState).toBe('review-due');
    });

    it('creates lifecycle event with note="Marked for review"', () => {
      const store = makeMockStore();
      const data = createEmptyStoreData();
      const entry = makeTestEntryWithDecay({ id: 'knowledge_1' });
      data.knowledgeEntries.push(entry);

      const input: BatchOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'mark-review',
        actorId: 'user_admin',
      };

      executeBatchOperation(store, data, input, TEST_DECAY_CONFIG, new Date());

      expect(entry.lifecycleHistory).toHaveLength(1);
      expect(entry.lifecycleHistory[0].note).toBe('Marked for review');
    });
  });

  describe('deactivate action', () => {
    it('sets lifecycleState to deactivated', () => {
      const store = makeMockStore();
      const data = createEmptyStoreData();
      const entry = makeTestEntryWithDecay({ id: 'knowledge_1' });
      data.knowledgeEntries.push(entry);

      const input: BatchOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'deactivate',
        actorId: 'user_admin',
      };

      const result = executeBatchOperation(store, data, input, TEST_DECAY_CONFIG, new Date());

      expect(result).toHaveLength(1);
      expect(result[0].lifecycleState).toBe('deactivated');
    });

    it('creates lifecycle event with type=deactivated', () => {
      const store = makeMockStore();
      const data = createEmptyStoreData();
      const entry = makeTestEntryWithDecay({ id: 'knowledge_1' });
      data.knowledgeEntries.push(entry);

      const input: BatchOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'deactivate',
        actorId: 'user_admin',
      };

      executeBatchOperation(store, data, input, TEST_DECAY_CONFIG, new Date());

      expect(entry.lifecycleHistory).toHaveLength(1);
      expect(entry.lifecycleHistory[0].type).toBe('deactivated');
      expect(entry.lifecycleHistory[0].note).toBe('Batch deactivated');
    });
  });

  describe('supersede action', () => {
    it('delegates to supersedeEntry for each eligible entry', () => {
      const store = makeMockStore();
      const data = createEmptyStoreData();
      const entry = makeTestEntryWithDecay({ id: 'knowledge_1' });
      const replacement = makeTestEntryWithDecay({ id: 'knowledge_2' });
      data.knowledgeEntries.push(entry, replacement);

      const input: BatchOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'supersede',
        actorId: 'user_admin',
        replacementId: 'knowledge_2',
      };

      const result = executeBatchOperation(store, data, input, TEST_DECAY_CONFIG, new Date());

      expect(result).toHaveLength(1);
      expect(result[0].decayMeta!.supersededById).toBe('knowledge_2');
      expect(result[0].decayMeta!.decayState).toBe('superseded');
    });
  });

  describe('skipping ineligible entries', () => {
    it('does not mutate ineligible entries', () => {
      const store = makeMockStore();
      const data = createEmptyStoreData();
      const approved = makeTestEntryWithDecay({ id: 'knowledge_1' });
      const pending = makeTestEntry({ id: 'knowledge_2', lifecycleState: 'pending' });
      data.knowledgeEntries.push(approved, pending);

      const input: BatchOperationInput = {
        entryIds: ['knowledge_1', 'knowledge_2'],
        action: 'extend',
        actorId: 'user_admin',
      };

      const result = executeBatchOperation(store, data, input, TEST_DECAY_CONFIG, new Date());

      // Only approved entry should be mutated
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('knowledge_1');

      // Pending entry should not be mutated
      const pendingEntry = data.knowledgeEntries.find((e) => e.id === 'knowledge_2');
      expect(pendingEntry?.lifecycleHistory).toHaveLength(0);
    });
  });

  describe('batch size handling', () => {
    it('handles multiple eligible entries', () => {
      const store = makeMockStore();
      const data = createEmptyStoreData();

      // Add 5 approved entries
      for (let i = 1; i <= 5; i++) {
        const entry = makeTestEntryWithDecay({ id: `knowledge_${i}` });
        data.knowledgeEntries.push(entry);
      }

      const input: BatchOperationInput = {
        entryIds: ['knowledge_1', 'knowledge_2', 'knowledge_3', 'knowledge_4', 'knowledge_5'],
        action: 'extend',
        actorId: 'user_admin',
      };

      const result = executeBatchOperation(store, data, input, TEST_DECAY_CONFIG, new Date());

      expect(result).toHaveLength(5);
      for (const record of result) {
        expect(record.decayMeta!.decayState).toBe('active');
      }
    });
  });
});
