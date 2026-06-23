import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import type { ServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { createServicePorts } from '@trapmap/host-distributed/shared/ports.js';
import {
  createIdentityAccessDeps,
  createIdentityAccessServer as createServiceIdentityAccessServer,
  type IdentityAccessServer,
} from '@trapmap/service-identity-access';

export async function createServer(
  config: ServiceConfig,
  db: ServiceDatabase,
): Promise<IdentityAccessServer> {
  const ports = createServicePorts(db.pool);
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
  return createServiceIdentityAccessServer(config, deps);
}
