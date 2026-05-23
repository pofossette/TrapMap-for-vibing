/**
 * Nyquist adversarial validation tests for auth routes.
 *
 * Validates gap claims:
 * - POST /v1/auth/login returns 200 + session for valid system admin key
 * - POST /v1/auth/login returns 401 for invalid key
 * - POST /v1/auth/login returns 500 when systemAdminKey not configured
 * - GET /v1/auth/session returns authenticated=true with valid session
 * - GET /v1/auth/session returns authenticated=false without session
 * - POST /v1/auth/logout deletes session
 * - POST /v1/teams/select updates activeTeamId
 */

import { buildServer } from '@trapmap/server/app.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Nyquist: POST /v1/auth/login', () => {
  it('returns 200 with session and x-session-token for valid systemAdminKey', async () => {
    const localApp = buildServer({
      config: {
        dataFile: `/tmp/trapmap-nyq-login-${Date.now()}-${Math.random()}.json`,
        systemAdminKey: 'nyquist-admin-key-123',
      },
    });
    await localApp.ready();

    const response = await localApp.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { systemAdminKey: 'nyquist-admin-key-123' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().session).toBeDefined();
    expect(response.headers['x-session-token']).toBeDefined();

    await localApp.close();
  });

  it('returns 401 for wrong systemAdminKey', async () => {
    const localApp = buildServer({
      config: {
        dataFile: `/tmp/trapmap-nyq-login-fail-${Date.now()}-${Math.random()}.json`,
        systemAdminKey: 'nyquist-admin-key-123',
      },
    });
    await localApp.ready();

    const response = await localApp.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { systemAdminKey: 'wrong-key-at-least-16-chars' },
    });

    expect(response.statusCode).toBe(401);

    await localApp.close();
  });

  it('returns 500 with code "system_admin_not_configured" when key not set', async () => {
    const localApp = buildServer({
      config: {
        dataFile: `/tmp/trapmap-nyq-login-noconf-${Date.now()}-${Math.random()}.json`,
      },
    });
    await localApp.ready();

    const response = await localApp.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { systemAdminKey: 'some-key-at-least-16-chars' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json().code).toBe('system_admin_not_configured');

    await localApp.close();
  });
});

describe('Nyquist: GET /v1/auth/session', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;

  beforeEach(async () => {
    app = buildServer({
      config: { dataFile: `/tmp/trapmap-nyq-session-${Date.now()}-${Math.random()}.json` },
    });
    await app.ready();
    store = app.skillShareer.store;
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns authenticated=false without authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/auth/session',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().authenticated).toBe(false);
  });

  it('returns authenticated=true with valid Bearer token', async () => {
    const token = `nyq_sess_${Date.now()}`;
    const userId = 'nyq_user_1';
    const teamId = 'nyq_team_1';

    await store.transact(async (data) => {
      if (!data.counters) data.counters = {};
      data.counters.user = 1;

      data.users.push({
        id: userId,
        handle: 'nyquistuser',
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      data.teams.push({
        id: teamId,
        name: 'Nyq Team',
        slug: 'nyq-team',
        description: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      data.memberships.push({
        id: 'm_nyq_1',
        userId,
        teamId,
        roleTemplate: 'admin',
        securityLevel: 10,
        permissions: [],
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      data.sessions.push({
        id: `sess_${Date.now()}`,
        userId,
        tokenHash: hashSecret(token),
        activeTeamId: teamId,
        subjectType: 'user',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.authenticated).toBe(true);
    expect(body.session).toBeDefined();
  });
});

describe('Nyquist: POST /v1/auth/logout', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;

  beforeEach(async () => {
    app = buildServer({
      config: { dataFile: `/tmp/trapmap-nyq-logout-${Date.now()}-${Math.random()}.json` },
    });
    await app.ready();
    store = app.skillShareer.store;
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('deletes session and returns ok:true', async () => {
    const token = `nyq_logout_${Date.now()}`;
    const userId = 'nyq_user_logout';
    const teamId = 'nyq_team_logout';

    await store.transact(async (data) => {
      if (!data.counters) data.counters = {};
      data.counters.user = 2;

      data.users.push({
        id: userId,
        handle: 'logoutuser',
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      data.teams.push({
        id: teamId,
        name: 'Logout Team',
        slug: 'logout-team',
        description: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      data.memberships.push({
        id: 'm_logout_1',
        userId,
        teamId,
        roleTemplate: 'admin',
        securityLevel: 10,
        permissions: [],
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      data.sessions.push({
        id: `sess_logout_${Date.now()}`,
        userId,
        tokenHash: hashSecret(token),
        activeTeamId: teamId,
        subjectType: 'user',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);

    // Verify session actually removed from store
    const snap = await store.snapshot();
    const remaining = snap.sessions.find((s) => s.tokenHash === hashSecret(token));
    expect(remaining).toBeUndefined();
  });
});

describe('Nyquist: POST /v1/teams/select', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;

  beforeEach(async () => {
    app = buildServer({
      config: { dataFile: `/tmp/trapmap-nyq-teamselect-${Date.now()}-${Math.random()}.json` },
    });
    await app.ready();
    store = app.skillShareer.store;
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns 401 without session token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/teams/select',
      payload: { teamId: 'team_X' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('updates activeTeamId to the selected team', async () => {
    const token = `nyq_ts_${Date.now()}`;
    const userId = 'nyq_user_ts';
    const team1 = 'nyq_team_ts1';
    const team2 = 'nyq_team_ts2';

    await store.transact(async (data) => {
      if (!data.counters) data.counters = {};
      data.counters.user = 3;

      data.users.push({
        id: userId,
        handle: 'teamselect',
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      data.teams.push({
        id: team1,
        name: 'Team 1',
        slug: 'team-1',
        description: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      data.teams.push({
        id: team2,
        name: 'Team 2',
        slug: 'team-2',
        description: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      data.memberships.push({
        id: 'm_ts_1',
        userId,
        teamId: team1,
        roleTemplate: 'admin',
        securityLevel: 10,
        permissions: [],
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      data.memberships.push({
        id: 'm_ts_2',
        userId,
        teamId: team2,
        roleTemplate: 'admin',
        securityLevel: 10,
        permissions: [],
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      data.sessions.push({
        id: `sess_ts_${Date.now()}`,
        userId,
        tokenHash: hashSecret(token),
        activeTeamId: team1,
        subjectType: 'user',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/teams/select',
      headers: { authorization: `Bearer ${token}` },
      payload: { teamId: team2 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().session.activeTeam.id).toBe(team2);
  });
});
