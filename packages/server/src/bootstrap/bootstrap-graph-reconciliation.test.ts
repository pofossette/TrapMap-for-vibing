import { describe, expect, it, vi } from 'vitest';

import type { GraphIndexRepositoryPort } from '@trapmap/contracts';
import { bootstrapGraphReconciliation } from './bootstrap-graph-reconciliation.js';

describe('bootstrapGraphReconciliation', () => {
  it('uses owner projections without reading the compatibility store', async () => {
    const graphIndex: GraphIndexRepositoryPort = {
      insert: vi.fn(),
      getById: vi.fn(),
      listBySource: vi.fn(),
      listAll: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      remove: vi.fn(),
      removeBySource: vi.fn(),
    };
    const store = { snapshot: vi.fn().mockRejectedValue(new Error('legacy snapshot reached')) };
    const knowledgeOwner = {
      listIndexingEntries: vi.fn().mockResolvedValue({ entries: [], nextOffset: null }),
    };
    const artifactReadProjection = {
      listIndexingEntries: vi.fn().mockResolvedValue({ entries: [], nextOffset: null }),
    };
    const app = {
      skillShareer: {
        store,
        knowledgeOwner,
        artifactReadProjection,
        graphIndex,
        repos: { graphIndex },
        graphQueryBackend: {},
        config: { graphDb: { enabled: false, syncOnWrite: false } },
      },
      log: { info: vi.fn(), error: vi.fn() },
    };

    await bootstrapGraphReconciliation(app as never);

    expect(store.snapshot).not.toHaveBeenCalled();
    expect(knowledgeOwner.listIndexingEntries).toHaveBeenCalledWith({ offset: 0, limit: 100 });
    expect(artifactReadProjection.listIndexingEntries).toHaveBeenCalledWith({
      offset: 0,
      limit: 100,
    });
    expect(app.log.info).toHaveBeenCalledWith(
      { removed: 0, rebuilt: 0 },
      'Graph index reconciliation complete',
    );
  });

  it('does not fall back to a compatibility snapshot when owners are missing', async () => {
    const store = { snapshot: vi.fn().mockRejectedValue(new Error('legacy snapshot reached')) };
    const app = {
      skillShareer: {
        store,
        graphIndex: {},
        repos: { graphIndex: {} },
        graphQueryBackend: {},
        config: { graphDb: { enabled: false, syncOnWrite: false } },
      },
      log: { info: vi.fn(), error: vi.fn() },
    };

    await bootstrapGraphReconciliation(app as never);

    expect(store.snapshot).not.toHaveBeenCalled();
    expect(app.log.error).toHaveBeenCalledWith(
      { error: expect.any(Error) },
      'Graph index reconciliation failed',
    );
  });
});
