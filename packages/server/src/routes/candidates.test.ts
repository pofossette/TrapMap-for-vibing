/**
 * Tests for apply-resolution endpoint.
 *
 * This module covers:
 * - Resolution returns 404 for non-existent candidate
 * - Resolution returns 400 for invalid status
 * - Resolution returns 400 for missing manual result
 * - Resolution publishes trap for independent decision
 * - Resolution publishes skill for independent decision
 * - Resolution records lineage for merged decision
 * - Resolution is idempotent
 * - Resolution records audit event
 * - Resolution requires knowledge:review permission
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';
import { buildServer } from '../app.js';
import type { SkillShareerStore } from '../lib/store.js';
import { hashSecret, nowIso } from '../lib/store.js';

describe('apply-resolution endpoint', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;
  let sessionId: string;
  const userId = 'user_1';
  const teamId = 'team_1';

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-${Date.now()}-${Math.random()}.json`;

    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;

    // Setup: Create a user, team, membership, and session
    await store.transact(async (data) => {
      if (!data.counters) data.counters = {};
      data.counters.user = 1;

      data.users.push({
        id: userId,
        handle: 'reviewer',
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      data.teams.push({
        id: teamId,
        name: 'Test Team',
        slug: 'test-team',
        description: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      data.memberships.push({
        id: 'membership_1',
        userId,
        teamId,
        roleTemplate: 'admin',
        securityLevel: 10,
        permissions: ['knowledge:review'],
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

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
    });
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('validation errors', () => {
    it('should return 404 for non-existent candidate', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/candidates/candidate_nonexistent/apply-resolution',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.code).toBe('candidate_not_found');
    });

    it('should return 400 for candidate without duplicate_detected status', async () => {
      const candidateId = 'candidate_1';

      await store.transact(async (data) => {
        data.candidateSubmissions.push({
          id: candidateId,
          sourceType: 'trap',
          submittedBy: userId,
          teamId: null,
          status: 'received',
          originalPayload: {
            trap: {
              scope: 'global',
              labels: ['test'],
              shortcut: 'Test',
              detail: 'Test detail',
            },
          },
          analysisSnapshot: null,
          duplicateCase: null,
          receivedAt: nowIso(),
          queuedAt: null,
          analyzingAt: null,
          completedAt: null,
          lastError: null,
          retryCount: 0,
          manualResult: null,
        });
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/candidates/${candidateId}/apply-resolution`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.code).toBe('invalid_candidate_status');
    });

    it('should return 400 for candidate without manual result', async () => {
      const candidateId = 'candidate_2';

      await store.transact(async (data) => {
        data.candidateSubmissions.push({
          id: candidateId,
          sourceType: 'trap',
          submittedBy: userId,
          teamId: null,
          status: 'duplicate_detected',
          originalPayload: {
            trap: {
              scope: 'global',
              labels: ['test'],
              shortcut: 'Test',
              detail: 'Test detail',
            },
          },
          analysisSnapshot: null,
          duplicateCase: null,
          receivedAt: nowIso(),
          queuedAt: null,
          analyzingAt: null,
          completedAt: null,
          lastError: null,
          retryCount: 0,
          manualResult: null,
        });
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/candidates/${candidateId}/apply-resolution`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.code).toBe('no_manual_result');
    });
  });

  describe('independent decision', () => {
    it('should publish trap for independent decision', async () => {
      const candidateId = 'candidate_3';

      await store.transact(async (data) => {
        data.candidateSubmissions.push({
          id: candidateId,
          sourceType: 'trap',
          submittedBy: userId,
          teamId: null,
          status: 'duplicate_detected',
          originalPayload: {
            trap: {
              scope: 'global',
              labels: ['test'],
              shortcut: 'Test Trap',
              detail: 'Test detail',
              requiredLevel: 0,
            },
          },
          analysisSnapshot: null,
          duplicateCase: null,
          receivedAt: nowIso(),
          queuedAt: null,
          analyzingAt: null,
          completedAt: null,
          lastError: null,
          retryCount: 0,
          manualResult: {
            decision: 'independent',
            notes: 'This is a new trap',
            submittedAt: nowIso(),
            submittedBy: userId,
          },
        });
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/candidates/${candidateId}/apply-resolution`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('resolved');
      expect(body.outcome.decision).toBe('independent');
      expect(body.outcome.publishedEntityId).toBeDefined();
      expect(body.outcome.entityType).toBe('trap');
      expect(body.lineage.relationshipType).toBe('published_as');

      // Verify knowledge entry was created
      const data = await store.snapshot();
      const entry = data.knowledgeEntries.find(e => e.id === body.outcome.publishedEntityId);
      expect(entry).toBeDefined();
      expect(entry?.lifecycleState).toBe('agent-pass');
    });

    it('should publish skill for independent decision', async () => {
      const candidateId = 'candidate_4';

      await store.transact(async (data) => {
        data.candidateSubmissions.push({
          id: candidateId,
          sourceType: 'skill',
          submittedBy: userId,
          teamId: null,
          status: 'duplicate_detected',
          originalPayload: {
            skill: {
              files: [
                { path: 'SKILL.md', sha256: 'a'.repeat(64), sizeBytes: 100, mediaType: 'text/markdown' },
              ],
              metadata: { title: 'Test Skill', slug: 'test-skill', labels: ['test'] },
            },
          },
          analysisSnapshot: null,
          duplicateCase: null,
          receivedAt: nowIso(),
          queuedAt: null,
          analyzingAt: null,
          completedAt: null,
          lastError: null,
          retryCount: 0,
          manualResult: {
            decision: 'independent',
            notes: 'This is a new skill',
            submittedAt: nowIso(),
            submittedBy: userId,
          },
        });
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/candidates/${candidateId}/apply-resolution`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('resolved');
      expect(body.outcome.decision).toBe('independent');
      expect(body.outcome.publishedEntityId).toBeDefined();
      expect(body.outcome.entityType).toBe('skill');
      expect(body.lineage.relationshipType).toBe('published_as');

      // Verify skill artifact was created
      const data = await store.snapshot();
      const artifact = data.skillArtifacts.find(a => a.id === body.outcome.publishedEntityId);
      expect(artifact).toBeDefined();
      expect(artifact?.lifecycleState).toBe('agent-pass');
    });
  });

  describe('merged decision', () => {
    it('should record lineage for merged decision', async () => {
      const candidateId = 'candidate_5';
      const existingTrapId = 'knowledge_existing';

      await store.transact(async (data) => {
        // Create existing trap
        data.knowledgeEntries.push({
          id: existingTrapId,
          teamId: null,
          scope: 'global',
          labels: ['existing'],
          shortcut: 'Existing Trap',
          detail: 'Existing detail',
          requiredLevel: 0,
          lifecycleState: 'approved',
          ownerUserId: userId,
          latestRevision: {
            revision: 1,
            submittedAt: nowIso(),
            submittedByUserId: userId,
            shortcut: 'Existing Trap',
            detail: 'Existing detail',
            labels: ['existing'],
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

        data.candidateSubmissions.push({
          id: candidateId,
          sourceType: 'trap',
          submittedBy: userId,
          teamId: null,
          status: 'duplicate_detected',
          originalPayload: {
            trap: {
              scope: 'global',
              labels: ['test'],
              shortcut: 'Duplicate Trap',
              detail: 'Duplicate detail',
            },
          },
          analysisSnapshot: null,
          duplicateCase: null,
          receivedAt: nowIso(),
          queuedAt: null,
          analyzingAt: null,
          completedAt: null,
          lastError: null,
          retryCount: 0,
          manualResult: {
            decision: 'merged',
            notes: 'Merging into existing',
            mergedWith: {
              entityType: 'trap',
              entityId: existingTrapId,
            },
            submittedAt: nowIso(),
            submittedBy: userId,
          },
        });
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/candidates/${candidateId}/apply-resolution`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('resolved');
      expect(body.outcome.decision).toBe('merged');
      expect(body.outcome.mergedIntoEntityId).toBe(existingTrapId);
      expect(body.outcome.entityType).toBe('trap');
      expect(body.lineage.relationshipType).toBe('merged_into');
    });
  });

  describe('idempotency', () => {
    it('should be idempotent - calling twice returns same result', async () => {
      const candidateId = 'candidate_6';

      await store.transact(async (data) => {
        data.candidateSubmissions.push({
          id: candidateId,
          sourceType: 'trap',
          submittedBy: userId,
          teamId: null,
          status: 'duplicate_detected',
          originalPayload: {
            trap: {
              scope: 'global',
              labels: ['test'],
              shortcut: 'Test',
              detail: 'Test detail',
            },
          },
          analysisSnapshot: null,
          duplicateCase: null,
          receivedAt: nowIso(),
          queuedAt: null,
          analyzingAt: null,
          completedAt: null,
          lastError: null,
          retryCount: 0,
          manualResult: {
            decision: 'independent',
            notes: 'This is a new trap',
            submittedAt: nowIso(),
            submittedBy: userId,
          },
        });
      });

      // First call
      const response1 = await app.inject({
        method: 'POST',
        url: `/v1/candidates/${candidateId}/apply-resolution`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      expect(response1.statusCode).toBe(200);
      const body1 = response1.json();

      // Second call
      const response2 = await app.inject({
        method: 'POST',
        url: `/v1/candidates/${candidateId}/apply-resolution`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      expect(response2.statusCode).toBe(200);
      const body2 = response2.json();

      // Both should have the same outcome
      expect(body2.status).toBe('resolved');
      expect(body2.outcome.publishedEntityId).toBe(body1.outcome.publishedEntityId);
    });
  });

  describe('audit', () => {
    it('should record audit event', async () => {
      const candidateId = 'candidate_7';

      await store.transact(async (data) => {
        data.candidateSubmissions.push({
          id: candidateId,
          sourceType: 'trap',
          submittedBy: userId,
          teamId: null,
          status: 'duplicate_detected',
          originalPayload: {
            trap: {
              scope: 'global',
              labels: ['test'],
              shortcut: 'Test',
              detail: 'Test detail',
            },
          },
          analysisSnapshot: null,
          duplicateCase: null,
          receivedAt: nowIso(),
          queuedAt: null,
          analyzingAt: null,
          completedAt: null,
          lastError: null,
          retryCount: 0,
          manualResult: {
            decision: 'independent',
            notes: 'This is a new trap',
            submittedAt: nowIso(),
            submittedBy: userId,
          },
        });
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/candidates/${candidateId}/apply-resolution`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify audit event was created
      const data = await store.snapshot();
      const auditEvent = data.auditEvents.find(e =>
        e.entityId === candidateId && e.action === 'duplicate-resolved-independent'
      );
      expect(auditEvent).toBeDefined();
    });
  });

  describe('authorization', () => {
    it('should require knowledge:review permission', async () => {
      // Create a user without knowledge:review permission
      const limitedUserId = 'user_limited';
      let limitedSessionId: string;

      await store.transact(async (data) => {
        data.users.push({
          id: limitedUserId,
          handle: 'limited_user',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_limited',
          userId: limitedUserId,
          teamId,
          roleTemplate: 'user',
          securityLevel: 5,
          permissions: [], // No review permission
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        const sessionToken = `session_limited_${Date.now()}`;
        data.sessions.push({
          id: `session_limited_${Date.now()}`,
          userId: limitedUserId,
          tokenHash: hashSecret(sessionToken),
          activeTeamId: teamId,
          subjectType: 'user',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });

        limitedSessionId = sessionToken;
      });

      const candidateId = 'candidate_8';

      await store.transact(async (data) => {
        data.candidateSubmissions.push({
          id: candidateId,
          sourceType: 'trap',
          submittedBy: userId,
          teamId: null,
          status: 'duplicate_detected',
          originalPayload: {
            trap: {
              scope: 'global',
              labels: ['test'],
              shortcut: 'Test',
              detail: 'Test detail',
            },
          },
          analysisSnapshot: null,
          duplicateCase: null,
          receivedAt: nowIso(),
          queuedAt: null,
          analyzingAt: null,
          completedAt: null,
          lastError: null,
          retryCount: 0,
          manualResult: {
            decision: 'independent',
            notes: 'This is a new trap',
            submittedAt: nowIso(),
            submittedBy: userId,
          },
        });
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/candidates/${candidateId}/apply-resolution`,
        headers: {
          authorization: `Bearer ${limitedSessionId}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
