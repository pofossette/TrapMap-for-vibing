import { describe, expect, it, vi } from 'vitest';

import { createHostLocalExperienceGeneGatewayDefs } from '../gateway/gateway.module.js';

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
