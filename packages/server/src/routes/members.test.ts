/**
 * Integration tests for members routes.
 *
 * Covers POST /v1/members (create) and PATCH /v1/members/:memberId (update)
 * including securityLevel persistence, handle uniqueness, and permission checks.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildServer } from '@trapmap/server/app.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import type { FastifyInstance } from 'fastify';

describe('members routes', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;
  let sessionToken: string;
  const userId = 'user_m_admin';
  const teamId = 'team_m_1';

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-members-${Date.now()}-${Math.random()}.json`;
    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;

    sessionToken = `session_members_${Date.now()}`;

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

      data.memberships.push({
        id: 'membership_admin',
        userId,
        teamId,
        roleTemplate: 'admin',
        securityLevel: 10,
        permissions: ['member:create', 'member:update'],
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

  describe('POST /v1/members', () => {
    it('creates a member with default securityLevel 0', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/members',
        headers: { authorization: `Bearer ${sessionToken}` },
        payload: {
          teamId,
          handle: 'newuser',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.handle).toBe('newuser');
      expect(body.securityLevel).toBe(0);
      expect(body.teamId).toBe(teamId);
    });

    it('creates a member with caller-provided securityLevel', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/members',
        headers: { authorization: `Bearer ${sessionToken}` },
        payload: {
          teamId,
          handle: 'privilegeduser',
          securityLevel: 5,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.handle).toBe('privilegeduser');
      expect(body.securityLevel).toBe(5);
    });

    it('persists securityLevel so it can be read back', async () => {
      // Create member with securityLevel 7
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/members',
        headers: { authorization: `Bearer ${sessionToken}` },
        payload: {
          teamId,
          handle: 'persisteduser',
          securityLevel: 7,
        },
      });

      expect(createResponse.statusCode).toBe(200);
      const memberId = createResponse.json().id;

      // Verify the membership was stored with the correct securityLevel
      const snapshot = await store.snapshot();
      const membership = snapshot.memberships.find((m) => m.id === memberId);
      expect(membership).toBeDefined();
      expect(membership?.securityLevel).toBe(7);
    });

    it('returns 409 when handle already exists', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/members',
        headers: { authorization: `Bearer ${sessionToken}` },
        payload: {
          teamId,
          handle: 'admin', // already exists
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('handle_exists');
    });

    it('returns 403 when teamId does not match active session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/members',
        headers: { authorization: `Bearer ${sessionToken}` },
        payload: {
          teamId: 'nonexistent_team',
          handle: 'someuser',
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('team_mismatch');
    });

    it('returns 401 without session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/members',
        payload: {
          teamId,
          handle: 'someuser',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PATCH /v1/members/:memberId', () => {
    it('updates securityLevel on an existing member', async () => {
      // Create a member first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/members',
        headers: { authorization: `Bearer ${sessionToken}` },
        payload: {
          teamId,
          handle: 'updatetarget',
          securityLevel: 2,
        },
      });

      const memberId = createResponse.json().id;

      // Update securityLevel
      const updateResponse = await app.inject({
        method: 'PATCH',
        url: `/v1/members/${memberId}`,
        headers: { authorization: `Bearer ${sessionToken}` },
        payload: {
          securityLevel: 8,
        },
      });

      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json().securityLevel).toBe(8);
    });

    it('returns 404 for nonexistent member', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/members/nonexistent_member',
        headers: { authorization: `Bearer ${sessionToken}` },
        payload: {
          securityLevel: 5,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('member_not_found');
    });
  });
});
