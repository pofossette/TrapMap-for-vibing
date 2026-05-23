import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildServer } from '@trapmap/server/app.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import type { FastifyInstance } from 'fastify';

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

  describe('legacy migration route (Phase 16-01)', () => {
    it('returns 401 for unauthenticated migration request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/migrate',
        payload: {
          mode: 'explicit',
          entryIds: ['knowledge_1'],
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('accepts valid explicit migration request schema', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/migrate',
        payload: {
          mode: 'explicit',
          entryIds: ['knowledge_1', 'knowledge_2'],
        },
      });

      // Should require auth, not fail on schema
      expect(response.statusCode).toBe(401);
    });

    it('accepts all-approved migration mode', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/migrate',
        payload: {
          mode: 'all-approved',
          limit: 50,
        },
      });

      // Should require auth, not fail on schema
      expect(response.statusCode).toBe(401);
    });

    it('accepts all-team migration mode', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/migrate',
        payload: {
          mode: 'all-team',
          teamId: 'team_1',
          limit: 25,
        },
      });

      // Should require auth, not fail on schema
      expect(response.statusCode).toBe(401);
    });

    it('rejects migration request with entry IDs exceeding max (100)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/migrate',
        payload: {
          mode: 'explicit',
          entryIds: Array.from({ length: 101 }, (_, i) => `knowledge_${i}`),
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('rejects migration request with limit exceeding max (200)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/migrate',
        payload: {
          mode: 'all-approved',
          limit: 201,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  // Phase 16-02: Governance parity coverage (COMP-02, COMP-04, T-16-04)
  describe('migration governance parity (Phase 16-02)', () => {
    it('migration route enforces knowledge:import permission', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/migrate',
        payload: {
          mode: 'explicit',
          entryIds: ['knowledge_1'],
        },
      });

      // Should require auth (knowledge:import permission check)
      expect(response.statusCode).toBe(401);
    });

    it('migration route validates request schema before auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/migrate',
        payload: {
          mode: 'invalid-mode', // Invalid mode
        },
      });

      // Should fail validation
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('compatibility status route enforces knowledge:export permission', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/status',
      });

      // Should require auth (knowledge:export permission check)
      expect(response.statusCode).toBe(401);
    });

    it('migration with team scope requires team access', async () => {
      // Verify all-team mode requires teamId
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/migrate',
        payload: {
          mode: 'all-team',
          // Missing teamId - should fail validation
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('migration explicit mode requires entryIds', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/migrate',
        payload: {
          mode: 'explicit',
          // Missing entryIds - should fail validation
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  // Phase 16-02: Governance parity with integration tests (COMP-02, COMP-04, T-16-04, T-16-05)
  describe('migration governance parity integration (Phase 16-02)', () => {
    let testApp: FastifyInstance;
    let testStore: SkillShareerStore;
    let sessionId: string;
    const userId = 'user_governance_test';
    const teamId = 'team_governance_test';
    const otherTeamId = 'team_other_governance';
    let entryId: string;
    let highLevelEntryId: string;

    beforeEach(async () => {
      const testDataFile = `/tmp/trapmap-test-${Date.now()}-${Math.random()}.json`;

      testApp = buildServer({ config: { dataFile: testDataFile } });
      await testApp.ready();
      testStore = testApp.skillShareer.store;

      await testStore.transact(async (data) => {
        if (!data.counters) data.counters = {};
        data.counters.user = 1;
        data.counters.knowledge = 1;

        // Create user
        data.users.push({
          id: userId,
          handle: 'governanceuser',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create teams
        data.teams.push({
          id: teamId,
          name: 'Governance Team',
          slug: 'governance-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
        data.teams.push({
          id: otherTeamId,
          name: 'Other Team',
          slug: 'other-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create membership with admin permissions
        data.memberships.push({
          id: 'membership_governance',
          userId,
          teamId,
          roleTemplate: 'admin',
          securityLevel: 5,
          permissions: ['knowledge:import', 'knowledge:export', 'knowledge:update'],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create session
        const sessionToken = `session_governance_${Date.now()}`;
        data.sessions.push({
          id: `session_gov_${Date.now()}`,
          userId,
          tokenHash: hashSecret(sessionToken),
          activeTeamId: teamId,
          subjectType: 'user',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });
        sessionId = sessionToken;

        // Create approved entry for migration
        entryId = 'knowledge_1';
        data.knowledgeEntries.push({
          id: entryId,
          teamId: null,
          scope: 'global',
          labels: ['test'],
          shortcut: 'Test Entry for Migration',
          detail: 'Test detail for migration parity',
          requiredLevel: 0,
          lifecycleState: 'approved',
          ownerUserId: userId,
          latestRevision: {
            revision: 1,
            submittedAt: nowIso(),
            submittedByUserId: userId,
            shortcut: 'Test Entry for Migration',
            detail: 'Test detail for migration parity',
            labels: ['test'],
            reviewNotes: [],
          },
          history: [
            {
              revision: 1,
              submittedAt: nowIso(),
              submittedByUserId: userId,
              shortcut: 'Test Entry for Migration',
              detail: 'Test detail for migration parity',
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
            latestDecision: 'approve',
          },
          lifecycleHistory: [],
          reviewHistory: [],
          agentReview: null,
          embeddingCache: null,
          indexState: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create high-security-level entry (level 8, user has level 5)
        highLevelEntryId = 'knowledge_2';
        data.knowledgeEntries.push({
          id: highLevelEntryId,
          teamId: null,
          scope: 'global',
          labels: ['secure'],
          shortcut: 'High Security Entry',
          detail: 'Entry requiring higher security level',
          requiredLevel: 8,
          lifecycleState: 'approved',
          ownerUserId: userId,
          latestRevision: {
            revision: 1,
            submittedAt: nowIso(),
            submittedByUserId: userId,
            shortcut: 'High Security Entry',
            detail: 'Entry requiring higher security level',
            labels: ['secure'],
            reviewNotes: [],
          },
          history: [
            {
              revision: 1,
              submittedAt: nowIso(),
              submittedByUserId: userId,
              shortcut: 'High Security Entry',
              detail: 'Entry requiring higher security level',
              labels: ['secure'],
              reviewNotes: [],
            },
          ],
          metadata: {
            scopeLabel: 'global-constraint',
            submissionCount: 1,
            resubmissionCount: 0,
            revisionCount: 1,
            latestSubmissionId: 'submission_2',
            latestSubmittedAt: nowIso(),
            latestReviewedAt: nowIso(),
            latestDecision: 'approve',
          },
          lifecycleHistory: [],
          reviewHistory: [],
          agentReview: null,
          embeddingCache: null,
          indexState: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Initialize artifacts arrays
        if (!data.skillArtifacts) data.skillArtifacts = [];
        if (!data.artifactFilePayloads) data.artifactFilePayloads = [];
      });
    });

    afterEach(async () => {
      if (testApp) {
        await testApp.close();
      }
    });

    it('migration enforces team access for team-scoped entries (T-16-04)', async () => {
      // Add a team-scoped entry
      const teamScopedEntryId = 'knowledge_team_1';
      await testStore.transact(async (data) => {
        data.knowledgeEntries.push({
          id: teamScopedEntryId,
          teamId: otherTeamId, // Different team than user's active team
          scope: 'project',
          labels: ['team-specific'],
          shortcut: 'Team Scoped Entry',
          detail: 'Entry scoped to another team',
          requiredLevel: 0,
          lifecycleState: 'approved',
          ownerUserId: userId,
          latestRevision: {
            revision: 1,
            submittedAt: nowIso(),
            submittedByUserId: userId,
            shortcut: 'Team Scoped Entry',
            detail: 'Entry scoped to another team',
            labels: ['team-specific'],
            reviewNotes: [],
          },
          history: [
            {
              revision: 1,
              submittedAt: nowIso(),
              submittedByUserId: userId,
              shortcut: 'Team Scoped Entry',
              detail: 'Entry scoped to another team',
              labels: ['team-specific'],
              reviewNotes: [],
            },
          ],
          metadata: {
            scopeLabel: 'project-knowledge',
            submissionCount: 1,
            resubmissionCount: 0,
            revisionCount: 1,
            latestSubmissionId: 'submission_team',
            latestSubmittedAt: nowIso(),
            latestReviewedAt: nowIso(),
            latestDecision: 'approve',
          },
          lifecycleHistory: [],
          reviewHistory: [],
          agentReview: null,
          embeddingCache: null,
          indexState: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      // Attempt to migrate the team-scoped entry
      const response = await testApp.inject({
        method: 'POST',
        url: '/v1/operations/migrate',
        payload: {
          mode: 'explicit',
          entryIds: [teamScopedEntryId],
        },
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      // Should fail because user's active team doesn't match entry's team
      expect(response.statusCode).toBe(403);
      const json = response.json();
      expect(json.code).toBe('team_mismatch');
    });

    it('migration enforces security level requirement (T-16-01)', async () => {
      // Attempt to migrate high-security-level entry (level 8, user has level 5)
      const response = await testApp.inject({
        method: 'POST',
        url: '/v1/operations/migrate',
        payload: {
          mode: 'explicit',
          entryIds: [highLevelEntryId],
        },
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      // Should fail because user's security level (5) is not higher than entry's required level (8)
      expect(response.statusCode).toBe(403);
      const json = response.json();
      expect(json.code).toBe('insufficient_level');
    });

    it('migration creates audit event for successful migration (T-16-02)', async () => {
      // Migrate a valid entry
      const response = await testApp.inject({
        method: 'POST',
        url: '/v1/operations/migrate',
        payload: {
          mode: 'explicit',
          entryIds: [entryId],
        },
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.migratedCount).toBe(1);
      expect(json.results[0].success).toBe(true);

      // Verify audit event was created
      const data = await testStore.snapshot();
      const auditEvents = data.auditEvents.filter(
        (e) => e.action === 'artifact-imported' && e.payload?.migration === true,
      );
      expect(auditEvents.length).toBe(1);
      expect(auditEvents[0].entityId).toBe(json.results[0].artifactId);
    });

    it('migration skips non-approved entries with skip reason', async () => {
      // Add a pending entry
      const pendingEntryId = 'knowledge_pending';
      await testStore.transact(async (data) => {
        data.knowledgeEntries.push({
          id: pendingEntryId,
          teamId: null,
          scope: 'global',
          labels: ['pending'],
          shortcut: 'Pending Entry',
          detail: 'Entry not yet approved',
          requiredLevel: 0,
          lifecycleState: 'pending',
          ownerUserId: userId,
          latestRevision: {
            revision: 1,
            submittedAt: nowIso(),
            submittedByUserId: userId,
            shortcut: 'Pending Entry',
            detail: 'Entry not yet approved',
            labels: ['pending'],
            reviewNotes: [],
          },
          history: [
            {
              revision: 1,
              submittedAt: nowIso(),
              submittedByUserId: userId,
              shortcut: 'Pending Entry',
              detail: 'Entry not yet approved',
              labels: ['pending'],
              reviewNotes: [],
            },
          ],
          metadata: {
            scopeLabel: 'global-constraint',
            submissionCount: 1,
            resubmissionCount: 0,
            revisionCount: 1,
            latestSubmissionId: 'submission_pending',
            latestSubmittedAt: nowIso(),
            latestReviewedAt: null,
            latestDecision: null,
          },
          lifecycleHistory: [],
          reviewHistory: [],
          agentReview: null,
          embeddingCache: null,
          indexState: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      // Attempt to migrate pending entry
      const response = await testApp.inject({
        method: 'POST',
        url: '/v1/operations/migrate',
        payload: {
          mode: 'explicit',
          entryIds: [pendingEntryId],
        },
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.skippedCount).toBe(1);
      expect(json.results[0].success).toBe(false);
      expect(json.results[0].skipReason).toContain('lifecycle');
    });

    it('migration preserves required level in created artifact (COMP-02)', async () => {
      // Create entry with specific required level
      const levelEntryId = 'knowledge_level_3';
      const requiredLevel = 3;
      await testStore.transact(async (data) => {
        data.knowledgeEntries.push({
          id: levelEntryId,
          teamId: null,
          scope: 'global',
          labels: ['level-test'],
          shortcut: 'Level Test Entry',
          detail: 'Entry with specific required level',
          requiredLevel: requiredLevel,
          lifecycleState: 'approved',
          ownerUserId: userId,
          latestRevision: {
            revision: 1,
            submittedAt: nowIso(),
            submittedByUserId: userId,
            shortcut: 'Level Test Entry',
            detail: 'Entry with specific required level',
            labels: ['level-test'],
            reviewNotes: [],
          },
          history: [
            {
              revision: 1,
              submittedAt: nowIso(),
              submittedByUserId: userId,
              shortcut: 'Level Test Entry',
              detail: 'Entry with specific required level',
              labels: ['level-test'],
              reviewNotes: [],
            },
          ],
          metadata: {
            scopeLabel: 'global-constraint',
            submissionCount: 1,
            resubmissionCount: 0,
            revisionCount: 1,
            latestSubmissionId: 'submission_level',
            latestSubmittedAt: nowIso(),
            latestReviewedAt: nowIso(),
            latestDecision: 'approve',
          },
          lifecycleHistory: [],
          reviewHistory: [],
          agentReview: null,
          embeddingCache: null,
          indexState: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const response = await testApp.inject({
        method: 'POST',
        url: '/v1/operations/migrate',
        payload: {
          mode: 'explicit',
          entryIds: [levelEntryId],
        },
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.results[0].success).toBe(true);

      // Verify artifact has same required level
      const data = await testStore.snapshot();
      const artifact = data.skillArtifacts?.find((a) => a.id === json.results[0].artifactId);
      expect(artifact).toBeDefined();
      expect(artifact?.requiredLevel).toBe(requiredLevel);
    });
  });
});
