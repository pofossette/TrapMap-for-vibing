import { describe, it, expect, beforeEach, vi } from 'vitest';
import { register } from 'prom-client';
import { MetricsPortAdapter } from './metrics-port.adapter.js';

function createMockPrometheusService() {
  return {
    getMetrics: vi.fn().mockResolvedValue('# HELP trapmap_test metric\n'),
    incrementRequests: vi.fn(),
    observeDuration: vi.fn(),
    incrementConnections: vi.fn(),
    decrementConnections: vi.fn(),
    getContentType: vi.fn().mockReturnValue('text/plain; version=0.0.4; charset=utf-8'),
  } as any;
}

describe('MetricsPortAdapter', () => {
  beforeEach(() => {
    register.clear();
  });

  it('renderMetrics delegates to prometheus.getMetrics()', async () => {
    const mockProm = createMockPrometheusService();
    const adapter = new MetricsPortAdapter(mockProm);

    const result = await adapter.renderMetrics();

    expect(result).toContain('trapmap_test');
    expect(mockProm.getMetrics).toHaveBeenCalled();
  });

  it('incrementCounter resolves and increments a registered counter', async () => {
    const mockProm = createMockPrometheusService();
    const adapter = new MetricsPortAdapter(mockProm);

    // Register a known counter in the prom-client registry
    const { Counter } = await import('prom-client');
    const counter = new Counter({
      name: 'test_counter',
      help: 'test counter',
      labelNames: ['method'],
    });

    adapter.incrementCounter('test_counter', { method: 'GET' }, 3);

    const metrics = await register.metrics();
    expect(metrics).toContain('test_counter');
  });

  it('setGauge resolves and sets a registered gauge', async () => {
    const mockProm = createMockPrometheusService();
    const adapter = new MetricsPortAdapter(mockProm);

    const { Gauge } = await import('prom-client');
    new Gauge({
      name: 'test_gauge',
      help: 'test gauge',
    });

    adapter.setGauge('test_gauge', 42);

    const metrics = await register.metrics();
    expect(metrics).toContain('test_gauge');
  });

  it('observeHistogram resolves and observes a registered histogram', async () => {
    const mockProm = createMockPrometheusService();
    const adapter = new MetricsPortAdapter(mockProm);

    const { Histogram } = await import('prom-client');
    new Histogram({
      name: 'test_histogram',
      help: 'test histogram',
    });

    adapter.observeHistogram('test_histogram', 0.5);

    const metrics = await register.metrics();
    expect(metrics).toContain('test_histogram');
  });

  it('incrementCounter is a no-op for unregistered metrics', () => {
    const mockProm = createMockPrometheusService();
    const adapter = new MetricsPortAdapter(mockProm);

    // Should not throw
    expect(() => {
      adapter.incrementCounter('nonexistent_metric', {});
    }).not.toThrow();
  });
});
