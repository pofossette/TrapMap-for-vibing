import type { ArtifactReadProjection, SkillArtifactRevision } from '@trapmap/contracts';
import { vi } from 'vitest';

type TestQueryResult = { rows: unknown[] };

export interface TestTransactionClient {
  query: (sql: string) => Promise<TestQueryResult>;
  release: () => void;
}

export interface TestTransactionPool {
  calls: string[];
  client: TestTransactionClient;
  pool: {
    connect: () => Promise<TestTransactionClient>;
    query: () => Promise<TestQueryResult>;
  };
}

export function createTransactionPool(
  respond: (sql: string) => Promise<{ rows: unknown[] }> | { rows: unknown[] },
): TestTransactionPool {
  const calls: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      calls.push(sql);
      return respond(sql);
    }),
    release: vi.fn(),
  };
  return {
    calls,
    client,
    pool: {
      connect: vi.fn(async () => client),
      query: vi.fn(async () => ({ rows: [] })),
    },
  };
}

export function createArtifactReadProjectionFixture(
  getById = vi.fn(async () => null),
  history = vi.fn(async () => [] as SkillArtifactRevision[]),
): ArtifactReadProjection {
  return {
    getById,
    listByFilter: vi.fn(async () => []),
    listForRetrieval: vi.fn(async () => []),
    history,
    exportArtifacts: vi.fn(async () => []),
    reviewQueue: vi.fn(async () => []),
    getIndexingEntry: vi.fn(async () => null),
    listIndexingEntries: vi.fn(async () => ({ entries: [], nextOffset: null })),
  };
}
