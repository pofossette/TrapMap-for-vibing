import { createAsyncTransport } from '@trapmap/server/lib/async/factory.js';
import { createAiProviders, type AiProviders } from '@trapmap/server/lib/ai/index.js';
import type { AsyncTransport } from '@trapmap/server/lib/async/transport.js';
import { setGlobalEmbeddingsProvider } from '@trapmap/server/lib/embeddings.js';
import type { GraphQueryBackend, GraphQueryRuntimeState } from '@trapmap/server/lib/graph-query/backend.js';
import { createMemoryGraphQueryBackend } from '@trapmap/server/lib/graph-query/memory-backend.js';
import {
  buildDefaultAdapterRegistry,
  type AdapterRegistry,
} from '@trapmap/server/lib/indexing/adapters/index.js';
import { LifecycleEventBus } from '@trapmap/server/lib/lifecycle/event-bus.js';
import { createSkillShareerStore } from '@trapmap/server/lib/persistence/create-store.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { createAllRepos, type SkillShareerRepos } from '@trapmap/server/lib/repos/index.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';

import type { HostLocalConfig } from '../config/index.js';

export interface HostLocalSharedInfra {
  store: SkillShareerStore;
  asyncTransport?: AsyncTransport;
  adapterRegistry: AdapterRegistry;
  ai: AiProviders;
  repos: SkillShareerRepos;
  graphQueryBackend: GraphQueryBackend;
  graphQuery: GraphQueryRuntimeState;
  eventBus: LifecycleEventBus;
}

export type HostLocalStore = HostLocalSharedInfra['store'];
export type HostLocalAsyncTransport = HostLocalSharedInfra['asyncTransport'];
export type HostLocalAdapterRegistry = HostLocalSharedInfra['adapterRegistry'];
export type HostLocalAiProviders = HostLocalSharedInfra['ai'];
export type HostLocalRepos = HostLocalSharedInfra['repos'];
export type HostLocalGraphQueryBackend = HostLocalSharedInfra['graphQueryBackend'];
export type HostLocalGraphQueryRuntimeState = HostLocalSharedInfra['graphQuery'];
export type HostLocalEventBus = HostLocalSharedInfra['eventBus'];

// Shared seam only: default light host still borrows server-owned infra helpers here
// until those factories are migrated behind a package-neutral boundary.
export async function createHostLocalSharedInfra(
  config: HostLocalConfig,
): Promise<HostLocalSharedInfra> {
  const store = createSkillShareerStore({
    dataFile: config.dataFile,
    databaseUrl: config.databaseUrl,
  });
  const pool = store instanceof PostgresStore ? store.getPool() : undefined;
  const repos = await createAllRepos(pool ? { store, pool } : { store });
  const asyncTransport = pool ? createAsyncTransport({ config, pool }) : undefined;
  const ai = createAiProviders(config.ai);

  const infra: HostLocalSharedInfra = {
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
