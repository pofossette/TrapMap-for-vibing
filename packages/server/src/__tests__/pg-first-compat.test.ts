/**
 * Cross-mode compatibility tests for auth and member flows.
 *
 * These tests verify that the same workflows produce identical observable
 * behavior regardless of whether the server uses JSON store or PostgreSQL.
 *
 * When PostgreSQL is available (TRAPMAP_PG_URL is set), both code paths
 * exercise the repository layer. When not available, the JSON store path
 * is tested to ensure the fallback still works correctly.
 *
 * Phase 2 (PG-First Convergence)
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildServer } from '@trapmap/server/app.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import type { FastifyInstance } from 'fastify';

describe('pg-first compatibility: auth and member flows', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-pgcompat-${Date.now()}-${Math.random()}.json`;
    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('access key issue -> login roundtrip', () => {
    it('issues a key and logs in with it', async () => {
      const adminId = 'user_compat_admin';
      const targetUserId = 'user_compat_target';
      const teamId = 'team_compat_1';
      const sessionToken = `session_compat_${Date.now()}`;

      await store.transact(async (data) => {
        if (!data.counters) data.counters = {};
        data.counters.user = 1;

        data.users.push(
          {
            id: adminId,
            handle: 'compatadmin',
            notes: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          },
          {
            id: targetUserId,
            handle: 'compattarget',
            notes: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          },
        );

        data.teams.push({
          id: teamId,
          name: 'Compat Team',
          slug: 'compat-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push(
          {
            id: 'membership_compat_admin',
            userId: adminId,
            teamId,
            roleTemplate: 'admin',
            securityLevel: 10,
            permissions: ['member:key:create'],
            notes: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          },
          {
            id: 'membership_compat_target',
            userId: targetUserId,
            teamId,
            roleTemplate: 'user',
            securityLevel: 5,
            permissions: [],
            notes: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          },
        );

        data.sessions.push({
          id: `session_compat_${Date.now()}`,
          userId: adminId,
          tokenHash: hashSecret(sessionToken),
          activeTeamId: teamId,
          subjectType: 'user',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });
      });

      // Step 1: Issue access key
      const issueResponse = await app.inject({
        method: 'POST',
        url: '/v1/access-keys',
        headers: { authorization: `Bearer ${sessionToken}` },
        payload: { memberId: 'membership_compat_target', teamId },
      });

      expect(issueResponse.statusCode).toBe(200);
      const plainKey = issueResponse.json().accessKey;
      expect(plainKey).toBeDefined();
      expect(plainKey.length).toBeGreaterThanOrEqual(16);

      // Step 2: Login with the issued key
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { accessKey: plainKey },
      });

      expect(loginResponse.statusCode).toBe(200);
      const session = loginResponse.json().session;
      expect(session).toBeDefined();
      expect(loginResponse.headers['x-session-token']).toBeDefined();

      // Step 3: Verify the session is usable
      const sessionResponse = await app.inject({
        method: 'GET',
        url: '/v1/auth/session',
        headers: { authorization: `Bearer ${loginResponse.headers['x-session-token']}` },
      });

      expect(sessionResponse.statusCode).toBe(200);
      expect(sessionResponse.json().authenticated).toBe(true);
    });
  });

  describe('member create with securityLevel', () => {
    it('persists caller-provided securityLevel and reads it back', async () => {
      const adminId = 'user_compat_sl_admin';
      const teamId = 'team_compat_sl_1';
      const sessionToken = `session_sl_${Date.now()}`;

      await store.transact(async (data) => {
        if (!data.counters) data.counters = {};
        data.counters.user = 10;

        data.users.push({
          id: adminId,
          handle: 'sladmin',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.teams.push({
          id: teamId,
          name: 'SL Team',
          slug: 'sl-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_sl_admin',
          userId: adminId,
          teamId,
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: ['member:create', 'member:update'],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.sessions.push({
          id: `session_sl_${Date.now()}`,
          userId: adminId,
          tokenHash: hashSecret(sessionToken),
          activeTeamId: teamId,
          subjectType: 'user',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });
      });

      // Create member with securityLevel 7
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/members',
        headers: { authorization: `Bearer ${sessionToken}` },
        payload: {
          teamId,
          handle: 'sluser',
          securityLevel: 7,
        },
      });

      expect(createResponse.statusCode).toBe(200);
      expect(createResponse.json().securityLevel).toBe(7);

      const memberId = createResponse.json().id;

      // Verify stored value
      const snapshot = await store.snapshot();
      const membership = snapshot.memberships.find((m) => m.id === memberId);
      expect(membership?.securityLevel).toBe(7);
    });
  });
});
