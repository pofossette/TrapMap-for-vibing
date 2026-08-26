import { performance } from 'node:perf_hooks';

import type { ExperienceGeneMetricsPort } from '@trapmap/backend-core';
import type { ExperienceGeneMode, GeneSearchQuery, GeneSearchResponse } from '@trapmap/contracts';
import type { ExperienceGeneDbContext } from './experience-gene-retrieval.js';

type SearchFunction = (
  input: GeneSearchQuery,
  context: ExperienceGeneDbContext,
) => Promise<GeneSearchResponse>;

export function withExperienceGeneSearchMetrics(
  search: SearchFunction,
  params: { metrics: ExperienceGeneMetricsPort; mode: ExperienceGeneMode },
): SearchFunction {
  return async (input, context) => {
    const startedAt = performance.now();
    try {
      const response = await search(input, context);
      const durationMs = performance.now() - startedAt;
      const outcome = response.primaryGene ? ('ok' as const) : ('empty' as const);
      params.metrics.recordSearch({ mode: params.mode, outcome, durationMs });
      if (response.primaryGene) params.metrics.recordPrimarySelected({ mode: params.mode });
      else params.metrics.recordEmptyResult({ mode: params.mode });
      return response;
    } catch (error) {
      params.metrics.recordSearch({
        mode: params.mode,
        outcome: 'error',
        durationMs: performance.now() - startedAt,
      });
      throw error;
    }
  };
}
