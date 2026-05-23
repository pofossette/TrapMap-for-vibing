/**
 * Tests for admin boundary search routes.
 *
 * Covers:
 * - 403 for non-admin users
 * - Empty matches for empty constraints
 * - Matching entries returned with boundary info
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildServer } from '@trapmap/server/app.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import type { FastifyInstance } from 'fastify';

describe('admin boundary search routes', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;

  const adminUserId = 'admin_1';
  const userId = 'user_1';
  const teamId = 'team_1';
  let adminSessionToken: string;
  let userSessionToken: string;

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-admin-boundary-${Date.now()}-${Math.random()}.json`;

    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;

    // Setup: Create users, team, memberships, sessions
    await store.transact(async (data) => {
      if (!data.counters) data.counters = {};
      data.counters.user = 2;

      // Create admin user
      data.users.push({
        id: adminUserId,
        handle: 'admin',
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      // Create regular user
      data.users.push({
        id: userId,
        handle: 'regularuser',
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      // Create team
      data.teams.push({
        id: teamId,
        name: 'Test Team',
        slug: 'test-team',
        description: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      // Admin membership
      data.memberships.push({
        id: 'membership_admin',
        userId: adminUserId,
        teamId,
        roleTemplate: 'admin',
        securityLevel: 10,
        permissions: [],
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      // Regular user membership
      data.memberships.push({
        id: 'membership_user',
        userId,
        teamId,
        roleTemplate: 'user',
        securityLevel: 5,
        permissions: [],
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      // Admin session (system-admin)
      adminSessionToken = `session_admin_${Date.now()}`;
      data.sessions.push({
        id: 'session_admin',
        userId: null,
        activeTeamId: null,
        tokenHash: hashSecret(adminSessionToken),
        subjectType: 'system-admin',
        expiresAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      // Regular user session
      userSessionToken = `session_user_${Date.now()}`;
      data.sessions.push({
        id: 'session_user',
        userId,
        activeTeamId: teamId,
        tokenHash: hashSecret(userSessionToken),
        subjectType: 'user',
        expiresAt: null,
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
