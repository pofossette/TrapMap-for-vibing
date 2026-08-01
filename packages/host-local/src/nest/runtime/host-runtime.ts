import type {
  AuditLogPort,
  PermissionCheckPort,
  QueuePorts,
  RetrievalQueryPort,
  SessionLookupPort,
  TeamLookupPort,
} from '@trapmap/backend-core';
import {
  createKnowledgeReadOwnerRetrievalServices,
  createKnowledgeReadRetrievalQuery,
} from '@trapmap/service-knowledge-read';
import {
  createCandidateProcessingRuntime,
  type CandidateProcessingRuntime,
} from '@trapmap/service-candidate-ingestion';
import type { IdentityAccessPortDeps } from '@trapmap/service-identity-access';

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
  processing: CandidateProcessingRuntime;
}

function createRetrievalQuery(services: HostLocalServices): RetrievalQueryPort {
  const retrievalServices = createKnowledgeReadOwnerRetrievalServices({
    config: services.config,
    knowledge: services.knowledgeOwner,
    artifact: services.artifactReadProjection,
    governance: services.governanceReview.retrievalProjection as unknown as Parameters<typeof createKnowledgeReadOwnerRetrievalServices>[0]['governance'],
    strategyRegistry: services.strategyRegistry,
    channelRegistry: services.channelRegistry,
    ai: services.ai,
    store: services.store,
    graphQuery: services.graphQuery,
    graphQueryBackend: services.graphQueryBackend,
  });

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
  const identity = services.identity;
  const queuePorts = createQueuePorts(services.asyncTransport);
  const runtime: HostLocalRuntime = {
    services,
    identity,
    retrievalQuery: createRetrievalQuery(services),
    sessionLookup: identity.sessionLookup,
    teamLookup: identity.teamLookup,
    permissionCheck: identity.permissionCheck,
    auditLog: identity.auditLog,
    queuePorts,
    processing: createCandidateProcessingRuntime({
      candidateRepo: services.candidateIngestion.candidateRepo,
      corpus: services.candidateCorpus,
      now: () => new Date().toISOString(),
      createId: crypto.randomUUID,
      queue: queuePorts.task,
    }),
  };

  return runtime;
}
