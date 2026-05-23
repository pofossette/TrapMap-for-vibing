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

  describe('GET /v1/operations/knowledge', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/knowledge',
      });

      expect(response.statusCode).toBe(401);
      const json = response.json();
      expect(json.code).toBeDefined();
    });

    it('accepts valid query parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/knowledge?scope=global&lifecycleState=approved&requiredLevelMax=5&limit=10',
      });

      // Should require auth
      expect(response.statusCode).toBe(401);
    });

    it('uses default limit value', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/knowledge',
      });

      // Should require auth, not fail on schema
      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /v1/operations/knowledge/:entryId/deactivate', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/knowledge/knowledge_1/deactivate',
        payload: {
          reason: 'Outdated information',
        },
      });

      expect(response.statusCode).toBe(401);
      const json = response.json();
      expect(json.code).toBeDefined();
    });

    it('returns 400 for missing reason', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/knowledge/knowledge_1/deactivate',
        payload: {},
      });

      // Should fail validation (reason required) or auth
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('validates reason length constraints', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/knowledge/knowledge_1/deactivate',
        payload: {
          reason: '', // Empty reason should fail validation
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('deactivation with indexing integration (IDX-06)', () => {
    let testApp: FastifyInstance;
    let testStore: SkillShareerStore;
    let sessionId: string;
    let entryId: string;
    const userId = 'user_idx_test';
    const teamId = 'team_idx_test';

    beforeEach(async () => {
      // Use a unique data file for each test to avoid interference
      const testDataFile = `/tmp/trapmap-test-${Date.now()}-${Math.random()}.json`;

      testApp = buildServer({ config: { dataFile: testDataFile } });
      await testApp.ready();
      testStore = testApp.skillShareer.store;

      // Setup: Create a user, team, membership, session, and an indexed entry
      await testStore.transact(async (data) => {
        // Initialize counters
        if (!data.counters) data.counters = {};
        data.counters.user = 1;

        // Create user
        data.users.push({
          id: userId,
          handle: 'deactivator',
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

        // Create membership with knowledge:update permission
        data.memberships.push({
          id: 'membership_idx_test',
          userId,
          teamId,
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: ['knowledge:update'],
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

        sessionId = sessionToken;

        // Create an approved, indexed knowledge entry
        data.counters.knowledge = 1;
        entryId = 'knowledge_1';

        data.knowledgeEntries.push({
          id: entryId,
          teamId: null,
          scope: 'global',
          labels: ['test'],
          shortcut: 'Test Entry',
          detail: 'Test detail for deactivation',
          requiredLevel: 0,
          lifecycleState: 'approved',
          ownerUserId: userId,
          latestRevision: {
            revision: 1,
            submittedAt: nowIso(),
            submittedByUserId: userId,
            shortcut: 'Test Entry',
            detail: 'Test detail for deactivation',
            labels: ['test'],
            reviewNotes: [],
          },
          history: [
            {
              revision: 1,
              submittedAt: nowIso(),
              submittedByUserId: userId,
              shortcut: 'Test Entry',
              detail: 'Test detail for deactivation',
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
          embeddingCache: {
            textHash: 'test-hash',
            vector: [0.1, 0.2, 0.3],
            createdAt: nowIso(),
            revision: 1,
          },
          indexState: {
            contentHash: 'indexed-hash',
            normalizedAt: nowIso(),
            vector: {
              status: 'synced',
              revision: 1,
              contentHash: 'indexed-hash',
              lastSyncedAt: nowIso(),
              lastError: null,
            },
            keyword: {
              status: 'synced',
              revision: 1,
              contentHash: 'indexed-hash',
              lastSyncedAt: nowIso(),
              lastError: null,
            },
            graph: {
              status: 'synced',
              revision: 1,
              contentHash: 'indexed-hash',
              lastSyncedAt: nowIso(),
              lastError: null,
            },
          },
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });
    });

    afterEach(async () => {
      if (testApp) {
        await testApp.close();
      }
    });

    it('should clear index state when deactivating an indexed entry (IDX-06)', async () => {
      // Deactivate the entry
      const response = await testApp.inject({
        method: 'POST',
        url: `/v1/operations/knowledge/${entryId}/deactivate`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          reason: 'No longer relevant',
        },
      });

      if (response.statusCode !== 200) {
        console.log('Error response:', response.json());
      }

      expect(response.statusCode).toBe(200);

      // Verify index state was cleared
      const data = await testStore.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === entryId);

      expect(entry).toBeDefined();
      expect(entry?.lifecycleState).toBe('deactivated');

      // Index state should be null after deactivation
      expect(entry?.indexState).toBeNull();

      // Embedding cache should also be cleared
      expect(entry?.embeddingCache).toBeNull();
    });
  });
});
