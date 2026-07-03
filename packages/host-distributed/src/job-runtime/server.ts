import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import type { ServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { attachRuntimeMetricsRoute } from '@trapmap/host-distributed/shared/observability.js';
import { createServicePorts } from '@trapmap/host-distributed/shared/ports.js';
import { attachRuntimeTelemetry } from '../shared/telemetry.js';
import {
  type JobRuntimeServer,
  createJobRuntimeDeps,
  createJobRuntimeServer,
} from '@trapmap/service-job-runtime';

export async function createServer(
  config: ServiceConfig,
  db: ServiceDatabase,
): Promise<JobRuntimeServer> {
  const ports = createServicePorts(db.pool);
  const deps = createJobRuntimeDeps(ports);
  const server = await createJobRuntimeServer(config, deps);
  attachRuntimeMetricsRoute(server.app);
  await attachRuntimeTelemetry(server.app, 'job-runtime');
  return server;
}
