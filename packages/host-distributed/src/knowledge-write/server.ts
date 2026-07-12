/**
 * Host adapter for the knowledge-write service.
 *
 * The service package owns the authoritative write assembly; this host
 * only supplies process config and concrete infrastructure dependencies.
 */

import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import type { ServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { attachRuntimeMetricsRoute } from '@trapmap/host-distributed/shared/observability.js';
import { createServicePorts } from '@trapmap/host-distributed/shared/ports.js';
import {
  type KnowledgeWriteServer,
  createKnowledgeWriteServer as createServiceKnowledgeWriteServer,
} from '@trapmap/service-knowledge-write';
import { attachRuntimeTelemetry } from '../shared/telemetry.js';
import { createKnowledgeWriteDeps } from './ports.js';

export async function createServer(
  config: ServiceConfig,
  db: ServiceDatabase,
): Promise<KnowledgeWriteServer> {
  const ports = createServicePorts(db.pool, config.serviceName);
  const deps = createKnowledgeWriteDeps(ports);
  const server = await createServiceKnowledgeWriteServer(config, deps, {
    checkDependency: async () => {
      const health = await db.healthCheck();
      return { reachable: health.status === 'healthy', detail: health.error };
    },
    getOperatorStatus: async () => {
      const [persistence, queue, outbox] = await Promise.all([
        db.healthCheck(),
        ports.asyncDiagnostics.task.getStatusSnapshot(),
        ports.asyncDiagnostics.outbox.getStatusSnapshot(),
      ]);
      return {
        persistence,
        asyncFollowUp: { owner: 'job-runtime', queue, outbox },
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
