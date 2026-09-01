import { register } from 'prom-client';
import { beforeEach, describe, expect, it } from 'vitest';

import { createPrometheusExperienceGeneMetrics } from '../../../src/nest/observability/experience-gene-metrics.js';

describe('Prometheus experience gene metrics', () => {
  beforeEach(() => {
    register.clear();
  });

  it('exports the frozen metric families with low-cardinality labels only', async () => {
    const metrics = createPrometheusExperienceGeneMetrics();

    metrics.recordDerivation({
      mode: 'shadow',
      sourceKind: 'trap',
      generator: 'rule',
      outcome: 'solidified',
      durationMs: 12,
      retryCount: 1,
    });
    metrics.recordValidationRejection({ mode: 'shadow', gate: 'safety' });
    metrics.recordSolidified({ mode: 'shadow', sourceKind: 'skill-artifact' });
    metrics.recordStale({ mode: 'serve', reasonClass: 'source-hash', count: 2 });
    metrics.recordSearch({ mode: 'serve', outcome: 'ok', durationMs: 4 });
    metrics.recordPrimarySelected({ mode: 'serve' });

    const output = await register.metrics();
    expect(output).toContain('trapmap_experience_gene_requests_total');
    expect(output).toContain('trapmap_experience_gene_derivation_retries_total');
    expect(output).toContain('generator="rule"');
    expect(output).toContain('outcome="solidified"');
    expect(output).toContain('trapmap_experience_gene_validation_rejections_total');
    expect(output).toContain('gate="safety"');
    expect(output).toContain('trapmap_experience_gene_stale_total');
    expect(output).toContain('reason_class="source-hash"');
    expect(output).toContain('trapmap_experience_gene_search_duration_ms_count');
    expect(output).toContain('trapmap_experience_gene_primary_selected_total');
    expect(output).not.toContain('/internal/');
  });

  it('re-registers after Prometheus test registry resets', async () => {
    createPrometheusExperienceGeneMetrics().recordEmptyResult({ mode: 'off' });
    register.clear();

    createPrometheusExperienceGeneMetrics().recordEmptyResult({ mode: 'off' });
    expect(
      await register.getSingleMetric('trapmap_experience_gene_empty_results_total'),
    ).toBeDefined();
  });
});
