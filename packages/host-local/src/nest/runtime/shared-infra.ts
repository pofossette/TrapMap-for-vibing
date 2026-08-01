import type { GraphQueryBackend, GraphQueryRuntimeState } from '@trapmap/contracts';
import {
  createKnowledgeReadGraphIndexRepository,
  createMemoryGraphQueryBackend,
} from '@trapmap/service-knowledge-read';
import type { JobRuntimeAsyncTransport } from '@trapmap/service-job-runtime';
import { createAiProviders, type AiProviders } from '@trapmap/ai-providers';
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
/** Raw repository interfaces used by the host-local adapter layer. */
export interface HostLocalRepos {
  session: {
    nextId(): string;
    create(record: Record<string, unknown>): Promise<Record<string, unknown>>;
    getByTokenHash(tokenHash: string): Promise<Record<string, unknown> | null>;
    deleteByTokenHash(tokenHash: string): Promise<void>;
    updateActiveTeam(sessionId: string, teamId: string): Promise<Record<string, unknown>>;
  };
  accessKey: {
    nextId(): string;
    insert(record: Record<string, unknown>): Promise<void>;
    getByTokenHash(tokenHash: string): Promise<Record<string, unknown> | null>;
    getById(keyId: string): Promise<Record<string, unknown> | null>;
    revoke(keyId: string): Promise<void>;
    listByMember(memberId: string): Promise<Record<string, unknown>[]>;
  };
  team: {
    nextId(): string;
    insert(record: Record<string, unknown>): Promise<void>;
    getById(teamId: string): Promise<Record<string, unknown> | null>;
    getBySlug(slug: string): Promise<Record<string, unknown> | null>;
    listAll(): Promise<Record<string, unknown>[]>;
    update(teamId: string, updates: Record<string, unknown>): Promise<void>;
  };
  membership: {
    nextId(): string;
    insert(record: Record<string, unknown>): Promise<void>;
    getById(membershipId: string): Promise<Record<string, unknown> | null>;
    findByUserAndTeam(userId: string, teamId: string): Promise<Record<string, unknown> | null>;
    listByUser(userId: string): Promise<Record<string, unknown>[]>;
    listByTeam(teamId: string): Promise<Record<string, unknown>[]>;
    update(membershipId: string, updates: Record<string, unknown>): Promise<void>;
  };
  user: {
    nextId(): string;
    insert(record: Record<string, unknown>): Promise<void>;
    getById(userId: string): Promise<Record<string, unknown> | null>;
    getByHandle(handle: string): Promise<Record<string, unknown> | null>;
    update(userId: string, updates: Record<string, unknown>): Promise<void>;
  };
  audit: {
    nextId(): string;
    insert(record: Record<string, unknown>): Promise<void>;
    listByFilter(filter: Record<string, unknown>): Promise<{
      total: number;
      items: Array<Record<string, unknown>>;
    }>;
  };
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
