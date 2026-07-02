/**
 * MetricsPort adapter that bridges the shared telemetry port interface
 * to the server's existing in-memory Prometheus-style metric stores.
 */

import {
  incrementMetric,
  observeHistogramMetric,
  renderPrometheusMetrics,
  setGaugeMetric,
} from './metrics.js';
import type { MetricsPort } from './telemetry-ports.js';

export function createMetricsPortAdapter(): MetricsPort {
  return {
    incrementCounter(name: string, labels?: Record<string, string>, value?: number): void {
      incrementMetric(name, labels ?? {}, value ?? 1);
    },

    setGauge(name: string, value: number, labels?: Record<string, string>): void {
      setGaugeMetric(name, labels ?? {}, value);
    },

    observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
      observeHistogramMetric(name, labels ?? {}, value);
    },

    async renderMetrics(): Promise<string> {
      return renderPrometheusMetrics();
    },
  };
}
