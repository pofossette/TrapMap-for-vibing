/** Integration tests for auth routes. */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildPostgresTestServer as buildServer } from '../../../../scripts/testing/server-test-composition.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import type { FastifyInstance } from 'fastify';

let sequence = 0;

async function seedUserSession(
  app: FastifyInstance,
  args: { accessKey?: string; teams?: number; sessionToken?: string },
) {
  const fixture = `auth_${Date.now()}_${sequence++}`;
  const { identity } = app.skillShareer;
  const userId = `user_${fixture}`;
  const teamIds = Array.from({ length: args.teams ?? 1 }, (_, index) => `team_${fixture}_${index}`);
  const token = args.sessionToken ?? `session_${fixture}`;
  const now = nowIso();
  await identity.userRepo.insert({
    id: userId,
    handle: `user-${fixture}`,
    notes: null,
    createdAt: now,
    updatedAt: now,
  });
  for (const [index, teamId] of teamIds.entries()) {
    await identity.teamRepo.insert({
      id: teamId,
      name: `Team ${index + 1}`,
      slug: `team-${fixture}-${index}`,
      description: null,
      createdAt: now,
      updatedAt: now,
    });
    await identity.membershipRepo.insert({
      id: `membership_${fixture}_${index}`,
      userId,
      teamId,
      roleTemplate: 'admin',
      securityLevel: 10,
      permissions: [],
      notes: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (args.accessKey) {
    await identity.accessKeyRepo.insert({
      id: `key_${fixture}`,
      memberId: `membership_${fixture}_0`,
      tokenHash: hashSecret(args.accessKey),
      tokenPreview: args.accessKey.slice(-8),
      issuedByUserId: userId,
      teamId: teamIds[0]!,
      level: 10,
      notes: null,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await identity.sessionRepo.create({
      userId,
      activeTeamId: teamIds[0]!,
      tokenHash: hashSecret(token),
      subjectType: 'user',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
  }
  return { userId, teamIds, token };
}

describe('auth routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildServer();
    await app.ready();
  });
  afterEach(async () => {
    await app?.close();
  });

  describe('POST /v1/auth/login', () => {
    it('returns 200 with session and x-session-token header for valid systemAdminKey', async () => {
      const localApp = await buildServer({ config: { systemAdminKey: 'test-admin-key-123' } });
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
      const localApp = await buildServer({ config: { systemAdminKey: 'test-admin-key-123' } });
      const response = await localApp.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { systemAdminKey: 'wrong-key-value-xxxx' },
      });
      expect(response.statusCode).toBe(401);
      await localApp.close();
    });
    it('returns 500 for system admin login when systemAdminKey not configured', async () => {
      const localApp = await buildServer();
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
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/v1/auth/login',
            payload: { accessKey: 'invalid_key_that_is_16_chars' },
          })
        ).statusCode,
      ).toBe(401);
    });
    it('returns 200 with session for valid access key', async () => {
      const accessKey = `test-access-key-${Date.now()}`;
      await seedUserSession(app, { accessKey });
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { accessKey },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().session).toBeDefined();
      expect(response.headers['x-session-token']).toBeDefined();
    });
  });

  describe('GET /v1/auth/session', () => {
    it('returns authenticated=false when no token provided', async () => {
      const response = await app.inject({ method: 'GET', url: '/v1/auth/session' });
      expect(response.statusCode).toBe(200);
      expect(response.json().authenticated).toBe(false);
    });
    it('returns authenticated=true with valid session', async () => {
      const { token } = await seedUserSession(app, {});
      const response = await app.inject({
        method: 'GET',
        url: '/v1/auth/session',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().authenticated).toBe(true);
      expect(response.json().session.member).toBeDefined();
      expect(response.json().session.effectivePermissions).toBeDefined();
    });
  });

  describe('POST /v1/auth/logout', () => {
    it('returns ok:true even without session token', async () => {
      const response = await app.inject({ method: 'POST', url: '/v1/auth/logout' });
      expect(response.statusCode).toBe(200);
      expect(response.json().ok).toBe(true);
    });
    it('deletes session on valid logout', async () => {
      const { token } = await seedUserSession(app, {});
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/logout',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().ok).toBe(true);
      expect(
        await app.skillShareer.identity.sessionRepo.getByTokenHash(hashSecret(token)),
      ).toBeNull();
    });
  });

  describe('POST /v1/teams/select', () => {
    it('returns 401 without session', async () => {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/v1/teams/select',
            payload: { teamId: 'team_1' },
          })
        ).statusCode,
      ).toBe(401);
    });
    it('updates activeTeamId for valid session', async () => {
      const { teamIds, token } = await seedUserSession(app, { teams: 2 });
      const response = await app.inject({
        method: 'POST',
        url: '/v1/teams/select',
        headers: { authorization: `Bearer ${token}` },
        payload: { teamId: teamIds[1] },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().session.activeTeam.id).toBe(teamIds[1]);
    });
    it('returns 403 when user is not a member of selected team', async () => {
      const { userId, teamIds, token } = await seedUserSession(app, { teams: 2 });
      await app.skillShareer.pool.query(
        'DELETE FROM memberships WHERE user_id = $1 AND team_id = $2',
        [userId, teamIds[1]],
      );
      const response = await app.inject({
        method: 'POST',
        url: '/v1/teams/select',
        headers: { authorization: `Bearer ${token}` },
        payload: { teamId: teamIds[1] },
      });
      expect(response.statusCode).toBe(403);
    });
  });
});
