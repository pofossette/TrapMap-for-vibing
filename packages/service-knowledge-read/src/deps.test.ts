import type {
  KnowledgeReadDeps as BackendKnowledgeReadDeps,
  KnowledgeReadPort,
} from '@trapmap/backend-core';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { createKnowledgeReadDeps, createKnowledgeReadServiceModule } from './deps.js';
import {
  invalidateKnowledgeEntryProjection,
  resetKnowledgeEntryProjectionCacheForTests,
} from './entry-projection.js';

describe('knowledge-read deps', () => {
  beforeEach(() => {
    resetKnowledgeEntryProjectionCacheForTests();
  });

  it('exports backend-core aligned deps and module contract', () => {
    const knowledgeRepo = {
      listByFilter: vi.fn(async () => ({ items: [], total: 0 })),
    };
    const retrievalQuery = {
      search: vi.fn(async () => ({ results: [] })),
    };

    const deps = createKnowledgeReadDeps({
      knowledgeRepo,
      retrievalQuery,
      skillLookup: vi.fn(async () => ({ matches: [] })),
    });
    const module = createKnowledgeReadServiceModule(deps);

    expectTypeOf(deps).toMatchTypeOf<BackendKnowledgeReadDeps>();
    expectTypeOf<BackendKnowledgeReadDeps>().toMatchTypeOf(deps);
    expectTypeOf(module).toMatchTypeOf<KnowledgeReadPort>();
    expectTypeOf<KnowledgeReadPort>().toMatchTypeOf(module);
  });

  it('routes knowledge reads through the derived entry projection while search stays on retrievalQuery', async () => {
    const knowledgeRepo = {
      getById: vi.fn(async () => {
        throw new Error('direct getById must not be used by knowledge-read');
      }),
      listByFilter: vi.fn(async () => ({
        items: [
          {
            id: 'entry-1',
            content: 'hello',
            lifecycleState: 'approved' as const,
            ownerUserId: 'user-1',
            teamId: 'team-1',
          },
          {
            id: 'entry-2',
            content: 'team filtered',
            lifecycleState: 'approved' as const,
            ownerUserId: 'user-1',
            teamId: 'team-2',
          },
        ],
        total: 3,
      })),
    };
    const retrievalQuery = {
      search: vi.fn(async () => ({
        results: [{ entryId: 'entry-1', score: 0.99 }],
        totalEstimate: 1,
        channel: 'derived-index',
      })),
    };

    const deps = createKnowledgeReadDeps({
      knowledgeRepo,
      retrievalQuery,
      skillLookup: vi.fn(async () => ({ matches: [] })),
    });
    const module = createKnowledgeReadServiceModule(deps);

    await expect(module.getById('entry-1')).resolves.toMatchObject({ id: 'entry-1' });
    await expect(module.listMine('user-1', 'team-2')).resolves.toHaveLength(1);
    await expect(module.search({ query: 'hello', teamId: 'team-1', limit: 3 })).resolves.toEqual({
      results: [{ entryId: 'entry-1', score: 0.99 }],
      totalEstimate: 1,
      channel: 'derived-index',
    });

    expect(knowledgeRepo.getById).not.toHaveBeenCalled();
    expect(knowledgeRepo.listByFilter).toHaveBeenCalledTimes(1);
    expect(knowledgeRepo.listByFilter).toHaveBeenCalledWith({});
    expect(retrievalQuery.search).toHaveBeenCalledWith({
      query: 'hello',
      teamId: 'team-1',
      limit: 3,
    });
  });

  it('keeps the phase-2 projection status contract closed over derived surfaces', async () => {
    const deps = createKnowledgeReadDeps({
      knowledgeRepo: {
        listByFilter: vi.fn(async () => ({ items: [], total: 0 })),
      },
      retrievalQuery: {
        search: vi.fn(async () => ({ results: [] })),
      },
      skillLookup: vi.fn(async () => ({ matches: [] })),
    });

    const status = await deps.knowledgeProjection.getStatus();

    expect(status.phase).toBe('phase-2-boundary-closed');
    expect(
      status.surfaces.find((surface) => surface.surface === 'knowledge-entry:getById'),
    ).toMatchObject({
      owner: 'knowledge-read',
      source: 'temporary-direct-backed-projection',
      consistency: 'eventual',
      fallback: 'direct-authoritative-read',
    });
    expect(
      status.surfaces.find((surface) => surface.surface === 'knowledge-entry:listMine'),
    ).toMatchObject({
      owner: 'knowledge-read',
      source: 'temporary-direct-backed-projection',
      consistency: 'eventual',
      fallback: 'direct-authoritative-read',
    });
    expect(status.surfaces.find((surface) => surface.surface === 'retrieval-search')).toMatchObject(
      {
        owner: 'knowledge-read',
        source: 'derived-search-index',
        fallback: 'none',
      },
    );
    expect(
      status.surfaces.find((surface) => surface.surface === 'retrieval-query-trace'),
    ).toMatchObject({
      owner: 'knowledge-read',
      source: 'derived-query-trace',
    });
    expect(
      status.surfaces.find((surface) => surface.surface === 'retrieval-cache-metadata'),
    ).toMatchObject({
      owner: 'knowledge-read',
      source: 'derived-projection',
    });
    expect(status.surfaces.find((surface) => surface.surface === 'review-queue')).toMatchObject({
      owner: 'governance-review',
      source: 'governance-read-model',
      fallback: 'none',
    });
    expect(
      status.surfaces.find((surface) => surface.surface === 'maintenance-entries'),
    ).toMatchObject({
      owner: 'governance-review',
      source: 'derived-projection',
      fallback: 'none',
    });
  });

  it('rebuilds the entry projection through the knowledge-read owner port', async () => {
    const deps = createKnowledgeReadDeps({
      knowledgeRepo: {
        listByFilter: vi
          .fn()
          .mockResolvedValueOnce({
            items: [
              {
                id: 'entry-1',
                content: 'before',
                lifecycleState: 'approved',
                ownerUserId: 'u',
                teamId: 't',
              },
            ],
            total: 1,
          })
          .mockResolvedValueOnce({
            items: [
              {
                id: 'entry-1',
                content: 'after',
                lifecycleState: 'approved',
                ownerUserId: 'u',
                teamId: 't',
              },
            ],
            total: 1,
          }),
      },
      retrievalQuery: { search: vi.fn(async () => ({ results: [] })) },
      skillLookup: vi.fn(async () => ({ matches: [] })),
    });
    const module = createKnowledgeReadServiceModule(deps);

    await module.getById('entry-1');
    invalidateKnowledgeEntryProjection('approved');
    await module.rebuildProjection?.();

    await expect(module.getById('entry-1')).resolves.toMatchObject({ content: 'after' });
  });
});
