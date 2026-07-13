import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import type { ServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { attachRuntimeMetricsRoute } from '@trapmap/host-distributed/shared/observability.js';
import {
  type IdentityAccessServer,
  createIdentityAccessPgDeps,
  createIdentityAccessServer as createServiceIdentityAccessServer,
} from '@trapmap/service-identity-access';
import { attachRuntimeTelemetry } from '../shared/telemetry.js';

export async function createServer(
  config: ServiceConfig,
  db: ServiceDatabase,
): Promise<IdentityAccessServer> {
  const deps = createIdentityAccessPgDeps(db.pool, {
    systemAdminKey: config.systemAdminKey,
  });
  const server = await createServiceIdentityAccessServer(config, deps);
  attachRuntimeMetricsRoute(server.app);
  await attachRuntimeTelemetry(server.app, 'identity-access');
  return server;
}
