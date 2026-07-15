import { vi } from 'vitest';
import type { ArtifactReadProjection } from '@trapmap/contracts';

export function createTransactionPool(
  respond: (sql: string) => Promise<{ rows: unknown[] }> | { rows: unknown[] },
) {
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
): ArtifactReadProjection {
  return {
    getById,
    listByFilter: vi.fn(async () => []),
    listForRetrieval: vi.fn(async () => []),
    history: vi.fn(async () => []),
    exportArtifacts: vi.fn(async () => []),
    reviewQueue: vi.fn(async () => []),
  };
}
