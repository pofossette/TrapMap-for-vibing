import { describe, expect, it } from 'vitest';

import type {
  VectorSearchFilters,
  VectorSearchHit,
  VectorSearchPort,
  VectorSearchRecord,
} from './vector-search-ports.js';

class ContractFixture implements VectorSearchPort {
  readonly rows = new Map<string, VectorSearchRecord>();

  async upsert(records: VectorSearchRecord[]): Promise<void> {
    for (const record of records) {
      this.rows.set(`${record.sourceId}:${record.sourceRevision}:${record.contentHash}`, record);
    }
  }

  async search(
    vector: number[],
    filters: VectorSearchFilters,
    limit: number,
  ): Promise<VectorSearchHit[]> {
    if (vector.length === 0 || limit <= 0) return [];

    return [...this.rows.values()]
      .filter((row) => row.teamId === filters.teamId)
      .filter((row) => row.requiredLevel <= filters.maxRequiredLevel)
      .filter((row) => filters.scopes.includes(row.scope))
      .map((row) => ({ sourceId: row.sourceId, similarity: Math.min(1, Math.max(0, vector[0]!)) }))
      .sort((left, right) =>
        left.similarity === right.similarity
          ? left.sourceId.localeCompare(right.sourceId)
          : right.similarity - left.similarity,
      )
      .slice(0, limit);
  }

  async deleteBySource(sourceId: string): Promise<void> {
    for (const [key, row] of this.rows) {
      if (row.sourceId === sourceId) this.rows.delete(key);
    }
  }

  async health(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
}

describe('VectorSearchPort contract fixture', () => {
  it('enforces governance filters and stable result ordering', async () => {
    const port = new ContractFixture();
    await port.upsert([
      {
        sourceId: 'source-b',
        sourceRevision: 2,
        contentHash: 'hash-b',
        vector: [1],
        teamId: 'team-1',
        scope: 'project',
        requiredLevel: 1,
      },
      {
        sourceId: 'source-a',
        sourceRevision: 1,
        contentHash: 'hash-a',
        vector: [1],
        teamId: 'team-1',
        scope: 'project',
        requiredLevel: 1,
      },
      {
        sourceId: 'forbidden-team',
        sourceRevision: 1,
        contentHash: 'hash-x',
        vector: [1],
        teamId: 'team-2',
        scope: 'project',
        requiredLevel: 1,
      },
      {
        sourceId: 'forbidden-level',
        sourceRevision: 1,
        contentHash: 'hash-y',
        vector: [1],
        teamId: 'team-1',
        scope: 'project',
        requiredLevel: 2,
      },
    ]);

    await expect(
      port.search([2], { teamId: 'team-1', maxRequiredLevel: 1, scopes: ['project'] }, 10),
    ).resolves.toEqual([
      { sourceId: 'source-a', similarity: 1 },
      { sourceId: 'source-b', similarity: 1 },
    ]);
  });
});
