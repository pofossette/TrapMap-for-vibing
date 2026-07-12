import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import type { ServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { attachRuntimeMetricsRoute } from '@trapmap/host-distributed/shared/observability.js';
import { createServicePorts } from '@trapmap/host-distributed/shared/ports.js';
import {
  type JobRuntimeServer,
  createJobRuntimeDeps,
  createJobRuntimeServer,
} from '@trapmap/service-job-runtime';
import { attachRuntimeTelemetry } from '../shared/telemetry.js';

export async function createServer(
  config: ServiceConfig,
  db: ServiceDatabase,
): Promise<JobRuntimeServer> {
  const ports = createServicePorts(db.pool, config.serviceName);
  if (!ports.jobRuntime) {
    throw new Error('job-runtime capability unavailable for job-runtime service');
  }
  const deps = createJobRuntimeDeps({
    queuePorts: ports.jobRuntime,
    auditLog: ports.auditLog,
  });
  const server = await createJobRuntimeServer(config, deps);
  attachRuntimeMetricsRoute(server.app);
  await attachRuntimeTelemetry(server.app, 'job-runtime');
  return server;
}
