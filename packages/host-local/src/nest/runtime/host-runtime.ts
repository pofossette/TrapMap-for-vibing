import type {
  AuditLogPort,
  PermissionCheckPort,
  QueuePorts,
  RetrievalQueryPort,
  SessionLookupPort,
  TeamLookupPort,
} from '@trapmap/backend-core';
import {
  type CandidateProcessingRuntime,
  createCandidateProcessingRuntime,
} from '@trapmap/service-candidate-ingestion';
import type { IdentityAccessPortDeps } from '@trapmap/service-identity-access';
import {
  createKnowledgeReadOwnerRetrievalServices,
  createKnowledgeReadRetrievalQuery,
  createRuleChannelMerge,
  createRuleIntentRecognition,
} from '@trapmap/service-knowledge-read';

import { loadHostLocalConfig } from '../config/index.js';
import { createQueuePorts } from './backend-core-adapters.js';
import { type HostLocalServices, createHostLocalServices } from './host-services.js';
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

type GovernanceRetrievalSeam = Parameters<
  typeof createKnowledgeReadOwnerRetrievalServices
>[0]['governance'];

function createRetrievalQuery(services: HostLocalServices): RetrievalQueryPort {
  // lib type gap: the governance owner bundle returns the backend-core minimal
  // FeedbackQueueRecord shape while the retrieval seam expects knowledge-read's
  // richer store record — same feedback rows at runtime
  const governanceProjection = services.governanceReview
    .retrievalProjection as unknown as GovernanceRetrievalSeam; // lib type gap:
  const retrievalServices = createKnowledgeReadOwnerRetrievalServices({
    config: services.config,
    knowledge: services.knowledgeOwner,
    artifact: services.artifactReadProjection,
    governance: governanceProjection,
    strategyRegistry: services.strategyRegistry,
    channelRegistry: services.channelRegistry,
    ai: services.ai,
    store: services.store,
    graphQuery: services.graphQuery,
    graphQueryBackend: services.graphQueryBackend,
    // D8 intent-recognition call-site migration: the retrieval seam consumes
    // the judgment port (rule default = pre-contract routing semantics); an
    // llm/hybrid variant can replace it here without touching the pipeline.
    intentRecognition: createRuleIntentRecognition(),
    // D8 channel-merge call-site migration: the retrieval seam consumes the
    // judgment port (rule default = mergeCandidatesWithGraph); a replacement
    // strategy can be wired here without touching the pipeline.
    channelMerge: createRuleChannelMerge(),
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

/**
 * Build a {@link HostLocalRuntime} from an already-composed
 * {@link HostLocalServices} bundle.
 *
 * Phase 2 (assembly pilot): split out of {@link createHostLocalRuntime} so
 * the assembly can build a single services bundle (owned by a
 * host-services node) and derive the runtime from it, avoiding a duplicate
 * store/pool owner. The legacy composition helper below is preserved for
 * direct (non-assembly) use and golden tests.
 */
function createHostLocalRuntimeFromServices(services: HostLocalServices): HostLocalRuntime {
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

export async function createHostLocalRuntime(): Promise<HostLocalRuntime> {
  const config = loadHostLocalConfig();
  const services = await createHostLocalServices(config);
  return createHostLocalRuntimeFromServices(services);
}
