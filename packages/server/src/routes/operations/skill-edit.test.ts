import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../app.js';
import type { SkillShareerStore } from '../../lib/store.js';
import { hashSecret, nowIso } from '../../lib/store.js';

describe('operations routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildServer();
    await app.ready();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('artifact coexistence (COMP-02, T-12-05)', () => {
    it('should expose knowledge audit trail with skillArtifacts present (COMP-02)', async () => {
      const store = app.skillShareer.store;
      let auditSessionId: string;
      const userId = 'user_audit_test';
      const knowledgeEntryId = 'knowledge_audit_1';

      // Setup: Create a user, session, knowledge entry, and skill artifact
      await store.transact(async (data) => {
        if (!data.counters) data.counters = {};
        if (!data.skillArtifacts) data.skillArtifacts = [];
        data.counters.user = 1;

        // Create user with audit:read permission
        data.users.push({
          id: userId,
          handle: 'audit_user',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create admin membership for audit user with audit:read permission
        data.memberships.push({
          id: 'membership_audit_coexist',
          userId,
          teamId: null,
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: ['audit:read'],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create session
        const sessionToken = `session_audit_${Date.now()}`;
        data.sessions.push({
          id: `session_${Date.now()}`,
          userId,
          tokenHash: hashSecret(sessionToken),
          activeTeamId: null,
          subjectType: 'user',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });
        auditSessionId = sessionToken;

        // Create a knowledge entry with audit events
        data.counters.knowledge = 1;
        data.knowledgeEntries.push({
          id: knowledgeEntryId,
          teamId: null,
          scope: 'global',
          labels: ['audit', 'test'],
          shortcut: 'Audit Test Entry',
          detail: 'Testing audit trail with artifacts present',
          requiredLevel: 0,
          lifecycleState: 'approved',
          ownerUserId: userId,
          latestRevision: {
            revision: 1,
            submittedAt: nowIso(),
            submittedByUserId: userId,
            shortcut: 'Audit Test Entry',
            detail: 'Testing audit trail with artifacts present',
            labels: ['audit', 'test'],
            reviewNotes: [],
          },
          history: [],
          metadata: {
            scopeLabel: 'global-constraint',
            submissionCount: 1,
            resubmissionCount: 0,
            revisionCount: 1,
            latestSubmissionId: null,
            latestSubmittedAt: null,
            latestReviewedAt: null,
            latestDecision: null,
          },
          latestSubmissionId: null,
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

        // Add audit events for the knowledge entry
        data.counters.audit = 2;
        data.auditEvents.push(
          {
            id: 'audit_1',
            teamId: null,
            actorId: userId,
            action: 'knowledge-submitted',
            entityId: knowledgeEntryId,
            payload: { shortcut: 'Audit Test Entry' },
            createdAt: nowIso(),
            updatedAt: nowIso(),
          },
          {
            id: 'audit_2',
            teamId: null,
            actorId: userId,
            action: 'knowledge-reviewed',
            entityId: knowledgeEntryId,
            payload: { decision: 'approve' },
            createdAt: nowIso(),
            updatedAt: nowIso(),
          },
        );

        // Add a skill artifact to the store (additive coexistence)
        data.counters.artifact = 1;
        const artifactRevision = {
          revision: 1,
          sourceHash: 'c'.repeat(64),
          files: [
            {
              path: 'SKILL.md',
              kind: 'skill-markdown' as const,
              sha256: 'd'.repeat(64),
              sizeBytes: 100,
              mediaType: 'text/markdown',
              source: 'SKILL.md' as const,
              includeInDerivation: true,
              activationOnly: false,
            },
          ],
          submittedAt: nowIso(),
          submittedByUserId: userId,
          scriptDescriptors: [],
          derived: null,
        };
        data.skillArtifacts = [
          {
            id: 'artifact_audit_1',
            teamId: null,
            scope: 'global',
            labels: ['artifact', 'audit'],
            title: 'Audit Test Artifact',
            slug: 'audit-test-artifact',
            requiredLevel: 0,
            lifecycleState: 'approved',
            ownerUserId: userId,
            latestRevision: artifactRevision,
            history: [artifactRevision],
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
          },
        ];
      });

      // Act: Query audit trail (should still work with skillArtifacts present)
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/audit?limit=10',
        headers: {
          authorization: `Bearer ${auditSessionId}`,
        },
      });

      // Assert: Should succeed and return audit events
      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.items).toBeDefined();
      expect(json.items.length).toBeGreaterThanOrEqual(2);

      // Verify knowledge audit events are present
      const knowledgeAuditEvents = json.items.filter(
        (e: { action: string }) =>
          e.action === 'knowledge-submitted' || e.action === 'knowledge-reviewed',
      );
      expect(knowledgeAuditEvents.length).toBeGreaterThanOrEqual(2);

      // Verify skillArtifacts still exist and were not affected
      const data = await store.snapshot();
      expect(data.skillArtifacts).toBeDefined();
      expect(data.skillArtifacts.length).toBe(1);
    });
  });
});
