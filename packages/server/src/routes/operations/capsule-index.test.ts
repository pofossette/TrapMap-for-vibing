import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPostgresTestServer as buildServer } from '../../../../../scripts/testing/server-test-composition.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import type { FastifyInstance } from 'fastify';

const mocks = vi.hoisted(() => ({
  rebuildAll: vi.fn(),
  rebuildOne: vi.fn(),
  health: vi.fn(),
  cleanup: vi.fn(),
}));
vi.mock('@trapmap/server/lib/retrieval/capsules/repositories/index-rebuild.js', () => ({
  rebuildAllCapsuleIndexes: mocks.rebuildAll,
  rebuildCapsuleIndexForArtifact: mocks.rebuildOne,
  verifyCapsuleIndexHealth: mocks.health,
  cleanupOrphanCapsuleIndexes: mocks.cleanup,
}));

const artifact = {
  id: 'artifact-approved',
  slug: 'artifact-approved',
  title: 'Approved',
  lifecycleState: 'approved',
  metadata: { sourceKind: 'skill-directory' },
} as never;
describe('capsule index operations routes', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await buildServer();
    await app.ready();
    vi.clearAllMocks();
    app.skillShareer.repos.artifact.listForRetrieval = vi.fn(async () => [artifact]);
    app.skillShareer.repos.artifact.getById = vi.fn(async () => artifact);
  });
  afterEach(async () => {
    await app?.close();
  });
  async function session(subject: 'system-admin' | 'user') {
    const token = `capsule_${subject}_${Date.now()}_${Math.random()}`;
    const now = nowIso();
    if (subject === 'user') {
      const teamId = `team_${token}`;
      await app.skillShareer.identity.userRepo.insert({
        id: `user_${token}`,
        handle: `user-${token}`,
        notes: null,
        createdAt: now,
        updatedAt: now,
      });
      await app.skillShareer.identity.teamRepo.insert({
        id: teamId,
        name: 'Capsule Team',
        slug: `capsule-${token}`,
        description: null,
        createdAt: now,
        updatedAt: now,
      });
      await app.skillShareer.identity.membershipRepo.insert({
        id: `member_${token}`,
        userId: `user_${token}`,
        teamId,
        roleTemplate: 'admin',
        securityLevel: 10,
        permissions: ['knowledge:export', 'knowledge:update'],
        notes: null,
        createdAt: now,
        updatedAt: now,
      });
      await app.skillShareer.identity.sessionRepo.create({
        userId: `user_${token}`,
        activeTeamId: teamId,
        tokenHash: hashSecret(token),
        subjectType: 'user',
        expiresAt: null,
      });
    } else
      await app.skillShareer.identity.sessionRepo.create({
        userId: null,
        activeTeamId: null,
        tokenHash: hashSecret(token),
        subjectType: 'system-admin',
        expiresAt: null,
      });
    return { authorization: `Bearer ${token}` };
  }
  it('returns 401 for unauthenticated rebuild requests', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/operations/capsule-index/rebuild',
          payload: { mode: 'full' },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('returns 403 for non-system-admin callers', async () => {
    const auth = await session('user');
    const response = await app.inject({
      method: 'GET',
      url: '/v1/operations/capsule-index/health',
      headers: auth,
    });
    expect(response.statusCode).toBe(403);
  });
  it('runs full rebuild through the injected pool and artifact owner', async () => {
    const auth = await session('system-admin');
    mocks.rebuildAll.mockResolvedValue({
      artifactsProcessed: 1,
      capsulesSynced: 1,
      keywordSynced: 1,
      keywordFailed: 0,
      embeddingSynced: 1,
      embeddingFailed: 0,
      durationMs: 1,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/operations/capsule-index/rebuild',
      headers: auth,
      payload: { mode: 'full' },
    });
    expect(response.statusCode).toBe(200);
    expect(mocks.rebuildAll).toHaveBeenCalledWith(
      expect.objectContaining({ pool: app.skillShareer.pool, artifacts: [artifact] }),
    );
  });
  it('runs artifact-scoped rebuild and health through owner projections', async () => {
    const auth = await session('system-admin');
    mocks.rebuildOne.mockResolvedValue({
      keyword: [{ capsuleId: 'c', status: 'synced' }],
      embedding: [{ capsuleId: 'c', status: 'synced' }],
    });
    mocks.health.mockResolvedValue({ ok: true });
    const rebuild = await app.inject({
      method: 'POST',
      url: '/v1/operations/capsule-index/rebuild',
      headers: auth,
      payload: { mode: 'artifact', artifactId: artifact.id },
    });
    expect(rebuild.statusCode).toBe(200);
    const health = await app.inject({
      method: 'GET',
      url: '/v1/operations/capsule-index/health',
      headers: auth,
    });
    expect(health.statusCode).toBe(200);
  });
  it('rejects non-approved artifact rebuilds', async () => {
    const auth = await session('system-admin');
    app.skillShareer.repos.artifact.getById = vi.fn(
      async () => ({ ...artifact, lifecycleState: 'agent-pass' }) as never,
    );
    const response = await app.inject({
      method: 'POST',
      url: '/v1/operations/capsule-index/rebuild',
      headers: auth,
      payload: { mode: 'artifact', artifactId: artifact.id },
    });
    expect(response.statusCode).toBe(409);
  });
});
