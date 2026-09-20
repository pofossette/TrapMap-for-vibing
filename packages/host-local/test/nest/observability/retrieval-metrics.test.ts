import {
  DEAD_RETRIEVAL_LATENCY_ENDPOINTS,
  DEAD_RETRIEVAL_RECALL_CHANNELS,
  LIVE_RETRIEVAL_LATENCY_ENDPOINTS,
  LIVE_RETRIEVAL_RECALL_CHANNELS,
} from '@trapmap/contracts';
import { register } from 'prom-client';
import { beforeEach, describe, expect, it } from 'vitest';

import { createPrometheusRetrievalMetrics } from '../../../src/nest/observability/retrieval-metrics.js';

describe('Prometheus retrieval latency metrics', () => {
  beforeEach(() => {
    register.clear();
  });

  it('emits the three duration families plus the request counter with low-cardinality labels', async () => {
    const metrics = createPrometheusRetrievalMetrics();

    metrics.recordSearch({
      endpoint: 'v1-search',
      mode: 'hybrid',
      outcome: 'ok',
      durationMs: 42,
      resultCount: 7,
    });
    metrics.recordStage({ endpoint: 'v1-search', stage: 'recall', durationMs: 30 });
    metrics.recordChannel({ endpoint: 'v1-search', channel: 'semantic', durationMs: 28 });

    const output = await register.metrics();
    expect(output).toContain('trapmap_retrieval_search_duration_ms_count');
    expect(output).toContain('trapmap_retrieval_stage_duration_ms_count');
    expect(output).toContain('trapmap_retrieval_channel_duration_ms_count');
    expect(output).toContain('trapmap_retrieval_search_total');
    expect(output).toContain('endpoint="v1-search"');
    expect(output).toContain('stage="recall"');
    expect(output).toContain('channel="semantic"');
    expect(output).toContain('outcome="ok"');
  });

  it('keeps the live/dead split in the shared contract, not in the metric layer', async () => {
    // All four surfaces and all four channels are live since 2026-09-19 (v2
    // capsule pipeline + v3 graph-assisted). The invariant lives in the
    // contract so dashboards, alerts and the eval gate read one list; this test
    // fails loudly if a surface silently loses its implementation.
    expect(LIVE_RETRIEVAL_LATENCY_ENDPOINTS).toEqual([
      'v1-search',
      'v1-skills',
      'v2-capsule',
      'v3-graph-plan',
    ]);
    expect(LIVE_RETRIEVAL_RECALL_CHANNELS).toEqual(['keyword', 'semantic', 'graph', 'heuristic']);
    expect(DEAD_RETRIEVAL_LATENCY_ENDPOINTS).toEqual([]);
    expect(DEAD_RETRIEVAL_RECALL_CHANNELS).toEqual([]);
  });

  it('survives repeated composition after a registry reset', async () => {
    createPrometheusRetrievalMetrics().recordSearch({
      endpoint: 'v3-graph-plan',
      mode: 'graph-assisted',
      outcome: 'empty',
      durationMs: 5,
      resultCount: 0,
    });
    register.clear();

    expect(() =>
      createPrometheusRetrievalMetrics().recordStage({
        endpoint: 'v1-skills',
        stage: 'snapshot',
        durationMs: 2,
      }),
    ).not.toThrow();
  });
});
