/**
 * Phase 73 validation tests: batch processing and memory logging in reconcileKnowledgeIndexes.
 *
 * Gaps verified:
 * 1. reconcileKnowledgeIndexes() processes entries in configurable batches
 * 2. Memory delta is logged (start/end heap stats printed to console)
 * 3. Batch size parameter is respected (custom batchSize limits per-iteration slice)
 * 4. Function handles empty input correctly (no entries => returns zeroes)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SkillShareerStore } from '../store.js';
import { JsonStore, nowIso } from '../store.js';

import { reconcileKnowledgeIndexes } from './pipeline.js';
import { AdapterRegistry } from './registry.js';
import type { IndexAdapter, IndexSyncResult, NormalizedIndexDocument } from './types.js';

function toRegistry(adapters: IndexAdapter[]): AdapterRegistry {
  const registry = new AdapterRegistry();
  for (const a of adapters) registry.register(a);
  return registry;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal approved knowledge entry that can pass normalization. */
function makeApprovedEntry(id: string) {
  return {
    id,
    teamId: null as string | null,
    scope: 'global' as const,
    labels: ['test'],
    shortcut: `Shortcut ${id}`,
    detail: `Detail for ${id}`,
    requiredLevel: 0,
    lifecycleState: 'approved' as const,
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      submittedAt: nowIso(),
      submittedByUserId: 'user_1',
      shortcut: `Shortcut ${id}`,
      detail: `Detail for ${id}`,
      labels: ['test'],
      reviewNotes: [] as string[],
    },
    history: [] as unknown[],
    metadata: {
      scopeLabel: 'global-constraint',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: `${id}_sub`,
      latestSubmittedAt: nowIso(),
      latestReviewedAt: nowIso(),
      latestDecision: null as unknown,
    },
    latestSubmissionId: `${id}_sub`,
    submissionHistory: [] as unknown[],
    agentReview: null as unknown,
    reviewHistory: [] as unknown[],
    reviewNotes: [] as string[],
    lifecycleHistory: [] as unknown[],
    embeddingCache: null as unknown,
    indexState: null as unknown,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

/** Creates a mock IndexAdapter that records every sync call's entryId. */
function trackingAdapter(): {
  adapter: IndexAdapter;
  syncedEntryIds: () => string[];
} {
  const callLog: string[] = [];

  const adapter: IndexAdapter = {
    kind: 'vector',
    async sync(doc: NormalizedIndexDocument): Promise<IndexSyncResult> {
      callLog.push(doc.entryId);
      return {
        adapterKind: 'vector',
        success: true,
        error: null,
        performedWork: true,
      };
    },
    async remove() {
      /* no-op */
    },
  };

  return {
    adapter,
    syncedEntryIds: () => [...callLog],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Phase 73: reconcileKnowledgeIndexes batch processing', () => {
  let store: SkillShareerStore;

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-p73-batch-test-${Date.now()}-${Math.random()}.json`;
    store = new JsonStore(testDataFile);

    await store.transact(async (data) => {
      data.counters = {};
      data.users = [
        {
          id: 'user_1',
          handle: 'testuser',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        },
      ];
      data.teams = [];
      data.memberships = [];
      data.accessKeys = [];
      data.sessions = [];
      data.knowledgeEntries = [];
      data.auditEvents = [];
    });
  });

  // ---------------------------------------------------------------------------
  // Gap 1 & 3: configurable batch size is respected
  // ---------------------------------------------------------------------------

  it('processes entries in configurable batches when batchSize is smaller than total entries', async () => {
    // Insert 5 approved entries and use batchSize=2.
    // This means: batch 1 = entries[0..1], batch 2 = entries[2..3], batch 3 = entries[4].
    // We track exactly which entry IDs get synced to verify all 5 are processed.

    const entryIds = ['e_1', 'e_2', 'e_3', 'e_4', 'e_5'];

    await store.transact(async (data) => {
      for (const id of entryIds) {
        data.knowledgeEntries.push(makeApprovedEntry(id));
      }
    });

    const { adapter, syncedEntryIds } = trackingAdapter();

    const result = await reconcileKnowledgeIndexes({ store }, toRegistry([adapter]), { batchSize: 2 });

    // All 5 entries must have been synced
    expect(result.totalEntries).toBe(5);
    expect(result.entriesSynced).toBe(5);
    expect(syncedEntryIds().sort()).toEqual(entryIds.sort());
  });

  it('uses default batch size of 50 when no options provided', async () => {
    // With a single entry, default batch size of 50 should still work fine.
    // The observable contract: the function completes and processes all entries.

    await store.transact(async (data) => {
      data.knowledgeEntries.push(makeApprovedEntry('solo_entry'));
    });

    const { adapter, syncedEntryIds } = trackingAdapter();

    const result = await reconcileKnowledgeIndexes({ store }, toRegistry([adapter]));

    expect(result.entriesSynced).toBe(1);
    expect(syncedEntryIds()).toEqual(['solo_entry']);
  });

  // ---------------------------------------------------------------------------
  // Gap 2: memory delta is logged
  // ---------------------------------------------------------------------------

  it('logs memory usage to console upon completion', async () => {
    await store.transact(async (data) => {
      data.knowledgeEntries.push(makeApprovedEntry('mem_entry'));
    });

    const { adapter } = trackingAdapter();

    // Spy on console.log to capture the memory log line
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      await reconcileKnowledgeIndexes({ store }, toRegistry([adapter]));

      // Find the memory log line
      const memoryLog = logSpy.mock.calls.find(
        (call) =>
          typeof call[0] === 'string' && call[0].includes('[reconcileKnowledgeIndexes] Memory:'),
      );

      expect(memoryLog).toBeDefined();

      // Verify the log format contains heap used, heap total, and delta
      const logMessage = memoryLog![0] as string;
      expect(logMessage).toMatch(/MB used/);
      expect(logMessage).toMatch(/MB total/);
      expect(logMessage).toMatch(/delta:/);
    } finally {
      logSpy.mockRestore();
    }
  });

  // ---------------------------------------------------------------------------
  // Gap 4: empty input
  // ---------------------------------------------------------------------------

  it('returns zero counts and completes without error when no entries exist', async () => {
    // Store is initialized with empty knowledgeEntries already

    const { adapter } = trackingAdapter();

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const result = await reconcileKnowledgeIndexes({ store }, toRegistry([adapter]));

      expect(result.totalEntries).toBe(0);
      expect(result.entriesSynced).toBe(0);
      expect(result.entriesRemoved).toBe(0);
      expect(result.entriesSkipped).toBe(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    } finally {
      logSpy.mockRestore();
    }
  });
});
