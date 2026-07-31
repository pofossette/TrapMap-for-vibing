import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPostgresTestServer as buildServer } from '../../../../scripts/testing/server-test-composition.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import type { FastifyInstance } from 'fastify';

let sequence = 0;
describe('members routes', () => {
  let app: FastifyInstance;
  let token: string;
  let teamId: string;
  let adminHandle: string;
  beforeEach(async () => {
    const id = `members_${Date.now()}_${sequence++}`;
    app = await buildServer();
    const { identity } = app.skillShareer;
    const now = nowIso();
    const userId = `user_${id}`;
    teamId = `team_${id}`;
    token = `token_${id}`;
    adminHandle = `admin-${id}`;
    await identity.userRepo.insert({
      id: userId,
      handle: adminHandle,
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
      id: `member_${id}`,
      userId,
      teamId,
      roleTemplate: 'admin',
      securityLevel: 10,
      permissions: ['member:create', 'member:update'],
      notes: null,
      createdAt: now,
      updatedAt: now,
    });
    await identity.sessionRepo.create({
      userId,
      activeTeamId: teamId,
      tokenHash: hashSecret(token),
      subjectType: 'user',
      expiresAt: null,
    });
  });
  afterEach(async () => {
    await app?.close();
  });
  const create = (handle: string, securityLevel?: number) =>
    app.inject({
      method: 'POST',
      url: '/v1/members',
      headers: { authorization: `Bearer ${token}` },
      payload: { teamId, handle, ...(securityLevel === undefined ? {} : { securityLevel }) },
    });
  it('creates members with default and caller-provided security levels', async () => {
    const defaultMember = await create(`new-${sequence}`);
    expect(defaultMember.json().securityLevel).toBe(0);
    const privileged = await create(`privileged-${sequence}`, 5);
    expect(privileged.json().securityLevel).toBe(5);
  });
  it('persists securityLevel through the identity owner', async () => {
    const response = await create(`persisted-${sequence}`, 7);
    expect(response.statusCode).toBe(200);
    expect(
      await app.skillShareer.identity.membershipRepo.getById(response.json().id),
    ).toMatchObject({ securityLevel: 7 });
  });
  it('rejects duplicate handles and mismatched teams', async () => {
    expect((await create(adminHandle)).statusCode).toBe(409);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/members',
      headers: { authorization: `Bearer ${token}` },
      payload: { teamId: 'missing', handle: `other-${sequence}` },
    });
    expect(response.statusCode).toBe(403);
  });
  it('updates a created member and rejects missing members', async () => {
    const member = await create(`update-${sequence}`, 2);
    const update = await app.inject({
      method: 'PATCH',
      url: `/v1/members/${member.json().id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { securityLevel: 8 },
    });
    expect(update.json().securityLevel).toBe(8);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/v1/members/missing',
          headers: { authorization: `Bearer ${token}` },
          payload: { securityLevel: 5 },
        })
      ).statusCode,
    ).toBe(404);
  });
});
