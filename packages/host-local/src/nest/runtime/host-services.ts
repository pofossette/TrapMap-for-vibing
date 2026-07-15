import type { ResolvedRuntimeDeployment } from '@trapmap/backend-core';
import type { ArtifactReadProjection, KnowledgeOwnerPort } from '@trapmap/contracts';
import { createIdentityAccessPgDeps, type IdentityAccessPortDeps } from '@trapmap/service-identity-access';
import {
  createKnowledgeWriteOwnerBundle,
  type ArtifactWritePort,
  type KnowledgeWriteOwnerBundle,
} from '@trapmap/service-knowledge-write';
import { getStorePool } from '@trapmap/runtime-infra';

import type { HostLocalConfig } from '../config/index.js';
import {
  createHostLocalChannelRegistry,
  createHostLocalStrategyRegistry,
  type HostLocalChannelRegistry,
  type HostLocalStrategyRegistry,
} from './retrieval-assembly.js';
import { resolveHostLocalDeployment } from './runtime-deployment.js';
import {
  createHostLocalSharedInfra,
  type HostLocalAdapterRegistry,
  type HostLocalAiProviders,
  type HostLocalAsyncTransport,
  type HostLocalEventBus,
  type HostLocalGraphQueryBackend,
  type HostLocalGraphQueryRuntimeState,
  type HostLocalRepos,
  type HostLocalStore,
} from './shared-infra.js';

export interface HostLocalServices {
  config: HostLocalConfig;
  runtimeDeployment: ResolvedRuntimeDeployment;
  runtimeMode: ResolvedRuntimeDeployment['runtimeMode'];
  serviceUnit: ResolvedRuntimeDeployment['serviceUnit'];
  store: HostLocalStore;
  asyncTransport?: HostLocalAsyncTransport;
  adapterRegistry: HostLocalAdapterRegistry;
  channelRegistry: HostLocalChannelRegistry;
  strategyRegistry: HostLocalStrategyRegistry;
  ai: HostLocalAiProviders;
  identity: IdentityAccessPortDeps;
  knowledgeWrite: KnowledgeWriteOwnerBundle;
  knowledgeOwner: KnowledgeOwnerPort;
  knowledgeRepo: HostLocalRepos['knowledge'];
  artifactWriter: ArtifactWritePort;
  artifactReadProjection: ArtifactReadProjection;
  usageAnalyticsRepo: HostLocalRepos['usageAnalytics'];
  repos: HostLocalRepos;
  graphQueryBackend: HostLocalGraphQueryBackend;
  graphQuery: HostLocalGraphQueryRuntimeState;
  eventBus: HostLocalEventBus;
}

export async function createHostLocalServices(
  config: HostLocalConfig,
): Promise<HostLocalServices> {
  const runtimeDeployment = resolveHostLocalDeployment(config);
  const infra = await createHostLocalSharedInfra(config);
  const pool = getStorePool(infra.store);
  if (!pool) {
    throw new Error('host-local identity runtime requires PostgreSQL');
  }
  const identity = createIdentityAccessPgDeps(pool, { systemAdminKey: config.systemAdminKey });
  const knowledgeWrite = createKnowledgeWriteOwnerBundle(pool);

  const services: HostLocalServices = {
    config,
    runtimeDeployment,
    runtimeMode: runtimeDeployment.runtimeMode,
    serviceUnit: runtimeDeployment.serviceUnit,
    store: infra.store,
    ...(infra.asyncTransport ? { asyncTransport: infra.asyncTransport } : {}),
    adapterRegistry: infra.adapterRegistry,
    channelRegistry: createHostLocalChannelRegistry(),
    strategyRegistry: createHostLocalStrategyRegistry(),
    ai: infra.ai,
    identity,
    knowledgeWrite,
    knowledgeOwner: knowledgeWrite.knowledgeOwner,
    knowledgeRepo: infra.repos.knowledge,
    artifactWriter: knowledgeWrite.artifactWriter,
    artifactReadProjection: knowledgeWrite.artifactReadProjection,
    usageAnalyticsRepo: infra.repos.usageAnalytics,
    repos: infra.repos,
    graphQueryBackend: infra.graphQueryBackend,
    graphQuery: infra.graphQuery,
    eventBus: infra.eventBus,
  };
  return services;
}
