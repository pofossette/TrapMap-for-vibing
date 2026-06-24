import { describe, expect, it, vi } from 'vitest';

import { createKnowledgeReadServer } from './server.js';

describe('knowledge-read server', () => {
  it('assembles a Fastify server around the knowledge-read module factory', async () => {
    const server = await createKnowledgeReadServer(
      {
        host: '127.0.0.1',
        port: 0,
        logLevel: 'silent',
      },
      {
        knowledgeProjection: {
          getById: vi.fn(async (entryId: string) => ({
            id: entryId,
            content: 'hello',
            lifecycleState: 'approved',
            ownerUserId: 'user-1',
            teamId: 'team-1',
          })),
          listMine: vi.fn(async () => []),
          getStatus: vi.fn(async () => ({
            phase: 'phase-2-boundary-closed' as const,
            source: 'derived-phase-2-read-side-contract',
            consistency: 'eventual' as const,
            freshness: 'current' as const,
            fallback: 'none' as const,
            surfaces: [],
          })),
        },
        retrievalQuery: {
          search: vi.fn(async () => ({ results: [], totalEstimate: 0, channel: 'derived-index' })),
        },
      },
    );

    const health = await server.app.inject({
      method: 'GET',
      url: '/internal/health',
    });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok', service: 'knowledge-read' });

    const byId = await server.app.inject({
      method: 'GET',
      url: '/internal/knowledge/entry-1',
    });
    expect(byId.statusCode).toBe(200);
    expect(byId.json()).toMatchObject({ id: 'entry-1' });

    await server.close();
  });
});
