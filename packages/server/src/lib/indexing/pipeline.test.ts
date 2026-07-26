import { describe, expect, it, vi } from 'vitest';

import { reconcileKnowledgeIndexesFromOwner, syncKnowledgeIndexFromOwner } from './pipeline.js';
import { AdapterRegistry } from './registry.js';

function registry(adapter: {
  kind: string;
  sync: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}) {
  const result = new AdapterRegistry();
  result.register(adapter as never);
  return result;
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    teamId: null,
    scope: 'global' as const,
    labels: ['docker'],
    shortcut: 'Restart Docker',
    detail: 'Restart the daemon.',
    requiredLevel: 0,
    lifecycleState: 'approved' as const,
    boundary: null,
    updatedAt: '2026-07-25T00:00:00.000Z',
    revision: 3,
    indexState: null,
    embeddingCache: null,
    ...overrides,
  };
}

describe('owner-local indexing pipeline', () => {
  it('checkpoints owner metadata after syncing an approved entry', async () => {
    const sync = vi.fn().mockResolvedValue({
      adapterKind: 'keyword',
      success: true,
      error: null,
      performedWork: true,
    });
    const updateIndexMetadata = vi.fn().mockResolvedValue(undefined);
    const knowledgeOwner = {
      getIndexingEntry: vi.fn().mockResolvedValue(entry()),
      updateIndexMetadata,
    };

    await syncKnowledgeIndexFromOwner(
      { knowledgeOwner, store: {} as never },
      'entry-1',
      registry({ kind: 'keyword', sync, remove: vi.fn() }),
    );

    expect(sync).toHaveBeenCalledOnce();
    expect(updateIndexMetadata).toHaveBeenCalledWith(
      'entry-1',
      expect.objectContaining({ indexState: expect.any(Object), embeddingCache: null }),
    );
  });

  it('clears owner metadata after removing a deactivated entry', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const updateIndexMetadata = vi.fn().mockResolvedValue(undefined);
    const knowledgeOwner = {
      getIndexingEntry: vi
        .fn()
        .mockResolvedValue(
          entry({ lifecycleState: 'deactivated', indexState: { adapters: {} }, revision: 4 }),
        ),
      updateIndexMetadata,
    };

    await syncKnowledgeIndexFromOwner(
      { knowledgeOwner, store: {} as never },
      'entry-1',
      registry({ kind: 'keyword', sync: vi.fn(), remove }),
    );

    expect(remove).toHaveBeenCalledWith({ entryId: 'entry-1', revision: 4 });
    expect(updateIndexMetadata).toHaveBeenCalledWith('entry-1', {
      indexState: null,
      embeddingCache: null,
    });
  });

  it('reconciles each owner projection page once', async () => {
    const sync = vi.fn().mockResolvedValue({
      adapterKind: 'keyword',
      success: true,
      error: null,
      performedWork: true,
    });
    const current = entry();
    const knowledgeOwner = {
      listIndexingEntries: vi
        .fn()
        .mockResolvedValueOnce({ entries: [current], nextOffset: 1 })
        .mockResolvedValueOnce({ entries: [], nextOffset: null }),
      getIndexingEntry: vi.fn().mockResolvedValue(current),
      updateIndexMetadata: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      reconcileKnowledgeIndexesFromOwner(
        { knowledgeOwner, store: {} as never },
        registry({ kind: 'keyword', sync, remove: vi.fn() }),
        { batchSize: 1 },
      ),
    ).resolves.toMatchObject({ totalEntries: 1, entriesSynced: 1, entriesRemoved: 0 });

    expect(knowledgeOwner.listIndexingEntries).toHaveBeenNthCalledWith(1, { offset: 0, limit: 1 });
    expect(knowledgeOwner.listIndexingEntries).toHaveBeenNthCalledWith(2, { offset: 1, limit: 1 });
  });
});
