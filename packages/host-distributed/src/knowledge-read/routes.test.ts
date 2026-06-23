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
      source: 'shared-postgresql-authoritative-read-model',
      consistency: 'strong',
      freshness: 'current',
      fallback: 'direct-authoritative-read',
      notes: 'projection adapter is explicit even though storage is still shared',
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
      source: 'shared-postgresql-authoritative-read-model',
      consistency: 'strong',
      freshness: 'current',
      fallback: 'direct-authoritative-read',
      notes: 'projection adapter is explicit even though storage is still shared',
    });

    await app.close();
  });
});
