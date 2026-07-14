/**
 * Host adapter for the knowledge-write service.
 *
 * The service package owns the authoritative write assembly; this host
 * only supplies process config and concrete infrastructure dependencies.
 */

import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import type { ServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { attachRuntimeMetricsRoute } from '@trapmap/host-distributed/shared/observability.js';
import {
  type KnowledgeWriteServer,
  createKnowledgeWriteOutboxDiagnostics,
  createKnowledgeWriteOwnerBundle,
  createKnowledgeWriteServer as createServiceKnowledgeWriteServer,
} from '@trapmap/service-knowledge-write';
import { createIdentityAccessPgDeps } from '@trapmap/service-identity-access';
import { attachRuntimeTelemetry } from '../shared/telemetry.js';

export async function createServer(
  config: ServiceConfig,
  db: ServiceDatabase,
): Promise<KnowledgeWriteServer> {
  const identity = createIdentityAccessPgDeps(db.pool, { systemAdminKey: config.systemAdminKey });
  const owner = createKnowledgeWriteOwnerBundle(db.pool);
  const outbox = createKnowledgeWriteOutboxDiagnostics(db.pool);
  const deps = createKnowledgeWriteDeps({
    knowledgeRepo: owner.knowledgeRepo,
    auditLog: identity.auditLog,
  });
  const server = await createServiceKnowledgeWriteServer(config, deps, {
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
  });
  attachRuntimeMetricsRoute(server.app);
  await attachRuntimeTelemetry(server.app, 'knowledge-write');
  return server;
}
