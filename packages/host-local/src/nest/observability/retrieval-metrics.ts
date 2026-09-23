import type { RetrievalMetricsPort } from '@trapmap/backend-core';
import { Counter, Histogram, register } from 'prom-client';

/**
 * Prometheus implementation of {@link RetrievalMetricsPort}.
 *
 * Mirrors `experience-gene-metrics.ts`: metric constructors are idempotent via
 * `register.getSingleMetric` so Nest hot-reload and repeated composition do not
 * throw on duplicate registration.
 *
 * Units are milliseconds, matching the Experience Gene and Go knowledge-read
 * metric families (the HTTP histogram is the only seconds-based one).
 */

/** Buckets tuned for in-memory recall up to PG + embedding round trips. */
const RETRIEVAL_DURATION_BUCKETS = [5, 10, 25, 50, 100, 200, 400, 800, 1600, 3200];

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

export function createPrometheusRetrievalMetrics(): RetrievalMetricsPort {
  const searchDuration = histogram({
    name: 'trapmap_retrieval_search_duration_ms',
    help: 'Retrieval request duration in milliseconds by endpoint',
    labelNames: ['endpoint', 'mode', 'outcome'] as const,
    buckets: RETRIEVAL_DURATION_BUCKETS,
  });
  const stageDuration = histogram({
    name: 'trapmap_retrieval_stage_duration_ms',
    help: 'Retrieval pipeline stage duration in milliseconds',
    labelNames: ['endpoint', 'stage'] as const,
    buckets: RETRIEVAL_DURATION_BUCKETS,
  });
  const channelDuration = histogram({
    name: 'trapmap_retrieval_channel_duration_ms',
    help: 'Retrieval recall-channel duration in milliseconds',
    labelNames: ['endpoint', 'channel'] as const,
    buckets: RETRIEVAL_DURATION_BUCKETS,
  });
  const searchTotal = counter({
    name: 'trapmap_retrieval_search_total',
    help: 'Retrieval requests by endpoint and outcome',
    labelNames: ['endpoint', 'outcome'] as const,
  });
  const degradedTotal = counter({
    name: 'trapmap_retrieval_degraded_total',
    help: 'Retrieval requests served by a fallback path instead of the primary one',
    labelNames: ['endpoint', 'reason'] as const,
  });

  return {
    recordSearch(params) {
      searchDuration?.observe(
        {
          endpoint: params.endpoint,
          mode: params.mode,
          outcome: params.outcome,
        },
        params.durationMs,
      );
      searchTotal?.inc({ endpoint: params.endpoint, outcome: params.outcome });
    },
    recordStage(params) {
      stageDuration?.observe({ endpoint: params.endpoint, stage: params.stage }, params.durationMs);
    },
    recordChannel(params) {
      channelDuration?.observe(
        { endpoint: params.endpoint, channel: params.channel },
        params.durationMs,
      );
    },
    recordDegraded(params) {
      degradedTotal?.inc({ endpoint: params.endpoint, reason: params.reason });
    },
  };
}
