import type {
  AuditLogPort,
  PermissionCheckPort,
  QueuePorts,
  RetrievalQueryPort,
  SessionLookupPort,
  TeamLookupPort,
} from '@trapmap/backend-core';
import {
  createKnowledgeReadRetrievalQuery,
  type KnowledgeReadRetrievalQueryOptions,
} from '@trapmap/service-knowledge-read';
import { createIdentityAccessPgDeps } from '@trapmap/service-identity-access';
import type { IdentityAccessPortDeps } from '@trapmap/service-identity-access';
import { getStorePool } from '@trapmap/runtime-infra';

import { loadHostLocalConfig } from '../config/index.js';
import { createQueuePorts } from './backend-core-adapters.js';
import { createHostLocalServices, type HostLocalServices } from './host-services.js';
import { resolveEffectivePermissions } from './permissions.js';

export const HOST_LOCAL_RUNTIME_TOKEN = 'HOST_LOCAL_RUNTIME';

export interface HostLocalRuntime {
  services: HostLocalServices;
  identity: IdentityAccessPortDeps;
  retrievalQuery: RetrievalQueryPort;
  sessionLookup: SessionLookupPort;
  teamLookup: TeamLookupPort;
  permissionCheck: PermissionCheckPort;
  auditLog: AuditLogPort;
  queuePorts: QueuePorts;
}

type HostLocalKnowledgeReadServices = KnowledgeReadRetrievalQueryOptions['services'];

function createRetrievalQuery(services: HostLocalServices): RetrievalQueryPort {
  const retrievalServices = services as unknown as HostLocalKnowledgeReadServices;

  return createKnowledgeReadRetrievalQuery({
    services: retrievalServices,
    resolveAuthContext(params) {
      return {
        subjectType: 'system-admin',
        actorId: 'nest-light-runtime',
        handle: 'nest-light-runtime',
        activeTeamId: params.teamId ?? null,
        securityLevel: Number.MAX_SAFE_INTEGER,
        effectivePermissions: resolveEffectivePermissions('system-admin', []),
        user: null,
        membership: null,
        team: null,
      };
    },
    mode: 'hybrid',
  });
}

export async function createHostLocalRuntime(): Promise<HostLocalRuntime> {
  const config = loadHostLocalConfig();
  const services = await createHostLocalServices(config);
  const pool = getStorePool(services.store);
  if (!pool) {
    throw new Error('host-local identity runtime requires PostgreSQL');
  }
  const identity = createIdentityAccessPgDeps(pool, { systemAdminKey: config.systemAdminKey });
  const runtime: HostLocalRuntime = {
    services,
    identity,
    retrievalQuery: createRetrievalQuery(services),
    sessionLookup: identity.sessionLookup,
    teamLookup: identity.teamLookup,
    permissionCheck: identity.permissionCheck,
    auditLog: identity.auditLog,
    queuePorts: createQueuePorts(services.asyncTransport),
  };

  return runtime;
}
