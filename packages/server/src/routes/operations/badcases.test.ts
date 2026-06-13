import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildServer } from '@trapmap/server/app.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import type { FastifyInstance } from 'fastify';

describe('badcase export route', () => {
  let app: FastifyInstance;
  let sessionToken: string;

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-badcase-export-${Date.now()}-${Math.random()}.json`;
    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();

    await app.skillShareer.store.transact(async (data) => {
      data.users.push({
        id: 'user_badcase_export',
        handle: 'badcase-export',
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      data.memberships.push({
        id: 'membership_badcase_export',
        userId: 'user_badcase_export',
        teamId: null,
        roleTemplate: 'admin',
        securityLevel: 5,
        permissions: ['knowledge:export'],
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      sessionToken = `session_badcase_export_${Date.now()}`;
      data.sessions.push({
        id: `session_badcase_export_${Date.now()}`,
        userId: 'user_badcase_export',
        tokenHash: hashSecret(sessionToken),
        activeTeamId: null,
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

  it('returns 401 when unauthenticated', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/operations/badcases/feedback_1/export',
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 404 or 409 when badcase trace is unavailable', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/operations/badcases/feedback_missing/export',
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect([404, 409]).toContain(response.statusCode);
  });
});
