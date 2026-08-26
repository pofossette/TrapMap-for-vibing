import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeToolCaller } from './tool-caller.js';

const originalFetch = globalThis.fetch;
const callTool = makeToolCaller('viewer');

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function stubFetch(body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
  globalThis.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

describe('trapmap_search_experience_genes', () => {
  it('returns the structured Gene response from the gateway', async () => {
    const response = {
      primaryGene: null,
      supplementaryAvoid: [],
      routingTrace: {
        selectedMode: 'naive',
        routeFamily: 'entry',
        routingReason: 'fallback-default',
        fallbackApplied: true,
        channelsUsed: [],
        fallbackTarget: null,
        confidenceScore: 0,
        confidenceBucket: 'low',
      },
    };
    const fetchMock = stubFetch(response);

    await expect(
      callTool('trapmap_search_experience_genes', { seed: 'queue retry' }),
    ).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:4000/v1/retrieval/genes/search',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      seed: 'queue retry',
      filters: { labels: [], scopes: [] },
      maxResults: 1,
      includeActivationHints: false,
    });
  });

  it('rejects more than five requested genes and unbounded seeds', async () => {
    stubFetch({ primaryGene: null, supplementaryAvoid: [] });
    await expect(
      callTool('trapmap_search_experience_genes', { seed: 'retry', maxResults: 6 }),
    ).rejects.toThrow();
    await expect(
      callTool('trapmap_search_experience_genes', { seed: 'x'.repeat(2001) }),
    ).rejects.toThrow();
  });
});
