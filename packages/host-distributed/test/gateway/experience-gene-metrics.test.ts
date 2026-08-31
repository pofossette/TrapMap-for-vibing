import { describe, expect, it } from 'vitest';

import {
  createExperienceGeneOtelMetrics,
  getDistributedInternalObservabilitySnapshot,
  resetDistributedInternalObservability,
} from '../../src/gateway/internal-observability.js';

describe('distributed experience gene metrics', () => {
  it('exports derivation and search signals through the shared OTel registry', async () => {
    resetDistributedInternalObservability();
    const metrics = createExperienceGeneOtelMetrics();

    metrics.recordDerivation({
      mode: 'shadow',
      sourceKind: 'trap',
      generator: 'rule',
      outcome: 'solidified',
      durationMs: 18,
      retryCount: 1,
    });
    metrics.recordValidationRejection({ mode: 'shadow', gate: 'safety' });
    metrics.recordStale({ mode: 'serve', reasonClass: 'source-revision', count: 3 });
    metrics.recordSearch({ mode: 'serve', outcome: 'ok', durationMs: 5 });
    metrics.recordPrimarySelected({ mode: 'serve' });

    const snapshot = await getDistributedInternalObservabilitySnapshot();
    expect(snapshot.counters.trapmap_experience_gene_derivation_retries_total?.[0]).toMatchObject({
      value: 1,
    });
    expect(snapshot.counters.trapmap_experience_gene_requests_total?.[0]).toMatchObject({
      value: 1,
      labels: expect.objectContaining({
        mode: 'shadow',
        source_kind: 'trap',
        outcome: 'solidified',
      }),
    });
    expect(
      snapshot.counters.trapmap_experience_gene_validation_rejections_total?.[0],
    ).toMatchObject({
      labels: { mode: 'shadow', gate: 'safety' },
    });
    expect(snapshot.counters.trapmap_experience_gene_stale_total?.[0]).toMatchObject({
      value: 3,
      labels: { reason_class: 'source-revision' },
    });
    expect(snapshot.histograms.trapmap_experience_gene_search_duration_ms?.[0]).toMatchObject({
      sum: 5,
      count: 1,
    });
  });
});
