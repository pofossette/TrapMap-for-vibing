import { describe, expect, it, vi } from 'vitest';

import { createKnowledgeReadModule } from './knowledge-read.js';

describe('createKnowledgeReadModule', () => {
  it('delegates getById to knowledgeProjection.getById', async () => {
    const deps = {
      knowledgeProjection: {
        getById: vi.fn(async (entryId: string) => ({ id: entryId })),
        listMine: vi.fn(async () => []),
        getStatus: vi.fn(async () => ({
          phase: 'phase-2-boundary-closed' as const,
          source: 'projection',
          consistency: 'strong' as const,
          freshness: 'current' as const,
          fallback: 'none' as const,
          surfaces: [],
        })),
      },
      retrievalQuery: {
        search: vi.fn(async () => ({ results: [] })),
      },
    };

    const module = createKnowledgeReadModule(deps);

    await expect(module.getById('entry-1')).resolves.toEqual({ id: 'entry-1' });
    expect(deps.knowledgeProjection.getById).toHaveBeenCalledWith('entry-1');
  });

  it('delegates listMine to knowledgeProjection.listMine', async () => {
    const deps = {
      knowledgeProjection: {
        getById: vi.fn(async () => null),
        listMine: vi.fn(async () => [{ id: 'entry-1' }]),
        getStatus: vi.fn(async () => ({
          phase: 'phase-2-boundary-closed' as const,
          source: 'projection',
          consistency: 'strong' as const,
          freshness: 'current' as const,
          fallback: 'none' as const,
          surfaces: [],
        })),
      },
      retrievalQuery: {
        search: vi.fn(async () => ({ results: [] })),
      },
    };

    const module = createKnowledgeReadModule(deps);

    await expect(module.listMine('user-1', 'team-1')).resolves.toEqual([{ id: 'entry-1' }]);
    expect(deps.knowledgeProjection.listMine).toHaveBeenCalledWith({
      userId: 'user-1',
      teamId: 'team-1',
    });
  });

  it('delegates search only to retrievalQuery.search', async () => {
    const deps = {
      knowledgeProjection: {
        getById: vi.fn(async () => null),
        listMine: vi.fn(async () => []),
        getStatus: vi.fn(async () => ({
          phase: 'phase-2-boundary-closed' as const,
          source: 'projection',
          consistency: 'strong' as const,
          freshness: 'current' as const,
          fallback: 'none' as const,
          surfaces: [],
        })),
      },
      retrievalQuery: {
        search: vi.fn(async () => ({ results: [{ entryId: 'entry-1', score: 0.9 }] })),
      },
    };

    const module = createKnowledgeReadModule(deps);

    await expect(module.search({ query: 'hello', teamId: 'team-1', limit: 3 })).resolves.toEqual({
      results: [{ entryId: 'entry-1', score: 0.9 }],
    });
    expect(deps.retrievalQuery.search).toHaveBeenCalledWith({
      query: 'hello',
      teamId: 'team-1',
      limit: 3,
    });
    expect(deps.knowledgeProjection.getById).not.toHaveBeenCalled();
    expect(deps.knowledgeProjection.listMine).not.toHaveBeenCalled();
  });

  it('delegates getProjectionStatus to knowledgeProjection.getStatus', async () => {
    const status = {
      phase: 'phase-2-boundary-closed' as const,
      source: 'projection',
      consistency: 'eventual' as const,
      freshness: 'refresh-pending' as const,
      fallback: 'direct-authoritative-read' as const,
      surfaces: [],
    };
    const deps = {
      knowledgeProjection: {
        getById: vi.fn(async () => null),
        listMine: vi.fn(async () => []),
        getStatus: vi.fn(async () => status),
      },
      retrievalQuery: {
        search: vi.fn(async () => ({ results: [] })),
      },
    };

    const module = createKnowledgeReadModule(deps);

    await expect(module.getProjectionStatus()).resolves.toEqual(status);
    expect(deps.knowledgeProjection.getStatus).toHaveBeenCalledTimes(1);
  });
});
