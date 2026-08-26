import { describe, expect, it, vi } from 'vitest';

import {
  buildRouteTestApp,
  type AdapterName,
} from '@trapmap/backend-core/testing/route-test-app.js';

import { createHostLocalExperienceGeneGatewayDefs } from '../gateway/gateway.module.js';

const ADAPTERS: readonly AdapterName[] = ['fastify', 'nest'];

describe('host-local experience gene gateway defs', () => {
  it('registers the service-owned external route through the monolith filter', () => {
    const deps = {
      mode: 'serve' as const,
      searchGenes: vi.fn(async () => ({ primaryGene: null, supplementaryAvoid: [] })),
    };
    const defs = createHostLocalExperienceGeneGatewayDefs(deps);

    expect(defs.map(({ path }) => path)).toEqual(['/v1/retrieval/genes/search']);
  });
});

describe.each(ADAPTERS)('host-local experience gene gateway tri-state (%s adapter)', (adapter) => {
  it('returns canonical disabled envelope in off and shadow without invoking search', async () => {
    for (const mode of ['off', 'shadow'] as const) {
      const searchGenes = vi.fn(async () => ({ primaryGene: null, supplementaryAvoid: [] }));
      const deps = { mode, searchGenes };
      const defs = createHostLocalExperienceGeneGatewayDefs(deps);
      const app = await buildRouteTestApp(defs, deps, adapter);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/retrieval/genes/search',
        payload: { seed: 'queue retry' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        primaryGene: null,
        supplementaryAvoid: [],
        routingTrace: expect.objectContaining({ confidenceScore: 0, fallbackApplied: true }),
      });
      expect(searchGenes).not.toHaveBeenCalled();
      await app.close();
    }
  });

  it('forwards to searchGenes in serve mode', async () => {
    const searchGenes = vi.fn(async () => ({ primaryGene: null, supplementaryAvoid: [] }));
    const deps = { mode: 'serve' as const, searchGenes };
    const defs = createHostLocalExperienceGeneGatewayDefs(deps);
    const app = await buildRouteTestApp(defs, deps, adapter);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/retrieval/genes/search',
      headers: { 'x-trapmap-team-id': 'team-1', 'x-trapmap-security-level': '2' },
      payload: { seed: 'queue retry' },
    });
    expect(response.statusCode).toBe(200);
    expect(searchGenes).toHaveBeenCalled();
    await app.close();
  });
});
