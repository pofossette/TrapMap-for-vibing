import { InvocationError, type KnowledgeReadPort } from '@trapmap/backend-core';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { registerKnowledgeReadRoutes } from './routes.js';

function createProjectionStatus() {
  return {
    phase: 'phase-2-boundary-closed' as const,
    source: 'mixed-phase-2-read-side-contract',
    consistency: 'eventual' as const,
    freshness: 'current' as const,
    fallback: 'none' as const,
    notes:
      'Phase 2 closes the read-side boundary by making each surface declare its owner, backing source, consistency, freshness, and direct-read allowance explicitly.',
    surfaces: [
      {
        surface: 'knowledge-entry:getById',
        owner: 'knowledge-read' as const,
        providedBy: 'knowledge-read' as const,
        source: 'temporary-direct-backed-projection' as const,
        authoritativeSource: 'knowledge-write authoritative PostgreSQL tables',
        consistency: 'strong' as const,
        freshness: 'current' as const,
        fallback: 'direct-authoritative-read' as const,
        notes: 'Entry lookup is a temporary direct-backed read surface owned by knowledge-read.',
        exitCriteria: 'replace with a derived entry projection owned by knowledge-read',
      },
      {
        surface: 'knowledge-entry:listMine',
        owner: 'knowledge-read' as const,
        providedBy: 'knowledge-read' as const,
        source: 'temporary-direct-backed-projection' as const,
        authoritativeSource: 'knowledge-write authoritative PostgreSQL tables',
        consistency: 'strong' as const,
        freshness: 'current' as const,
        fallback: 'direct-authoritative-read' as const,
        notes: 'List queries are a temporary direct-backed read surface owned by knowledge-read.',
        exitCriteria: 'replace with a derived entry projection owned by knowledge-read',
      },
      {
        surface: 'retrieval-search',
        owner: 'knowledge-read' as const,
        providedBy: 'knowledge-read' as const,
        source: 'derived-search-index' as const,
        authoritativeSource: 'knowledge-write lifecycle events and retrieval indexing artifacts',
        consistency: 'eventual' as const,
        freshness: 'current' as const,
        fallback: 'none' as const,
        notes:
          'Retrieval queries are served from derived index/search state, not route-local direct SQL assembly.',
      },
      {
        surface: 'retrieval-query-trace',
        owner: 'knowledge-read' as const,
        providedBy: 'knowledge-read' as const,
        source: 'derived-query-trace' as const,
        authoritativeSource: 'knowledge-read query trace and badcase capture records',
        consistency: 'eventual' as const,
        freshness: 'current' as const,
        fallback: 'none' as const,
        notes: 'Trace and analytics remain read-side derived state owned by knowledge-read.',
      },
      {
        surface: 'retrieval-cache-metadata',
        owner: 'knowledge-read' as const,
        providedBy: 'knowledge-read' as const,
        source: 'derived-projection' as const,
        authoritativeSource: 'knowledge-read cache metadata and projection cache state',
        consistency: 'eventual' as const,
        freshness: 'current' as const,
        fallback: 'none' as const,
        notes:
          'Cache metadata stays on derived read-side state and must not fall back to direct authoritative reads.',
      },
      {
        surface: 'review-queue',
        owner: 'governance-review' as const,
        providedBy: 'governance-review' as const,
        source: 'governance-read-model' as const,
        authoritativeSource: 'governance-review queue and workbench tables',
        consistency: 'strong' as const,
        freshness: 'current' as const,
        fallback: 'none' as const,
        notes: 'Review queue stays outside knowledge-read and is served by governance-review.',
      },
      {
        surface: 'maintenance-entries',
        owner: 'governance-review' as const,
        providedBy: 'governance-review' as const,
        source: 'derived-projection' as const,
        authoritativeSource: 'governance-review derived maintenance read model',
        consistency: 'strong' as const,
        freshness: 'current' as const,
        fallback: 'none' as const,
        notes:
          'Operator-facing maintenance entry views are served from a governance-owned derived projection.',
      },
      {
        surface: 'decay-entries-search',
        owner: 'governance-review' as const,
        providedBy: 'governance-review' as const,
        source: 'governance-read-model' as const,
        authoritativeSource: 'governance-review decay workbench and operator queues',
        consistency: 'eventual' as const,
        freshness: 'current' as const,
        fallback: 'none' as const,
        notes:
          'Decay workbench search remains a governance-review concern unless promoted into retrieval-facing search.',
      },
    ],
  };
}

function createModule(): KnowledgeReadPort {
  return {
    getById: vi.fn(async () => ({
      id: 'entry-1',
      content: 'hello',
      lifecycleState: 'approved',
      ownerUserId: 'user-1',
      teamId: 'team-1',
    })),
    listMine: vi.fn(async () => []),
    search: vi.fn(async () => ({ results: [], totalEstimate: 0, channel: 'derived-index' })),
    getProjectionStatus: vi.fn(async () => createProjectionStatus()),
  };
}

describe('knowledge-read routes', () => {
  it('serves derived entry lookup through getById with 404 semantics', async () => {
    const app = Fastify();
    const module = createModule();
    registerKnowledgeReadRoutes(app, module);
    await app.ready();

    const success = await app.inject({
      method: 'GET',
      url: '/internal/knowledge/entry-1',
    });

    expect(success.statusCode).toBe(200);
    expect(success.json()).toMatchObject({ id: 'entry-1', ownerUserId: 'user-1' });
    expect(module.getById).toHaveBeenCalledWith('entry-1');

    vi.mocked(module.getById).mockResolvedValueOnce(null);
    const notFound = await app.inject({
      method: 'GET',
      url: '/internal/knowledge/missing-entry',
    });

    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toEqual({
      error: 'not-found',
      message: 'Knowledge entry not found',
    });
    expect(module.getById).toHaveBeenCalledWith('missing-entry');

    await app.close();
  });

  it('serves listMine as a temporary direct-backed projection with query passthrough', async () => {
    const app = Fastify();
    const module = createModule();
    vi.mocked(module.listMine).mockResolvedValueOnce([
      {
        id: 'entry-2',
        content: 'mine',
        lifecycleState: 'approved',
        ownerUserId: 'user-1',
        teamId: 'team-2',
      },
    ]);
    registerKnowledgeReadRoutes(app, module);
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/internal/knowledge/mine?userId=user-1&teamId=team-2',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: 'entry-2',
        content: 'mine',
        lifecycleState: 'approved',
        ownerUserId: 'user-1',
        teamId: 'team-2',
      },
    ]);
    expect(module.listMine).toHaveBeenCalledWith('user-1', 'team-2');

    const missingUserId = await app.inject({
      method: 'GET',
      url: '/internal/knowledge/mine',
    });

    expect(missingUserId.statusCode).toBe(400);
    expect(missingUserId.json()).toEqual({
      error: 'validation',
      message: 'userId query parameter is required',
    });

    await app.close();
  });

  it('serves retrieval search from derived read-side state with body passthrough', async () => {
    const app = Fastify();
    const module = createModule();
    vi.mocked(module.search).mockResolvedValueOnce({
      results: [{ entryId: 'entry-1', score: 0.98, snippet: 'hello' }],
      totalEstimate: 1,
      channel: 'derived-index',
      latencyMs: 12,
    });
    registerKnowledgeReadRoutes(app, module);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/internal/retrieval/search',
      payload: { query: 'hello', teamId: 'team-1', limit: 5 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      results: [{ entryId: 'entry-1', score: 0.98, snippet: 'hello' }],
      totalEstimate: 1,
      channel: 'derived-index',
      latencyMs: 12,
    });
    expect(module.search).toHaveBeenCalledWith({
      query: 'hello',
      teamId: 'team-1',
      limit: 5,
    });

    const missingQuery = await app.inject({
      method: 'POST',
      url: '/internal/retrieval/search',
      payload: {},
    });

    expect(missingQuery.statusCode).toBe(400);
    expect(missingQuery.json()).toEqual({
      error: 'validation',
      message: 'query is required in request body',
    });

    await app.close();
  });

  it('exposes projection status for freshness and fallback evidence', async () => {
    const app = Fastify();
    const module = createModule();
    registerKnowledgeReadRoutes(app, module);
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/internal/knowledge-read/projection-status',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(createProjectionStatus());

    await app.close();
  });

  it('keeps temporary direct-backed entry reads distinct from retrieval and governance surfaces', async () => {
    const module = createModule();
    const status = await module.getProjectionStatus();

    const entryGetById = status.surfaces.find(
      (surface) => surface.surface === 'knowledge-entry:getById',
    );
    const entryListMine = status.surfaces.find(
      (surface) => surface.surface === 'knowledge-entry:listMine',
    );
    const retrievalSurface = status.surfaces.find(
      (surface) => surface.surface === 'retrieval-search',
    );
    const queryTraceSurface = status.surfaces.find(
      (surface) => surface.surface === 'retrieval-query-trace',
    );
    const cacheMetadataSurface = status.surfaces.find(
      (surface) => surface.surface === 'retrieval-cache-metadata',
    );
    const reviewSurface = status.surfaces.find((surface) => surface.surface === 'review-queue');
    const maintenanceSurface = status.surfaces.find(
      (surface) => surface.surface === 'maintenance-entries',
    );

    expect(entryGetById).toMatchObject({
      source: 'temporary-direct-backed-projection',
      fallback: 'direct-authoritative-read',
      owner: 'knowledge-read',
    });
    expect(entryListMine).toMatchObject({
      source: 'temporary-direct-backed-projection',
      fallback: 'direct-authoritative-read',
      owner: 'knowledge-read',
    });
    expect(retrievalSurface).toMatchObject({
      source: 'derived-search-index',
      fallback: 'none',
      owner: 'knowledge-read',
      consistency: 'eventual',
    });
    expect(queryTraceSurface).toMatchObject({
      source: 'derived-query-trace',
      fallback: 'none',
      owner: 'knowledge-read',
    });
    expect(cacheMetadataSurface).toMatchObject({
      source: 'derived-projection',
      fallback: 'none',
      owner: 'knowledge-read',
    });
    expect(reviewSurface).toMatchObject({
      owner: 'governance-review',
      providedBy: 'governance-review',
      source: 'governance-read-model',
    });
    expect(maintenanceSurface).toMatchObject({
      owner: 'governance-review',
      source: 'derived-projection',
    });
  });

  it.each([
    ['validation', 400],
    ['forbidden', 403],
    ['not-found', 404],
    ['conflict', 409],
    ['unavailable', 503],
    ['timeout', 504],
    ['internal', 500],
  ] as const)(
    'maps InvocationError kind %s to HTTP %i across knowledge-read surfaces',
    async (kind, statusCode) => {
      const app = Fastify();
      const error = new InvocationError(kind, `boom:${kind}`);
      const module: KnowledgeReadPort = {
        getById: vi.fn(async () => {
          throw error;
        }),
        listMine: vi.fn(async () => {
          throw error;
        }),
        search: vi.fn(async () => {
          throw error;
        }),
        getProjectionStatus: vi.fn(async () => {
          throw error;
        }),
      };
      registerKnowledgeReadRoutes(app, module);
      await app.ready();

      const byId = await app.inject({ method: 'GET', url: '/internal/knowledge/entry-1' });
      const mine = await app.inject({
        method: 'GET',
        url: '/internal/knowledge/mine?userId=user-1',
      });
      const search = await app.inject({
        method: 'POST',
        url: '/internal/retrieval/search',
        payload: { query: 'hello' },
      });
      const projectionStatus = await app.inject({
        method: 'GET',
        url: '/internal/knowledge-read/projection-status',
      });

      for (const response of [byId, mine, search, projectionStatus]) {
        expect(response.statusCode).toBe(statusCode);
        expect(response.json()).toEqual({ error: kind, message: `boom:${kind}` });
      }

      await app.close();
    },
  );
});
