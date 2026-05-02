/**
 * Tests for admin feedback routes.
 *
 * Covers:
 * - GET /v1/admin/feedback returns 401 for unauthenticated request
 * - GET /v1/admin/feedback filters by status correctly
 * - GET /v1/admin/feedback filters by entryId and includes qualityScore
 * - POST /v1/admin/feedback/batch dry-run mode returns plan without mutations
 * - POST /v1/admin/feedback/batch execute mode updates feedback status
 * - POST /v1/admin/feedback/batch transition action updates entry decayMeta
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';
import { buildServer } from '../app.js';
import type { SkillShareerStore } from '../lib/store.js';
import { hashSecret, nowIso } from '../lib/store.js';

describe('admin feedback routes', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;

  const userId = 'user_1';
  const teamId = 'team_1';
  const entryId = 'entry_1';
  let sessionToken: string;

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-admin-feedback-${Date.now()}-${Math.random()}.json`;

    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;

    // Setup: Create user, team, membership (admin role for knowledge:export/update), session
    await store.transact(async (data) => {
      if (!data.counters) data.counters = {};

      data.users.push({
        id: userId,
        handle: 'admin',
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
        securityLevel: 5,
        permissions: ['knowledge:export', 'knowledge:update'],
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      sessionToken = `session_token_admin_fb_${Date.now()}`;
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

      // Add test knowledge entry
      data.knowledgeEntries.push({
        id: entryId,
        teamId,
        scope: 'project',
        labels: [],
        shortcut: 'test-trap',
        detail: 'Test trap content',
        requiredLevel: 0,
        lifecycleState: 'approved',
        ownerUserId: userId,
        latestRevision: {
          revision: 1,
          submittedAt: nowIso(),
          submittedByUserId: userId,
          shortcut: 'test-trap',
          detail: 'Test trap content',
          labels: [],
          reviewNotes: [],
        },
        history: [],
        metadata: {
          scopeLabel: 'project-knowledge',
          submissionCount: 1,
          resubmissionCount: 0,
          revisionCount: 1,
          latestSubmissionId: null,
          latestSubmittedAt: nowIso(),
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
        decayMeta: {
          lastVerifiedAt: nowIso(),
          decayState: 'active',
          supersededById: null,
          decayStateComputedAt: nowIso(),
          freshnessType: 'evergreen',
        },
        evidenceMeta: null,
        boundary: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      // Add test feedback
      data.feedbackQueue.push({
        id: 'feedback_1',
        entryId,
        entryType: 'trap',
        problemType: 'outdated',
        description: 'This trap is no longer accurate',
        context: 'Using version 2.0',
        querySeed: null,
        customAnswers: null,
        submittedAt: nowIso(),
        submittedByUserId: userId,
        submittedByHandle: 'admin',
        status: 'new',
        adminNotes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    });
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /v1/admin/feedback', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/admin/feedback',
      });

      expect(response.statusCode).toBe(401);
    });

    it('filters by status', async () => {
      // Add another feedback with different status
      await store.transact(async (data) => {
        data.feedbackQueue.push({
          id: 'feedback_2',
          entryId,
          entryType: 'trap',
          problemType: 'incorrect',
          description: 'Wrong solution',
          context: null,
          querySeed: null,
          customAnswers: null,
          submittedAt: nowIso(),
          submittedByUserId: userId,
          submittedByHandle: 'admin',
          status: 'resolved',
          adminNotes: 'Fixed',
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/admin/feedback?status=new',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].id).toBe('feedback_1');
    });

    it('filters by entryId and includes qualityScore', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/v1/admin/feedback?entryId=${entryId}`,
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].id).toBe('feedback_1');
      expect(body.qualityScore).toBeDefined();
      expect(body.qualityScore.entryId).toBe(entryId);
      expect(body.qualityScore.score).toBeLessThanOrEqual(100);
      expect(body.qualityScore.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('POST /v1/admin/feedback/batch', () => {
    it('dry-run mode returns plan without mutations', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/feedback/batch',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          action: 'resolve',
          feedbackIds: ['feedback_1'],
          dryRun: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.dryRun).toBe(true);
      expect(body.appliedAt).toBeNull();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].eligible).toBe(true);
      expect(body.items[0].proposedStatus).toBe('resolved');

      // Verify no mutation happened
      const data = await store.snapshot();
      expect(data.feedbackQueue[0].status).toBe('new');
    });

    it('execute mode updates feedback status', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/feedback/batch',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          action: 'resolve',
          feedbackIds: ['feedback_1'],
          dryRun: false,
          notes: 'Issue addressed',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.dryRun).toBe(false);
      expect(body.appliedAt).not.toBeNull();
      expect(body.items[0].proposedStatus).toBe('resolved');
      expect(body.totalEligible).toBe(1);

      // Verify mutation happened
      const data = await store.snapshot();
      expect(data.feedbackQueue[0].status).toBe('resolved');
      expect(data.feedbackQueue[0].adminNotes).toContain('Issue addressed');
    });

    it('transition action updates entry decayMeta', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/feedback/batch',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          action: 'transition',
          feedbackIds: ['feedback_1'],
          dryRun: false,
          notes: 'Transitioning to stale based on feedback',
          targetDecayState: 'stale',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.items[0].eligible).toBe(true);
      expect(body.items[0].resultingDecayState).toBe('stale');

      // Verify entry decayMeta was updated
      const data = await store.snapshot();
      expect(data.feedbackQueue[0].status).toBe('resolved');
      expect(data.knowledgeEntries[0].decayMeta?.decayState).toBe('stale');
    });
  });
});
