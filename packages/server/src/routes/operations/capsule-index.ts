import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

import { AppError } from '@trapmap/server/lib/errors.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import {
  cleanupOrphanCapsuleIndexes,
  rebuildAllCapsuleIndexes,
  rebuildCapsuleIndexForArtifact,
  verifyCapsuleIndexHealth,
} from '@trapmap/server/lib/retrieval/capsules/repositories/index-rebuild.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';

const capsuleIndexRebuildRequestSchema = z
  .object({
    mode: z.enum(['full', 'artifact']),
    artifactId: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === 'artifact' && !value.artifactId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['artifactId'],
        message: 'artifactId is required when mode=artifact',
      });
    }

    if (value.mode === 'full' && value.artifactId !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['artifactId'],
        message: 'artifactId is only allowed when mode=artifact',
      });
    }
  });

type PoolBackedStore = {
  getPool(): Pool;
};

function requireSystemAdmin(subjectType: 'user' | 'system-admin'): void {
  if (subjectType !== 'system-admin') {
    throw new AppError(403, 'forbidden', 'Capsule index operations require system-admin access');
  }
}

function getCapsuleIndexPool(app: FastifyInstance): Pool {
  const store = app.skillShareer.store as Partial<PoolBackedStore>;
  if (typeof store.getPool !== 'function') {
    throw new AppError(
      409,
      'capsule_pg_unavailable',
      'Capsule index operations require a PostgreSQL-backed store',
    );
  }

  return store.getPool();
}

function summarizeSyncResult(result: {
  keyword: Array<{ status: 'synced' | 'failed' }>;
  embedding: Array<{ status: 'synced' | 'failed' }>;
}) {
  const keywordSynced = result.keyword.filter((entry) => entry.status === 'synced').length;
  const keywordFailed = result.keyword.filter((entry) => entry.status === 'failed').length;
  const embeddingSynced = result.embedding.filter((entry) => entry.status === 'synced').length;
  const embeddingFailed = result.embedding.filter((entry) => entry.status === 'failed').length;

  return {
    keywordSynced,
    keywordFailed,
    embeddingSynced,
    embeddingFailed,
    capsulesSynced: Math.max(result.keyword.length, result.embedding.length),
  };
}

export const capsuleIndexRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/operations/capsule-index/rebuild', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');
    requireSystemAdmin(auth.subjectType);

    const pool = getCapsuleIndexPool(app);
    const body = capsuleIndexRebuildRequestSchema.parse(
      (request.body as Record<string, unknown> | undefined) ?? {},
    );

    if (body.mode === 'full') {
      const artifacts = await app.skillShareer.repos.artifact.listForRetrieval({
        lifecycleState: 'approved',
      });
      const stats = await rebuildAllCapsuleIndexes({ pool, artifacts });

      return {
        mode: 'full' as const,
        sourceArtifactCount: artifacts.length,
        stats,
        rebuiltAt: nowIso(),
      };
    }

    const artifactId = body.artifactId;
    if (!artifactId) {
      throw new AppError(400, 'invalid_request', 'artifactId is required when mode=artifact');
    }

    const artifact = await app.skillShareer.repos.artifact.getById(artifactId);
    if (!artifact) {
      throw new AppError(404, 'artifact_not_found', `Artifact ${artifactId} not found`);
    }

    if (artifact.lifecycleState !== 'approved') {
      throw new AppError(
        409,
        'artifact_not_indexed',
        `Artifact ${artifactId} is not approved and has no capsule PG index to rebuild`,
      );
    }

    const result = await rebuildCapsuleIndexForArtifact(
      { pool, artifacts: [artifact] },
      artifact.id,
    );

    if (!result) {
      throw new AppError(
        500,
        'capsule_index_rebuild_failed',
        `Capsule index rebuild failed for artifact ${artifact.id}`,
      );
    }

    return {
      mode: 'artifact' as const,
      artifactId: artifact.id,
      result: summarizeSyncResult(result),
      rebuiltAt: nowIso(),
    };
  });

  app.get('/v1/operations/capsule-index/health', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');
    requireSystemAdmin(auth.subjectType);

    const pool = getCapsuleIndexPool(app);
    const artifacts = await app.skillShareer.repos.artifact.listForRetrieval({
      lifecycleState: 'approved',
    });
    const report = await verifyCapsuleIndexHealth({ pool, artifacts });

    return {
      sourceArtifactCount: artifacts.length,
      report,
      reportedAt: nowIso(),
    };
  });

  app.post('/v1/operations/capsule-index/cleanup-orphans', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');
    requireSystemAdmin(auth.subjectType);

    const pool = getCapsuleIndexPool(app);
    const artifacts = await app.skillShareer.repos.artifact.listForRetrieval({
      lifecycleState: 'approved',
    });
    const removed = await cleanupOrphanCapsuleIndexes({ pool, artifacts });

    return {
      sourceArtifactCount: artifacts.length,
      removed,
      cleanedAt: nowIso(),
    };
  });
};
