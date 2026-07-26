import type { GraphIndexDocumentRecord } from '@trapmap/server/lib/indexing/graph-lite/documents.js';
import type { GraphIndexRepositoryPort } from '@trapmap/contracts';
import { describe, expect, it, vi } from 'vitest';

import { reconcileGraphIndexesFromOwners, rebuildGraphProjectionFromTruth } from './reconcile.js';

function indexingEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'trap-owner',
    teamId: null,
    scope: 'global' as const,
    labels: ['owner'],
    shortcut: 'Owner trap',
    detail: 'Authoritative owner projection for graph reconciliation.',
    requiredLevel: 0,
    lifecycleState: 'approved' as const,
    boundary: null,
    updatedAt: '2026-07-26T00:00:00.000Z',
    revision: 2,
    indexState: null,
    embeddingCache: null,
    ...overrides,
  };
}

function graphDocument(
  overrides: Partial<GraphIndexDocumentRecord> = {},
): GraphIndexDocumentRecord {
  return {
    id: 'graphdoc-stale',
    sourceType: 'trap',
    sourceId: 'missing-trap',
    revision: 1,
    contentHash: 'stale',
    teamId: null,
    scope: 'global',
    requiredLevel: 0,
    nodes: [],
    edges: [],
    evidence: 'stale',
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z',
    ...overrides,
  };
}

function graphOwner(documents: GraphIndexDocumentRecord[]): GraphIndexRepositoryPort {
  return {
    insert: vi.fn(),
    getById: vi.fn(),
    listBySource: vi.fn(),
    listAll: vi.fn(async () => documents),
    upsert: vi.fn(async (document) => {
      const index = documents.findIndex((current) => current.id === document.id);
      if (index >= 0) documents[index] = document;
      else documents.push(document);
    }),
    remove: vi.fn(),
    removeBySource: vi.fn(async (sourceType, sourceId) => {
      for (let index = documents.length - 1; index >= 0; index--) {
        if (
          documents[index]!.sourceType === sourceType &&
          documents[index]!.sourceId === sourceId
        ) {
          documents.splice(index, 1);
        }
      }
    }),
  };
}

describe('owner graph reconciliation', () => {
  it('removes stale graph documents and rebuilds approved owner sources', async () => {
    const documents = [graphDocument()];
    const graphIndex = graphOwner(documents);
    const knowledgeOwner = {
      listIndexingEntries: vi
        .fn()
        .mockResolvedValueOnce({ entries: [indexingEntry()], nextOffset: 1 })
        .mockResolvedValueOnce({ entries: [], nextOffset: null }),
    };
    const artifactReadProjection = {
      listIndexingEntries: vi
        .fn()
        .mockResolvedValueOnce({ entries: [], nextOffset: 1 })
        .mockResolvedValueOnce({ entries: [], nextOffset: null }),
    };

    const result = await reconcileGraphIndexesFromOwners({
      knowledgeOwner,
      artifactReadProjection,
      graphIndex,
    });

    expect(result).toMatchObject({ documentsRemoved: 1, documentsRebuilt: 1 });
    expect(documents).toEqual([
      expect.objectContaining({ sourceType: 'trap', sourceId: 'trap-owner', revision: 2 }),
    ]);
    expect(knowledgeOwner.listIndexingEntries).toHaveBeenLastCalledWith({ offset: 1, limit: 100 });
    expect(artifactReadProjection.listIndexingEntries).toHaveBeenLastCalledWith({
      offset: 1,
      limit: 100,
    });
  });

  it('removes an old revision before rebuilding the current owner revision', async () => {
    const documents = [
      graphDocument({ id: 'graphdoc-owner-old', sourceId: 'trap-owner', revision: 1 }),
    ];
    const graphIndex = graphOwner(documents);

    const result = await reconcileGraphIndexesFromOwners({
      knowledgeOwner: {
        listIndexingEntries: vi
          .fn()
          .mockResolvedValue({ entries: [indexingEntry()], nextOffset: null }),
      },
      artifactReadProjection: {
        listIndexingEntries: vi.fn().mockResolvedValue({ entries: [], nextOffset: null }),
      },
      graphIndex,
    });

    expect(result).toMatchObject({ documentsRemoved: 1, documentsRebuilt: 1 });
    expect(documents).toEqual([expect.objectContaining({ sourceId: 'trap-owner', revision: 2 })]);
  });

  it('rejects a non-advancing owner page to prevent an infinite reconciliation loop', async () => {
    await expect(
      reconcileGraphIndexesFromOwners({
        knowledgeOwner: {
          listIndexingEntries: vi.fn().mockResolvedValue({ entries: [], nextOffset: 0 }),
        },
        artifactReadProjection: {
          listIndexingEntries: vi.fn().mockResolvedValue({ entries: [], nextOffset: null }),
        },
        graphIndex: graphOwner([]),
      }),
    ).rejects.toThrow('Owner indexing projection returned a non-advancing page offset');
  });
});

describe('rebuildGraphProjectionFromTruth', () => {
  it('rebuilds the query projection from graph-owner truth', async () => {
    const documents = [graphDocument()];
    const graphQueryBackend = { rebuildProjection: vi.fn().mockResolvedValue(undefined) };

    await expect(
      rebuildGraphProjectionFromTruth({
        graphIndexRepo: graphOwner(documents),
        graphQueryBackend: graphQueryBackend as never,
      }),
    ).resolves.toBe(1);
    expect(graphQueryBackend.rebuildProjection).toHaveBeenCalledWith(documents);
  });
});
