import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '@trapmap/server/app.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import type { FastifyInstance } from 'fastify';

const {
  rebuildAllCapsuleIndexesMock,
  rebuildCapsuleIndexForArtifactMock,
  verifyCapsuleIndexHealthMock,
  cleanupOrphanCapsuleIndexesMock,
} = vi.hoisted(() => ({
  rebuildAllCapsuleIndexesMock: vi.fn(),
  rebuildCapsuleIndexForArtifactMock: vi.fn(),
  verifyCapsuleIndexHealthMock: vi.fn(),
  cleanupOrphanCapsuleIndexesMock: vi.fn(),
}));

vi.mock('@trapmap/server/lib/retrieval/capsules/repositories/index-rebuild.js', () => ({
  rebuildAllCapsuleIndexes: rebuildAllCapsuleIndexesMock,
  rebuildCapsuleIndexForArtifact: rebuildCapsuleIndexForArtifactMock,
  verifyCapsuleIndexHealth: verifyCapsuleIndexHealthMock,
  cleanupOrphanCapsuleIndexes: cleanupOrphanCapsuleIndexesMock,
}));

async function getSystemAdminAuth(app: FastifyInstance): Promise<{ Authorization: string }> {
  const loginResponse = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: {
      systemAdminKey: 'test-system-admin-key',
    },
  });

  if (loginResponse.statusCode === 200) {
    const loginJson = loginResponse.json() as { token?: string };
    return { Authorization: `Bearer ${loginJson.token}` };
  }

  const token = 'test-capsule-index-admin-token';
  const tokenHash = hashSecret(token);
  await app.skillShareer.store.transact((txData) => {
    txData.sessions.push({
      id: 'capsule-index-test-session',
      subjectType: 'system-admin',
      userId: null,
      activeTeamId: null,
      tokenHash,
      expiresAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  });

  return { Authorization: `Bearer ${token}` };
}

async function getUserAuth(app: FastifyInstance): Promise<{ Authorization: string }> {
  const token = 'test-capsule-index-user-token';
  const userId = 'capsule-index-user';

  await app.skillShareer.store.transact((data) => {
    data.users.push({
      id: userId,
      handle: 'capsule-index-user',
      notes: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    data.memberships.push({
      id: 'capsule-index-membership',
      userId,
      teamId: null,
      roleTemplate: 'admin',
      securityLevel: 5,
      permissions: ['knowledge:export', 'knowledge:update'],
      notes: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    data.sessions.push({
      id: 'capsule-index-user-session',
      subjectType: 'user',
      userId,
      activeTeamId: null,
      tokenHash: hashSecret(token),
      expiresAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  });

  return { Authorization: `Bearer ${token}` };
}

async function seedApprovedArtifact(app: FastifyInstance) {
  await app.skillShareer.store.transact((data) => {
    data.skillArtifacts.push({
      id: 'artifact-approved',
      slug: 'artifact-approved',
      title: 'Approved Artifact',
      summary: 'Artifact for capsule index route tests',
      ownerUserId: 'owner-1',
      teamId: null,
      scope: 'global',
      labels: ['capsule'],
      requiredLevel: 0,
      lifecycleState: 'approved',
      latestSubmissionId: 'submission-approved',
      latestRevision: {
        revision: 1,
        submittedAt: nowIso(),
        submittedByUserId: 'owner-1',
        sourceHash: 'hash-approved',
        payloadVersion: 1,
        bundle: {
          profile: {
            kind: 'inline',
            markdown: '# Profile',
          },
          skill: {
            kind: 'inline',
            markdown: '# Skill',
          },
          references: [],
          assets: [],
          scripts: [],
        },
        derived: {
          profile: {
            summary: 'profile',
            tags: ['capsule'],
            tools: [],
            traps: [],
          },
          capsules: [
            {
              capsuleId: 'capsule-approved-1',
              artifactId: 'artifact-approved',
              revision: 1,
              title: 'Capsule',
              summary: 'Capsule summary',
              content: 'Capsule content',
              situation: 'Situation',
              problem: 'Problem',
              goal: 'Goal',
              labels: ['capsule'],
              scope: 'global',
              requiredLevel: 0,
              sourcePaths: ['SKILL.md'],
              sourceType: 'skill-main',
              activationHint: null,
              governanceInherited: true,
              contextualPrefix: null,
            },
          ],
          clientManifest: null,
        },
      },
      history: [],
      lifecycleHistory: [],
      revisionCount: 1,
      metadata: {
        sourceKind: 'skill-directory',
        sourcePath: '/tmp/skill',
        importId: null,
        lastExportedAt: null,
        reviewCount: 0,
      },
      maintenanceMeta: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    } as never);
  });
}

async function seedPendingArtifact(app: FastifyInstance) {
  await app.skillShareer.store.transact((data) => {
    data.skillArtifacts.push({
      id: 'artifact-pending',
      slug: 'artifact-pending',
      title: 'Pending Artifact',
      summary: 'Pending artifact for gating',
      ownerUserId: 'owner-1',
      teamId: null,
      scope: 'global',
      labels: ['capsule'],
      requiredLevel: 0,
      lifecycleState: 'agent-pass',
      latestSubmissionId: 'submission-pending',
      latestRevision: {
        revision: 1,
        submittedAt: nowIso(),
        submittedByUserId: 'owner-1',
        sourceHash: 'hash-pending',
        payloadVersion: 1,
        bundle: {
          profile: {
            kind: 'inline',
            markdown: '# Profile',
          },
          skill: {
            kind: 'inline',
            markdown: '# Skill',
          },
          references: [],
          assets: [],
          scripts: [],
        },
        derived: {
          profile: null,
          capsules: [],
          clientManifest: null,
        },
      },
      history: [],
      lifecycleHistory: [],
      revisionCount: 1,
      metadata: {
        sourceKind: 'skill-directory',
        sourcePath: '/tmp/skill-pending',
        importId: null,
        lastExportedAt: null,
        reviewCount: 0,
      },
      maintenanceMeta: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    } as never);
  });
}

describe('capsule index operations routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = buildServer();
    await app.ready();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns 401 for unauthenticated rebuild request', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/operations/capsule-index/rebuild',
      payload: { mode: 'full' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 403 for non-system-admin caller even with permissions', async () => {
    const auth = await getUserAuth(app);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/operations/capsule-index/health',
      headers: auth,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('forbidden');
  });

  it('returns 409 when capsule index operations are requested without PostgreSQL', async () => {
    const auth = await getSystemAdminAuth(app);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/operations/capsule-index/health',
      headers: auth,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('capsule_pg_unavailable');
  });

  describe('with PostgreSQL-backed store', () => {
    beforeEach(() => {
      const store = app.skillShareer.store as typeof app.skillShareer.store & {
        getPool?: () => unknown;
      };
      store.getPool = () => ({}) as never;
    });

    it('runs full rebuild against approved artifacts', async () => {
      const auth = await getSystemAdminAuth(app);
      await seedApprovedArtifact(app);
      rebuildAllCapsuleIndexesMock.mockResolvedValue({
        artifactsProcessed: 1,
        capsulesSynced: 2,
        keywordSynced: 1,
        keywordFailed: 0,
        embeddingSynced: 1,
        embeddingFailed: 0,
        durationMs: 12,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/capsule-index/rebuild',
        payload: { mode: 'full' },
        headers: auth,
      });

      expect(response.statusCode).toBe(200);
      expect(rebuildAllCapsuleIndexesMock).toHaveBeenCalledTimes(1);
      const args = rebuildAllCapsuleIndexesMock.mock.calls[0]![0];
      expect(args.artifacts).toHaveLength(1);
      expect(args.artifacts[0].id).toBe('artifact-approved');
      expect(response.json().mode).toBe('full');
    });

    it('runs artifact-scoped rebuild for an approved artifact', async () => {
      const auth = await getSystemAdminAuth(app);
      await seedApprovedArtifact(app);
      rebuildCapsuleIndexForArtifactMock.mockResolvedValue({
        keyword: [{ capsuleId: 'capsule-approved-1', status: 'synced' }],
        embedding: [{ capsuleId: 'capsule-approved-1', status: 'synced' }],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/capsule-index/rebuild',
        payload: { mode: 'artifact', artifactId: 'artifact-approved' },
        headers: auth,
      });

      expect(response.statusCode).toBe(200);
      expect(rebuildCapsuleIndexForArtifactMock).toHaveBeenCalledTimes(1);
      expect(response.json().artifactId).toBe('artifact-approved');
      expect(response.json().result.keywordSynced).toBe(1);
      expect(response.json().result.embeddingSynced).toBe(1);
    });

    it('rejects artifact-scoped rebuild for a non-approved artifact', async () => {
      const auth = await getSystemAdminAuth(app);
      await seedPendingArtifact(app);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/capsule-index/rebuild',
        payload: { mode: 'artifact', artifactId: 'artifact-pending' },
        headers: auth,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('artifact_not_indexed');
    });

    it('returns capsule index health report', async () => {
      const auth = await getSystemAdminAuth(app);
      await seedApprovedArtifact(app);
      verifyCapsuleIndexHealthMock.mockResolvedValue({
        totalSourceCapsules: 1,
        totalKeywordRows: 1,
        totalEmbeddingRows: 1,
        missingKeywords: [],
        missingEmbeddings: [],
        failedKeywords: [],
        failedEmbeddings: [],
        orphanKeywords: [],
        orphanEmbeddings: [],
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/capsule-index/health',
        headers: auth,
      });

      expect(response.statusCode).toBe(200);
      expect(verifyCapsuleIndexHealthMock).toHaveBeenCalledTimes(1);
      expect(response.json().report.totalSourceCapsules).toBe(1);
    });

    it('runs orphan cleanup against approved artifacts', async () => {
      const auth = await getSystemAdminAuth(app);
      await seedApprovedArtifact(app);
      cleanupOrphanCapsuleIndexesMock.mockResolvedValue({
        removedKeywords: 2,
        removedEmbeddings: 1,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/capsule-index/cleanup-orphans',
        headers: auth,
      });

      expect(response.statusCode).toBe(200);
      expect(cleanupOrphanCapsuleIndexesMock).toHaveBeenCalledTimes(1);
      expect(response.json().removed).toEqual({
        removedKeywords: 2,
        removedEmbeddings: 1,
      });
    });
  });
});
