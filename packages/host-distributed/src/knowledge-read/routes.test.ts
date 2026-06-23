import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import type { KnowledgeReadPort } from '@trapmap/backend-core';
import { registerRoutes } from './routes.js';

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
    search: vi.fn(async () => ({ results: [] })),
    getProjectionStatus: vi.fn(async () => ({
      phase: 'phase-2-boundary-closed',
      source: 'mixed-phase-2-read-side-contract',
      consistency: 'eventual',
      freshness: 'current',
      fallback: 'none',
      notes: 'phase 2 closes the read-side boundary with explicit per-surface contracts',
      surfaces: [
        {
          surface: 'knowledge-entry:getById',
          owner: 'knowledge-read',
          providedBy: 'knowledge-read',
          source: 'temporary-direct-backed-projection',
          authoritativeSource: 'knowledge-write authoritative PostgreSQL tables',
          consistency: 'strong',
          freshness: 'current',
          fallback: 'direct-authoritative-read',
          notes: 'temporary phase contract for direct-backed entry lookup',
          exitCriteria: 'replace with derived projection ownership',
        },
        {
          surface: 'retrieval-search',
          owner: 'knowledge-read',
          providedBy: 'knowledge-read',
          source: 'derived-search-index',
          authoritativeSource: 'knowledge-write lifecycle events and retrieval indexing artifacts',
          consistency: 'eventual',
          freshness: 'current',
          fallback: 'none',
          notes: 'derived retrieval read-side',
        },
        {
          surface: 'review-queue',
          owner: 'governance-review',
          providedBy: 'governance-review',
          source: 'governance-read-model',
          authoritativeSource: 'governance-review queue and workbench tables',
          consistency: 'strong',
          freshness: 'current',
          fallback: 'none',
          notes: 'review queue is not part of knowledge-read',
        },
      ],
    })),
  };
}

describe('knowledge-read routes', () => {
  it('exposes projection status for freshness and fallback evidence', async () => {
    const app = Fastify();
    const module = createModule();
    registerRoutes(app, module);
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/internal/knowledge-read/projection-status',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      phase: 'phase-2-boundary-closed',
      source: 'mixed-phase-2-read-side-contract',
      consistency: 'eventual',
      freshness: 'current',
      fallback: 'none',
      notes: 'phase 2 closes the read-side boundary with explicit per-surface contracts',
      surfaces: [
        {
          surface: 'knowledge-entry:getById',
          owner: 'knowledge-read',
          providedBy: 'knowledge-read',
          source: 'temporary-direct-backed-projection',
          authoritativeSource: 'knowledge-write authoritative PostgreSQL tables',
          consistency: 'strong',
          freshness: 'current',
          fallback: 'direct-authoritative-read',
          notes: 'temporary phase contract for direct-backed entry lookup',
          exitCriteria: 'replace with derived projection ownership',
        },
        {
          surface: 'retrieval-search',
          owner: 'knowledge-read',
          providedBy: 'knowledge-read',
          source: 'derived-search-index',
          authoritativeSource: 'knowledge-write lifecycle events and retrieval indexing artifacts',
          consistency: 'eventual',
          freshness: 'current',
          fallback: 'none',
          notes: 'derived retrieval read-side',
        },
        {
          surface: 'review-queue',
          owner: 'governance-review',
          providedBy: 'governance-review',
          source: 'governance-read-model',
          authoritativeSource: 'governance-review queue and workbench tables',
          consistency: 'strong',
          freshness: 'current',
          fallback: 'none',
          notes: 'review queue is not part of knowledge-read',
        },
      ],
    });

    await app.close();
  });

  it('keeps direct-backed entry reads distinct from derived retrieval surfaces', async () => {
    const module = createModule();
    const status = await module.getProjectionStatus();
    const entrySurface = status.surfaces.find(
      (surface) => surface.surface === 'knowledge-entry:getById',
    );
    const retrievalSurface = status.surfaces.find(
      (surface) => surface.surface === 'retrieval-search',
    );
    const reviewSurface = status.surfaces.find((surface) => surface.surface === 'review-queue');

    expect(entrySurface).toMatchObject({
      source: 'temporary-direct-backed-projection',
      fallback: 'direct-authoritative-read',
      owner: 'knowledge-read',
    });
    expect(entrySurface?.notes).toContain('temporary');

    expect(retrievalSurface).toMatchObject({
      source: 'derived-search-index',
      fallback: 'none',
      owner: 'knowledge-read',
      consistency: 'eventual',
    });
    expect(reviewSurface).toMatchObject({
      owner: 'governance-review',
      providedBy: 'governance-review',
      source: 'governance-read-model',
    });
  });
});
