import type { ResolvedRuntimeDeployment } from '@trapmap/backend-core';

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
  knowledgeRepo: HostLocalRepos['knowledge'];
  artifactRepo: HostLocalRepos['artifact'];
  sessionRepo: HostLocalRepos['session'];
  accessKeyRepo: HostLocalRepos['accessKey'];
  userRepo: HostLocalRepos['user'];
  teamRepo: HostLocalRepos['team'];
  membershipRepo: HostLocalRepos['membership'];
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
    knowledgeRepo: infra.repos.knowledge,
    artifactRepo: infra.repos.artifact,
    sessionRepo: infra.repos.session,
    accessKeyRepo: infra.repos.accessKey,
    userRepo: infra.repos.user,
    teamRepo: infra.repos.team,
    membershipRepo: infra.repos.membership,
    usageAnalyticsRepo: infra.repos.usageAnalytics,
    repos: infra.repos,
    graphQueryBackend: infra.graphQueryBackend,
    graphQuery: infra.graphQuery,
    eventBus: infra.eventBus,
  };
  return services;
}
