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
});
