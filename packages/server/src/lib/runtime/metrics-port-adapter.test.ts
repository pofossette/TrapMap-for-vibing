import { describe, expect, it } from 'vitest';

import { createMetricsPortAdapter } from './metrics-port-adapter.js';
import { renderPrometheusMetrics, resetRuntimeMetrics } from './metrics.js';

describe('MetricsPort adapter', () => {
  it('increments counters that appear in rendered output', async () => {
    resetRuntimeMetrics();

    const metrics = createMetricsPortAdapter();
    metrics.incrementCounter('test_requests_total', { method: 'GET' });
    metrics.incrementCounter('test_requests_total', { method: 'GET' }, 5);

    const output = await metrics.renderMetrics();
    expect(output).toContain('# TYPE test_requests_total counter');
    expect(output).toContain('test_requests_total{method="GET"} 6');
  });

  it('sets gauges that appear in rendered output', async () => {
    resetRuntimeMetrics();

    const metrics = createMetricsPortAdapter();
    metrics.setGauge('test_connections', 42, { pool: 'primary' });

    const output = await metrics.renderMetrics();
    expect(output).toContain('# TYPE test_connections gauge');
    expect(output).toContain('test_connections{pool="primary"} 42');
  });

  it('records histogram observations that appear in rendered output', async () => {
    resetRuntimeMetrics();

    const metrics = createMetricsPortAdapter();
    metrics.observeHistogram('test_latency_ms', 100, { route: '/api' });
    metrics.observeHistogram('test_latency_ms', 300, { route: '/api' });

    const output = await metrics.renderMetrics();
    expect(output).toContain('# TYPE test_latency_ms histogram');
    expect(output).toContain('test_latency_ms_count{route="/api"} 2');
    expect(output).toContain('test_latency_ms_sum{route="/api"} 400');
  });

  it('defaults counter increment to 1 when value is omitted', async () => {
    resetRuntimeMetrics();

    const metrics = createMetricsPortAdapter();
    metrics.incrementCounter('test_default_inc', { env: 'test' });

    const output = await metrics.renderMetrics();
    expect(output).toContain('test_default_inc{env="test"} 1');
  });

  it('uses empty labels when labels argument is omitted', async () => {
    resetRuntimeMetrics();

    const metrics = createMetricsPortAdapter();
    metrics.incrementCounter('test_no_labels');

    const output = await metrics.renderMetrics();
    expect(output).toContain('# TYPE test_no_labels counter');
    expect(output).toContain('test_no_labels 1');
  });

  it('renderPrometheusMetrics still works after adapter operations', async () => {
    resetRuntimeMetrics();

    const metrics = createMetricsPortAdapter();
    metrics.incrementCounter('via_adapter', { source: 'adapter' });

    // Direct call to the underlying render function should see the same data
    const directOutput = renderPrometheusMetrics();
    expect(directOutput).toContain('via_adapter{source="adapter"} 1');
  });
});
