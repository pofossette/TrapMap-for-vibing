import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPostgresTestServer as buildServer } from '../../../../scripts/testing/server-test-composition.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import type { FastifyInstance } from 'fastify';

let sequence = 0;
describe('access-keys routes', () => {
  let app: FastifyInstance;
  let token: string;
  let teamId: string;
  let targetMemberId: string;
  let adminId: string;
  beforeEach(async () => {
    const id = `keys_${Date.now()}_${sequence++}`;
    app = await buildServer();
    const { identity } = app.skillShareer;
    const now = nowIso();
    adminId = `admin_${id}`;
    const target = `target_${id}`;
    teamId = `team_${id}`;
    targetMemberId = `member_target_${id}`;
    token = `token_${id}`;
    await identity.userRepo.insert({
      id: adminId,
      handle: `admin-${id}`,
      notes: null,
      createdAt: now,
      updatedAt: now,
    });
    await identity.userRepo.insert({
      id: target,
      handle: `target-${id}`,
      notes: null,
      createdAt: now,
      updatedAt: now,
    });
    await identity.teamRepo.insert({
      id: teamId,
      name: 'Test Team',
      slug: `team-${id}`,
      description: null,
      createdAt: now,
      updatedAt: now,
    });
    await identity.membershipRepo.insert({
      id: `member_admin_${id}`,
      userId: adminId,
      teamId,
      roleTemplate: 'admin',
      securityLevel: 10,
      permissions: ['member:key:create'],
      notes: null,
      createdAt: now,
      updatedAt: now,
    });
    await identity.membershipRepo.insert({
      id: targetMemberId,
      userId: target,
      teamId,
      roleTemplate: 'user',
      securityLevel: 5,
      permissions: [],
      notes: null,
      createdAt: now,
      updatedAt: now,
    });
    await identity.sessionRepo.create({
      userId: adminId,
      activeTeamId: teamId,
      tokenHash: hashSecret(token),
      subjectType: 'user',
      expiresAt: null,
    });
  });
  afterEach(async () => {
    await app?.close();
  });
  const issue = (memberId: string, payload: Record<string, unknown> = {}) =>
    app.inject({
      method: 'POST',
      url: '/v1/access-keys',
      headers: { authorization: `Bearer ${token}` },
      payload: { memberId, teamId, ...payload },
    });
  it('returns 404 when memberId does not exist', async () => {
    const response = await issue('missing');
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('member_not_found');
  });
  it('returns 400 when member team does not match the payload team', async () => {
    const other = `other_${sequence++}`;
    const now = nowIso();
    await app.skillShareer.identity.teamRepo.insert({
      id: other,
      name: 'Other',
      slug: other,
      description: null,
      createdAt: now,
      updatedAt: now,
    });
    await app.skillShareer.identity.membershipRepo.insert({
      id: `member_other_${other}`,
      userId: adminId,
      teamId: other,
      roleTemplate: 'admin',
      securityLevel: 10,
      permissions: [],
      notes: null,
      createdAt: now,
      updatedAt: now,
    });
    const response = await issue(`member_other_${other}`);
    expect(response.statusCode).toBe(400);
  });
  it('creates an access key and persists it through the identity owner', async () => {
    const response = await issue(targetMemberId);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(
      await app.skillShareer.identity.accessKeyRepo.getByTokenHash(hashSecret(body.accessKey)),
    ).toMatchObject({ memberId: targetMemberId });
  });
  it('creates an access key with notes', async () => {
    const response = await issue(targetMemberId, { notes: 'Test key for CI' });
    expect(response.statusCode).toBe(200);
    expect(response.json().record.notes).toBe('Test key for CI');
  });
  it('issues a key that can log in', async () => {
    const issued = await issue(targetMemberId);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { accessKey: issued.json().accessKey },
    });
    expect(response.statusCode).toBe(200);
  });
});
