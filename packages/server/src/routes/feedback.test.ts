/**
 * Tests for feedback routes.
 *
 * Covers:
 * - Successful feedback submission (201)
 * - Authentication requirement (401)
 * - Validation errors (400) for short description
 * - Optional context field persistence
 * - CustomAnswers persistence
 * - Store persistence to feedbackQueue
 * - Admin routes for listing and batch operations (FEEDBACK-02)
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildServer } from '@trapmap/server/app.js';
import { BADCASE_EXPORT_DRAFT_TASK_TYPE } from '@trapmap/server/lib/jobs/types.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import type { FastifyInstance } from 'fastify';

describe('feedback routes', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;

  const userId = 'user_1';
  const adminUserId = 'admin_1';
  const teamId = 'team_1';
  let sessionToken: string;
  let adminSessionToken: string;

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-feedback-${Date.now()}-${Math.random()}.json`;

    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;

    // Setup: Create user, team, membership, session
    await store.transact(async (data) => {
      if (!data.counters) data.counters = {};
      data.counters.user = 2;

      data.users.push({
        id: userId,
        handle: 'tester',
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      data.users.push({
        id: adminUserId,
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
        roleTemplate: 'user',
        securityLevel: 5,
        permissions: [],
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      // Admin membership with knowledge:update permission
      data.memberships.push({
        id: 'membership_2',
        userId: adminUserId,
        teamId,
        roleTemplate: 'admin',
        securityLevel: 10,
        permissions: ['knowledge:update'],
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      sessionToken = `session_token_feedback_${Date.now()}`;
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

      adminSessionToken = `session_token_admin_${Date.now()}`;
      data.sessions.push({
        id: `session_admin_${Date.now()}`,
        userId: adminUserId,
        tokenHash: hashSecret(adminSessionToken),
        activeTeamId: teamId,
        subjectType: 'user',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });

      // Add a knowledge entry for testing entryShortcut lookup
      data.knowledgeEntries.push({
        id: 'trap_1',
        teamId: null,
        scope: 'global',
        labels: [],
        shortcut: 'test-trap-shortcut',
        detail: 'Test trap content',
        requiredLevel: 0,
        lifecycleState: 'approved',
        ownerUserId: userId,
        latestRevision: {
          revision: 1,
          submittedAt: nowIso(),
          submittedByUserId: userId,
          shortcut: 'test-trap-shortcut',
          detail: 'Test trap content',
          labels: [],
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
        submissionHistory: [],
        agentReview: null,
        reviewHistory: [],
        reviewNotes: [],
        lifecycleHistory: [],
        embeddingCache: null,
        indexState: null,
        boundary: null,
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

  it('creates feedback entry with valid submission', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      headers: { authorization: `Bearer ${sessionToken}` },
      payload: {
        entryId: 'trap_1',
        entryType: 'trap',
        problemType: 'incorrect',
        description:
          'The solution described does not work with the current version of the library.',
        badcase: {
          queryId: 'qry_test_1',
          querySeed: 'library version issue',
          routeFamily: 'entry',
          failureClassification: 'outdated-content',
          expectedCorrection: 'Return the current library migration guide.',
          selectedResultSnapshot: {
            entryId: 'trap_1',
            entryType: 'trap',
            title: 'test-trap-shortcut',
            score: 0.9,
            routeFamily: 'entry',
          },
        },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.feedback).toBeDefined();
    expect(body.feedback.entryId).toBe('trap_1');
    expect(body.feedback.entryType).toBe('trap');
    expect(body.feedback.problemType).toBe('incorrect');
    expect(body.feedback.description).toBe(
      'The solution described does not work with the current version of the library.',
    );
    expect(body.feedback.status).toBe('new');
    expect(body.feedback.queryId).toBe('qry_test_1');
    expect(body.feedback.routeFamily).toBe('entry');
    expect(body.feedback.expectedCorrection).toBe('Return the current library migration guide.');
    expect(body.feedback.submittedBy).toBeDefined();
    expect(body.feedback.submittedBy.id).toBe(userId);

    if (store instanceof PostgresStore) {
      expect(body.feedback.asyncJobId).toBeDefined();
      const queued = await store
        .getPool()
        .query<{ count: string }>(
          'SELECT COUNT(*) AS count FROM task_queue WHERE type = $1 AND dedupe_key = $2',
          [BADCASE_EXPORT_DRAFT_TASK_TYPE, `${BADCASE_EXPORT_DRAFT_TASK_TYPE}:feedback_1`],
        );
      expect(Number(queued.rows[0]?.count ?? '0')).toBe(1);
    }
  });

  it('returns 401 when not authenticated', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      payload: {
        entryId: 'trap_1',
        entryType: 'trap',
        problemType: 'incorrect',
        description: 'A valid description with enough characters',
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 400 when description is too short', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      headers: { authorization: `Bearer ${sessionToken}` },
      payload: {
        entryId: 'trap_1',
        entryType: 'trap',
        problemType: 'incorrect',
        description: 'too short',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('accepts submission with optional context field', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      headers: { authorization: `Bearer ${sessionToken}` },
      payload: {
        entryId: 'skill_1',
        entryType: 'skill',
        problemType: 'context-mismatch',
        description: 'This does not apply to our deployment environment.',
        context: 'Trying to deploy on ARM architecture',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.feedback.context).toBe('Trying to deploy on ARM architecture');
  });

  it('accepts submission with customAnswers from skill prompts', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      headers: { authorization: `Bearer ${sessionToken}` },
      payload: {
        entryId: 'skill_1',
        entryType: 'skill',
        problemType: 'incomplete',
        description: 'Missing critical steps in the deployment guide.',
        customAnswers: [{ prompt: 'Which step failed?', answer: 'Step 3: database migration' }],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.feedback.customAnswers).toEqual([
      { prompt: 'Which step failed?', answer: 'Step 3: database migration' },
    ]);
  });

  it('persists feedback to feedbackQueue in store', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      headers: { authorization: `Bearer ${sessionToken}` },
      payload: {
        entryId: 'trap_1',
        entryType: 'trap',
        problemType: 'outdated',
        description: 'This information is from an old version and no longer accurate.',
      },
    });

    const data = await store.snapshot();
    expect(data.feedbackQueue).toHaveLength(1);
    expect(data.feedbackQueue[0].entryId).toBe('trap_1');
    expect(data.feedbackQueue[0].problemType).toBe('outdated');
    expect(data.feedbackQueue[0].status).toBe('new');
    expect(data.feedbackQueue[0].submittedByUserId).toBe(userId);
    expect(data.feedbackQueue[0].submittedByHandle).toBe('tester');
  });
});

describe('feedback admin routes', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;

  const userId = 'user_1';
  const adminUserId = 'admin_1';
  const teamId = 'team_1';
  let sessionToken: string;
  let adminSessionToken: string;

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-feedback-admin-${Date.now()}-${Math.random()}.json`;

    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;

    // Setup: Create user, team, membership, session
    await store.transact(async (data) => {
      if (!data.counters) data.counters = {};
      data.counters.user = 2;

      data.users.push({
        id: userId,
        handle: 'tester',
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      data.users.push({
        id: adminUserId,
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
        roleTemplate: 'user',
        securityLevel: 5,
        permissions: [],
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      // Admin membership with knowledge:update permission
      data.memberships.push({
        id: 'membership_2',
        userId: adminUserId,
        teamId,
        roleTemplate: 'admin',
        securityLevel: 10,
        permissions: ['knowledge:update'],
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      sessionToken = `session_token_feedback_${Date.now()}`;
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

      adminSessionToken = `session_token_admin_${Date.now()}`;
      data.sessions.push({
        id: `session_admin_${Date.now()}`,
        userId: adminUserId,
        tokenHash: hashSecret(adminSessionToken),
        activeTeamId: teamId,
        subjectType: 'user',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });

      // Add a knowledge entry for testing entryShortcut lookup
      data.knowledgeEntries.push({
        id: 'trap_1',
        teamId: null,
        scope: 'global',
        labels: [],
        shortcut: 'test-trap-shortcut',
        detail: 'Test trap content',
        requiredLevel: 0,
        lifecycleState: 'approved',
        ownerUserId: userId,
        latestRevision: {
          revision: 1,
          submittedAt: nowIso(),
          submittedByUserId: userId,
          shortcut: 'test-trap-shortcut',
          detail: 'Test trap content',
          labels: [],
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
        submissionHistory: [],
        agentReview: null,
        reviewHistory: [],
        reviewNotes: [],
        lifecycleHistory: [],
        embeddingCache: null,
        indexState: null,
        boundary: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      // Add some feedback records for testing
      data.feedbackQueue.push({
        id: 'feedback_1',
        entryId: 'trap_1',
        entryType: 'trap',
        problemType: 'outdated',
        description: 'This content is outdated.',
        context: null,
        querySeed: null,
        customAnswers: null,
        submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
        submittedByUserId: userId,
        submittedByHandle: 'tester',
        status: 'new',
        adminNotes: null,
        resolvedAt: null,
        resolvedByUserId: null,
        triggeredTransition: null,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      });

      data.feedbackQueue.push({
        id: 'feedback_2',
        entryId: 'trap_1',
        entryType: 'trap',
        problemType: 'incorrect',
        description: 'This solution has an error.',
        context: 'Was trying to deploy to production',
        querySeed: null,
        customAnswers: null,
        submittedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
        submittedByUserId: userId,
        submittedByHandle: 'tester',
        status: 'triaged',
        adminNotes: 'Needs investigation',
        resolvedAt: null,
        resolvedByUserId: null,
        triggeredTransition: null,
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      });
    });
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /v1/operations/feedback', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/feedback',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns empty list when no feedback', async () => {
      // Clear feedback queue
      await store.transact((data) => {
        data.feedbackQueue = [];
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/feedback',
        headers: { authorization: `Bearer ${adminSessionToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('returns feedback list with correct fields', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/feedback',
        headers: { authorization: `Bearer ${adminSessionToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.items).toHaveLength(2);
      expect(body.total).toBe(2);

      // Check first item (most recent first due to sort)
      const firstItem = body.items[0];
      expect(firstItem.id).toBe('feedback_1');
      expect(firstItem.entryId).toBe('trap_1');
      expect(firstItem.entryType).toBe('trap');
      expect(firstItem.entryShortcut).toBe('test-trap-shortcut');
      expect(firstItem.problemType).toBe('outdated');
      expect(firstItem.status).toBe('new');
      expect(firstItem.ageDays).toBeGreaterThanOrEqual(1);
    });

    it('filters by status query param', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/feedback?status=new',
        headers: { authorization: `Bearer ${adminSessionToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].status).toBe('new');
    });

    it('filters by problemType query param', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/feedback?problemType=incorrect',
        headers: { authorization: `Bearer ${adminSessionToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].problemType).toBe('incorrect');
    });

    it('filters by entryId query param', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/feedback?entryId=trap_1',
        headers: { authorization: `Bearer ${adminSessionToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.items).toHaveLength(2);
    });

    it('computes ageDays correctly', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/feedback',
        headers: { authorization: `Bearer ${adminSessionToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Find feedback_1 which was submitted 2 days ago
      const feedback1 = body.items.find((i: { id: string }) => i.id === 'feedback_1');
      expect(feedback1.ageDays).toBeGreaterThanOrEqual(2);
      expect(feedback1.ageDays).toBeLessThan(3);

      // Find feedback_2 which was submitted 5 days ago
      const feedback2 = body.items.find((i: { id: string }) => i.id === 'feedback_2');
      expect(feedback2.ageDays).toBeGreaterThanOrEqual(5);
      expect(feedback2.ageDays).toBeLessThan(6);
    });

    it('returns entry shortcut from knowledge entries', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/feedback',
        headers: { authorization: `Bearer ${adminSessionToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.items[0].entryShortcut).toBe('test-trap-shortcut');
    });
  });

  describe('GET /v1/operations/feedback/remediation', () => {
    it('returns escalated trap items with source snapshot after threshold is reached', async () => {
      await store.transact((data) => {
        for (let i = 3; i <= 10; i++) {
          data.feedbackQueue.push({
            id: `feedback_${i}`,
            entryId: 'trap_1',
            entryType: 'trap',
            problemType: i % 2 === 0 ? 'incorrect' : 'outdated',
            description: `Escalation feedback ${i}`,
            context: null,
            querySeed: null,
            customAnswers: null,
            submittedAt: new Date(Date.now() - i * 60 * 1000).toISOString(),
            submittedByUserId: userId,
            submittedByHandle: 'tester',
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
        method: 'GET',
        url: '/v1/operations/feedback/remediation',
        headers: { authorization: `Bearer ${adminSessionToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.total).toBe(1);
      expect(body.items[0].entryId).toBe('trap_1');
      expect(body.items[0].entryType).toBe('trap');
      expect(body.items[0].unresolvedFeedbackCount).toBe(10);
      expect(body.items[0].remediation.status).toBe('pending-human-review');
      expect(body.items[0].remediation.suppressedFromRetrieval).toBe(true);
      expect(body.items[0].sourceSnapshot.trapDetail).toBe('Test trap content');
    });

    it('completes remediation by resolving active escalated feedback for an entry', async () => {
      await store.transact((data) => {
        for (let i = 3; i <= 10; i++) {
          data.feedbackQueue.push({
            id: `feedback_${i}`,
            entryId: 'trap_1',
            entryType: 'trap',
            problemType: 'incorrect',
            description: `Escalation feedback ${i}`,
            context: null,
            querySeed: null,
            customAnswers: null,
            submittedAt: new Date(Date.now() - i * 60 * 1000).toISOString(),
            submittedByUserId: userId,
            submittedByHandle: 'tester',
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
        url: '/v1/operations/feedback/remediation/trap_1/complete',
        headers: { authorization: `Bearer ${adminSessionToken}` },
        payload: {
          notes: 'Manually fixed and ready to reindex',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.entryId).toBe('trap_1');
      expect(body.resolvedCount).toBe(10);
      if (store instanceof PostgresStore) {
        expect(body.asyncJobId).toBe('wf_remediation_trap_1');
      }

      const data = await store.snapshot();
      const active = data.feedbackQueue.filter(
        (record) =>
          record.entryId === 'trap_1' && (record.status === 'new' || record.status === 'triaged'),
      );
      expect(active).toHaveLength(0);
      const resolved = data.feedbackQueue.filter((record) => record.entryId === 'trap_1');
      expect(resolved.every((record) => record.status === 'resolved')).toBe(true);
    });
  });

  describe('POST /v1/operations/feedback/batch', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/feedback/batch',
        payload: {
          feedbackIds: ['feedback_1'],
          action: 'resolve',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 for non-admin user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/feedback/batch',
        headers: { authorization: `Bearer ${sessionToken}` },
        payload: {
          feedbackIds: ['feedback_1'],
          action: 'resolve',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('dry-run returns plan without persisting', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/feedback/batch',
        headers: { authorization: `Bearer ${adminSessionToken}` },
        payload: {
          feedbackIds: ['feedback_1'],
          action: 'resolve',
          dryRun: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.dryRun).toBe(true);
      expect(body.appliedAt).toBeNull();
      expect(body.totalEligible).toBe(1);

      // Verify not persisted
      const data = await store.snapshot();
      expect(data.feedbackQueue[0].status).toBe('new');
    });

    it('resolve action updates status and sets resolvedAt', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/feedback/batch',
        headers: { authorization: `Bearer ${adminSessionToken}` },
        payload: {
          feedbackIds: ['feedback_1'],
          action: 'resolve',
          notes: 'Fixed in latest version',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.action).toBe('resolve');
      expect(body.dryRun).toBe(false);
      expect(body.appliedAt).not.toBeNull();
      expect(body.totalEligible).toBe(1);

      // Verify persisted
      const data = await store.snapshot();
      expect(data.feedbackQueue[0].status).toBe('resolved');
      expect(data.feedbackQueue[0].resolvedAt).not.toBeNull();
      expect(data.feedbackQueue[0].resolvedByUserId).toBe(adminUserId);
      expect(data.feedbackQueue[0].adminNotes).toBe('Fixed in latest version');
    });

    it('dismiss action updates status', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/feedback/batch',
        headers: { authorization: `Bearer ${adminSessionToken}` },
        payload: {
          feedbackIds: ['feedback_1'],
          action: 'dismiss',
          notes: 'Not reproducible',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.totalEligible).toBe(1);

      // Verify persisted
      const data = await store.snapshot();
      expect(data.feedbackQueue[0].status).toBe('dismissed');
      expect(data.feedbackQueue[0].adminNotes).toBe('Not reproducible');
    });

    it('triage action updates status', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/feedback/batch',
        headers: { authorization: `Bearer ${adminSessionToken}` },
        payload: {
          feedbackIds: ['feedback_1'],
          action: 'triage',
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify persisted
      const data = await store.snapshot();
      expect(data.feedbackQueue[0].status).toBe('triaged');
    });

    it('transition action sets triggeredTransition field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/feedback/batch',
        headers: { authorization: `Bearer ${adminSessionToken}` },
        payload: {
          feedbackIds: ['feedback_1'],
          action: 'transition',
          transitionTarget: 'stale',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.items[0].transitionApplied).toBe(true);

      // Verify persisted
      const data = await store.snapshot();
      expect(data.feedbackQueue[0].triggeredTransition).toBe('stale');
    });

    it('returns eligible/ineligible items with reasons', async () => {
      // Mark feedback_1 as already resolved
      await store.transact((data) => {
        data.feedbackQueue[0].status = 'resolved';
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/feedback/batch',
        headers: { authorization: `Bearer ${adminSessionToken}` },
        payload: {
          feedbackIds: ['feedback_1', 'feedback_2'],
          action: 'resolve',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.totalEligible).toBe(1);
      expect(body.totalIneligible).toBe(1);

      const ineligible = body.items.find(
        (i: { feedbackId: string }) => i.feedbackId === 'feedback_1',
      );
      expect(ineligible.eligible).toBe(false);
      expect(ineligible.reason).toContain('already resolved');
    });
  });

  describe('lifecycle triggers', () => {
    it('triggers lifecycle transition after batch feedback resolution', async () => {
      // Setup: Create 3 "outdated" feedback items for the same entry within 30 days
      await store.transact((data) => {
        for (let i = 0; i < 3; i++) {
          data.feedbackQueue.push({
            id: `feedback_outdated_${i}`,
            entryId: 'trap_1',
            entryType: 'trap',
            problemType: 'outdated',
            description: `Outdated report ${i} with enough characters to pass validation`,
            context: null,
            querySeed: null,
            customAnswers: null,
            submittedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
            submittedByUserId: userId,
            submittedByHandle: 'tester',
            status: 'new',
            adminNotes: null,
            resolvedAt: null,
            resolvedByUserId: null,
            triggeredTransition: null,
            createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      });

      // Execute: Resolve all 3 outdated feedbacks in a batch
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/feedback/batch',
        headers: { authorization: `Bearer ${adminSessionToken}` },
        payload: {
          feedbackIds: ['feedback_outdated_0', 'feedback_outdated_1', 'feedback_outdated_2'],
          action: 'resolve',
          notes: 'Batch resolved after review',
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify: Entry decay state should have transitioned to 'stale'
      const data = await store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === 'trap_1');
      expect(entry?.decayMeta?.decayState).toBe('stale');
    });

    it('does not trigger lifecycle transitions during dry-run', async () => {
      // Setup: Create 3 "outdated" feedback items
      await store.transact((data) => {
        for (let i = 0; i < 3; i++) {
          data.feedbackQueue.push({
            id: `feedback_dryrun_${i}`,
            entryId: 'trap_1',
            entryType: 'trap',
            problemType: 'outdated',
            description: `Dry-run outdated report ${i} with enough chars`,
            context: null,
            querySeed: null,
            customAnswers: null,
            submittedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
            submittedByUserId: userId,
            submittedByHandle: 'tester',
            status: 'new',
            adminNotes: null,
            resolvedAt: null,
            resolvedByUserId: null,
            triggeredTransition: null,
            createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      });

      // Execute dry-run
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/feedback/batch',
        headers: { authorization: `Bearer ${adminSessionToken}` },
        payload: {
          feedbackIds: ['feedback_dryrun_0', 'feedback_dryrun_1', 'feedback_dryrun_2'],
          action: 'resolve',
          dryRun: true,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().dryRun).toBe(true);

      // Verify: Entry decay state should NOT have changed
      const data = await store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === 'trap_1');
      expect(entry?.decayMeta?.decayState).not.toBe('stale');
    });

    it('includes decay, evidence, and maintenance routes in documented routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/meta/routes',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.documentedRoutes).toContain('GET /v1/operations/decay/entries');
      expect(json.documentedRoutes).toContain('POST /v1/operations/decay/batch');
      expect(json.documentedRoutes).toContain('POST /v1/operations/decay/search');
      expect(json.documentedRoutes).toContain('PATCH /v1/knowledge/:id/evidence');
      expect(json.documentedRoutes).toContain('GET /v1/operations/maintenance/entries');
      expect(json.documentedRoutes).toContain('POST /v1/operations/maintenance/batch');
    });
  });
});
