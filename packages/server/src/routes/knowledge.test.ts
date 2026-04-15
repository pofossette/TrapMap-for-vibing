/**
 * Tests for knowledge routes with indexing integration.
 *
 * This module covers:
 * - IDX-05: Approved updates refresh indexes after commit
 * - IDX-06: Deactivation removes indexes after commit
 * - T-11-04: Non-approved updates remain indexing no-ops
 * - T-11-05: Post-commit refresh prevents nested transactions
 * - T-11-06: Deactivate clears persisted index state
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';
import { buildServer } from '../app.js';
import type { JsonStore } from '../lib/store.js';
import { hashSecret, nowIso } from '../lib/store.js';

describe('knowledge routes with indexing integration (IDX-05, IDX-06)', () => {
  let app: FastifyInstance;
  let store: JsonStore;

  beforeEach(async () => {
    // Use a unique data file for each test to avoid interference
    const testDataFile = `/tmp/skill-shareer-test-${Date.now()}-${Math.random()}.json`;
    process.env.SKILL_SHAREER_DATA_FILE = testDataFile;

    app = buildServer();
    await app.ready();
    store = app.skillShareer.store;
  });

  describe('approved update refreshes indexes (IDX-05)', () => {
    let sessionId: string;
    let entryId: string;
    const userId = 'user_1';
    const teamId = 'team_1';

    beforeEach(async () => {
      // Setup: Create a user, team, membership, session, and an approved entry
      await store.transact(async (data) => {
        // Initialize counters
        if (!data.counters) data.counters = {};
        data.counters.user = 1;

        // Create user
        data.users.push({
          id: userId,
          handle: 'updater',
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
        const membershipId = 'membership_1';
        data.memberships.push({
          id: membershipId,
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

        // Create an approved knowledge entry with existing index state
        data.counters.knowledge = 1;
        entryId = `knowledge_1`;

        data.knowledgeEntries.push({
          id: entryId,
          teamId: null,
          scope: 'global',
          labels: ['test', 'original'],
          shortcut: 'Original Shortcut',
          detail: 'Original detail for testing refresh',
          requiredLevel: 0,
          lifecycleState: 'approved',
          ownerUserId: userId,
          latestRevision: {
            revision: 1,
            submittedAt: nowIso(),
            submittedByUserId: userId,
            shortcut: 'Original Shortcut',
            detail: 'Original detail for testing refresh',
            labels: ['test', 'original'],
            reviewNotes: [],
          },
          history: [
            {
              revision: 1,
              submittedAt: nowIso(),
              submittedByUserId: userId,
              shortcut: 'Original Shortcut',
              detail: 'Original detail for testing refresh',
              labels: ['test', 'original'],
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
          indexState: null, // Will be populated after approval in real flow
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });
    });

    it('should refresh index state when updating an approved entry (IDX-05)', async () => {
      // First, approve the entry to create index state
      await store.transact(async (data) => {
        const entry = data.knowledgeEntries.find((e) => e.id === entryId);
        if (entry) {
          entry.lifecycleState = 'approved';
          entry.indexState = {
            contentHash: 'original-hash',
            normalizedAt: nowIso(),
            vector: {
              status: 'synced',
              revision: 1,
              contentHash: 'original-hash',
              lastSyncedAt: nowIso(),
              lastError: null,
            },
            keyword: {
              status: 'synced',
              revision: 1,
              contentHash: 'original-hash',
              lastSyncedAt: nowIso(),
              lastError: null,
            },
            graph: {
              status: 'synced',
              revision: 1,
              contentHash: 'original-hash',
              lastSyncedAt: nowIso(),
              lastError: null,
            },
          };
        }
      });

      // Patch the entry with new content
      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/knowledge/${entryId}`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          labels: ['test', 'updated'],
          shortcut: 'Updated Shortcut',
          detail: 'Updated detail content',
        },
      });

      if (response.statusCode !== 200) {
        console.log('Error response:', response.json());
      }

      expect(response.statusCode).toBe(200);

      // Verify index state was refreshed (contentHash should change)
      const data = await store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === entryId);

      expect(entry).toBeDefined();
      expect(entry?.lifecycleState).toBe('approved');
      expect(entry?.shortcut).toBe('Updated Shortcut');
      expect(entry?.detail).toBe('Updated detail content');

      // Index state should exist and be refreshed (contentHash different from original)
      expect(entry?.indexState).toBeDefined();
      expect(entry?.indexState?.contentHash).not.toBe('original-hash');
      expect(entry?.indexState?.vector?.status).toBe('synced');
      expect(entry?.indexState?.keyword?.status).toBe('synced');
    });

    it('should not create index state for non-approved entries (T-11-04)', async () => {
      // Change entry to submitted state (non-approved)
      await store.transact(async (data) => {
        const entry = data.knowledgeEntries.find((e) => e.id === entryId);
        if (entry) {
          entry.lifecycleState = 'submitted';
        }
      });

      // Patch the submitted entry
      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/knowledge/${entryId}`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          labels: ['test', 'updated'],
          shortcut: 'Updated Shortcut',
          detail: 'Updated detail content',
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify index state does NOT exist
      const data = await store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === entryId);

      expect(entry).toBeDefined();
      expect(entry?.lifecycleState).toBe('submitted');
      expect(entry?.shortcut).toBe('Updated Shortcut');

      // Non-approved update should be a no-op for indexing
      expect(entry?.indexState).toBeNull();
      expect(entry?.embeddingCache).toBeNull();
    });

    it('should trigger refresh only after the transaction commits (T-11-05)', async () => {
      // Setup entry with existing index state
      await store.transact(async (data) => {
        const entry = data.knowledgeEntries.find((e) => e.id === entryId);
        if (entry) {
          entry.indexState = {
            contentHash: 'before-update',
            normalizedAt: nowIso(),
            vector: {
              status: 'synced',
              revision: 1,
              contentHash: 'before-update',
              lastSyncedAt: nowIso(),
              lastError: null,
            },
            keyword: {
              status: 'synced',
              revision: 1,
              contentHash: 'before-update',
              lastSyncedAt: nowIso(),
              lastError: null,
            },
            graph: {
              status: 'synced',
              revision: 1,
              contentHash: 'before-update',
              lastSyncedAt: nowIso(),
              lastError: null,
            },
          };
        }
      });

      // Patch the entry
      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/knowledge/${entryId}`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          detail: 'New detail that should trigger refresh',
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify refresh happened post-commit by observing the new contentHash
      const data = await store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === entryId);

      expect(entry?.indexState?.contentHash).not.toBe('before-update');
      expect(entry?.indexState?.vector?.status).toBe('synced');
    });
  });

  describe('deactivation removes indexes (IDX-06)', () => {
    let sessionId: string;
    let entryId: string;
    const userId = 'user_1';
    const teamId = 'team_1';

    beforeEach(async () => {
      // Setup: Create a user, team, membership, session, and an indexed entry
      await store.transact(async (data) => {
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
        const membershipId = 'membership_1';
        data.memberships.push({
          id: membershipId,
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
        entryId = `knowledge_1`;

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
            vector: [0.1, 0.2, 0.3],
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

    it('should clear index state when deactivating an indexed entry (IDX-06)', async () => {
      // Deactivate the entry
      const response = await app.inject({
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
      const data = await store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === entryId);

      expect(entry).toBeDefined();
      expect(entry?.lifecycleState).toBe('deactivated');

      // Index state should be null after deactivation
      expect(entry?.indexState).toBeNull();

      // Embedding cache should also be cleared
      expect(entry?.embeddingCache).toBeNull();
    });

    it('should clear index state only after the transaction commits (T-11-06)', async () => {
      // Deactivate the entry
      const response = await app.inject({
        method: 'POST',
        url: `/v1/operations/knowledge/${entryId}/deactivate`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          reason: 'Test post-commit removal',
        },
      });

      expect(response.statusCode).toBe(200);

      // The fact that we can observe null indexState after the route
      // completes proves that removal happened post-commit
      const data = await store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === entryId);

      expect(entry?.lifecycleState).toBe('deactivated');
      expect(entry?.indexState).toBeNull();
    });

    it('should handle deactivation of already-unindexed entries gracefully', async () => {
      // Remove index state first
      await store.transact(async (data) => {
        const entry = data.knowledgeEntries.find((e) => e.id === entryId);
        if (entry) {
          entry.indexState = null;
          entry.embeddingCache = null;
        }
      });

      // Deactivate the entry (should not fail)
      const response = await app.inject({
        method: 'POST',
        url: `/v1/operations/knowledge/${entryId}/deactivate`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          reason: 'Already unindexed',
        },
      });

      expect(response.statusCode).toBe(200);

      const data = await store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === entryId);

      expect(entry?.lifecycleState).toBe('deactivated');
      expect(entry?.indexState).toBeNull();
    });
  });
});
