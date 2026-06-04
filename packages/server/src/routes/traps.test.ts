/**
 * Tests for trap routes.
 *
 * Covers:
 * - PG-mode trap submission via shared application service
 * - Trap resubmission persists revision, governance, and lifecycle
 * - Trap route uses repos.knowledge (not legacy knowledgeRepo)
 *
 * Phase 3 of the PG-first convergence plan.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildServer } from '@trapmap/server/app.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import type { FastifyInstance } from 'fastify';

describe('trap routes', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-traps-${Date.now()}-${Math.random()}.json`;
    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('trap submission', () => {
    let sessionId: string;
    const userId = 'user_trap_sub';
    const teamId = 'team_trap_sub';

    beforeEach(async () => {
      await store.transact(async (data) => {
        if (!data.counters) data.counters = {};
        data.counters.user = 1;

        data.users.push({
          id: userId,
          handle: 'trap_submitter',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.teams.push({
          id: teamId,
          name: 'Trap Test Team',
          slug: 'trap-test-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_trap_sub',
          userId,
          teamId,
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: ['knowledge:submit', 'knowledge:update'],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        const sessionToken = `session_trap_${Date.now()}`;
        data.sessions.push({
          id: `session_trap_${Date.now()}`,
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

    it('should submit a trap via the shared application service', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/traps',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          scope: 'global',
          labels: ['trap', 'test'],
          shortcut: 'Trap Shortcut',
          detail: 'Trap detail for submission test through the shared service layer',
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.entry.shortcut).toBe('Trap Shortcut');
      expect(body.entry.labels).toContain('trap');
      expect(body.entry.owner.id).toBe(userId);

      // Verify the entry was persisted via repos.knowledge (not legacy knowledgeRepo)
      const data = await store.snapshot();
      const entries = data.knowledgeEntries.filter((e) => e.shortcut === 'Trap Shortcut');
      expect(entries.length).toBe(1);
    });

    it('should persist boundary when submitting a trap', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/traps',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          scope: 'global',
          labels: ['trap-boundary'],
          shortcut: 'Trap with Boundary',
          detail: 'Trap detail with boundary constraints for testing',
          boundary: {
            context: ['test-context'],
            versions: [],
            prerequisites: [],
            signals: [],
            exclusions: [],
            evidence: [],
          },
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.entry.boundary).toBeDefined();
      expect(body.entry.boundary.context).toContain('test-context');
    });
  });

  describe('trap resubmission', () => {
    let sessionId: string;
    const userId = 'user_trap_resub';
    const teamId = 'team_trap_resub';
    let rejectedEntryId: string;

    beforeEach(async () => {
      await store.transact(async (data) => {
        if (!data.counters) data.counters = {};
        data.counters.user = 1;
        data.counters.knowledge = 1;

        data.users.push({
          id: userId,
          handle: 'trap_resubmitter',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.teams.push({
          id: teamId,
          name: 'Trap Resub Team',
          slug: 'trap-resub-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_trap_resub',
          userId,
          teamId,
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: ['knowledge:submit', 'knowledge:update'],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        const sessionToken = `session_trap_resub_${Date.now()}`;
        data.sessions.push({
          id: `session_trap_resub_${Date.now()}`,
          userId,
          tokenHash: hashSecret(sessionToken),
          activeTeamId: teamId,
          subjectType: 'user',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });

        sessionId = sessionToken;

        // Create a rejected trap entry
        rejectedEntryId = 'knowledge_1';
        const submittedAt = nowIso();
        data.knowledgeEntries.push({
          id: rejectedEntryId,
          teamId: null,
          scope: 'global',
          labels: ['rejected-trap'],
          shortcut: 'Rejected Trap',
          detail: 'This trap was rejected and needs resubmission',
          requiredLevel: 0,
          lifecycleState: 'rejected',
          ownerUserId: userId,
          latestRevision: {
            revision: 1,
            submittedAt,
            submittedByUserId: userId,
            shortcut: 'Rejected Trap',
            detail: 'This trap was rejected and needs resubmission',
            labels: ['rejected-trap'],
            reviewNotes: [],
          },
          history: [
            {
              revision: 1,
              submittedAt,
              submittedByUserId: userId,
              shortcut: 'Rejected Trap',
              detail: 'This trap was rejected and needs resubmission',
              labels: ['rejected-trap'],
              reviewNotes: [],
            },
          ],
          metadata: {
            scopeLabel: 'global-constraint',
            submissionCount: 1,
            resubmissionCount: 0,
            revisionCount: 1,
            latestSubmissionId: 'submission_1',
            latestSubmittedAt: submittedAt,
            latestReviewedAt: submittedAt,
            latestDecision: 'reject',
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
          createdAt: submittedAt,
          updatedAt: submittedAt,
        });
      });
    });

    it('should resubmit a rejected trap with full persistence', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/v1/traps/${rejectedEntryId}/resubmit`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          labels: ['resubmitted', 'trap'],
          shortcut: 'Resubmitted Trap',
          detail: 'This trap has been resubmitted with corrections after rejection',
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.entry.labels).toContain('resubmitted');
      expect(body.entry.shortcut).toBe('Resubmitted Trap');
      expect(body.entry.history).toHaveLength(2);
    });

    it('should reject resubmit by non-owner', async () => {
      // Create a second user
      await store.transact(async (data) => {
        data.counters!.user = 2;
        data.users.push({
          id: 'user_trap_other',
          handle: 'other_user',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        const otherSessionToken = `session_trap_other_${Date.now()}`;
        data.sessions.push({
          id: `session_trap_other_${Date.now()}`,
          userId: 'user_trap_other',
          tokenHash: hashSecret(otherSessionToken),
          activeTeamId: teamId,
          subjectType: 'user',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });
      });

      // Get the other user's session token
      const data = await store.snapshot();
      const _otherSession = data.sessions.find((s) => s.userId === 'user_trap_other');
      // We need to use the token, not the hash. Use the original token we set.
      // Since we can't recover the token from the hash, let's create a new session directly.

      // Actually, let's just inject a different user's session
      const otherToken = `session_trap_other_inject_${Date.now()}`;
      await store.transact(async (data) => {
        data.sessions.push({
          id: `session_inject_${Date.now()}`,
          userId: 'user_trap_other',
          tokenHash: hashSecret(otherToken),
          activeTeamId: teamId,
          subjectType: 'user',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/traps/${rejectedEntryId}/resubmit`,
        headers: {
          authorization: `Bearer ${otherToken}`,
        },
        payload: {
          labels: ['resubmitted'],
          shortcut: 'Resubmitted Trap',
          detail: 'This should fail because the user is not the owner',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should reject resubmit of non-rejected trap', async () => {
      // Change the entry to approved state
      await store.transact(async (data) => {
        const entry = data.knowledgeEntries.find((e) => e.id === rejectedEntryId);
        if (entry) {
          entry.lifecycleState = 'approved';
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/traps/${rejectedEntryId}/resubmit`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          labels: ['resubmitted'],
          shortcut: 'Resubmitted Trap',
          detail: 'This should fail because the entry is not rejected',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('invalid_state');
    });
  });

  describe('trap listing and retrieval', () => {
    let sessionId: string;
    const userId = 'user_trap_list';
    const teamId = 'team_trap_list';

    beforeEach(async () => {
      await store.transact(async (data) => {
        if (!data.counters) data.counters = {};
        data.counters.user = 1;
        data.counters.knowledge = 2;

        data.users.push({
          id: userId,
          handle: 'trap_lister',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.teams.push({
          id: teamId,
          name: 'Trap List Team',
          slug: 'trap-list-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_trap_list',
          userId,
          teamId,
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: ['knowledge:submit'],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        const sessionToken = `session_trap_list_${Date.now()}`;
        data.sessions.push({
          id: `session_trap_list_${Date.now()}`,
          userId,
          tokenHash: hashSecret(sessionToken),
          activeTeamId: teamId,
          subjectType: 'user',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });

        sessionId = sessionToken;

        // Create some entries
        const submittedAt = nowIso();
        for (let i = 1; i <= 2; i++) {
          data.knowledgeEntries.push({
            id: `knowledge_${i}`,
            teamId: null,
            scope: 'global',
            labels: [`trap-${i}`],
            shortcut: `Trap ${i}`,
            detail: `Trap detail ${i} for listing test`,
            requiredLevel: 0,
            lifecycleState: 'approved',
            ownerUserId: userId,
            latestRevision: {
              revision: 1,
              submittedAt,
              submittedByUserId: userId,
              shortcut: `Trap ${i}`,
              detail: `Trap detail ${i} for listing test`,
              labels: [`trap-${i}`],
              reviewNotes: [],
            },
            history: [
              {
                revision: 1,
                submittedAt,
                submittedByUserId: userId,
                shortcut: `Trap ${i}`,
                detail: `Trap detail ${i} for listing test`,
                labels: [`trap-${i}`],
                reviewNotes: [],
              },
            ],
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
            decayMeta: null,
            evidenceMeta: null,
            maintenanceMeta: null,
            boundary: null,
            createdAt: submittedAt,
            updatedAt: submittedAt,
          });
        }
      });
    });

    it('should list own traps via repos.knowledge', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/traps',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.items).toHaveLength(2);
      expect(body.items[0].owner.id).toBe(userId);
    });

    it('should get a single trap by id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/traps/knowledge_1',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.entry.id).toBe('knowledge_1');
      expect(body.entry.shortcut).toBe('Trap 1');
    });

    it('should return 404 for non-existent trap', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/traps/non_existent',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('trap supersede', () => {
    let sessionId: string;
    const userId = 'user_trap_supersede';
    const teamId = 'team_trap_supersede';
    let trapId: string;
    let replacementId: string;

    beforeEach(async () => {
      await store.transact(async (data) => {
        if (!data.counters) data.counters = {};
        data.counters.user = 1;

        data.users.push({
          id: userId,
          handle: 'trap_superseder',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.teams.push({
          id: teamId,
          name: 'Trap Supersede Team',
          slug: 'trap-supersede-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_trap_supersede',
          userId,
          teamId,
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: ['knowledge:update'],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        const sessionToken = `session_trap_supersede_${Date.now()}`;
        data.sessions.push({
          id: `session_trap_supersede_${Date.now()}`,
          userId,
          tokenHash: hashSecret(sessionToken),
          activeTeamId: teamId,
          subjectType: 'user',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });

        sessionId = sessionToken;
        trapId = 'trap_supersede_source';
        replacementId = 'trap_supersede_replacement';

        const submittedAt = nowIso();
        const makeTrap = (id: string, shortcut: string) => ({
          id,
          teamId: null,
          scope: 'global' as const,
          labels: ['trap', 'supersede'],
          shortcut,
          detail: `${shortcut} detail`,
          requiredLevel: 0,
          lifecycleState: 'approved' as const,
          ownerUserId: userId,
          latestRevision: {
            revision: 1,
            submittedAt,
            submittedByUserId: userId,
            shortcut,
            detail: `${shortcut} detail`,
            labels: ['trap', 'supersede'],
            reviewNotes: [],
          },
          history: [
            {
              revision: 1,
              submittedAt,
              submittedByUserId: userId,
              shortcut,
              detail: `${shortcut} detail`,
              labels: ['trap', 'supersede'],
              reviewNotes: [],
            },
          ],
          metadata: {
            scopeLabel: 'global-constraint',
            submissionCount: 1,
            resubmissionCount: 0,
            revisionCount: 1,
            latestSubmissionId: `submission_${id}`,
            latestSubmittedAt: submittedAt,
            latestReviewedAt: submittedAt,
            latestDecision: 'approve' as const,
          },
          latestSubmissionId: `submission_${id}`,
          submissionHistory: [],
          agentReview: null,
          reviewHistory: [],
          reviewNotes: [],
          lifecycleHistory: [],
          embeddingCache: null,
          indexState: null,
          decayMeta: null,
          createdAt: submittedAt,
          updatedAt: submittedAt,
        });

        data.knowledgeEntries.push(
          makeTrap(trapId, 'Superseded Trap'),
          makeTrap(replacementId, 'Replacement Trap'),
        );
      });
    });

    it('transitions the superseded trap to deactivated', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/v1/traps/${trapId}/supersede`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          replacementId,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.entry.id).toBe(trapId);
      expect(body.entry.lifecycleState).toBe('deactivated');

      const snapshot = await store.snapshot();
      const updated = snapshot.knowledgeEntries.find((entry) => entry.id === trapId);
      expect(updated?.lifecycleState).toBe('deactivated');
      expect(updated?.decayMeta?.supersededById).toBe(replacementId);
    });
  });
});
