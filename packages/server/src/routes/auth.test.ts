/**
 * Integration tests for auth routes.
 *
 * Covers login (system admin + access key), session status, logout,
 * and team selection with both success and failure paths.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';
import { buildServer } from '../app.js';
import type { SkillShareerStore } from '../lib/store.js';
import { hashSecret, nowIso } from '../lib/store.js';

describe('auth routes', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-auth-${Date.now()}-${Math.random()}.json`;
    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /v1/auth/login', () => {
    it('returns 200 with session and x-session-token header for valid systemAdminKey', async () => {
      const localApp = buildServer({
        config: {
          dataFile: `/tmp/trapmap-test-sa-login-${Date.now()}-${Math.random()}.json`,
          systemAdminKey: 'test-admin-key-123',
        },
      });
      await localApp.ready();

      const response = await localApp.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { systemAdminKey: 'test-admin-key-123' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().session).toBeDefined();
      expect(response.headers['x-session-token']).toBeDefined();

      await localApp.close();
    });

    it('returns 401 for invalid systemAdminKey', async () => {
      const localApp = buildServer({
        config: {
          dataFile: `/tmp/trapmap-test-sa-invalid-${Date.now()}-${Math.random()}.json`,
          systemAdminKey: 'test-admin-key-123',
        },
      });
      await localApp.ready();

      const response = await localApp.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { systemAdminKey: 'wrong-key-value-xxxx' },
      });

      expect(response.statusCode).toBe(401);

      await localApp.close();
    });

    it('returns 500 for system admin login when systemAdminKey not configured', async () => {
      const localApp = buildServer({
        config: {
          dataFile: `/tmp/trapmap-test-sa-unconf-${Date.now()}-${Math.random()}.json`,
        },
      });
      await localApp.ready();

      const response = await localApp.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { systemAdminKey: 'any-key-at-least-16-chars' },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().code).toBe('system_admin_not_configured');

      await localApp.close();
    });

    it('returns 401 for invalid access key', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { accessKey: 'invalid_key_that_is_16_chars' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 200 with session for valid access key', async () => {
      const userId = 'user_ak_1';
      const teamId = 'team_ak_1';
      const plainToken = 'test-access-key-001';

      await store.transact(async (data) => {
        if (!data.counters) data.counters = {};
        data.counters.user = 1;

        data.users.push({
          id: userId,
          handle: 'keyuser',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.teams.push({
          id: teamId,
          name: 'AK Test Team',
          slug: 'ak-test-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_ak_1',
          userId,
          teamId,
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.accessKeys.push({
          id: 'ak_1',
          memberId: 'membership_ak_1',
          tokenHash: hashSecret(plainToken),
          tokenPreview: plainToken.slice(-8),
          issuedByUserId: userId,
          teamId,
          level: 10,
          notes: null,
          revokedAt: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { accessKey: plainToken },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().session).toBeDefined();
      expect(response.headers['x-session-token']).toBeDefined();
    });
  });

  describe('GET /v1/auth/session', () => {
    it('returns authenticated=false when no token provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/auth/session',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().authenticated).toBe(false);
    });

    it('returns authenticated=true with valid session', async () => {
      const userId = 'user_sess_1';
      const teamId = 'team_sess_1';
      const sessionToken = `session_test_${Date.now()}`;

      await store.transact(async (data) => {
        if (!data.counters) data.counters = {};
        data.counters.user = 2;

        data.users.push({
          id: userId,
          handle: 'sessuser',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.teams.push({
          id: teamId,
          name: 'Session Team',
          slug: 'session-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_sess_1',
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

      const response = await app.inject({
        method: 'GET',
        url: '/v1/auth/session',
        headers: { authorization: `Bearer ${sessionToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.authenticated).toBe(true);
      expect(body.session).toBeDefined();
      expect(body.session.sessionId).toBeDefined();
      expect(body.session.member).toBeDefined();
      expect(body.session.effectivePermissions).toBeDefined();
    });
  });

  describe('POST /v1/auth/logout', () => {
    it('returns ok:true even without session token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/logout',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().ok).toBe(true);
    });

    it('deletes session on valid logout', async () => {
      const userId = 'user_logout_1';
      const teamId = 'team_logout_1';
      const sessionToken = `session_logout_${Date.now()}`;

      await store.transact(async (data) => {
        if (!data.counters) data.counters = {};
        data.counters.user = 3;

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
          id: 'membership_logout_1',
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
          id: `session_logout_rec_${Date.now()}`,
          userId,
          tokenHash: hashSecret(sessionToken),
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
        headers: { authorization: `Bearer ${sessionToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().ok).toBe(true);

      // Verify session is removed
      const snapshot = await store.snapshot();
      const remaining = snapshot.sessions.find(
        (s) => s.tokenHash === hashSecret(sessionToken),
      );
      expect(remaining).toBeUndefined();
    });
  });

  describe('POST /v1/teams/select', () => {
    it('returns 401 without session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/teams/select',
        payload: { teamId: 'team_1' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('updates activeTeamId for valid session', async () => {
      const userId = 'user_teamselect_1';
      const teamId1 = 'team_ts_1';
      const teamId2 = 'team_ts_2';
      const sessionToken = `session_ts_${Date.now()}`;

      await store.transact(async (data) => {
        if (!data.counters) data.counters = {};
        data.counters.user = 4;

        data.users.push({
          id: userId,
          handle: 'teamselectuser',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.teams.push({
          id: teamId1,
          name: 'Team 1',
          slug: 'team-1',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.teams.push({
          id: teamId2,
          name: 'Team 2',
          slug: 'team-2',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_ts_1',
          userId,
          teamId: teamId1,
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_ts_2',
          userId,
          teamId: teamId2,
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.sessions.push({
          id: `session_ts_rec_${Date.now()}`,
          userId,
          tokenHash: hashSecret(sessionToken),
          activeTeamId: teamId1,
          subjectType: 'user',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/teams/select',
        headers: { authorization: `Bearer ${sessionToken}` },
        payload: { teamId: teamId2 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.session).toBeDefined();
      expect(body.session.activeTeam).toBeDefined();
      expect(body.session.activeTeam.id).toBe(teamId2);
    });

    it('returns 403 when user is not a member of selected team', async () => {
      const userId = 'user_nomember_1';
      const teamId1 = 'team_nm_1';
      const teamId2 = 'team_nm_2';
      const sessionToken = `session_nm_${Date.now()}`;

      await store.transact(async (data) => {
        if (!data.counters) data.counters = {};
        data.counters.user = 5;

        data.users.push({
          id: userId,
          handle: 'nomemberuser',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.teams.push({
          id: teamId1,
          name: 'Member Team',
          slug: 'member-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.teams.push({
          id: teamId2,
          name: 'Non-Member Team',
          slug: 'non-member-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Only membership in team1, not in team2
        data.memberships.push({
          id: 'membership_nm_1',
          userId,
          teamId: teamId1,
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.sessions.push({
          id: `session_nm_rec_${Date.now()}`,
          userId,
          tokenHash: hashSecret(sessionToken),
          activeTeamId: teamId1,
          subjectType: 'user',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/teams/select',
        headers: { authorization: `Bearer ${sessionToken}` },
        payload: { teamId: teamId2 },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
