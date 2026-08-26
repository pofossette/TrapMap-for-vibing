import { describe, expect, it, vi } from 'vitest';

import type { GeneSearchQuery } from '@trapmap/contracts';
import { withExperienceGeneSearchMetrics } from './experience-gene-metrics.js';

function metrics() {
  return {
    recordDerivation: vi.fn(),
    recordValidationRejection: vi.fn(),
    recordSolidified: vi.fn(),
    recordStale: vi.fn(),
    recordSearch: vi.fn(),
    recordPrimarySelected: vi.fn(),
    recordEmptyResult: vi.fn(),
  };
}

function query(seed: string): GeneSearchQuery {
  return {
    seed,
    filters: { labels: [], scopes: [] },
    maxResults: 1,
    includeActivationHints: false,
  };
}

describe('experience gene search metric wrapper', () => {
  it('records selected and empty outcomes without seed text', async () => {
    const recorder = metrics();
    const search = vi
      .fn()
      .mockResolvedValueOnce({ primaryGene: { geneId: 'gene-1' }, supplementaryAvoid: [] })
      .mockResolvedValueOnce({ primaryGene: null, supplementaryAvoid: [] });
    const wrapped = withExperienceGeneSearchMetrics(search, {
      metrics: recorder,
      mode: 'serve',
    });

    await wrapped(query('raw queue failure'), { teamId: null, maxRequiredLevel: 1 });
    await wrapped(query('raw queue failure'), { teamId: null, maxRequiredLevel: 1 });

    expect(recorder.recordPrimarySelected).toHaveBeenCalledTimes(1);
    expect(recorder.recordEmptyResult).toHaveBeenCalledTimes(1);
    expect(recorder.recordSearch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(recorder.recordSearch.mock.calls)).not.toContain('raw queue failure');
  });

  it('records errors and preserves the original failure', async () => {
    const recorder = metrics();
    const failure = new Error('database unavailable');
    const wrapped = withExperienceGeneSearchMetrics(vi.fn().mockRejectedValue(failure), {
      metrics: recorder,
      mode: 'shadow',
    });

    await expect(wrapped(query('x'), { teamId: null, maxRequiredLevel: 0 })).rejects.toBe(failure);
    expect(recorder.recordSearch).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'error', mode: 'shadow' }),
    );
  });
});
