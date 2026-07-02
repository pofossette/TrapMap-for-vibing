import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { PrometheusService } from './prometheus.service.js';
import { register } from 'prom-client';

function createMockConfig(values: Record<string, string> = {}) {
  return {
    get: (key: string, defaultValue?: string) => values[key] ?? defaultValue,
  } as unknown as ConfigService;
}

describe('PrometheusService', () => {
  beforeEach(() => {
    register.clear();
  });

  it('should initialize with default metrics', () => {
    const service = new PrometheusService(createMockConfig());

    expect(service.httpRequestsTotal).toBeDefined();
    expect(service.httpRequestDuration).toBeDefined();
    expect(service.activeConnections).toBeDefined();
  });

  it('should increment request counter', async () => {
    const service = new PrometheusService(createMockConfig());

    service.incrementRequests('GET', '/health', '200');
    service.incrementRequests('GET', '/health', '200');

    const metrics = await service.getMetrics();
    expect(metrics).toContain('trapmap_http_requests_total');
  });

  it('should observe request duration', async () => {
    const service = new PrometheusService(createMockConfig());

    service.observeDuration('GET', '/health', 0.15);

    const metrics = await service.getMetrics();
    expect(metrics).toContain('trapmap_http_request_duration_seconds');
  });

  it('should track active connections', async () => {
    const service = new PrometheusService(createMockConfig());

    service.incrementConnections();
    service.incrementConnections();
    service.decrementConnections();

    const metrics = await service.getMetrics();
    expect(metrics).toContain('trapmap_active_connections');
  });

  it('should return content type', () => {
    const service = new PrometheusService(createMockConfig());
    expect(service.getContentType()).toBe('text/plain; version=0.0.4; charset=utf-8');
  });
});
