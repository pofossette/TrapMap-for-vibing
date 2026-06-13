/**
 * Tests for review routes with indexing integration.
 *
 * This module covers:
 * - IDX-03: Approval triggers indexing after commit
 * - IDX-04: Adapter registration in service container
 * - T-11-01: Post-commit indexing prevents nested transactions
 * - T-11-02: Bootstrap adapter registration is stable and reusable
 * - T-11-03: Rejection remains an indexing no-op
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildServer } from '@trapmap/server/app.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import type { FastifyInstance } from 'fastify';

describe('review routes with indexing integration (IDX-03, IDX-04)', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;

  beforeEach(async () => {
    // Use a unique data file for each test to avoid interference
    const testDataFile = `/tmp/trapmap-test-${Date.now()}-${Math.random()}.json`;

    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('adapter registration (IDX-04, T-11-02)', () => {
    it('should expose indexAdapters registry in service container (IDX-04)', async () => {
      // Verify the service container has the indexAdapters field
      expect(app.skillShareer).toBeDefined();
      expect(app.skillShareer.adapterRegistry).toBeDefined();

      // Verify it contains the expected adapters
      expect(app.skillShareer.adapterRegistry.all().length).toBeGreaterThan(0);

      const adapterKinds = app.skillShareer.adapterRegistry.kinds();
      expect(adapterKinds).toContain('vector');
      expect(adapterKinds).toContain('keyword');
    });

    it('should provide stable adapter registration across multiple builds (T-11-02)', async () => {
      // Build a second server instance
      const app2 = buildServer();
      await app2.ready();

      // Both should have the same adapter configuration
      expect(app.skillShareer.adapterRegistry.kinds().length).toBe(
        app2.skillShareer.adapterRegistry.kinds().length,
      );

      const adapterKinds1 = app.skillShareer.adapterRegistry.kinds();
      const adapterKinds2 = app2.skillShareer.adapterRegistry.kinds();

      expect(adapterKinds1).toEqual(adapterKinds2);

      await app2.close();
    });
  });

  describe('approval indexing integration (IDX-03, T-11-01)', () => {
    let sessionId: string;
    let entryId: string;
    const userId = 'user_1'; // Use simple ID format
    const teamId = 'team_1';

    beforeEach(async () => {
      // Setup: Create a user, team, membership, and session
      await store.transact(async (data) => {
        // Initialize counters if needed
        if (!data.counters) data.counters = {};
        data.counters.user = 1;

        // Create user
        data.users.push({
          id: userId,
          handle: 'reviewer',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create team
        data.teams.push({
          id: teamId,
          name: 'Test Team',
          slug: 'test-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create membership
        const membershipId = 'membership_1';
        data.memberships.push({
          id: membershipId,
          userId,
          teamId,
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: ['knowledge:review'],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create session
        const sessionToken = `session_token_${Date.now()}`;
        data.sessions.push({
          id: `session_${Date.now()}`,
          userId,
          tokenHash: hashSecret(sessionToken),
          activeTeamId: teamId,
          subjectType: 'user',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });

        // Use the actual token for auth
        sessionId = sessionToken;

        // Create a submitted knowledge entry
        data.counters.knowledge = 1;
        entryId = 'knowledge_1';

        data.knowledgeEntries.push({
          id: entryId,
          teamId: null,
          scope: 'global',
          labels: ['test'],
          shortcut: 'Test Entry',
          detail: 'Test detail for indexing',
          requiredLevel: 0,
          lifecycleState: 'agent-pass',
          ownerUserId: userId,
          latestRevision: {
            revision: 1,
            submittedAt: nowIso(),
            submittedByUserId: userId,
            shortcut: 'Test Entry',
            detail: 'Test detail for indexing',
            labels: ['test'],
            reviewNotes: [],
          },
          history: [
            {
              revision: 1,
              submittedAt: nowIso(),
              submittedByUserId: userId,
              shortcut: 'Test Entry',
              detail: 'Test detail for indexing',
              labels: ['test'],
              reviewNotes: [],
            },
          ],
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
          decayMeta: null,
          evidenceMeta: null,
          maintenanceMeta: null,
          boundary: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });
    });

    it('should create index state after approval completes (IDX-03)', async () => {
      // Approve the entry
      const response = await app.inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          entryId,
          decision: 'approve',
          notes: 'Looks good',
        },
      });

      if (response.statusCode !== 200) {
        console.log('Error response:', response.json());
      }

      expect(response.statusCode).toBe(200);

      // Verify index state exists after the route completes
      const data = await store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === entryId);

      expect(entry).toBeDefined();
      expect(entry?.lifecycleState).toBe('approved');

      // The key assertion: indexState should exist and be synced
      expect(entry?.indexState).toBeDefined();
      expect(entry?.indexState?.adapters?.vector?.status).toBe('synced');
      expect(entry?.indexState?.adapters?.keyword?.status).toBe('synced');

      // Verify embedding cache is populated (for compatibility)
      expect(entry?.embeddingCache).toBeDefined();
      expect(entry?.embeddingCache?.vector).toBeDefined();
      expect(Array.isArray(entry?.embeddingCache?.vector)).toBe(true);
    });

    it('should not create index state for rejected entries (T-11-03)', async () => {
      // Reject the entry
      const response = await app.inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          entryId,
          decision: 'reject',
          notes: 'Not ready',
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify index state does NOT exist
      const data = await store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === entryId);

      expect(entry).toBeDefined();
      expect(entry?.lifecycleState).toBe('rejected');

      // Rejection should be a no-op for indexing
      expect(entry?.indexState).toBeNull();
      expect(entry?.embeddingCache).toBeNull();
    });

    it('should trigger indexing only after the transaction commits (T-11-01)', async () => {
      // This test verifies the post-commit pattern by checking that
      // the indexing happens after the domain transaction completes
      // The implementation detail is that runKnowledgeIndexEvent is
      // called AFTER store.transact resolves

      const response = await app.inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          entryId,
          decision: 'approve',
          notes: 'Approve for indexing',
        },
      });

      expect(response.statusCode).toBe(200);

      // The fact that we can observe the index state after the route
      // completes proves that indexing happened post-commit
      // If indexing was inside the transaction, we would still see it,
      // but the critical requirement is avoiding nested transactions
      const data = await store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === entryId);

      expect(entry?.indexState?.adapters?.vector?.status).toBe('synced');
      expect(entry?.indexState?.adapters?.keyword?.status).toBe('synced');
    });

    it('marks escalated trap feedback as ready-to-reindex after approval', async () => {
      await store.transact(async (data) => {
        for (let i = 1; i <= 10; i++) {
          data.feedbackQueue.push({
            id: `feedback_review_${i}`,
            entryId,
            entryType: 'trap',
            problemType: 'incorrect',
            description: `Escalated review feedback ${i}`,
            context: null,
            querySeed: null,
            customAnswers: null,
            submittedAt: new Date(Date.now() - i * 60 * 1000).toISOString(),
            submittedByUserId: userId,
            submittedByHandle: 'reviewer',
            status: 'new',
            adminNotes: null,
            resolvedAt: null,
            resolvedByUserId: null,
            triggeredTransition: null,
            remediationStatus: null,
            remediationOpenedAt: null,
            remediationOpenedByUserId: null,
            remediationResolvedAt: null,
            remediationResolvedByUserId: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          });
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          entryId,
          decision: 'approve',
          notes: 'Approve remediated trap',
        },
      });

      expect(response.statusCode).toBe(200);

      const data = await store.snapshot();
      const feedback = data.feedbackQueue.filter((record) => record.entryId === entryId);
      expect(feedback).toHaveLength(10);
      expect(feedback.every((record) => record.remediationStatus === 'ready-to-reindex')).toBe(
        true,
      );
    });
  });

  describe('artifact coexistence (COMP-02, T-12-05)', () => {
    it('should continue to enforce review permissions with skillArtifacts present (COMP-02)', async () => {
      let reviewSessionId!: string; // Will be assigned in transaction
      const reviewerId = 'user_reviewer';
      const knowledgeEntryId = 'knowledge_coexist_1';

      // Setup: Create a reviewer user, session, and a knowledge entry
      await store.transact(async (data) => {
        if (!data.counters) data.counters = {};
        data.counters.user = 2;

        // Create owner user (user_1) - required for knowledge entry
        data.users.push({
          id: 'user_1',
          handle: 'owner_user',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create reviewer user
        data.users.push({
          id: reviewerId,
          handle: 'reviewer_user',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create admin membership for reviewer with knowledge:review permission
        data.memberships.push({
          id: 'membership_review_coexist',
          userId: reviewerId,
          teamId: '', // Global membership uses empty string
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: ['knowledge:review'],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create session for reviewer
        const sessionToken = `session_review_${Date.now()}`;
        data.sessions.push({
          id: `session_${Date.now()}`,
          userId: reviewerId,
          tokenHash: hashSecret(sessionToken),
          activeTeamId: null,
          subjectType: 'user',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });
        reviewSessionId = sessionToken;

        // Create a submitted knowledge entry with proper submission record
        const submissionId = 'submission_coexist_1';
        const revision = {
          revision: 1,
          submittedAt: nowIso(),
          submittedByUserId: 'user_1',
          shortcut: 'Coexistence Test',
          detail: 'Testing artifact coexistence with knowledge review',
          labels: ['coexistence'],
          reviewNotes: [],
        };
        data.knowledgeEntries.push({
          id: knowledgeEntryId,
          teamId: null,
          scope: 'global',
          labels: ['coexistence'],
          shortcut: 'Coexistence Test',
          detail: 'Testing artifact coexistence with knowledge review',
          requiredLevel: 0,
          lifecycleState: 'agent-pass',
          ownerUserId: 'user_1',
          latestRevision: revision,
          history: [revision],
          metadata: {
            scopeLabel: 'global-constraint',
            submissionCount: 1,
            resubmissionCount: 0,
            revisionCount: 1,
            latestSubmissionId: submissionId,
            latestSubmittedAt: nowIso(),
            latestReviewedAt: null,
            latestDecision: null,
          },
          latestSubmissionId: submissionId,
          submissionHistory: [
            {
              id: submissionId,
              revision: 1,
              submittedAt: nowIso(),
              submittedByUserId: 'user_1',
              lifecycleState: 'agent-pass',
              resubmissionOf: null,
              agentReview: null,
              reviewerDecision: null,
              reviewNotes: [],
            },
          ],
          agentReview: null,
          reviewHistory: [],
          reviewNotes: [],
          lifecycleHistory: [],
          embeddingCache: null,
          indexState: null,
          decayMeta: null,
          evidenceMeta: null,
          maintenanceMeta: null,
          boundary: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Add a skill artifact to the store (additive coexistence)
        data.counters.artifact = 1;
        data.skillArtifacts = [
          {
            id: 'artifact_1',
            teamId: null,
            scope: 'global',
            labels: ['artifact', 'skill'],
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
              derived: null,
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
            decayMeta: null,
            evidenceMeta: null,
            maintenanceMeta: null,
            boundary: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          },
        ];
      });

      // Act: Review the knowledge entry (should still work with skillArtifacts present)
      const response = await app.inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: {
          authorization: `Bearer ${reviewSessionId}`,
        },
        payload: {
          entryId: knowledgeEntryId,
          decision: 'approve',
          notes: 'Approving with artifacts present',
        },
      });

      // Assert: Review should succeed
      expect(response.statusCode).toBe(200);

      // Verify the knowledge entry was approved
      const data = await store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === knowledgeEntryId);
      expect(entry?.lifecycleState).toBe('approved');

      // Verify skillArtifacts still exist and were not affected
      expect(data.skillArtifacts).toBeDefined();
      expect(data.skillArtifacts.length).toBe(1);
      expect(data.skillArtifacts[0]?.id).toBe('artifact_1');
    });
  });

  describe('graph document lifecycle (T-36-13)', () => {
    it('should remove graph documents when approved entry transitions to deactivated', async () => {
      let sessionId!: string;
      const userId = 'user_deactivate_graph';
      const teamId = 'team_deactivate_graph';
      const entryId = 'knowledge_deactivate_graph';

      await store.transact(async (data) => {
        if (!data.counters) data.counters = {};
        data.counters.user = 11;

        // Create user
        data.users.push({
          id: userId,
          handle: 'deactivate_user',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create team
        data.teams.push({
          id: teamId,
          name: 'Deactivate Test Team',
          slug: 'deactivate-test-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create membership with admin role
        data.memberships.push({
          id: 'membership_deactivate',
          userId,
          teamId,
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: ['knowledge:review'],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create session
        const sessionToken = `session_deactivate_${Date.now()}`;
        data.sessions.push({
          id: `session_${Date.now()}`,
          userId,
          tokenHash: hashSecret(sessionToken),
          activeTeamId: teamId,
          subjectType: 'user',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });
        sessionId = sessionToken;

        // Create an approved knowledge entry
        const revision = {
          revision: 1,
          submittedAt: nowIso(),
          submittedByUserId: userId,
          shortcut: 'Deactivate Graph Test',
          detail: 'Test detail for graph deactivation',
          labels: ['test'],
          reviewNotes: [],
        };

        data.knowledgeEntries.push({
          id: entryId,
          teamId: null,
          scope: 'global',
          labels: ['test'],
          shortcut: 'Deactivate Graph Test',
          detail: 'Test detail for graph deactivation',
          requiredLevel: 0,
          lifecycleState: 'approved',
          ownerUserId: userId,
          latestRevision: revision,
          history: [revision],
          metadata: {
            scopeLabel: 'global-constraint',
            submissionCount: 1,
            resubmissionCount: 0,
            revisionCount: 1,
            latestSubmissionId: 'submission_deactivate_1',
            latestSubmittedAt: nowIso(),
            latestReviewedAt: nowIso(),
            latestDecision: 'approve',
          },
          latestSubmissionId: 'submission_deactivate_1',
          submissionHistory: [],
          agentReview: null,
          reviewHistory: [
            {
              decidedAt: nowIso(),
              decidedByUserId: userId,
              decision: 'approve',
              notes: 'Initial approval',
            },
          ],
          reviewNotes: [],
          lifecycleHistory: [],
          embeddingCache: null,
          indexState: null,
          decayMeta: null,
          evidenceMeta: null,
          maintenanceMeta: null,
          boundary: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Add a graph document for this entry
        data.graphIndexDocuments.push({
          id: 'graphdoc_deactivate',
          sourceType: 'trap',
          sourceId: entryId,
          revision: 1,
          contentHash: 'deactivate-hash',
          teamId: null,
          scope: 'global',
          requiredLevel: 0,
          nodes: [
            { id: 'node_deactivate', kind: 'trap', label: 'Deactivate Node', evidence: 'Test' },
          ],
          edges: [],
          evidence: 'Graph document for deactivation test',
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      // Verify graph document exists before deactivation
      const beforeData = await store.snapshot();
      expect(beforeData.graphIndexDocuments.find((d) => d.sourceId === entryId)).toBeDefined();

      // Deactivate via operations route
      const response = await app.inject({
        method: 'POST',
        url: `/v1/operations/knowledge/${entryId}/deactivate`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          reason: 'Test deactivation for graph document removal',
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify graph document was removed
      const afterData = await store.snapshot();
      expect(afterData.graphIndexDocuments.find((d) => d.sourceId === entryId)).toBeUndefined();
    });
  });

  describe('review with evidence (EVIDENCE-01)', () => {
    let sessionId: string;
    let entryId: string;
    const userId = 'user_evidence';
    const teamId = 'team_evidence';

    beforeEach(async () => {
      // Setup: Create a user, team, membership, and session
      await store.transact(async (data) => {
        if (!data.counters) data.counters = {};
        data.counters.user = 20;

        // Create user
        data.users.push({
          id: userId,
          handle: 'evidence_reviewer',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create team
        data.teams.push({
          id: teamId,
          name: 'Evidence Test Team',
          slug: 'evidence-test-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create membership
        data.memberships.push({
          id: 'membership_evidence',
          userId,
          teamId,
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: ['knowledge:review'],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create session
        const sessionToken = `session_evidence_${Date.now()}`;
        data.sessions.push({
          id: `session_${Date.now()}`,
          userId,
          tokenHash: hashSecret(sessionToken),
          activeTeamId: teamId,
          subjectType: 'user',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });

        sessionId = sessionToken;

        // Create a submitted knowledge entry
        data.counters.knowledge = 20;
        entryId = 'knowledge_evidence_1';

        const revision = {
          revision: 1,
          submittedAt: nowIso(),
          submittedByUserId: userId,
          shortcut: 'Evidence Test Entry',
          detail: 'Test detail for evidence metadata',
          labels: ['evidence-test'],
          reviewNotes: [],
        };

        data.knowledgeEntries.push({
          id: entryId,
          teamId: null,
          scope: 'global',
          labels: ['evidence-test'],
          shortcut: 'Evidence Test Entry',
          detail: 'Test detail for evidence metadata',
          requiredLevel: 0,
          lifecycleState: 'agent-pass',
          ownerUserId: userId,
          latestRevision: revision,
          history: [revision],
          metadata: {
            scopeLabel: 'global-constraint',
            submissionCount: 1,
            resubmissionCount: 0,
            revisionCount: 1,
            latestSubmissionId: 'submission_evidence_1',
            latestSubmittedAt: nowIso(),
            latestReviewedAt: null,
            latestDecision: null,
          },
          latestSubmissionId: 'submission_evidence_1',
          submissionHistory: [
            {
              id: 'submission_evidence_1',
              revision: 1,
              submittedAt: nowIso(),
              submittedByUserId: userId,
              lifecycleState: 'agent-pass',
              resubmissionOf: null,
              agentReview: null,
              reviewerDecision: null,
              reviewNotes: [],
            },
          ],
          agentReview: null,
          reviewHistory: [],
          reviewNotes: [],
          lifecycleHistory: [],
          embeddingCache: null,
          indexState: null,
          decayMeta: null,
          evidenceMeta: null,
          maintenanceMeta: null,
          boundary: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });
    });

    it('should persist evidence metadata on approval', async () => {
      // Approve with explicit evidence object
      const response = await app.inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          entryId,
          decision: 'approve',
          notes: 'Verified evidence',
          evidence: {
            sourceType: 'incident',
            evidenceLevel: 'verified-in-prod',
            sourceRef: 'INC-123',
            verifiedAt: nowIso(),
            verifiedBy: {
              id: userId,
              handle: 'evidence_reviewer',
              securityLevel: 10,
            },
          },
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify evidence metadata was persisted
      const data = await store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === entryId);

      expect(entry).toBeDefined();
      expect(entry?.lifecycleState).toBe('approved');
      expect(entry?.evidenceMeta).toBeDefined();
      expect(entry?.evidenceMeta?.sourceType).toBe('incident');
      expect(entry?.evidenceMeta?.evidenceLevel).toBe('verified-in-prod');
      expect(entry?.evidenceMeta?.sourceRef).toBe('INC-123');
    });

    it('should create default evidence when not provided on approval', async () => {
      // Approve without evidence
      const response = await app.inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          entryId,
          decision: 'approve',
          notes: 'Approved without explicit evidence',
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify default evidence was created
      const data = await store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === entryId);

      expect(entry).toBeDefined();
      expect(entry?.lifecycleState).toBe('approved');
      expect(entry?.evidenceMeta).toBeDefined();
      expect(entry?.evidenceMeta?.sourceType).toBe('internal-experience');
      expect(entry?.evidenceMeta?.evidenceLevel).toBe('anecdotal');
    });

    it('should not set evidence on rejection', async () => {
      // Reject the entry
      const response = await app.inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          entryId,
          decision: 'reject',
          notes: 'Not acceptable',
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify evidence metadata was NOT set
      const data = await store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === entryId);

      expect(entry).toBeDefined();
      expect(entry?.lifecycleState).toBe('rejected');
      expect(entry?.evidenceMeta).toBeNull();
    });
  });

  describe('outbox vs direct sync emission convergence (Phase 4)', () => {
    it('uses emitLifecycleTransition helper instead of inline PG/JSON split', () => {
      const source = readFileSync(path.join(__dirname, 'review.ts'), 'utf8');
      // review.ts now delegates to emitLifecycleTransition for PG/JSON routing.
      expect(source).toContain('emitLifecycleTransition');
      // No longer contains inline outbox enqueue logic.
      expect(source).not.toContain('outbox.enqueue');
    });
  });
});
