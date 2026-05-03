import { describe, expect, it } from 'vitest';

import type { KnowledgeRecord } from '@trapmap/contracts';

import { createEmptyStoreData, nowIso } from '../store.js';
import type { SkillShareerStore } from '../store.js';
import { executeMaintenanceOperation, planMaintenanceOperation } from './batch.js';
import type { MaintenanceOperationInput } from './batch.js';

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
 * Helper to create a test knowledge entry with default values.
 * Optionally accepts overrides for maintenanceMeta, decayMeta, lifecycleState.
 */
function makeTestEntry(overrides: Partial<KnowledgeRecord> & { decayMeta?: any } = {}): KnowledgeRecord {
  const now = nowIso();
  const { decayMeta, ...rest } = overrides;
  const entry: any = {
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
    maintenanceMeta: null,
    decayMeta: decayMeta ?? null,
    createdAt: now,
    updatedAt: now,
    ...rest,
  };
  return entry as KnowledgeRecord;
}

/**
 * Helper to create test data wrapping entries.
 */
function makeTestData(entries: KnowledgeRecord[] = []) {
  const data = createEmptyStoreData();
  data.knowledgeEntries.push(...entries);
  return data;
}

describe('planMaintenanceOperation', () => {
  it('returns ineligible for non-existent entry', () => {
    const data = makeTestData();
    const input: MaintenanceOperationInput = {
      entryIds: ['nonexistent'],
      action: 'assign-owner',
      actorId: 'user_admin',
      newMaintainerId: 'user_2',
    };

    const result = planMaintenanceOperation(data, input, new Date());

    expect(result).toHaveLength(1);
    expect(result[0].entryId).toBe('nonexistent');
    expect(result[0].eligible).toBe(false);
    expect(result[0].ineligibilityReason).toBe('Entry not found');
  });

  it('returns ineligible for non-approved entry', () => {
    const entry = makeTestEntry({ id: 'knowledge_1', lifecycleState: 'pending' });
    const data = makeTestData([entry]);
    const input: MaintenanceOperationInput = {
      entryIds: ['knowledge_1'],
      action: 'assign-owner',
      actorId: 'user_admin',
      newMaintainerId: 'user_2',
    };

    const result = planMaintenanceOperation(data, input, new Date());

    expect(result).toHaveLength(1);
    expect(result[0].eligible).toBe(false);
    expect(result[0].ineligibilityReason).toBe('Only approved entries can be modified');
  });

  it('returns eligible for assign-owner with newMaintainerId', () => {
    const entry = makeTestEntry({ id: 'knowledge_1' });
    const data = makeTestData([entry]);
    const input: MaintenanceOperationInput = {
      entryIds: ['knowledge_1'],
      action: 'assign-owner',
      actorId: 'user_admin',
      newMaintainerId: 'user_2',
    };

    const result = planMaintenanceOperation(data, input, new Date());

    expect(result).toHaveLength(1);
    expect(result[0].eligible).toBe(true);
    expect(result[0].proposedChange).toContain('Assign maintainer');
  });

  it('returns eligible for extend-review', () => {
    const entry = makeTestEntry({ id: 'knowledge_1' });
    const data = makeTestData([entry]);
    const input: MaintenanceOperationInput = {
      entryIds: ['knowledge_1'],
      action: 'extend-review',
      actorId: 'user_admin',
      extendDays: 120,
    };

    const result = planMaintenanceOperation(data, input, new Date());

    expect(result).toHaveLength(1);
    expect(result[0].eligible).toBe(true);
    expect(result[0].proposedChange).toContain('120 days');
  });

  it('returns eligible for mark-verified', () => {
    const entry = makeTestEntry({ id: 'knowledge_1' });
    const data = makeTestData([entry]);
    const input: MaintenanceOperationInput = {
      entryIds: ['knowledge_1'],
      action: 'mark-verified',
      actorId: 'user_admin',
    };

    const result = planMaintenanceOperation(data, input, new Date());

    expect(result).toHaveLength(1);
    expect(result[0].eligible).toBe(true);
    expect(result[0].proposedChange).toContain('re-verified');
  });
});

describe('executeMaintenanceOperation', () => {
  describe('assign-owner action', () => {
    it('sets maintenanceMeta.maintainerUserId on target entry', () => {
      const store = makeMockStore() as unknown as SkillShareerStore;
      const entry = makeTestEntry({ id: 'knowledge_1' });
      const data = makeTestData([entry]);
      const input: MaintenanceOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'assign-owner',
        actorId: 'user_admin',
        newMaintainerId: 'user_2',
        newMaintainerHandle: 'bob',
        newMaintainerLevel: 3,
      };

      executeMaintenanceOperation(store, data, input, new Date());

      expect(entry.maintenanceMeta).not.toBeNull();
      expect(entry.maintenanceMeta!.maintainerUserId).toBe('user_2');
      expect(entry.maintenanceMeta!.maintainerHandle).toBe('bob');
      expect(entry.maintenanceMeta!.maintainerLevel).toBe(3);
    });

    it('preserves existing reviewBy when assigning owner', () => {
      const store = makeMockStore() as unknown as SkillShareerStore;
      const entry = makeTestEntry({
        id: 'knowledge_1',
        maintenanceMeta: {
          maintainerUserId: 'user_old',
          maintainerHandle: 'oldowner',
          maintainerLevel: 2,
          reviewBy: '2026-06-01T00:00:00.000Z',
        },
      });
      const data = makeTestData([entry]);
      const input: MaintenanceOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'assign-owner',
        actorId: 'user_admin',
        newMaintainerId: 'user_new',
      };

      executeMaintenanceOperation(store, data, input, new Date());

      expect(entry.maintenanceMeta!.reviewBy).toBe('2026-06-01T00:00:00.000Z');
    });

    it('does not modify non-target entries', () => {
      const store = makeMockStore() as unknown as SkillShareerStore;
      const target = makeTestEntry({ id: 'knowledge_1' });
      const other = makeTestEntry({ id: 'knowledge_2' });
      const data = makeTestData([target, other]);
      const input: MaintenanceOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'assign-owner',
        actorId: 'user_admin',
        newMaintainerId: 'user_2',
      };

      const result = executeMaintenanceOperation(store, data, input, new Date());

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('knowledge_1');
      expect(other.maintenanceMeta).toBeNull();
    });
  });

  describe('extend-review action', () => {
    it('sets maintenanceMeta.reviewBy to future date', () => {
      const store = makeMockStore() as unknown as SkillShareerStore;
      const entry = makeTestEntry({ id: 'knowledge_1' });
      const data = makeTestData([entry]);
      const input: MaintenanceOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'extend-review',
        actorId: 'user_admin',
        extendDays: 60,
      };

      const before = Date.now();
      executeMaintenanceOperation(store, data, input, new Date());

      expect(entry.maintenanceMeta).not.toBeNull();
      const reviewByDate = new Date(entry.maintenanceMeta!.reviewBy!).getTime();
      expect(reviewByDate).toBeGreaterThanOrEqual(before + 60 * 86400000 - 1000);
    });

    it('preserves existing maintainer when extending review', () => {
      const store = makeMockStore() as unknown as SkillShareerStore;
      const entry = makeTestEntry({
        id: 'knowledge_1',
        maintenanceMeta: {
          maintainerUserId: 'user_1',
          maintainerHandle: 'alice',
          maintainerLevel: 5,
          reviewBy: null,
        },
      });
      const data = makeTestData([entry]);
      const input: MaintenanceOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'extend-review',
        actorId: 'user_admin',
        extendDays: 90,
      };

      executeMaintenanceOperation(store, data, input, new Date());

      expect(entry.maintenanceMeta!.maintainerUserId).toBe('user_1');
      expect(entry.maintenanceMeta!.maintainerHandle).toBe('alice');
    });
  });

  describe('mark-verified action', () => {
    it('sets maintenanceMeta.reviewBy to future date', () => {
      const store = makeMockStore() as unknown as SkillShareerStore;
      const entry = makeTestEntry({ id: 'knowledge_1' });
      const data = makeTestData([entry]);
      const input: MaintenanceOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'mark-verified',
        actorId: 'user_admin',
        extendDays: 90,
      };

      const before = Date.now();
      executeMaintenanceOperation(store, data, input, new Date());

      expect(entry.maintenanceMeta).not.toBeNull();
      const reviewByDate = new Date(entry.maintenanceMeta!.reviewBy!).getTime();
      expect(reviewByDate).toBeGreaterThanOrEqual(before + 90 * 86400000 - 1000);
    });

    it('updates decayMeta.lastVerifiedAt to now', () => {
      const store = makeMockStore() as unknown as SkillShareerStore;
      const entry = makeTestEntry({
        id: 'knowledge_1',
        decayMeta: {
          lastVerifiedAt: '2025-01-01T00:00:00.000Z',
          decayState: 'active',
          supersededById: null,
          decayStateComputedAt: '2025-01-01T00:00:00.000Z',
          freshnessType: 'evergreen',
        },
      });
      const data = makeTestData([entry]);
      const input: MaintenanceOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'mark-verified',
        actorId: 'user_admin',
      };

      const before = Date.now();
      executeMaintenanceOperation(store, data, input, new Date());

      // Access decayMeta via any cast since KnowledgeRecord type doesn't include it
      const decayMeta = (entry as any).decayMeta;
      expect(decayMeta).not.toBeNull();
      expect(decayMeta.lastVerifiedAt).not.toBe('2025-01-01T00:00:00.000Z');
      expect(new Date(decayMeta.lastVerifiedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    });

    it('initializes decayMeta if null', () => {
      const store = makeMockStore() as unknown as SkillShareerStore;
      const entry = makeTestEntry({ id: 'knowledge_1', decayMeta: null });
      const data = makeTestData([entry]);
      const input: MaintenanceOperationInput = {
        entryIds: ['knowledge_1'],
        action: 'mark-verified',
        actorId: 'user_admin',
      };

      executeMaintenanceOperation(store, data, input, new Date());

      const decayMeta = (entry as any).decayMeta;
      expect(decayMeta).not.toBeNull();
      expect(decayMeta.decayState).toBe('active');
      expect(decayMeta.freshnessType).toBe('evergreen');
      expect(decayMeta.lastVerifiedAt).toBeDefined();
    });
  });
});
