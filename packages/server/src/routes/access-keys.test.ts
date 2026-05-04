/**
 * Integration tests for access-keys route.
 *
 * Covers POST /v1/access-keys for key creation with success and failure paths:
 * member-not-found, team-mismatch, permission-denied, successful creation,
 * and creation with notes.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';
import { buildServer } from '../app.js';
import type { SkillShareerStore } from '../lib/store.js';
import { hashSecret, nowIso } from '../lib/store.js';

describe('access-keys routes', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;
  let sessionToken: string;
  const userId = 'user_ak_admin';
  const teamId = 'team_ak_1';

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-accesskeys-${Date.now()}-${Math.random()}.json`;
    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;

    sessionToken = `session_accesskey_${Date.now()}`;

    await store.transact(async (data) => {
      if (!data.counters) data.counters = {};
      data.counters.user = 1;

      data.users.push({
        id: userId,
        handle: 'admin',
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

      // Admin membership (caller) -- securityLevel 10
      data.memberships.push({
        id: 'membership_admin',
        userId,
        teamId,
        roleTemplate: 'admin',
        securityLevel: 10,
        permissions: ['member:key:create'],
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      // Target membership for key issuance -- securityLevel 5 (lower than caller)
      const targetUserId = 'user_ak_target';
      data.users.push({
        id: targetUserId,
        handle: 'targetuser',
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      data.memberships.push({
        id: 'membership_1',
        userId: targetUserId,
        teamId,
        roleTemplate: 'user',
        securityLevel: 5,
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
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /v1/access-keys', () => {
    it('returns 404 when memberId does not exist', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/access-keys',
        headers: { authorization: `Bearer ${sessionToken}` },
        payload: { memberId: 'nonexistent', teamId },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('member_not_found');
    });

    it('returns 400 when member teamId does not match payload teamId', async () => {
      // Create a membership in a different team
      const otherTeamId = 'team_ak_2';

      await store.transact(async (data) => {
        data.teams.push({
          id: otherTeamId,
          name: 'Other Team',
          slug: 'other-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_other_team',
          userId,
          teamId: otherTeamId,
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      // Request key for membership_other_team (in team_ak_2) but specify team_ak_1
      const response = await app.inject({
        method: 'POST',
        url: '/v1/access-keys',
        headers: { authorization: `Bearer ${sessionToken}` },
        payload: { memberId: 'membership_other_team', teamId },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('team_member_mismatch');
    });

    it('returns 403 when caller does not have member:key:create permission', async () => {
      const userRoleApp = buildServer({
        config: {
          dataFile: `/tmp/trapmap-test-ak-perm-${Date.now()}-${Math.random()}.json`,
        },
      });
      await userRoleApp.ready();

      const userRoleToken = `session_userole_${Date.now()}`;
      const userRoleId = 'user_role_test';
      const userRoleTeamId = 'team_role_test';

      await userRoleApp.skillShareer.store.transact(async (data) => {
        if (!data.counters) data.counters = {};
        data.counters.user = 10;

        data.users.push({
          id: userRoleId,
          handle: 'regularuser',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.teams.push({
          id: userRoleTeamId,
          name: 'Role Test Team',
          slug: 'role-test-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_role_test',
          userId: userRoleId,
          teamId: userRoleTeamId,
          roleTemplate: 'user',
          securityLevel: 5,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Target membership for the access key
        data.memberships.push({
          id: 'membership_role_target',
          userId: userRoleId,
          teamId: userRoleTeamId,
          roleTemplate: 'user',
          securityLevel: 3,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.sessions.push({
          id: `session_userole_${Date.now()}`,
          userId: userRoleId,
          tokenHash: hashSecret(userRoleToken),
          activeTeamId: userRoleTeamId,
          subjectType: 'user',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });
      });

      const response = await userRoleApp.inject({
        method: 'POST',
        url: '/v1/access-keys',
        headers: { authorization: `Bearer ${userRoleToken}` },
        payload: {
          memberId: 'membership_role_target',
          teamId: userRoleTeamId,
        },
      });

      expect(response.statusCode).toBe(403);

      await userRoleApp.close();
    });

    it('creates access key successfully', async () => {
      // membership_1 is already set up in beforeEach, belongs to team_ak_1
      const response = await app.inject({
        method: 'POST',
        url: '/v1/access-keys',
        headers: { authorization: `Bearer ${sessionToken}` },
        payload: { memberId: 'membership_1', teamId },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      // Plaintext key for one-time display
      expect(typeof body.accessKey).toBe('string');
      expect(body.accessKey.length).toBeGreaterThan(0);

      // Record with metadata
      expect(body.record).toBeDefined();
      expect(body.record.memberId).toBe('membership_1');
      expect(body.record.tokenPreview).toBeDefined();
      expect(body.record.level).toBeDefined();
      expect(body.record.teamId).toBe(teamId);

      // Verify access key is stored
      const snapshot = await store.snapshot();
      const storedKey = snapshot.accessKeys.find((k) => k.tokenHash === hashSecret(body.accessKey));
      expect(storedKey).toBeDefined();
      expect(storedKey?.memberId).toBe('membership_1');
    });

    it('creates access key with notes', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/access-keys',
        headers: { authorization: `Bearer ${sessionToken}` },
        payload: {
          memberId: 'membership_1',
          teamId,
          notes: 'Test key for CI',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().record.notes).toBe('Test key for CI');
    });
  });
});
