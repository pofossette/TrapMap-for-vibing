/**
 * Host adapter for the knowledge-write service.
 *
 * The service package owns the authoritative write assembly; this host
 * only supplies process config and concrete infrastructure dependencies.
 */

import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import type { ServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { attachRuntimeMetricsRoute } from '@trapmap/host-distributed/shared/observability.js';
import { createIdentityAccessPgDeps } from '@trapmap/service-identity-access';
import {
  type KnowledgeWriteOwnerBundle,
  type KnowledgeWriteReadinessOptions,
  type KnowledgeWriteServer,
  createExperienceGeneDerivationOperation,
  createExperienceGeneStaleOperation,
  createKnowledgeWriteDeps,
  createKnowledgeWriteOutboxDiagnostics,
  createKnowledgeWriteOwnerBundle,
  createKnowledgeWriteServer as createServiceKnowledgeWriteServer,
} from '@trapmap/service-knowledge-write';
import { createExperienceGeneDerivationPlanner } from '@trapmap/service-knowledge-write';
import { createExperienceGeneOtelMetrics } from '../gateway/internal-observability.js';
import { attachRuntimeTelemetry } from '../shared/telemetry.js';

export function createKnowledgeWriteReadinessOptions(
  owner: Pick<KnowledgeWriteOwnerBundle, 'knowledgeOwner'>,
  options: Omit<KnowledgeWriteReadinessOptions, 'conflictCandidateRead'>,
): KnowledgeWriteReadinessOptions {
  return {
    ...options,
    conflictCandidateRead: owner.knowledgeOwner,
  };
}

export async function createServer(
  config: ServiceConfig,
  db: ServiceDatabase,
): Promise<KnowledgeWriteServer> {
  const identity = createIdentityAccessPgDeps(db.pool, { systemAdminKey: config.systemAdminKey });
  const owner = createKnowledgeWriteOwnerBundle(db.pool);
  const outbox = createKnowledgeWriteOutboxDiagnostics(db.pool);
  const experienceGeneMetrics = createExperienceGeneOtelMetrics();
  const deps = createKnowledgeWriteDeps({
    knowledgeOwner: owner.knowledgeOwner,
    auditLog: identity.auditLog,
    artifactWriter: owner.artifactWriter,
    artifactReadProjection: owner.artifactReadProjection,
    artifactBundleImporter: owner.artifactBundleImporter,
  });
  const server = await createServiceKnowledgeWriteServer(
    config,
    deps,
    createKnowledgeWriteReadinessOptions(owner, {
      planExperienceGeneDerivations: createExperienceGeneDerivationPlanner(db.pool)
        .planFromLifecycle,
      experienceGeneDerive: createExperienceGeneDerivationOperation(db.pool, {
        metrics: experienceGeneMetrics,
        mode: config.experienceGeneMode,
      }),
      markExperienceGenesStale: createExperienceGeneStaleOperation(db.pool, {
        metrics: experienceGeneMetrics,
        mode: config.experienceGeneMode,
      }),
      checkDependency: async () => {
        const health = await db.healthCheck();
        return {
          reachable: health.status === 'healthy',
          ...(health.error ? { detail: health.error } : {}),
        };
      },
      getOperatorStatus: async () => {
        const [persistence, outboxStatus] = await Promise.all([
          db.healthCheck(),
          outbox.getStatusSnapshot(),
        ]);
        return {
          persistence,
          asyncFollowUp: { owner: 'job-runtime', outbox: outboxStatus },
          timeouts: {
            connectionMs: config.connectionTimeoutMs,
            statementMs: config.statementTimeoutMs,
          },
          idempotency: { mechanism: 'task_queue.dedupe_key' },
        };
      },
    }),
  );
  attachRuntimeMetricsRoute(server.app);
  await attachRuntimeTelemetry(server.app, 'knowledge-write');
  return server;
}
