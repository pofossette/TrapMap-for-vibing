import type { ExperienceGeneMetricsPort } from '@trapmap/backend-core';
import { Counter, Histogram, register } from 'prom-client';

const DURATION_BUCKETS = [0.005, 0.025, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

function counter(config: ConstructorParameters<typeof Counter>[0]): Counter {
  const existing = register.getSingleMetric(config.name);
  if (existing && 'inc' in existing && typeof existing.inc === 'function') {
    return existing as Counter; // lib type gap: prom-client's metric lookup erases the concrete subtype
  }
  return new Counter(config);
}

function histogram(config: ConstructorParameters<typeof Histogram>[0]): Histogram {
  const existing = register.getSingleMetric(config.name);
  if (existing && 'observe' in existing && typeof existing.observe === 'function') {
    return existing as Histogram; // lib type gap: prom-client's metric lookup erases the concrete subtype
  }
  return new Histogram(config);
}

export function createPrometheusExperienceGeneMetrics(): ExperienceGeneMetricsPort {
  const requests = counter({
    name: 'trapmap_experience_gene_requests_total',
    help: 'Experience Gene derivation requests',
    labelNames: ['mode', 'source_kind', 'generator', 'outcome', 'reason_class'] as const,
  });
  const candidates = counter({
    name: 'trapmap_experience_gene_candidates_total',
    help: 'Experience Gene candidates produced by generator',
    labelNames: ['mode', 'generator'] as const,
  });
  const rejections = counter({
    name: 'trapmap_experience_gene_validation_rejections_total',
    help: 'Experience Gene deterministic gate rejections',
    labelNames: ['mode', 'gate'] as const,
  });
  const solidified = counter({
    name: 'trapmap_experience_gene_solidified_total',
    help: 'Experience Genes successfully solidified',
    labelNames: ['mode', 'source_kind'] as const,
  });
  const retries = counter({
    name: 'trapmap_experience_gene_derivation_retries_total',
    help: 'Experience Gene derivation retry attempts',
    labelNames: ['mode', 'outcome'] as const,
  });
  const stale = counter({
    name: 'trapmap_experience_gene_stale_total',
    help: 'Experience Genes marked stale by reason class',
    labelNames: ['mode', 'reason_class'] as const,
  });
  const derivationDuration = histogram({
    name: 'trapmap_experience_gene_derivation_duration_ms',
    help: 'Experience Gene derivation duration in milliseconds',
    labelNames: ['mode', 'source_kind', 'generator', 'outcome'] as const,
    buckets: DURATION_BUCKETS,
  });
  const searchDuration = histogram({
    name: 'trapmap_experience_gene_search_duration_ms',
    help: 'Experience Gene search duration in milliseconds',
    labelNames: ['mode', 'outcome'] as const,
    buckets: DURATION_BUCKETS,
  });
  const primarySelected = counter({
    name: 'trapmap_experience_gene_primary_selected_total',
    help: 'Gene searches that selected a primary Gene',
    labelNames: ['mode'] as const,
  });
  const emptyResults = counter({
    name: 'trapmap_experience_gene_empty_results_total',
    help: 'Gene searches that returned no primary Gene',
    labelNames: ['mode'] as const,
  });

  // fallow-ignore-next-line complexity -- one explicit branch per metric family keeps label mappings auditable.
  return {
    // fallow-ignore-next-line complexity -- one explicit branch per metric family keeps label mappings auditable.
    recordDerivation(params) {
      const labels = {
        mode: params.mode,
        source_kind: params.sourceKind,
        generator: params.generator,
        outcome: params.outcome,
        reason_class: params.reasonClass ?? 'none',
      };
      requests?.inc(labels);
      candidates?.inc({ mode: params.mode, generator: params.generator });
      derivationDuration?.observe(
        {
          mode: params.mode,
          source_kind: params.sourceKind,
          generator: params.generator,
          outcome: params.outcome,
        },
        params.durationMs,
      );
      if ((params.retryCount ?? 0) > 0) {
        retries?.inc({ mode: params.mode, outcome: params.outcome }, params.retryCount);
      }
    },
    recordValidationRejection(params) {
      rejections?.inc(params);
    },
    recordSolidified(params) {
      solidified?.inc({ mode: params.mode, source_kind: params.sourceKind });
    },
    recordStale(params) {
      stale?.inc({ mode: params.mode, reason_class: params.reasonClass }, params.count);
    },
    recordSearch(params) {
      searchDuration?.observe({ mode: params.mode, outcome: params.outcome }, params.durationMs);
    },
    recordPrimarySelected(params) {
      primarySelected?.inc(params);
    },
    recordEmptyResult(params) {
      emptyResults?.inc(params);
    },
  };
}
