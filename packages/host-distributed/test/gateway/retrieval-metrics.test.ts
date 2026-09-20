import { describe, expect, it } from 'vitest';

import {
  createRetrievalOtelMetrics,
  getDistributedInternalObservabilitySnapshot,
  resetDistributedInternalObservability,
} from '../../src/gateway/internal-observability.js';

describe('distributed retrieval metrics', () => {
  it('exports the retrieval families through the shared OTel registry', async () => {
    resetDistributedInternalObservability();
    const metrics = createRetrievalOtelMetrics();

    metrics.recordSearch({
      endpoint: 'v1-search',
      mode: 'hybrid',
      outcome: 'ok',
      durationMs: 12,
      resultCount: 3,
    });
    metrics.recordStage({ endpoint: 'v1-search', stage: 'recall', durationMs: 8 });
    metrics.recordChannel({ endpoint: 'v1-search', channel: 'semantic', durationMs: 7 });

    const snapshot = await getDistributedInternalObservabilitySnapshot();
    expect(snapshot.counters.trapmap_retrieval_search_total?.[0]).toMatchObject({
      value: 1,
      labels: expect.objectContaining({ endpoint: 'v1-search', outcome: 'ok' }),
    });
    expect(snapshot.histograms.trapmap_retrieval_search_duration_ms?.[0]).toMatchObject({
      sum: 12,
      count: 1,
    });
    expect(snapshot.histograms.trapmap_retrieval_stage_duration_ms?.[0]).toMatchObject({
      sum: 8,
      count: 1,
    });
    expect(snapshot.histograms.trapmap_retrieval_channel_duration_ms?.[0]).toMatchObject({
      sum: 7,
      count: 1,
    });
  });

  it('counts degraded fallbacks per endpoint and reason', async () => {
    // The distributed host must expose the same degraded signal as the
    // Prometheus host, otherwise a silently failing DB branch is visible in
    // one deployment profile and invisible in the other.
    resetDistributedInternalObservability();
    const metrics = createRetrievalOtelMetrics();

    metrics.recordDegraded({ endpoint: 'v1-search', reason: 'db-search-failed' });
    metrics.recordDegraded({ endpoint: 'v1-search', reason: 'db-search-failed' });
    metrics.recordDegraded({ endpoint: 'v2-capsule', reason: 'db-vector-search-failed' });

    const snapshot = await getDistributedInternalObservabilitySnapshot();
    const samples = snapshot.counters.trapmap_retrieval_degraded_total ?? [];
    expect(samples).toHaveLength(2);
    expect(samples.find((sample) => sample.labels.reason === 'db-search-failed')).toMatchObject({
      value: 2,
      labels: { endpoint: 'v1-search' },
    });
    expect(
      samples.find((sample) => sample.labels.reason === 'db-vector-search-failed'),
    ).toMatchObject({ value: 1, labels: { endpoint: 'v2-capsule' } });
  });
});
