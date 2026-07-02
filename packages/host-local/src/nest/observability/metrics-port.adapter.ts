import { Injectable } from '@nestjs/common';
import type { MetricsPort } from '@trapmap/backend-core';
import { PrometheusService } from './prometheus.service.js';

/**
 * NestJS adapter that implements the shared {@link MetricsPort}
 * by delegating to {@link PrometheusService} (prom-client).
 */
@Injectable()
export class MetricsPortAdapter implements MetricsPort {
  constructor(private readonly prometheus: PrometheusService) {}

  incrementCounter(
    name: string,
    labels?: Record<string, string>,
    value?: number,
  ): void {
    const metric = this.resolveMetric(name);
    if (metric && typeof metric.inc === 'function') {
      metric.inc(labels ?? {}, value ?? 1);
    }
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const metric = this.resolveMetric(name);
    if (metric && typeof metric.set === 'function') {
      metric.set(labels ?? {}, value);
    }
  }

  observeHistogram(
    name: string,
    value: number,
    labels?: Record<string, string>,
  ): void {
    const metric = this.resolveMetric(name);
    if (metric && typeof metric.observe === 'function') {
      metric.observe(labels ?? {}, value);
    }
  }

  async renderMetrics(): Promise<string> {
    return this.prometheus.getMetrics();
  }

  /**
   * Look up a metric by name from the prom-client registry.
   * Returns undefined if the metric is not registered.
   */
  private resolveMetric(name: string): any {
    try {
      // prom-client exposes register.getSingleMetric()
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { register } = require('prom-client');
      return register.getSingleMetric(name);
    } catch {
      return undefined;
    }
  }
}
