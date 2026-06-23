import { buildServer } from '@trapmap/server/app.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('candidate routes', () => {
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
        permissions: ['knowledge:submit', 'knowledge:review'],
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
    await app.close();
  });

  it('submits candidates without waiting for analysis', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/candidates',
      headers: {
        authorization: `Bearer ${sessionId}`,
      },
      payload: {
        sourceType: 'trap',
        payload: {
          scope: 'global',
          labels: ['test'],
          shortcut: 'Test Trap',
          detail: 'Test detail',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      candidateId: expect.any(String),
      status: 'queued',
      receivedAt: expect.any(String),
    });
  });

  it('keeps manual-result active for candidate-local facts', async () => {
    const candidateId = 'candidate_manual_1';

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
      url: `/v1/candidates/${candidateId}/manual-result`,
      headers: {
        authorization: `Bearer ${sessionId}`,
      },
      payload: {
        decision: 'independent',
        notes: 'Keep candidate fact only',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      candidateId,
      decision: 'independent',
      nextState: 'ready_for_review',
    });

    const snapshot = await store.snapshot();
    const candidate = snapshot.candidateSubmissions.find((item) => item.id === candidateId);
    expect(candidate?.manualResult?.decision).toBe('independent');
  });

  it('applies resolution when a manual result is attached', async () => {
    const candidateId = 'candidate_apply_1';

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
            labels: ['apply'],
            shortcut: 'Apply Resolution',
            detail: 'Publish this candidate',
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
          notes: 'Looks independent',
          reviewedAt: nowIso(),
          reviewedBy: userId,
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
    expect(response.json()).toMatchObject({
      candidateId,
      status: 'resolved',
      outcome: expect.objectContaining({
        decision: 'independent',
      }),
    });
  });

  it('still enforces review permission before applying resolution', async () => {
    let limitedSessionId = '';

    await store.transact(async (data) => {
      data.users.push({
        id: 'user_limited',
        handle: 'limited',
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      data.memberships.push({
        id: 'membership_limited',
        userId: 'user_limited',
        teamId,
        roleTemplate: 'user',
        securityLevel: 5,
        permissions: [],
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      const token = `session_limited_${Date.now()}`;
      data.sessions.push({
        id: `session_limited_${Date.now()}`,
        userId: 'user_limited',
        tokenHash: hashSecret(token),
        activeTeamId: teamId,
        subjectType: 'user',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
      limitedSessionId = token;
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/candidates/candidate_unauthorized/apply-resolution',
      headers: {
        authorization: `Bearer ${limitedSessionId}`,
      },
    });

    expect(response.statusCode).toBe(403);
  });
});
