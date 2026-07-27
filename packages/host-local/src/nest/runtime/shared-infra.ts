import { createKnowledgeReadGraphIndexRepository } from '@trapmap/service-knowledge-read';
import type { JobRuntimeAsyncTransport } from '@trapmap/service-job-runtime';
import { createAiProviders, type AiProviders } from '@trapmap/ai-providers';
import {
  createMemoryGraphQueryBackend,
  type GraphQueryBackend,
  type GraphQueryRuntimeState,
} from '@trapmap/server/lib/graph-query/index.js';
import pg from 'pg';

import type { HostLocalConfig } from '../config/index.js';

export interface HostLocalSharedInfra {
  store: HostLocalStore;
  ai: AiProviders;
  graphQueryBackend: GraphQueryBackend;
  graphQuery: GraphQueryRuntimeState;
}

export interface HostLocalStore {
  getPool(): pg.Pool;
  close(): Promise<void>;
}
export type HostLocalAsyncTransport = JobRuntimeAsyncTransport;
export type HostLocalAiProviders = HostLocalSharedInfra['ai'];
export type HostLocalGraphQueryBackend = HostLocalSharedInfra['graphQueryBackend'];
export type HostLocalGraphQueryRuntimeState = HostLocalSharedInfra['graphQuery'];

export async function createHostLocalSharedInfra(
  config: HostLocalConfig,
): Promise<HostLocalSharedInfra> {
  if (!config.databaseUrl) {
    throw new Error('host-local graph projection requires PostgreSQL');
  }
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  const store: HostLocalStore = {
    getPool: () => pool,
    close: () => pool.end(),
  };
  const ai = createAiProviders(config.ai);
  const graphIndex = createKnowledgeReadGraphIndexRepository(pool);

  return {
    store,
    ai,
    graphQueryBackend: createMemoryGraphQueryBackend(graphIndex),
    graphQuery: { backendKind: 'memory', failOpen: true, mode: 'disabled' },
  };
}
