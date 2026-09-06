import {
  type AdapterName,
  buildRouteTestApp,
  type RouteTestApp,
} from '@trapmap/backend-core/testing/route-test-app.js';
import { describe, expect, it, vi } from 'vitest';

import {
  createExperienceGeneRouteDefs,
  toExperienceGeneSearchContext,
} from '../src/experience-gene-routes.js';

const ADAPTERS: readonly AdapterName[] = ['fastify', 'nest'];
const searchGenes = vi.fn(async () => ({
  primaryGene: null,
  supplementaryAvoid: [],
}));

async function buildApp(
  deps: Parameters<typeof createExperienceGeneRouteDefs>[0],
  adapter: AdapterName,
) {
  return buildRouteTestApp(createExperienceGeneRouteDefs(deps), deps, adapter);
}

describe.each(ADAPTERS)('experience gene retrieval routes (%s adapter)', (adapter) => {
  it('exposes the frozen internal and external paths', () => {
    const defs = createExperienceGeneRouteDefs({ mode: 'serve', searchGenes });
    expect(defs.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'POST /internal/retrieval/genes/search',
      'POST /v1/retrieval/genes/search',
    ]);
  });

  it('serves an internal query with trusted governance context', async () => {
    const search = vi.fn(async () => ({ primaryGene: null, supplementaryAvoid: [] }));
    const app: RouteTestApp = await buildApp({ mode: 'serve', searchGenes: search }, adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/retrieval/genes/search',
      headers: { 'x-trapmap-team-id': 'team-1', 'x-trapmap-security-level': '3' },
      payload: { seed: 'queue retry storm' },
    });

    expect(response.statusCode).toBe(200);
    expect(search).toHaveBeenCalledWith(
      {
        seed: 'queue retry storm',
        filters: { labels: [], scopes: [] },
        maxResults: 1,
        includeActivationHints: false,
      },
      { teamId: 'team-1', maxRequiredLevel: 3 },
    );
    await app.close();
  });

  it('narrows an explicit team filter to the authenticated team', async () => {
    const search = vi.fn(async () => ({ primaryGene: null, supplementaryAvoid: [] }));
    const app = await buildApp({ mode: 'serve', searchGenes: search }, adapter);

    await app.inject({
      method: 'POST',
      url: '/v1/retrieval/genes/search',
      headers: { 'x-trapmap-team-id': 'team-1' },
      payload: { seed: 'lease', filters: { teamId: 'team-other', labels: [], scopes: [] } },
    });

    expect(search).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns a canonical disabled envelope on the external route in shadow mode', async () => {
    const app = await buildApp({ mode: 'shadow', searchGenes }, adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/retrieval/genes/search',
      payload: { seed: 'lease' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      primaryGene: null,
      supplementaryAvoid: [],
      routingTrace: expect.objectContaining({ confidenceScore: 0 }),
    });
    expect(searchGenes).not.toHaveBeenCalled();
    await app.close();
  });

  it('disables both routes in off mode without invoking search', async () => {
    for (const path of ['/internal/retrieval/genes/search', '/v1/retrieval/genes/search']) {
      const app = await buildApp({ mode: 'off', searchGenes }, adapter);
      const response = await app.inject({ method: 'POST', url: path, payload: { seed: 'x' } });
      expect(response.statusCode).toBe(200);
      await app.close();
    }
    expect(searchGenes).not.toHaveBeenCalled();
  });
});

describe('experience gene request context', () => {
  it('requires a matching authenticated team for a non-null filter', () => {
    expect(() =>
      toExperienceGeneSearchContext(
        { teamId: 'team-requested', labels: [], scopes: [] },
        { teamId: 'team-authenticated', securityLevel: 2 },
      ),
    ).toThrow();
  });
});
