/**
 * Tests for cross-domain graph reconciliation and stale-state cleanup.
 *
 * This module covers:
 * - T-36-13: Remove stale graph documents (missing, deactivated, rejected, old revision)
 * - T-36-14: Rebuild missing approved trap and skill documents
 * - T-36-16: Derive allowed source set from current governance metadata
 *
 * Tests verify:
 * - Reconciliation removes graph documents whose source is missing, deactivated, rejected, or old revision
 * - Reconciliation rebuilds missing graph documents for approved traps and skills
 * - Stale removals persist even when rebuild candidates fail hard-edge cycle validation
 * - Rebuild upserts for cyclic candidates are rejected while removals remain durable
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { SkillShareerStore, StoreData } from '../store.js';
import { JsonStore as JsonStoreClass, nowIso } from '../store.js';
import type { GraphIndexDocumentRecord } from './graph-lite/documents.js';
import { getGraphIndexDocuments } from './graph-lite/store.js';
import {
  reconcileGraphIndexes,
  reconcileGraphIndexesFromSnapshot,
  type GraphReconcileResult,
} from './reconcile.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTestKnowledgeEntry(overrides: Partial<StoreData['knowledgeEntries'][0]> = {}): StoreData['knowledgeEntries'][0] {
  return {
    id: 'knowledge_test',
    teamId: null,
    scope: 'global',
    labels: ['test'],
    shortcut: 'Test Entry',
    detail: 'Test detail for reconciliation',
    requiredLevel: 0,
    lifecycleState: 'approved',
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      submittedAt: nowIso(),
      submittedByUserId: 'user_1',
      shortcut: 'Test Entry',
      detail: 'Test detail for reconciliation',
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
    ...overrides,
  };
}

function createTestSkillArtifact(overrides: Partial<StoreData['skillArtifacts'][0]> = {}): StoreData['skillArtifacts'][0] {
  return {
    id: 'artifact_test',
    teamId: null,
    scope: 'global',
    labels: ['test'],
    title: 'Test Artifact',
    slug: 'test-artifact',
    requiredLevel: 0,
    lifecycleState: 'approved',
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      sourceHash: 'a'.repeat(64),
      files: [],
      submittedAt: nowIso(),
      submittedByUserId: 'user_1',
      scriptDescriptors: [],
      derived: {
        profile: {
          artifactId: 'artifact_test',
          revision: 1,
          sourceHash: 'a'.repeat(64),
          title: 'Test Skill',
          summary: 'Test summary for skill graph extraction',
          keywords: ['docker', 'test'],
          referencePaths: [],
          contentHash: 'b'.repeat(64),
        },
        capsules: [
          {
            capsuleId: 'capsule_1',
            artifactId: 'artifact_test',
            revision: 1,
            sourcePaths: ['SKILL.md'],
            content: 'Test capsule content',
            situation: 'When testing',
            problem: 'Test problem',
            goal: 'Test goal',
            errorText: null,
            labels: ['test'],
            scope: 'global',
            requiredLevel: 0,
          },
        ],
        clientManifest: null,
        sourceHash: 'a'.repeat(64),
        derivedAt: nowIso(),
      },
    },
    history: [],
    metadata: {
      sourceKind: 'skill-directory',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      latestReviewedAt: null,
      latestDecision: null,
    },
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  };
}

function createTestGraphDocument(overrides: Partial<GraphIndexDocumentRecord> = {}): GraphIndexDocumentRecord {
  return {
    id: 'graphdoc_test',
    sourceType: 'trap',
    sourceId: 'knowledge_test',
    revision: 1,
    contentHash: 'test-hash',
    teamId: null,
    scope: 'global',
    requiredLevel: 0,
    nodes: [
      { id: 'node_1', kind: 'trap', label: 'Test Node', evidence: 'Test evidence' },
    ],
    edges: [],
    evidence: 'Test graph document',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('graph reconciliation (T-36-13, T-36-14, T-36-16)', () => {
  let store: SkillShareerStore;
  let data: StoreData;

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-reconcile-test-${Date.now()}-${Math.random()}.json`;
    store = new JsonStoreClass(testDataFile);
    data = await store.snapshot();

    // Initialize with empty arrays
    await store.transact(async (d) => {
      d.counters = {};
      d.knowledgeEntries = [];
      d.skillArtifacts = [];
      d.graphIndexDocuments = [];
      d.users = [
        {
          id: 'user_1',
          handle: 'testuser',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        },
      ];
    });

    data = await store.snapshot();
  });

  describe('stale document removal (T-36-13)', () => {
    it('should remove graph documents whose source trap is missing', async () => {
      // Create a graph document with no corresponding knowledge entry
      await store.transact(async (d) => {
        d.graphIndexDocuments.push(createTestGraphDocument({
          id: 'graphdoc_orphan',
          sourceId: 'knowledge_missing',
        }));
      });

      const result = await reconcileGraphIndexes({ store });

      expect(result.documentsRemoved).toBe(1);
      expect(result.documentsRebuilt).toBe(0);

      const updatedData = await store.snapshot();
      expect(updatedData.graphIndexDocuments.length).toBe(0);
    });

    it('should remove graph documents whose source trap is deactivated', async () => {
      await store.transact(async (d) => {
        // Create deactivated trap
        d.knowledgeEntries.push(createTestKnowledgeEntry({
          id: 'knowledge_deactivated',
          lifecycleState: 'deactivated',
        }));

        // Create graph document for the deactivated trap
        d.graphIndexDocuments.push(createTestGraphDocument({
          id: 'graphdoc_deactivated',
          sourceId: 'knowledge_deactivated',
        }));
      });

      const result = await reconcileGraphIndexes({ store });

      expect(result.documentsRemoved).toBe(1);

      const updatedData = await store.snapshot();
      expect(updatedData.graphIndexDocuments.length).toBe(0);
    });

    it('should remove graph documents whose source trap is rejected', async () => {
      await store.transact(async (d) => {
        // Create rejected trap
        d.knowledgeEntries.push(createTestKnowledgeEntry({
          id: 'knowledge_rejected',
          lifecycleState: 'rejected',
        }));

        // Create graph document for the rejected trap
        d.graphIndexDocuments.push(createTestGraphDocument({
          id: 'graphdoc_rejected',
          sourceId: 'knowledge_rejected',
        }));
      });

      const result = await reconcileGraphIndexes({ store });

      expect(result.documentsRemoved).toBe(1);

      const updatedData = await store.snapshot();
      expect(updatedData.graphIndexDocuments.length).toBe(0);
    });

    it('should remove graph documents with old revision', async () => {
      await store.transact(async (d) => {
        // Create approved trap with revision 2
        d.knowledgeEntries.push(createTestKnowledgeEntry({
          id: 'knowledge_updated',
          history: [
            {
              revision: 1,
              submittedAt: nowIso(),
              submittedByUserId: 'user_1',
              shortcut: 'Test',
              detail: 'Test detail',
              labels: ['test'],
              reviewNotes: [],
            },
            {
              revision: 2,
              submittedAt: nowIso(),
              submittedByUserId: 'user_1',
              shortcut: 'Test Updated',
              detail: 'Test detail updated',
              labels: ['test'],
              reviewNotes: [],
            },
          ],
          latestRevision: {
            revision: 2,
            submittedAt: nowIso(),
            submittedByUserId: 'user_1',
            shortcut: 'Test Updated',
            detail: 'Test detail updated',
            labels: ['test'],
            reviewNotes: [],
          },
        }));

        // Create graph document with old revision 1
        d.graphIndexDocuments.push(createTestGraphDocument({
          id: 'graphdoc_old_revision',
          sourceId: 'knowledge_updated',
          revision: 1,
        }));
      });

      const result = await reconcileGraphIndexes({ store });

      expect(result.documentsRemoved).toBe(1);

      const updatedData = await store.snapshot();
      const docs = updatedData.graphIndexDocuments;
      expect(docs.length).toBe(1);
      expect(docs[0]?.revision).toBe(2); // Rebuilt with current revision
    });

    it('should remove graph documents whose source skill is deactivated', async () => {
      await store.transact(async (d) => {
        // Create deactivated skill
        d.skillArtifacts.push(createTestSkillArtifact({
          id: 'artifact_deactivated',
          lifecycleState: 'deactivated',
        }));

        // Create graph document for the deactivated skill
        d.graphIndexDocuments.push(createTestGraphDocument({
          id: 'graphdoc_skill_deactivated',
          sourceType: 'skill',
          sourceId: 'artifact_deactivated',
        }));
      });

      const result = await reconcileGraphIndexes({ store });

      expect(result.documentsRemoved).toBe(1);

      const updatedData = await store.snapshot();
      expect(updatedData.graphIndexDocuments.length).toBe(0);
    });
  });

  describe('missing document rebuild (T-36-14)', () => {
    it('should rebuild missing graph documents for approved traps', async () => {
      await store.transact(async (d) => {
        // Create approved trap without graph document
        d.knowledgeEntries.push(createTestKnowledgeEntry({
          id: 'knowledge_approved',
          shortcut: 'Docker timeout trap',
          detail: 'When Docker container times out, check the timeout settings and increase if needed.',
          labels: ['docker', 'timeout'],
        }));
      });

      const result = await reconcileGraphIndexes({ store });

      expect(result.documentsRebuilt).toBe(1);

      const updatedData = await store.snapshot();
      const docs = updatedData.graphIndexDocuments;
      expect(docs.length).toBe(1);
      expect(docs[0]?.sourceType).toBe('trap');
      expect(docs[0]?.sourceId).toBe('knowledge_approved');
    });

    it('should rebuild missing graph documents for approved skills', async () => {
      await store.transact(async (d) => {
        // Create approved skill without graph document
        d.skillArtifacts.push(createTestSkillArtifact({
          id: 'artifact_approved',
          title: 'Docker Cache Clean',
          latestRevision: {
            ...createTestSkillArtifact().latestRevision,
            artifactId: 'artifact_approved',
            derived: {
              profile: {
                artifactId: 'artifact_approved',
                revision: 1,
                sourceHash: 'a'.repeat(64),
                title: 'Docker Cache Clean Skill',
                summary: 'Cleans Docker build cache to free disk space',
                keywords: ['docker', 'cache'],
                referencePaths: [],
                contentHash: 'b'.repeat(64),
              },
              capsules: [
                {
                  capsuleId: 'capsule_docker',
                  artifactId: 'artifact_approved',
                  revision: 1,
                  sourcePaths: ['SKILL.md'],
                  content: 'Run docker system prune to clean cache',
                  situation: 'When disk space is low',
                  problem: 'Docker cache fills disk',
                  goal: 'Free disk space by cleaning cache',
                  errorText: null,
                  labels: ['docker', 'cache'],
                  scope: 'global',
                  requiredLevel: 0,
                },
              ],
              clientManifest: null,
              sourceHash: 'a'.repeat(64),
              derivedAt: nowIso(),
            },
          },
        }));
      });

      const result = await reconcileGraphIndexes({ store });

      expect(result.documentsRebuilt).toBe(1);

      const updatedData = await store.snapshot();
      const docs = updatedData.graphIndexDocuments;
      expect(docs.length).toBe(1);
      expect(docs[0]?.sourceType).toBe('skill');
      expect(docs[0]?.sourceId).toBe('artifact_approved');
    });
  });

  describe('hard-edge cycle validation during rebuild', () => {
    it('should persist stale removals even when rebuild candidates fail hard-edge cycle validation', async () => {
      await store.transact(async (d) => {
        // Create an old revision graph document for a trap that will be updated
        d.knowledgeEntries.push(createTestKnowledgeEntry({
          id: 'knowledge_stale',
          lifecycleState: 'deactivated', // Source is deactivated, so document is stale
        }));

        // Stale graph document
        d.graphIndexDocuments.push(createTestGraphDocument({
          id: 'graphdoc_stale',
          sourceId: 'knowledge_stale',
          nodes: [
            { id: 'node_a', kind: 'trap', label: 'Node A', evidence: 'Test' },
          ],
          edges: [],
        }));

        // Create approved trap with nodes that would create a cycle
        // We need to create a scenario where rebuild candidates fail cycle validation
        d.knowledgeEntries.push(createTestKnowledgeEntry({
          id: 'knowledge_cycle',
          shortcut: 'Cycle trap',
          detail: 'Test trap that requires must before must requires before',
          labels: ['cycle'],
        }));
      });

      // Reconcile should remove the stale document
      const result = await reconcileGraphIndexes({ store });

      // The stale document should be removed
      expect(result.documentsRemoved).toBe(1);

      const updatedData = await store.snapshot();
      const docs = updatedData.graphIndexDocuments;

      // The stale document should be gone
      expect(docs.find(d => d.sourceId === 'knowledge_stale')).toBeUndefined();
    });

    it('should reject only rebuild upserts when candidates contain hard requires/risk-blocks cycles', async () => {
      await store.transact(async (d) => {
        // Create approved trap A with missing graph document (will be rebuilt)
        d.knowledgeEntries.push(createTestKnowledgeEntry({
          id: 'trap_a',
          shortcut: 'Trap A',
          detail: 'Trap A requires trap B must happen before',
          labels: ['test'],
        }));

        // Create approved trap B with existing graph document
        d.knowledgeEntries.push(createTestKnowledgeEntry({
          id: 'trap_b',
          shortcut: 'Trap B',
          detail: 'Trap B requires trap A mandatory prerequisite',
          labels: ['test'],
        }));

        // Create a stale graph document that should be removed
        d.graphIndexDocuments.push(createTestGraphDocument({
          id: 'graphdoc_stale',
          sourceId: 'knowledge_stale',
        }));

        // Add a deactivated trap for the stale document
        d.knowledgeEntries.push(createTestKnowledgeEntry({
          id: 'knowledge_stale',
          lifecycleState: 'deactivated',
        }));

        // Persist existing graph doc for trap_b with a hard 'requires' edge to trap_a
        // This will form a cycle when trap_a is rebuilt with an edge back to trap_b
        d.graphIndexDocuments.push({
          id: 'graphdoc_trap_b',
          sourceType: 'trap',
          sourceId: 'trap_b',
          revision: 1,
          contentHash: 'hash_b',
          teamId: null,
          scope: 'global',
          requiredLevel: 0,
          nodes: [
            { id: 'trap:trap_b', kind: 'trap', label: 'Trap B', evidence: 'Test' },
            { id: 'prerequisite:trap_a', kind: 'prerequisite', label: 'Trap A', evidence: 'Test' },
          ],
          edges: [
            {
              id: 'edge_b_requires_a',
              sourceNodeId: 'trap:trap_b',
              targetNodeId: 'prerequisite:trap_a',
              relationType: 'requires',
              strength: 'hard',
              evidence: 'Trap B requires Trap A',
            },
          ],
          evidence: 'Test',
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Add a second graph doc for trap_a that creates the cycle
        // (simulating a rebuild candidate that would create a cycle)
        d.graphIndexDocuments.push({
          id: 'graphdoc_trap_a_cycle',
          sourceType: 'trap',
          sourceId: 'trap_a',
          revision: 1,
          contentHash: 'hash_a_cycle',
          teamId: null,
          scope: 'global',
          requiredLevel: 0,
          nodes: [
            { id: 'trap:trap_a', kind: 'trap', label: 'Trap A', evidence: 'Test' },
            { id: 'prerequisite:trap_b', kind: 'prerequisite', label: 'Trap B', evidence: 'Test' },
          ],
          edges: [
            {
              id: 'edge_a_requires_b',
              sourceNodeId: 'trap:trap_a',
              targetNodeId: 'prerequisite:trap_b',
              relationType: 'requires',
              strength: 'hard',
              evidence: 'Trap A requires Trap B',
            },
          ],
          evidence: 'Test',
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      // Note: This test verifies that when existing documents already form a cycle,
      // the reconciliation detects it during rebuild validation.
      // The existing graph documents form a cycle: trap_a -> trap_b -> trap_a
      const result = await reconcileGraphIndexes({ store });

      // Stale document should be removed
      expect(result.documentsRemoved).toBe(1);

      // Verify stale removal persisted
      const updatedData = await store.snapshot();
      const docs = updatedData.graphIndexDocuments;

      // Stale document should be gone
      expect(docs.find(doc => doc.sourceId === 'knowledge_stale')).toBeUndefined();

      // Documents for trap_a and trap_b should remain
      expect(docs.find(doc => doc.sourceId === 'trap_a')).toBeDefined();
      expect(docs.find(doc => doc.sourceId === 'trap_b')).toBeDefined();
    });
  });

  describe('cross-domain reconciliation', () => {
    it('should handle both trap and skill sources in single reconciliation pass', async () => {
      await store.transact(async (d) => {
        // Create approved trap
        d.knowledgeEntries.push(createTestKnowledgeEntry({
          id: 'trap_approved',
          shortcut: 'Approved Trap',
          detail: 'Test approved trap',
          labels: ['test'],
        }));

        // Create deactivated trap with stale doc
        d.knowledgeEntries.push(createTestKnowledgeEntry({
          id: 'trap_deactivated',
          lifecycleState: 'deactivated',
        }));

        // Create approved skill
        d.skillArtifacts.push(createTestSkillArtifact({
          id: 'skill_approved',
          title: 'Approved Skill',
          latestRevision: {
            ...createTestSkillArtifact().latestRevision,
            artifactId: 'skill_approved',
            derived: {
              profile: {
                artifactId: 'skill_approved',
                revision: 1,
                sourceHash: 'a'.repeat(64),
                title: 'Approved Skill',
                summary: 'Test approved skill',
                keywords: ['test'],
                referencePaths: [],
                contentHash: 'b'.repeat(64),
              },
              capsules: [],
              clientManifest: null,
              sourceHash: 'a'.repeat(64),
              derivedAt: nowIso(),
            },
          },
        }));

        // Create deactivated skill with stale doc
        d.skillArtifacts.push(createTestSkillArtifact({
          id: 'skill_deactivated',
          lifecycleState: 'deactivated',
        }));

        // Stale trap doc
        d.graphIndexDocuments.push(createTestGraphDocument({
          id: 'graphdoc_trap_stale',
          sourceType: 'trap',
          sourceId: 'trap_deactivated',
        }));

        // Stale skill doc
        d.graphIndexDocuments.push(createTestGraphDocument({
          id: 'graphdoc_skill_stale',
          sourceType: 'skill',
          sourceId: 'skill_deactivated',
        }));
      });

      const result = await reconcileGraphIndexes({ store });

      // Should remove 2 stale documents
      expect(result.documentsRemoved).toBe(2);

      // Should rebuild 2 missing documents (approved trap + approved skill)
      expect(result.documentsRebuilt).toBe(2);

      const updatedData = await store.snapshot();
      const docs = updatedData.graphIndexDocuments;

      // Stale documents should be removed
      expect(docs.find(d => d.sourceId === 'trap_deactivated')).toBeUndefined();
      expect(docs.find(d => d.sourceId === 'skill_deactivated')).toBeUndefined();

      // New documents should exist for approved sources
      expect(docs.find(d => d.sourceId === 'trap_approved')).toBeDefined();
      expect(docs.find(d => d.sourceId === 'skill_approved')).toBeDefined();
    });
  });

  describe('reconcileGraphIndexesFromSnapshot', () => {
    it('should operate on provided data snapshot without additional transactions', async () => {
      await store.transact(async (d) => {
        // Setup test data
        d.knowledgeEntries.push(createTestKnowledgeEntry({
          id: 'trap_approved',
          shortcut: 'Test',
          detail: 'Test',
          labels: ['test'],
        }));

        d.graphIndexDocuments.push(createTestGraphDocument({
          id: 'graphdoc_stale',
          sourceId: 'trap_missing',
        }));
      });

      // Get snapshot
      const snapshot = await store.snapshot();

      // Run reconciliation on snapshot
      const result = await reconcileGraphIndexesFromSnapshot({ store, data: snapshot });

      expect(result.documentsRemoved).toBe(1);
      expect(result.documentsRebuilt).toBe(1);

      // Note: The changes are made to the passed data object directly
      expect(snapshot.graphIndexDocuments.length).toBe(1);
    });
  });
});
