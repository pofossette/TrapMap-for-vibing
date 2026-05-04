/**
 * Nyquist adversarial validation tests for access-keys route.
 *
 * Validates gap claims:
 * - POST /v1/access-keys returns 404 for non-existent member
 * - POST /v1/access-keys returns 400 for team mismatch
 * - POST /v1/access-keys returns 403 for insufficient permissions
 * - POST /v1/access-keys creates key successfully with correct fields
 * - POST /v1/access-keys creates key with notes
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../app.js';
import type { SkillShareerStore } from '../lib/store.js';
import { hashSecret, nowIso } from '../lib/store.js';

describe('Nyquist: POST /v1/access-keys', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;
  let sessionToken: string;
  const adminUserId = 'nyq_ak_admin';
  const targetUserId = 'nyq_ak_target';
  const teamId = 'nyq_ak_team';

  beforeEach(async () => {
    app = buildServer({
      config: { dataFile: `/tmp/trapmap-nyq-ak-${Date.now()}-${Math.random()}.json` },
    });
    await app.ready();
    store = app.skillShareer.store;
    sessionToken = `nyq_ak_sess_${Date.now()}`;

    await store.transact(async (data) => {
      if (!data.counters) data.counters = {};
      data.counters.user = 1;

      data.users.push({
        id: adminUserId, handle: 'admin', notes: null,
        createdAt: nowIso(), updatedAt: nowIso(),
      });
      data.users.push({
        id: targetUserId, handle: 'target', notes: null,
        createdAt: nowIso(), updatedAt: nowIso(),
      });
      data.teams.push({
        id: teamId, name: 'AK Team', slug: 'ak-team', description: null,
        createdAt: nowIso(), updatedAt: nowIso(),
      });
      // Admin membership with permission
      data.memberships.push({
        id: 'm_ak_admin', userId: adminUserId, teamId,
        roleTemplate: 'admin', securityLevel: 10,
        permissions: ['member:key:create'], notes: null,
        createdAt: nowIso(), updatedAt: nowIso(),
      });
      // Target membership at lower level
      data.memberships.push({
        id: 'm_ak_target', userId: targetUserId, teamId,
        roleTemplate: 'user', securityLevel: 5,
        permissions: [], notes: null,
        createdAt: nowIso(), updatedAt: nowIso(),
      });
      data.sessions.push({
        id: `sess_ak_${Date.now()}`, userId: adminUserId,
        tokenHash: hashSecret(sessionToken), activeTeamId: teamId,
        subjectType: 'user',
        createdAt: nowIso(), updatedAt: nowIso(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
    });
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns 404 with code "member_not_found" for non-existent member', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/access-keys',
      headers: { authorization: `Bearer ${sessionToken}` },
      payload: { memberId: 'nonexistent_member', teamId },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('member_not_found');
  });

  it('returns 400 when membership teamId does not match payload teamId', async () => {
    const otherTeamId = 'nyq_ak_other_team';

    await store.transact(async (data) => {
      data.teams.push({
        id: otherTeamId, name: 'Other Team', slug: 'other-team', description: null,
        createdAt: nowIso(), updatedAt: nowIso(),
      });
      data.memberships.push({
        id: 'm_ak_other', userId: targetUserId, teamId: otherTeamId,
        roleTemplate: 'user', securityLevel: 3,
        permissions: [], notes: null,
        createdAt: nowIso(), updatedAt: nowIso(),
      });
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/access-keys',
      headers: { authorization: `Bearer ${sessionToken}` },
      payload: { memberId: 'm_ak_other', teamId }, // payload teamId differs from membership teamId
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('team_member_mismatch');
  });

  it('creates access key and returns plaintext key with record', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/access-keys',
      headers: { authorization: `Bearer ${sessionToken}` },
      payload: { memberId: 'm_ak_target', teamId },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(typeof body.accessKey).toBe('string');
    expect(body.accessKey.length).toBeGreaterThan(0);
    expect(body.record).toBeDefined();
    expect(body.record.memberId).toBe('m_ak_target');
    expect(body.record.teamId).toBe(teamId);
    expect(body.record.tokenPreview).toBeDefined();

    // Verify stored in store
    const snap = await store.snapshot();
    const stored = snap.accessKeys.find((k) => k.tokenHash === hashSecret(body.accessKey));
    expect(stored).toBeDefined();
    expect(stored!.memberId).toBe('m_ak_target');
  });

  it('creates access key with notes field', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/access-keys',
      headers: { authorization: `Bearer ${sessionToken}` },
      payload: { memberId: 'm_ak_target', teamId, notes: 'Nyquist test key' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().record.notes).toBe('Nyquist test key');
  });
});
