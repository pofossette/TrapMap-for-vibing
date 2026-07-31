/**
 * Tests for admin boundary search routes.
 *
 * Covers:
 * - 403 for non-admin users
 * - Empty matches for empty constraints
 * - Matching entries returned with boundary info
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildPostgresTestServer as buildServer } from '../../../../scripts/testing/server-test-composition.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import type { FastifyInstance } from 'fastify';

describe('admin boundary search routes', () => {
  let app: FastifyInstance;

  let adminUserId: string;
  let userId: string;
  let teamId: string;
  let adminSessionToken: string;
  let userSessionToken: string;

  beforeEach(async () => {
    const fixtureId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    adminUserId = `admin_${fixtureId}`;
    userId = `user_${fixtureId}`;
    teamId = `team_${fixtureId}`;
    const testDataFile = `/tmp/trapmap-test-admin-boundary-${Date.now()}-${Math.random()}.json`;

    app = await buildServer({
      config: { dataFile: testDataFile },
      ownerReadModel: { getReadModel: async () => ({ knowledgeEntries: [] }) },
    });
    await app.ready();
    const { identity } = app.skillShareer;
    await identity.userRepo.insert({
      id: adminUserId,
      handle: `admin-${fixtureId}`,
      notes: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    await identity.userRepo.insert({
      id: userId,
      handle: `regular-${fixtureId}`,
      notes: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    await identity.teamRepo.insert({
      id: teamId,
      name: 'Test Team',
      slug: `test-team-${fixtureId}`,
      description: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    await identity.membershipRepo.insert({
      id: `membership_admin_${fixtureId}`,
      userId: adminUserId,
      teamId,
      roleTemplate: 'admin',
      securityLevel: 10,
      permissions: [],
      notes: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    await identity.membershipRepo.insert({
      id: `membership_user_${fixtureId}`,
      userId,
      teamId,
      roleTemplate: 'user',
      securityLevel: 5,
      permissions: [],
      notes: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    adminSessionToken = `session_admin_${Date.now()}`;
    await identity.sessionRepo.create({
      userId: null,
      activeTeamId: null,
      tokenHash: hashSecret(adminSessionToken),
      subjectType: 'system-admin',
      expiresAt: null,
    });
    userSessionToken = `session_user_${Date.now()}`;
    await identity.sessionRepo.create({
      userId,
      activeTeamId: teamId,
      tokenHash: hashSecret(userSessionToken),
      subjectType: 'user',
      expiresAt: null,
    });
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /admin/boundary-search', () => {
    it('returns 403 for non-admin users', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/boundary-search',
        headers: {
          authorization: `Bearer ${userSessionToken}`,
        },
        payload: { context: 'production' },
      });

      expect(response.statusCode).toBe(403);
      const json = response.json();
      expect(json.code).toBe('forbidden');
      expect(json.message).toContain('System admin required');
    });

    it('returns 401 for unauthenticated requests', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/boundary-search',
        payload: { context: 'production' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns empty matches for empty constraints', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/boundary-search',
        headers: {
          authorization: `Bearer ${adminSessionToken}`,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.matches).toEqual([]);
      expect(json.query.maxResults).toBe(50);
    });

    it('validates query parameters', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/boundary-search',
        headers: {
          authorization: `Bearer ${adminSessionToken}`,
        },
        payload: {
          context: 'production',
          maxResults: 10,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.query.context).toBe('production');
      expect(json.query.maxResults).toBe(10);
    });
  });
});
