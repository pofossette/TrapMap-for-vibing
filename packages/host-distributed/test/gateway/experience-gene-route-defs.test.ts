import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import type { InternalServiceClients } from '../../src/gateway/internal-client.js';
import { registerGatewayRoutes } from '../../src/gateway/routes.js';

function createClients(searchGenes: ReturnType<typeof vi.fn>) {
  return {
    identityAccess: {
      validateSession: vi.fn(async () => ({
        status: 200,
        body: {
          userId: 'user-1',
          handle: 'user',
          activeTeamId: 'team-1',
          securityLevel: 3,
        },
      })),
    },
    knowledgeRead: { searchGenes },
  } as InternalServiceClients;
}

async function injectSearch(mode: 'off' | 'shadow' | 'serve') {
  const searchGenes = vi.fn(async () => ({
    status: 200,
    body: {
      primaryGene: null,
      supplementaryAvoid: [],
      routingTrace: {
        selectedMode: 'local',
        routeFamily: 'entry',
        routingReason: 'fallback-default',
        fallbackApplied: false,
        channelsUsed: ['keyword'],
        fallbackTarget: null,
        confidenceScore: 0.5,
        confidenceBucket: 'medium',
      },
    },
  }));
  const clients = createClients(searchGenes);
  const app = Fastify();
  registerGatewayRoutes(app, clients, { experienceGenesMode: mode });
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: '/v1/retrieval/genes/search',
    headers: { authorization: 'Bearer session-token' },
    payload: { seed: 'queue retry', filters: { teamId: 'team-1', labels: [], scopes: [] } },
  });
  await app.close();
  return { response, searchGenes };
}

describe('distributed experience gene gateway route', () => {
  it('keeps off and shadow external responses disabled without an internal search hop', async () => {
    for (const mode of ['off', 'shadow'] as const) {
      const { response, searchGenes } = await injectSearch(mode);
      expect(response.statusCode).toBe(200);
      expect(response.json().primaryGene).toBeNull();
      expect(response.json().routingTrace.fallbackApplied).toBe(true);
      expect(searchGenes).not.toHaveBeenCalled();
    }
  });

  it('forwards trusted actor context in serve mode', async () => {
    const { response, searchGenes } = await injectSearch('serve');

    expect(response.statusCode).toBe(200);
    expect(searchGenes).toHaveBeenCalledWith(expect.objectContaining({ seed: 'queue retry' }), {
      headers: {
        'x-trapmap-team-id': 'team-1',
        'x-trapmap-security-level': '3',
      },
    });
  });
});
