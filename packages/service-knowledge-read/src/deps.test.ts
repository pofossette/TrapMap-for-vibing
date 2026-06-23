import { describe, expect, it, vi } from 'vitest';

import { createKnowledgeReadDeps, createKnowledgeReadServiceModule } from './deps.js';

describe('knowledge-read deps', () => {
  it('limits direct-backed projection reads to getById and listMine while search stays on retrievalQuery', async () => {
    const knowledgeRepo = {
      getById: vi.fn(async (entryId: string) => ({
        id: entryId,
        content: 'hello',
        lifecycleState: 'approved' as const,
        ownerUserId: 'user-1',
        teamId: 'team-1',
      })),
      listByFilter: vi.fn(async () => [
        {
          id: 'entry-2',
          content: 'mine',
          lifecycleState: 'approved' as const,
          ownerUserId: 'user-1',
          teamId: 'team-2',
        },
      ]),
    };
    const retrievalQuery = {
      search: vi.fn(async () => ({
        results: [{ entryId: 'entry-1', score: 0.99 }],
        totalEstimate: 1,
        channel: 'derived-index',
      })),
    };

    const deps = createKnowledgeReadDeps({ knowledgeRepo, retrievalQuery });
    const module = createKnowledgeReadServiceModule(deps);

    await expect(module.getById('entry-1')).resolves.toMatchObject({ id: 'entry-1' });
    await expect(module.listMine('user-1', 'team-2')).resolves.toHaveLength(1);
    await expect(module.search({ query: 'hello', teamId: 'team-1', limit: 3 })).resolves.toEqual({
      results: [{ entryId: 'entry-1', score: 0.99 }],
      totalEstimate: 1,
      channel: 'derived-index',
    });

    expect(knowledgeRepo.getById).toHaveBeenCalledWith('entry-1');
    expect(knowledgeRepo.listByFilter).toHaveBeenCalledWith({
      ownerUserId: 'user-1',
      teamId: 'team-2',
    });
    expect(retrievalQuery.search).toHaveBeenCalledWith({
      query: 'hello',
      teamId: 'team-1',
      limit: 3,
    });
  });

  it('keeps the phase-2 projection status contract closed over direct-backed and derived surfaces', async () => {
    const deps = createKnowledgeReadDeps({
      knowledgeRepo: {
        getById: vi.fn(async () => null),
        listByFilter: vi.fn(async () => []),
      },
      retrievalQuery: {
        search: vi.fn(async () => ({ results: [] })),
      },
    });

    const status = await deps.knowledgeProjection.getStatus();

    expect(status.phase).toBe('phase-2-boundary-closed');
    expect(
      status.surfaces.find((surface) => surface.surface === 'knowledge-entry:getById'),
    ).toMatchObject({
      owner: 'knowledge-read',
      source: 'temporary-direct-backed-projection',
      fallback: 'direct-authoritative-read',
    });
    expect(
      status.surfaces.find((surface) => surface.surface === 'knowledge-entry:listMine'),
    ).toMatchObject({
      owner: 'knowledge-read',
      source: 'temporary-direct-backed-projection',
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
  });
});
