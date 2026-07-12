import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import type { ServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { attachRuntimeMetricsRoute } from '@trapmap/host-distributed/shared/observability.js';
import { createServicePorts } from '@trapmap/host-distributed/shared/ports.js';
import {
  type GovernanceReviewServer,
  createGovernanceReviewServer as createServiceGovernanceReviewServer,
} from '@trapmap/service-governance-review';
import { attachRuntimeTelemetry } from '../shared/telemetry.js';
import { createGovernanceReviewDeps } from './ports.js';

export async function createServer(
  config: ServiceConfig,
  db: ServiceDatabase,
): Promise<GovernanceReviewServer> {
  const ports = createServicePorts(db.pool, config.serviceName);
  const deps = createGovernanceReviewDeps(ports, config);
  const server = await createServiceGovernanceReviewServer(config, deps, {
    checkDependency: async () => {
      const health = await db.healthCheck();
      if (health.status !== 'healthy') {
        return { reachable: false, detail: health.error ?? 'database unhealthy' };
      }
      try {
        const response = await fetch(`${config.internalUrls.knowledgeWrite}/internal/ready`, {
          signal: AbortSignal.timeout(config.connectionTimeoutMs),
        });
        return {
          reachable: response.ok,
          ...(response.ok
            ? {}
            : { detail: `knowledge-write readiness returned ${response.status}` }),
        };
      } catch (error) {
        return { reachable: false, detail: error instanceof Error ? error.message : String(error) };
      }
    },
    getOperatorStatus: async () => {
      const [persistence, queue, outbox] = await Promise.all([
        db.healthCheck(),
        ports.queuePorts.task.getStatusSnapshot(),
        ports.queuePorts.outbox.getStatusSnapshot(),
      ]);
      return {
        persistence,
        delegatedOwner: { service: 'knowledge-write' },
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
  await attachRuntimeTelemetry(server.app, 'governance-review');
  return server;
}
