import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import type { ServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { attachRuntimeMetricsRoute } from '@trapmap/host-distributed/shared/observability.js';
import { createServicePorts } from '@trapmap/host-distributed/shared/ports.js';
import {
  type IdentityAccessServer,
  createIdentityAccessDeps,
  createIdentityAccessServer as createServiceIdentityAccessServer,
} from '@trapmap/service-identity-access';
import { attachRuntimeTelemetry } from '../shared/telemetry.js';

export async function createServer(
  config: ServiceConfig,
  db: ServiceDatabase,
): Promise<IdentityAccessServer> {
  const ports = createServicePorts(db.pool, config.serviceName);
  const deps = createIdentityAccessDeps({
    sessionRepo: ports.repos.session,
    accessKeyRepo: ports.repos.accessKey,
    teamRepo: ports.repos.team,
    membershipRepo: ports.repos.membership,
    userRepo: ports.repos.user,
    sessionLookup: ports.sessionLookup,
    teamLookup: ports.teamLookup,
    permissionCheck: ports.permissionCheck,
    auditLog: ports.auditLog,
  });
  const server = await createServiceIdentityAccessServer(config, deps);
  attachRuntimeMetricsRoute(server.app);
  await attachRuntimeTelemetry(server.app, 'identity-access');
  return server;
}
