import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import { createInternalServiceClients } from '@trapmap/host-distributed/gateway/internal-client.js';
import type { ServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { attachRuntimeMetricsRoute } from '@trapmap/host-distributed/shared/observability.js';
import { createServicePorts } from '@trapmap/host-distributed/shared/ports.js';
import {
  type JobRuntimeServer,
  createJobRuntimeAsyncTransport,
  createJobRuntimeDeps,
  createJobRuntimeServer,
} from '@trapmap/service-job-runtime';
import { createIdentityAccessPgDeps } from '@trapmap/service-identity-access';
import { attachRuntimeTelemetry } from '../shared/telemetry.js';
import { createJobRuntimeTaskHandlers } from './handlers.js';

export async function createServer(
  config: ServiceConfig,
  db: ServiceDatabase,
): Promise<JobRuntimeServer> {
  const identity = createIdentityAccessPgDeps(db.pool, { systemAdminKey: config.systemAdminKey });
  const ports = createServicePorts(db.pool, config.serviceName, identity);
  const queuePorts = createJobRuntimeAsyncTransport({
    config: {
      asyncTaskTransport: {
        provider: 'postgres',
        rabbitmq: null,
      },
    },
    pool: db.pool,
  });
  const internalClients = createInternalServiceClients(config.internalUrls);
  const deps = createJobRuntimeDeps({
    queuePorts,
    auditLog: ports.auditLog,
    taskHandlers: createJobRuntimeTaskHandlers(internalClients),
    outboxHandlers: [
      {
        eventName: 'knowledge.approved',
        async handle(payload) {
          const event = payload as {
            entryId?: unknown;
            metadata?: { sourceEventId?: unknown };
          };
          if (typeof event.entryId !== 'string') {
            throw new Error('knowledge.approved outbox event is missing entryId');
          }
          const sourceEventId =
            typeof event.metadata?.sourceEventId === 'string'
              ? event.metadata.sourceEventId
              : undefined;
          await queuePorts.task.enqueue(
            'governance.conflict-detection',
            { entryId: event.entryId, ...(sourceEventId ? { sourceEventId } : {}) },
            {
              dedupeKey: `governance.conflict-detection:${event.entryId}:${sourceEventId ?? 'outbox'}`,
            },
          );
        },
      },
    ],
    ownsWork: true,
  });
  const server = await createJobRuntimeServer(config, deps);
  attachRuntimeMetricsRoute(server.app);
  await attachRuntimeTelemetry(server.app, 'job-runtime');
  return server;
}
