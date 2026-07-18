import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import { createInternalServiceClients } from '@trapmap/host-distributed/gateway/internal-client.js';
import type { ServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { attachRuntimeMetricsRoute } from '@trapmap/host-distributed/shared/observability.js';
import { createServicePorts } from '@trapmap/host-distributed/shared/ports.js';
import {
  type JobRuntimeServer,
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
  if (!ports.jobRuntime) {
    throw new Error('job-runtime capability unavailable for job-runtime service');
  }
  const internalClients = createInternalServiceClients(config.internalUrls);
  const deps = createJobRuntimeDeps({
    queuePorts: ports.jobRuntime,
    auditLog: ports.auditLog,
    taskHandlers: createJobRuntimeTaskHandlers(internalClients),
    ownsWork: true,
  });
  const server = await createJobRuntimeServer(config, deps);
  attachRuntimeMetricsRoute(server.app);
  await attachRuntimeTelemetry(server.app, 'job-runtime');
  return server;
}
