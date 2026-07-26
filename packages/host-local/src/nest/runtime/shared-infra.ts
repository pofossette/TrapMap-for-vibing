import { createKnowledgeReadGraphIndexRepository } from '@trapmap/service-knowledge-read';
import type { JobRuntimeAsyncTransport } from '@trapmap/service-job-runtime';
import { createAiProviders, type AiProviders } from '@trapmap/server/lib/ai/index.js';
import { setGlobalEmbeddingsProvider } from '@trapmap/server/lib/embeddings.js';
import {
  createMemoryGraphQueryBackend,
  type GraphQueryBackend,
  type GraphQueryRuntimeState,
} from '@trapmap/server/lib/graph-query/index.js';
import { createSkillShareerStore } from '@trapmap/server/lib/persistence/create-store.js';
import { getStorePool, type SkillShareerStore } from '@trapmap/server/lib/store.js';

import type { HostLocalConfig } from '../config/index.js';

export interface HostLocalSharedInfra {
  store: SkillShareerStore;
  ai: AiProviders;
  graphQueryBackend: GraphQueryBackend;
  graphQuery: GraphQueryRuntimeState;
}

export type HostLocalStore = HostLocalSharedInfra['store'];
export type HostLocalAsyncTransport = JobRuntimeAsyncTransport;
export type HostLocalAiProviders = HostLocalSharedInfra['ai'];
export type HostLocalGraphQueryBackend = HostLocalSharedInfra['graphQueryBackend'];
export type HostLocalGraphQueryRuntimeState = HostLocalSharedInfra['graphQuery'];

export async function createHostLocalSharedInfra(
  config: HostLocalConfig,
): Promise<HostLocalSharedInfra> {
  const store = createSkillShareerStore(config);
  const pool = getStorePool(store);
  if (!pool) {
    throw new Error('host-local graph projection requires PostgreSQL');
  }
  const ai = createAiProviders(config.ai);
  const graphIndex = createKnowledgeReadGraphIndexRepository(pool);
  setGlobalEmbeddingsProvider(ai.embeddings);

  return {
    store,
    ai,
    graphQueryBackend: createMemoryGraphQueryBackend(graphIndex),
    graphQuery: { backendKind: 'memory', failOpen: true, mode: 'disabled' },
  };
}
