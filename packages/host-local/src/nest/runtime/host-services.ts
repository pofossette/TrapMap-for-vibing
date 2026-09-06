import type { ResolvedRuntimeDeployment } from '@trapmap/backend-core';
import type {
  ArtifactReadProjection,
  CandidateCorpusReadPort,
  ExperienceGeneDerivationTaskPayload,
  GraphIndexRepositoryPort,
  KnowledgeOwnerPort,
} from '@trapmap/contracts';
import { embedWithFallback } from '@trapmap/infra';
import {
  type CandidateIngestionPgOwnerBundle,
  createCandidateIngestionPgOwnerBundle,
} from '@trapmap/service-candidate-ingestion';
import {
  type CronOwnerBundle,
  type CronScheduler,
  createCronOwnerBundle,
  createCronScheduler,
} from '@trapmap/service-cron';
import {
  createGovernanceReviewPgOwnerBundle,
  type GovernanceReviewPgOwnerBundle,
} from '@trapmap/service-governance-review';
import {
  createIdentityAccessPgDeps,
  type IdentityAccessPortDeps,
} from '@trapmap/service-identity-access';
import { createJobRuntimeAsyncTransport } from '@trapmap/service-job-runtime';
import {
  createCandidateCorpusPgReadPort,
  createKnowledgeReadGraphIndexRepository,
  createOwnerReadModelProjection,
  createPgExperienceGeneSearchPort,
  type OwnerReadModelProjection,
  type OwnerReadModelProjectionOptions,
} from '@trapmap/service-knowledge-read';
import {
  type ArtifactWritePort,
  createExperienceGeneDerivationOperation,
  createExperienceGeneDerivationPlanner,
  createExperienceGeneStaleOperation,
  createKnowledgeWriteOwnerBundle,
  type KnowledgeWriteOwnerBundle,
} from '@trapmap/service-knowledge-write';
import type { HostLocalConfig } from '../config/index.js';
import { createPrometheusExperienceGeneMetrics } from '../observability/experience-gene-metrics.js';
import {
  createHostLocalChannelRegistry,
  createHostLocalStrategyRegistry,
  type HostLocalChannelRegistry,
  type HostLocalStrategyRegistry,
} from './retrieval-assembly.js';
import { resolveHostLocalDeployment } from './runtime-deployment.js';
import {
  createHostLocalSharedInfra,
  type HostLocalAiProviders,
  type HostLocalAsyncTransport,
  type HostLocalGraphQueryBackend,
  type HostLocalGraphQueryRuntimeState,
  type HostLocalStore,
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
  experienceGeneDerive: ReturnType<typeof createExperienceGeneDerivationOperation>;
  experienceGeneMarkStale: ReturnType<typeof createExperienceGeneStaleOperation>;
  experienceGenePlan: (event: unknown) => Promise<ExperienceGeneDerivationTaskPayload[]>;
  experienceGeneSearch: ReturnType<typeof createPgExperienceGeneSearchPort>;
  governanceReview: GovernanceReviewPgOwnerBundle;
  cronOwnerBundle: CronOwnerBundle;
  cronScheduler: CronScheduler;
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
  const experienceGeneMetrics = createPrometheusExperienceGeneMetrics();
  const experienceGeneDerive = createExperienceGeneDerivationOperation(pool, {
    metrics: experienceGeneMetrics,
    mode: config.experienceGeneMode,
  });
  const experienceGeneMarkStale = createExperienceGeneStaleOperation(pool, {
    metrics: experienceGeneMetrics,
    mode: config.experienceGeneMode,
  });
  const experienceGenePlan = createExperienceGeneDerivationPlanner(pool).planFromLifecycle;
  const experienceGeneSearch = createPgExperienceGeneSearchPort({
    pool,
    embed: embedWithFallback,
    metrics: experienceGeneMetrics,
    mode: config.experienceGenesMode,
  });
  const governanceReview = createGovernanceReviewPgOwnerBundle(pool);
  const ownerReadModel = createOwnerReadModelProjection({
    knowledge: knowledgeWrite.knowledgeOwner,
    artifact: knowledgeWrite.artifactReadProjection,
    governance:
      governanceReview.retrievalProjection as unknown as OwnerReadModelProjectionOptions['governance'], // lib type gap: the
    // governance owner bundle returns the backend-core minimal FeedbackQueueRecord
    // shape while the owner read model expects knowledge-read's richer store record —
    // same feedback rows at runtime
  });
  const asyncTransport = createJobRuntimeAsyncTransport({
    config: { asyncTaskTransport: config.asyncTaskTransport },
    pool,
  });
  const cronOwnerBundle = createCronOwnerBundle(pool);
  const cronScheduler = createCronScheduler({
    bundle: cronOwnerBundle,
    transport: { task: asyncTransport.task },
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
    experienceGeneDerive,
    experienceGeneMarkStale,
    experienceGenePlan,
    experienceGeneSearch,
    governanceReview,
    cronOwnerBundle,
    cronScheduler,
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
