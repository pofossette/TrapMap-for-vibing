import { type AiProviders, createAiProviders } from '@trapmap/server/lib/ai/index.js';
import { setGlobalEmbeddingsProvider } from '@trapmap/server/lib/embeddings.js';
import {
  type GraphQueryBackend,
  type GraphQueryRuntimeState,
  createMemoryGraphQueryBackend,
} from '@trapmap/server/lib/graph-query/index.js';
import { createGraphIndexRepository } from '@trapmap/server/lib/graph-index/index.js';
import { createSkillShareerStore } from './store-factory.js';
import { type SkillShareerStore, getStorePool } from './store.js';

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
  ai: AiProviders;
  graphQueryBackend: GraphQueryBackend;
  graphQuery: GraphQueryRuntimeState;
}

export type RuntimeInfraStore = RuntimeInfraShared['store'];
export type RuntimeInfraAiProviders = RuntimeInfraShared['ai'];
export type RuntimeInfraGraphQueryBackend = RuntimeInfraShared['graphQueryBackend'];
export type RuntimeInfraGraphQueryRuntimeState = RuntimeInfraShared['graphQuery'];

export async function createRuntimeSharedInfra(
  config: RuntimeInfraConfig,
): Promise<RuntimeInfraShared> {
  const store = createSkillShareerStore({
    dataFile: config.dataFile,
    databaseUrl: config.databaseUrl,
  });
  const pool = getStorePool(store) ?? undefined;
  const graphIndex = createGraphIndexRepository(pool ? { store, pool } : { store });
  const ai = createAiProviders(config.ai);

  const infra: RuntimeInfraShared = {
    store,
    ai,
    graphQueryBackend: createMemoryGraphQueryBackend(graphIndex),
    graphQuery: {
      backendKind: 'memory',
      failOpen: true,
      mode: 'disabled',
    },
  };

  setGlobalEmbeddingsProvider(ai.embeddings);
  return infra;
}
