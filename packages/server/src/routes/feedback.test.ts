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
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';
import { buildServer } from '../app.js';
import type { SkillShareerStore } from '../lib/store.js';
import { hashSecret, nowIso } from '../lib/store.js';

describe('feedback routes', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;

  const userId = 'user_1';
  const teamId = 'team_1';
  let sessionToken: string;

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-feedback-${Date.now()}-${Math.random()}.json`;

    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;

    // Setup: Create user, team, membership, session
    await store.transact(async (data) => {
      if (!data.counters) data.counters = {};
      data.counters.user = 1;

      data.users.push({
        id: userId,
        handle: 'tester',
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
        description: 'The solution described does not work with the current version of the library.',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.feedback).toBeDefined();
    expect(body.feedback.entryId).toBe('trap_1');
    expect(body.feedback.entryType).toBe('trap');
    expect(body.feedback.problemType).toBe('incorrect');
    expect(body.feedback.description).toBe('The solution described does not work with the current version of the library.');
    expect(body.feedback.status).toBe('new');
    expect(body.feedback.submittedBy).toBeDefined();
    expect(body.feedback.submittedBy.id).toBe(userId);
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
        customAnswers: [
          { prompt: 'Which step failed?', answer: 'Step 3: database migration' },
        ],
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
