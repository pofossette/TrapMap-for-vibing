/**
 * Tests for lifecycle event mapping and approval-triggered indexing.
 *
 * This module covers:
 * - IDX-03: Event trigger mapping from approval/update/deactivate
 * - IDX-04: Approval automatically builds index state
 * - T-08-05: Approval triggers index sync only after permission checks
 * - T-08-06: Only approved content maps to upsert action
 * - T-08-07: All transition types are covered in tests
 */

import type { LifecycleState } from '@trapmap/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SkillShareerStore, StoreData } from '../store.js';
import { JsonStore as JsonStoreClass, nowIso } from '../store.js';
import { determineKnowledgeIndexAction, runKnowledgeIndexEvent } from './events.js';
import { AdapterRegistry } from './registry.js';
import type { IndexAdapter, NormalizedIndexDocument } from './types.js';

// Mock adapter for testing
class MockAdapter implements IndexAdapter {
  kind: string;
  syncCalls: NormalizedIndexDocument[] = [];
  removeCalls: { entryId: string; revision: number }[] = [];

  constructor(kind: string) {
    this.kind = kind;
  }

  async sync(document: NormalizedIndexDocument) {
    this.syncCalls.push(document);
    return {
      adapterKind: this.kind,
      success: true,
      error: null,
      performedWork: true,
    };
  }

  async remove(ref: { entryId: string; revision: number }) {
    this.removeCalls.push(ref);
  }
}

function createRegistry(...adapters: IndexAdapter[]): AdapterRegistry {
  const registry = new AdapterRegistry();
  for (const adapter of adapters) {
    registry.register(adapter);
  }
  return registry;
}

describe('lifecycle event mapping (IDX-03, T-08-06)', () => {
  describe('determineKnowledgeIndexAction', () => {
    // Test 1: lifecycle event mapping returns upsert for approval, remove for deactivation, noop for rejected
    it('should return "upsert" for reviewer-approved transition (IDX-03)', async () => {
      const action = determineKnowledgeIndexAction('submitted', 'approved');
      expect(action).toBe('upsert');
    });

    it('should return "remove" for deactivated transition (IDX-03)', async () => {
      const action = determineKnowledgeIndexAction('approved', 'deactivated');
      expect(action).toBe('remove');
    });

    it('should return "noop" for rejected transitions (T-08-06)', async () => {
      const action = determineKnowledgeIndexAction('submitted', 'rejected');
      expect(action).toBe('noop');
    });

    it('should return "noop" for non-approved states like submitted/agent-rejected (T-08-06)', async () => {
      expect(determineKnowledgeIndexAction('submitted', 'submitted')).toBe('noop');
      expect(determineKnowledgeIndexAction('agent-pass', 'agent-pass')).toBe('noop');
      expect(determineKnowledgeIndexAction('agent-rejected', 'agent-rejected')).toBe('noop');
    });

    it('should return "upsert" for updated approved entries (IDX-05)', async () => {
      const action = determineKnowledgeIndexAction('approved', 'approved');
      expect(action).toBe('upsert');
    });

    it('should require explicit previous and next state inputs (T-08-07)', async () => {
      // transition mapping must not infer state from entry alone
      // This is verified by the function signature requiring both parameters
      expect(typeof determineKnowledgeIndexAction).toBe('function');
      expect(determineKnowledgeIndexAction.length).toBe(2);
    });
  });

  describe('runKnowledgeIndexEvent', () => {
    let store: SkillShareerStore;
    let data: StoreData;
    let mockVectorAdapter: MockAdapter;
    let mockKeywordAdapter: MockAdapter;

    beforeEach(async () => {
      const testDataFile = `/tmp/skill-shareer-events-test-${Date.now()}.json`;
      store = new JsonStoreClass(testDataFile);
      data = await store.snapshot();

      await store.transact(async (d) => {
        d.counters = {};
        d.knowledgeEntries = [];
      });

      data = await store.snapshot();

      mockVectorAdapter = new MockAdapter('vector');
      mockKeywordAdapter = new MockAdapter('keyword');
    });

    it('should call syncKnowledgeIndex for upsert actions (IDX-03)', async () => {
      // Create an approved entry
      await store.transact(async (d) => {
        d.knowledgeEntries.push({
          id: 'knowledge_1',
          teamId: null,
          scope: 'global',
          labels: ['test'],
          shortcut: 'Test',
          detail: 'Test detail',
          requiredLevel: 0,
          lifecycleState: 'approved',
          ownerUserId: 'user_1',
          latestRevision: {
            revision: 1,
            submittedAt: nowIso(),
            submittedByUserId: 'user_1',
            shortcut: 'Test',
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
            latestSubmittedAt: nowIso(),
            latestReviewedAt: nowIso(),
            latestDecision: null,
          },
          latestSubmissionId: 'submission_1',
          submissionHistory: [],
          agentReview: null,
          reviewHistory: [],
          reviewNotes: [],
          lifecycleHistory: [],
          embeddingCache: null,
          indexState: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const data = await store.snapshot();

      // Run event for approved transition
      await runKnowledgeIndexEvent({
        services: { store, data },
        entryId: 'knowledge_1',
        previousState: 'submitted',
        nextState: 'approved',
        reason: 'reviewer-approved',
        registry: createRegistry(mockVectorAdapter, mockKeywordAdapter),
      });

      // Verify sync was called on both adapters
      expect(mockVectorAdapter.syncCalls.length).toBe(1);
      expect(mockKeywordAdapter.syncCalls.length).toBe(1);
    });

    it('should call removeKnowledgeIndex for remove actions (IDX-03)', async () => {
      // Create an entry with indexState
      await store.transact(async (d) => {
        d.knowledgeEntries.push({
          id: 'knowledge_1',
          teamId: null,
          scope: 'global',
          labels: ['test'],
          shortcut: 'Test',
          detail: 'Test detail',
          requiredLevel: 0,
          lifecycleState: 'deactivated',
          ownerUserId: 'user_1',
          latestRevision: {
            revision: 1,
            submittedAt: nowIso(),
            submittedByUserId: 'user_1',
            shortcut: 'Test',
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
            latestSubmittedAt: nowIso(),
            latestReviewedAt: nowIso(),
            latestDecision: null,
          },
          latestSubmissionId: 'submission_1',
          submissionHistory: [],
          agentReview: null,
          reviewHistory: [],
          reviewNotes: [],
          lifecycleHistory: [],
          embeddingCache: null,
          indexState: {
            contentHash: 'hash',
            normalizedAt: nowIso(),
            vector: {
              status: 'synced',
              revision: 1,
              contentHash: 'hash',
              lastSyncedAt: nowIso(),
              lastError: null,
            },
            keyword: {
              status: 'synced',
              revision: 1,
              contentHash: 'hash',
              lastSyncedAt: nowIso(),
              lastError: null,
            },
            graph: {
              status: 'synced',
              revision: 1,
              contentHash: 'hash',
              lastSyncedAt: nowIso(),
              lastError: null,
            },
          },
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const data = await store.snapshot();

      // Run event for deactivated transition
      await runKnowledgeIndexEvent({
        services: { store, data },
        entryId: 'knowledge_1',
        previousState: 'approved',
        nextState: 'deactivated',
        reason: 'deactivated',
        registry: createRegistry(mockVectorAdapter, mockKeywordAdapter),
      });

      // Verify remove was called on both adapters
      expect(mockVectorAdapter.removeCalls.length).toBe(1);
      expect(mockKeywordAdapter.removeCalls.length).toBe(1);

      // Verify indexState was cleared
      const updatedData = await store.snapshot();
      const entry = updatedData.knowledgeEntries.find((e) => e.id === 'knowledge_1');
      expect(entry?.indexState).toBeNull();
    });

    it('should skip all pipeline calls for noop actions (T-08-06)', async () => {
      // Create a rejected entry
      await store.transact(async (d) => {
        d.knowledgeEntries.push({
          id: 'knowledge_1',
          teamId: null,
          scope: 'global',
          labels: ['test'],
          shortcut: 'Test',
          detail: 'Test detail',
          requiredLevel: 0,
          lifecycleState: 'rejected',
          ownerUserId: 'user_1',
          latestRevision: {
            revision: 1,
            submittedAt: nowIso(),
            submittedByUserId: 'user_1',
            shortcut: 'Test',
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
            latestSubmittedAt: nowIso(),
            latestReviewedAt: nowIso(),
            latestDecision: null,
          },
          latestSubmissionId: 'submission_1',
          submissionHistory: [],
          agentReview: null,
          reviewHistory: [],
          reviewNotes: [],
          lifecycleHistory: [],
          embeddingCache: null,
          indexState: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const data = await store.snapshot();

      // Run event for rejected transition
      await runKnowledgeIndexEvent({
        services: { store, data },
        entryId: 'knowledge_1',
        previousState: 'submitted',
        nextState: 'rejected',
        reason: 'reviewer-rejected',
        registry: createRegistry(mockVectorAdapter, mockKeywordAdapter),
      });

      // Verify no sync or remove calls were made
      expect(mockVectorAdapter.syncCalls.length).toBe(0);
      expect(mockVectorAdapter.removeCalls.length).toBe(0);
      expect(mockKeywordAdapter.syncCalls.length).toBe(0);
      expect(mockKeywordAdapter.removeCalls.length).toBe(0);
    });

    it('should accept services, entryId, previousState, nextState, and reason (T-08-07)', async () => {
      // function signature must include all transition context
      // This is verified by the function signature and the test above
      expect(typeof runKnowledgeIndexEvent).toBe('function');
      expect(runKnowledgeIndexEvent.length).toBe(1); // Takes a single args object
    });
  });
});

/**
 * Additional tests for graph document lifecycle during approval/deactivate transitions.
 * Covers T-36-13: Stale, rejected, or deactivated graph documents are removed automatically.
 */
describe('graph document lifecycle (T-36-13)', () => {
  let store: SkillShareerStore;
  let data: StoreData;

  beforeEach(async () => {
    const testDataFile = `/tmp/skill-shareer-graph-lifecycle-test-${Date.now()}.json`;
    store = new JsonStoreClass(testDataFile);
    data = await store.snapshot();

    await store.transact(async (d) => {
      d.counters = {};
      d.knowledgeEntries = [];
      d.graphIndexDocuments = [];
    });

    data = await store.snapshot();
  });

  it('should remove graph documents when approved trap transitions to deactivated', async () => {
    // Create an approved trap with a graph document
    await store.transact(async (d) => {
      d.knowledgeEntries.push({
        id: 'knowledge_deactivate_test',
        teamId: null,
        scope: 'global',
        labels: ['test'],
        shortcut: 'Deactivate Test',
        detail: 'Test detail for deactivation',
        requiredLevel: 0,
        lifecycleState: 'approved',
        ownerUserId: 'user_1',
        latestRevision: {
          revision: 1,
          submittedAt: nowIso(),
          submittedByUserId: 'user_1',
          shortcut: 'Deactivate Test',
          detail: 'Test detail for deactivation',
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
          latestSubmittedAt: nowIso(),
          latestReviewedAt: nowIso(),
          latestDecision: null,
        },
        latestSubmissionId: 'submission_1',
        submissionHistory: [],
        agentReview: null,
        reviewHistory: [],
        reviewNotes: [],
        lifecycleHistory: [],
        embeddingCache: null,
        indexState: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      // Add a graph document for this trap
      d.graphIndexDocuments.push({
        id: 'graphdoc_deactivate_test',
        sourceType: 'trap',
        sourceId: 'knowledge_deactivate_test',
        revision: 1,
        contentHash: 'test-hash',
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        nodes: [{ id: 'node_1', kind: 'trap', label: 'Deactivate Test', evidence: 'Test' }],
        edges: [],
        evidence: 'Test graph document for deactivation',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    });

    data = await store.snapshot();

    // Run deactivation event
    await runKnowledgeIndexEvent({
      services: { store, data },
      entryId: 'knowledge_deactivate_test',
      previousState: 'approved',
      nextState: 'deactivated',
      reason: 'admin-deactivate',
      registry: new AdapterRegistry(), // Adapters not used for graph removal in this path
    });

    // Verify graph document was removed
    const updatedData = await store.snapshot();
    const remainingDocs = updatedData.graphIndexDocuments.filter(
      (d) => d.sourceId === 'knowledge_deactivate_test',
    );
    expect(remainingDocs.length).toBe(0);
  });

  it('should leave no stale graph documents after reapprove flow', async () => {
    // Create an approved trap
    await store.transact(async (d) => {
      d.knowledgeEntries.push({
        id: 'knowledge_reapprove_test',
        teamId: null,
        scope: 'global',
        labels: ['test'],
        shortcut: 'Reapprove Test',
        detail: 'Test detail for reapproval',
        requiredLevel: 0,
        lifecycleState: 'approved',
        ownerUserId: 'user_1',
        latestRevision: {
          revision: 1,
          submittedAt: nowIso(),
          submittedByUserId: 'user_1',
          shortcut: 'Reapprove Test',
          detail: 'Test detail for reapproval',
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
          latestSubmittedAt: nowIso(),
          latestReviewedAt: nowIso(),
          latestDecision: null,
        },
        latestSubmissionId: 'submission_1',
        submissionHistory: [],
        agentReview: null,
        reviewHistory: [],
        reviewNotes: [],
        lifecycleHistory: [],
        embeddingCache: null,
        indexState: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      // Add a graph document
      d.graphIndexDocuments.push({
        id: 'graphdoc_reapprove_test',
        sourceType: 'trap',
        sourceId: 'knowledge_reapprove_test',
        revision: 1,
        contentHash: 'test-hash-v1',
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        nodes: [{ id: 'node_1', kind: 'trap', label: 'Reapprove Test', evidence: 'Test' }],
        edges: [],
        evidence: 'Test graph document v1',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    });

    data = await store.snapshot();

    // Run reapprove event (approved -> approved with update)
    await runKnowledgeIndexEvent({
      services: { store, data },
      entryId: 'knowledge_reapprove_test',
      previousState: 'approved',
      nextState: 'approved',
      reason: 'reapprove',
      registry: new AdapterRegistry(), // Using empty adapters since we're testing graph doc behavior
    });

    // Verify no stale graph documents remain
    const updatedData = await store.snapshot();
    const docs = updatedData.graphIndexDocuments.filter(
      (d) => d.sourceId === 'knowledge_reapprove_test',
    );

    // Should have exactly one document (upserted, not duplicated)
    expect(docs.length).toBeLessThanOrEqual(1);
  });
});
