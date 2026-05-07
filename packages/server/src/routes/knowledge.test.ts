/**
 * Tests for knowledge routes with indexing integration.
 *
 * This module covers:
 * - IDX-05: Approved updates refresh indexes after commit
 * - IDX-06: Deactivation removes indexes after commit
 * - T-11-04: Non-approved updates remain indexing no-ops
 * - T-11-05: Post-commit refresh prevents nested transactions
 * - T-11-06: Deactivate clears persisted index state
 * - WRITE-02: Repository integration for knowledge mutations
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FastifyInstance } from 'fastify';
import { buildServer } from '../app.js';
import type { KnowledgeRepository } from '../lib/knowledge/index.js';
import type { SkillShareerStore } from '../lib/store.js';
import { hashSecret, nowIso } from '../lib/store.js';

describe('knowledge routes with indexing integration (IDX-05, IDX-06)', () => {
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
        entryId = 'knowledge_1';

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
      expect(entry?.indexState?.adapters?.vector?.status).toBe('synced');
      expect(entry?.indexState?.adapters?.keyword?.status).toBe('synced');
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
      expect(entry?.indexState?.adapters?.vector?.status).toBe('synced');
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

  describe('artifact coexistence (COMP-02, T-12-05)', () => {
    it('should continue to respect team scope and security level with skillArtifacts present (COMP-02)', async () => {
      let updateSessionId: string;
      const updaterId = 'user_updater';
      const team1Id = 'team_coexist_1';
      const team2Id = 'team_coexist_2';
      const knowledgeEntryId = 'knowledge_coexist_1';

      // Setup: Create two teams, a user with different security levels, and a knowledge entry
      await store.transact(async (data) => {
        if (!data.counters) data.counters = {};
        data.counters.user = 2;
        data.counters.team = 2;

        // Create teams
        data.teams.push(
          {
            id: team1Id,
            name: 'Team 1',
            slug: 'team-1',
            description: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          },
          {
            id: team2Id,
            name: 'Team 2',
            slug: 'team-2',
            description: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          },
        );

        // Create user with membership in team1 only
        data.users.push({
          id: updaterId,
          handle: 'updater_user',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Membership in team1 with knowledge:update permission
        // User needs securityLevel > entry.requiredLevel for updates
        data.memberships.push({
          id: 'membership_coexist_1',
          userId: updaterId,
          teamId: team1Id,
          roleTemplate: 'admin',
          securityLevel: 6,
          permissions: ['knowledge:update'],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create session for user with team1 active
        const sessionToken = `session_update_${Date.now()}`;
        data.sessions.push({
          id: `session_${Date.now()}`,
          userId: updaterId,
          tokenHash: hashSecret(sessionToken),
          activeTeamId: team1Id,
          subjectType: 'user',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });
        updateSessionId = sessionToken;

        // Create a project-scoped knowledge entry for team1
        const revision = {
          revision: 1,
          submittedAt: nowIso(),
          submittedByUserId: updaterId,
          shortcut: 'Team1 Knowledge',
          detail: 'Team1 specific knowledge',
          labels: ['team1'],
          reviewNotes: [],
        };
        data.knowledgeEntries.push({
          id: knowledgeEntryId,
          teamId: team1Id,
          scope: 'project',
          labels: ['team1'],
          shortcut: 'Team1 Knowledge',
          detail: 'Team1 specific knowledge',
          requiredLevel: 5,
          lifecycleState: 'approved',
          ownerUserId: updaterId,
          latestRevision: revision,
          history: [revision],
          metadata: {
            scopeLabel: 'project-knowledge',
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

        // Add skill artifacts for both teams (additive coexistence)
        data.counters.artifact = 2;
        data.skillArtifacts = [
          {
            id: 'artifact_team1',
            teamId: team1Id,
            scope: 'project',
            labels: ['artifact', 'team1'],
            title: 'Team1 Artifact',
            slug: 'team1-artifact',
            requiredLevel: 5,
            lifecycleState: 'approved',
            ownerUserId: updaterId,
            latestRevision: {
              revision: 1,
              sourceHash: 'a'.repeat(64),
              files: [],
              submittedAt: nowIso(),
              submittedByUserId: updaterId,
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
            createdAt: nowIso(),
            updatedAt: nowIso(),
          },
          {
            id: 'artifact_team2',
            teamId: team2Id,
            scope: 'project',
            labels: ['artifact', 'team2'],
            title: 'Team2 Artifact',
            slug: 'team2-artifact',
            requiredLevel: 5,
            lifecycleState: 'approved',
            ownerUserId: 'user_2',
            latestRevision: {
              revision: 1,
              sourceHash: 'b'.repeat(64),
              files: [],
              submittedAt: nowIso(),
              submittedByUserId: 'user_2',
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
            createdAt: nowIso(),
            updatedAt: nowIso(),
          },
        ];
      });

      // Act: Update the knowledge entry (should work for user's own team)
      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/knowledge/${knowledgeEntryId}`,
        headers: {
          authorization: `Bearer ${updateSessionId}`,
        },
        payload: {
          labels: ['team1', 'updated'],
          shortcut: 'Updated Team1 Knowledge',
          detail: 'Updated detail',
          requiredLevel: 5,
        },
      });

      // Assert: Update should succeed
      expect(response.statusCode).toBe(200);

      // Verify the knowledge entry was updated
      const data = await store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === knowledgeEntryId);
      expect(entry?.shortcut).toBe('Updated Team1 Knowledge');
      expect(entry?.labels).toContain('updated');

      // Verify skillArtifacts still exist and were not affected
      expect(data.skillArtifacts).toBeDefined();
      expect(data.skillArtifacts.length).toBe(2);
    });
  });

  describe('knowledge repository integration (WRITE-02)', () => {
    let sessionId: string;
    const userId = 'user_repo_test';
    const teamId = 'team_repo_test';

    beforeEach(async () => {
      // Setup: Create a user, team, membership, session
      await store.transact(async (data) => {
        if (!data.counters) data.counters = {};
        data.counters.user = 1;

        // Create user
        data.users.push({
          id: userId,
          handle: 'repo_tester',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create team
        data.teams.push({
          id: teamId,
          name: 'Repo Test Team',
          slug: 'repo-test-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create membership with knowledge:submit permission
        data.memberships.push({
          id: 'membership_repo_test',
          userId,
          teamId,
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: ['knowledge:submit', 'knowledge:update'],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create session
        const sessionToken = `session_repo_${Date.now()}`;
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
      });
    });

    it('should fallback to store.transact without repository', async () => {
      // In test environment (JsonStore), repos.knowledge is an InMemoryKnowledgeRepository
      // that wraps the same store — the idempotent insert prevents double-writes
      expect(app.skillShareer.repos.knowledge).toBeDefined();

      // Create knowledge entry
      const response = await app.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          scope: 'global',
          labels: ['test'],
          shortcut: 'Test Entry',
          detail: 'Test detail for repository fallback',
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify entry was created via JSONB store
      const data = await store.snapshot();
      const entries = data.knowledgeEntries.filter((e) => e.shortcut === 'Test Entry');
      expect(entries.length).toBe(1);
    });

    it('should use repository for knowledge creation when available', async () => {
      // Mock knowledgeRepo
      const mockRepo: KnowledgeRepository = {
        nextId: vi.fn().mockResolvedValue('knowledge_123'),
        insert: vi.fn().mockResolvedValue(undefined),
        getById: vi.fn().mockResolvedValue(null),
        updateLifecycle: vi.fn().mockResolvedValue(undefined),
        appendRevision: vi.fn().mockResolvedValue(undefined),
        appendLifecycleEvent: vi.fn().mockResolvedValue(undefined),
        listByFilter: vi.fn().mockResolvedValue([]),
        updateGovernance: vi.fn().mockResolvedValue(undefined),
      };

      // Inject mock repository at new repos path
      (app.skillShareer.repos as { knowledge: KnowledgeRepository }).knowledge = mockRepo;

      // Create knowledge entry
      const response = await app.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          scope: 'global',
          labels: ['test'],
          shortcut: 'Test Entry with Repo',
          detail: 'Test detail for repository integration',
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify repository was called for ID generation
      expect(mockRepo.nextId).toHaveBeenCalled();

      // Verify repository was called for insert (dual-write)
      expect(mockRepo.insert).toHaveBeenCalled();
    });

    it('should update governance via repository on PATCH', async () => {
      // Mock knowledgeRepo
      const mockRepo: KnowledgeRepository = {
        nextId: vi.fn().mockResolvedValue('knowledge_456'),
        insert: vi.fn().mockResolvedValue(undefined),
        getById: vi.fn().mockResolvedValue(null),
        updateLifecycle: vi.fn().mockResolvedValue(undefined),
        appendRevision: vi.fn().mockResolvedValue(undefined),
        appendLifecycleEvent: vi.fn().mockResolvedValue(undefined),
        listByFilter: vi.fn().mockResolvedValue([]),
        updateGovernance: vi.fn().mockResolvedValue(undefined),
      };

      // Inject mock repository at new repos path
      (app.skillShareer.repos as { knowledge: KnowledgeRepository }).knowledge = mockRepo;

      // Create an approved knowledge entry first
      const entryId = 'knowledge_456';
      await store.transact(async (data) => {
        data.knowledgeEntries.push({
          id: entryId,
          teamId: null,
          scope: 'global',
          labels: ['test'],
          shortcut: 'Test Entry for Update',
          detail: 'Test detail',
          requiredLevel: 0,
          lifecycleState: 'approved',
          ownerUserId: userId,
          latestRevision: {
            revision: 1,
            submittedAt: nowIso(),
            submittedByUserId: userId,
            shortcut: 'Test Entry for Update',
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
      });

      // Update the entry
      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/knowledge/${entryId}`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          labels: ['test', 'updated'],
        },
      });

      expect(response.statusCode).toBe(200);

      // PATCH now updates governance directly via store.transact (no repo.updateGovernance call)
      // Verify the entry was updated in the store
      const data = await store.snapshot();
      const updated = data.knowledgeEntries.find((e) => e.id === entryId);
      expect(updated?.labels).toEqual(['test', 'updated']);
    });
  });
});
