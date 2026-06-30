import { createAiProviders, type AiProviders } from '@trapmap/server/lib/ai/index.js';
import { setGlobalEmbeddingsProvider } from '@trapmap/server/lib/embeddings.js';
import type {
  GraphQueryBackend,
  GraphQueryRuntimeState,
} from '@trapmap/server/lib/graph-query/backend.js';
import { createMemoryGraphQueryBackend } from '@trapmap/server/lib/graph-query/memory-backend.js';
import {
  buildDefaultAdapterRegistry,
  type AdapterRegistry,
} from '@trapmap/server/lib/indexing/adapters/index.js';
import type { AsyncTransport } from './async-transport.js';
import { createAsyncTransport } from './async-factory.js';
import { LifecycleEventBus } from './event-bus.js';
import { PostgresStore } from './postgres-store.js';
import { createRuntimeInfraRepos, type SkillShareerRepos } from './repos.js';
import type { SkillShareerStore } from './store.js';
import { createSkillShareerStore } from './store-factory.js';

type AiProviderConfig = Parameters<typeof createAiProviders>[0];

export interface RuntimeInfraConfig {
  dataFile: string;
  databaseUrl: string | null;
  ai: AiProviderConfig;
  asyncTaskTransport: {
    provider: 'postgres' | 'rabbitmq';
    rabbitmq: {
      url: string;
      exchange: string;
      queue: string;
      prefetch: number;
    } | null;
  };
}

export interface RuntimeInfraShared {
  store: SkillShareerStore;
  asyncTransport?: AsyncTransport;
  adapterRegistry: AdapterRegistry;
  ai: AiProviders;
  repos: SkillShareerRepos;
  graphQueryBackend: GraphQueryBackend;
  graphQuery: GraphQueryRuntimeState;
  eventBus: LifecycleEventBus;
}

export type RuntimeInfraStore = RuntimeInfraShared['store'];
export type RuntimeInfraAsyncTransport = RuntimeInfraShared['asyncTransport'];
export type RuntimeInfraAdapterRegistry = RuntimeInfraShared['adapterRegistry'];
export type RuntimeInfraAiProviders = RuntimeInfraShared['ai'];
export type RuntimeInfraRepos = RuntimeInfraShared['repos'];
export type RuntimeInfraGraphQueryBackend = RuntimeInfraShared['graphQueryBackend'];
export type RuntimeInfraGraphQueryRuntimeState = RuntimeInfraShared['graphQuery'];
export type RuntimeInfraEventBus = RuntimeInfraShared['eventBus'];

export async function createRuntimeSharedInfra(
  config: RuntimeInfraConfig,
): Promise<RuntimeInfraShared> {
  const store = createSkillShareerStore({
    dataFile: config.dataFile,
    databaseUrl: config.databaseUrl,
  });
  const pool = store instanceof PostgresStore ? store.getPool() : undefined;
  const repos = await createRuntimeInfraRepos(pool ? { store, pool } : { store });
  const asyncTransport = pool
    ? createAsyncTransport({
        config: { asyncTaskTransport: config.asyncTaskTransport },
        pool,
      })
    : undefined;
  const ai = createAiProviders(config.ai);

  const infra: RuntimeInfraShared = {
    store,
    ...(asyncTransport ? { asyncTransport } : {}),
    adapterRegistry: buildDefaultAdapterRegistry(),
    ai,
    repos,
    graphQueryBackend: createMemoryGraphQueryBackend(repos.graphIndex),
    graphQuery: {
      backendKind: 'memory',
      enabled: false,
      failOpen: true,
      mode: 'disabled',
      syncOnWrite: false,
    },
    eventBus: new LifecycleEventBus(),
  };

  setGlobalEmbeddingsProvider(ai.embeddings);
  return infra;
}
