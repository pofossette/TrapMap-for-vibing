import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import type { ServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { attachRuntimeMetricsRoute } from '@trapmap/host-distributed/shared/observability.js';
import {
  createGovernanceReviewPgOwnerBundle,
  createGovernanceReviewServer as createServiceGovernanceReviewServer,
  type GovernanceReviewServer,
} from '@trapmap/service-governance-review';
import { createIdentityAccessPgDeps } from '@trapmap/service-identity-access';
import { attachRuntimeTelemetry } from '../shared/telemetry.js';
import { createGovernanceReviewDeps } from './ports.js';

export async function createServer(
  config: ServiceConfig,
  db: ServiceDatabase,
): Promise<GovernanceReviewServer> {
  const owner = createGovernanceReviewPgOwnerBundle(db.pool);
  const identity = createIdentityAccessPgDeps(db.pool, { systemAdminKey: config.systemAdminKey });
  const deps = createGovernanceReviewDeps(owner, config, identity);
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
        Promise.resolve({ provider: 'job-runtime', pending: null, running: null, dead: null }),
        Promise.resolve({ provider: 'job-runtime', pending: null, processing: null, failed: null }),
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
