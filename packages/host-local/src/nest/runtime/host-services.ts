import type { ResolvedRuntimeDeployment } from '@trapmap/backend-core';
import type {
  ArtifactReadProjection,
  CandidateCorpusReadPort,
  GraphIndexRepositoryPort,
  KnowledgeOwnerPort,
} from '@trapmap/contracts';
import {
  type CandidateIngestionPgOwnerBundle,
  createCandidateIngestionPgOwnerBundle,
} from '@trapmap/service-candidate-ingestion';
import {
  type GovernanceReviewPgOwnerBundle,
  createGovernanceReviewPgOwnerBundle,
} from '@trapmap/service-governance-review';
import {
  type IdentityAccessPortDeps,
  createIdentityAccessPgDeps,
} from '@trapmap/service-identity-access';
import { createJobRuntimeAsyncTransport } from '@trapmap/service-job-runtime';
import {
  type OwnerReadModelProjection,
  type OwnerReadModelProjectionOptions,
  createCandidateCorpusPgReadPort,
  createKnowledgeReadGraphIndexRepository,
  createOwnerReadModelProjection,
} from '@trapmap/service-knowledge-read';
import {
  type ArtifactWritePort,
  type KnowledgeWriteOwnerBundle,
  createKnowledgeWriteOwnerBundle,
} from '@trapmap/service-knowledge-write';

import type { HostLocalConfig } from '../config/index.js';
import {
  type HostLocalChannelRegistry,
  type HostLocalStrategyRegistry,
  createHostLocalChannelRegistry,
  createHostLocalStrategyRegistry,
} from './retrieval-assembly.js';
import { resolveHostLocalDeployment } from './runtime-deployment.js';
import {
  type HostLocalAiProviders,
  type HostLocalAsyncTransport,
  type HostLocalGraphQueryBackend,
  type HostLocalGraphQueryRuntimeState,
  type HostLocalStore,
  createHostLocalSharedInfra,
} from './shared-infra.js';
import { getHostLocalStorePool } from './store-pool.js';

export interface HostLocalServices {
  config: HostLocalConfig;
  runtimeDeployment: ResolvedRuntimeDeployment;
  runtimeMode: ResolvedRuntimeDeployment['runtimeMode'];
  serviceUnit: ResolvedRuntimeDeployment['serviceUnit'];
  store: HostLocalStore;
  asyncTransport?: HostLocalAsyncTransport;
  channelRegistry: HostLocalChannelRegistry;
  strategyRegistry: HostLocalStrategyRegistry;
  ai: HostLocalAiProviders;
  identity: IdentityAccessPortDeps;
  candidateIngestion: CandidateIngestionPgOwnerBundle;
  candidateCorpus: CandidateCorpusReadPort;
  knowledgeWrite: KnowledgeWriteOwnerBundle;
  governanceReview: GovernanceReviewPgOwnerBundle;
  knowledgeOwner: KnowledgeOwnerPort;
  artifactWriter: ArtifactWritePort;
  artifactReadProjection: ArtifactReadProjection;
  ownerReadModel: OwnerReadModelProjection;
  graphIndex: GraphIndexRepositoryPort;
  graphQueryBackend: HostLocalGraphQueryBackend;
  graphQuery: HostLocalGraphQueryRuntimeState;
  close(): Promise<void>;
}

export async function createHostLocalServices(config: HostLocalConfig): Promise<HostLocalServices> {
  const runtimeDeployment = resolveHostLocalDeployment(config);
  const infra = await createHostLocalSharedInfra(config);
  const pool = getHostLocalStorePool(infra.store);
  if (!pool) {
    throw new Error('host-local identity runtime requires PostgreSQL');
  }
  const identity = createIdentityAccessPgDeps(pool, { systemAdminKey: config.systemAdminKey });
  const candidateIngestion = createCandidateIngestionPgOwnerBundle(pool);
  const candidateCorpus: CandidateCorpusReadPort = createCandidateCorpusPgReadPort(pool);
  const graphIndex = createKnowledgeReadGraphIndexRepository(pool);
  const knowledgeWrite = createKnowledgeWriteOwnerBundle(pool);
  const governanceReview = createGovernanceReviewPgOwnerBundle(pool);
  const ownerReadModel = createOwnerReadModelProjection({
    knowledge: knowledgeWrite.knowledgeOwner,
    artifact: knowledgeWrite.artifactReadProjection,
    governance:
      governanceReview.retrievalProjection as unknown as OwnerReadModelProjectionOptions['governance'],
  });
  const asyncTransport = createJobRuntimeAsyncTransport({
    config: { asyncTaskTransport: config.asyncTaskTransport },
    pool,
  });
  const services: HostLocalServices = {
    config,
    runtimeDeployment,
    runtimeMode: runtimeDeployment.runtimeMode,
    serviceUnit: runtimeDeployment.serviceUnit,
    store: infra.store,
    asyncTransport,
    channelRegistry: createHostLocalChannelRegistry(),
    strategyRegistry: createHostLocalStrategyRegistry(),
    ai: infra.ai,
    identity,
    candidateIngestion,
    candidateCorpus,
    knowledgeWrite,
    governanceReview,
    knowledgeOwner: knowledgeWrite.knowledgeOwner,
    artifactWriter: knowledgeWrite.artifactWriter,
    artifactReadProjection: knowledgeWrite.artifactReadProjection,
    ownerReadModel,
    graphIndex,
    graphQueryBackend: infra.graphQueryBackend,
    graphQuery: infra.graphQuery,
    close: () => infra.store.close(),
  };
  return services;
}
