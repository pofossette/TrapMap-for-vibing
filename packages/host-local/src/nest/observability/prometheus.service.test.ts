import type { ConfigService } from '@nestjs/config';
import { register } from 'prom-client';
import { beforeEach, describe, expect, it } from 'vitest';
import { PrometheusService } from './prometheus.service.js';

function createMockConfig(values: Record<string, string> = {}) {
  return {
    get: (key: string, defaultValue?: string) => values[key] ?? defaultValue,
  } as ConfigService;
}

describe('PrometheusService', () => {
  beforeEach(() => {
    register.clear();
  });

  describe('enabled mode (default)', () => {
    it('should initialize with default metrics', () => {
      const service = new PrometheusService(createMockConfig());

      expect(service.enabled).toBe(true);
      expect(service.httpRequestsTotal).toBeDefined();
      expect(service.httpRequestDuration).toBeDefined();
      expect(service.activeConnections).toBeDefined();
    });

    it('should increment request counter', async () => {
      const service = new PrometheusService(createMockConfig());

      service.incrementRequests('GET', '/v1/knowledge/entry-123', '200');
      service.incrementRequests('GET', '/v1/knowledge/entry-123', '200');

      const metrics = await service.getMetrics();
      expect(metrics).toContain('trapmap_http_requests_total');
      expect(metrics).toContain('route_family="gateway"');
      expect(metrics).toContain('status_class="2xx"');
      expect(metrics).not.toContain('entry-123');
    });

    it('should observe request duration with actual status code', async () => {
      const service = new PrometheusService(createMockConfig());

      service.observeDuration('GET', '/health', '200', 0.15);
      service.observeDuration('POST', '/v1/candidates', '422', 0.05);
      service.observeDuration('GET', '/v1/knowledge', '500', 2.5);

      const metrics = await service.getMetrics();
      expect(metrics).toContain('trapmap_http_request_duration_seconds');
      expect(metrics).toContain('status_class="2xx"');
      expect(metrics).toContain('status_class="4xx"');
      expect(metrics).toContain('status_class="5xx"');
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

    it('should normalize routes to route families', async () => {
      const service = new PrometheusService(createMockConfig());

      service.incrementRequests('GET', '/v1/traps', '200');
      service.incrementRequests('POST', '/v1/operations/reindex', '200');
      service.incrementRequests('GET', '/health', '200');

      const metrics = await service.getMetrics();
      expect(metrics).toContain('route_family="gateway"');
      expect(metrics).toContain('route_family="operator"');
      expect(metrics).toContain('route_family="runtime"');
    });
  });

  describe('disabled mode', () => {
    it('should skip metric registration when TRAPMAP_METRICS_ENABLED=false', () => {
      const service = new PrometheusService(createMockConfig({ TRAPMAP_METRICS_ENABLED: 'false' }));

      expect(service.enabled).toBe(false);
      expect(service.httpRequestsTotal).toBeNull();
      expect(service.httpRequestDuration).toBeNull();
      expect(service.activeConnections).toBeNull();
    });

    it('should return empty string from getMetrics when disabled', async () => {
      const service = new PrometheusService(createMockConfig({ TRAPMAP_METRICS_ENABLED: 'false' }));

      const metrics = await service.getMetrics();
      expect(metrics).toBe('');
    });

    it('should no-op incrementRequests when disabled', () => {
      const service = new PrometheusService(createMockConfig({ TRAPMAP_METRICS_ENABLED: 'false' }));

      // Should not throw
      service.incrementRequests('GET', '/v1/traps', '200');
      service.incrementRequests('POST', '/v1/candidates', '422');
    });

    it('should no-op observeDuration when disabled', () => {
      const service = new PrometheusService(createMockConfig({ TRAPMAP_METRICS_ENABLED: 'false' }));

      // Should not throw
      service.observeDuration('GET', '/health', '200', 0.15);
    });

    it('should no-op connection tracking when disabled', () => {
      const service = new PrometheusService(createMockConfig({ TRAPMAP_METRICS_ENABLED: 'false' }));

      // Should not throw
      service.incrementConnections();
      service.decrementConnections();
    });

    it('should not include real metric signals when disabled', async () => {
      const enabledService = new PrometheusService(createMockConfig());
      enabledService.incrementRequests('GET', '/v1/traps', '200');

      const disabledService = new PrometheusService(
        createMockConfig({ TRAPMAP_METRICS_ENABLED: 'false' }),
      );
      const disabledMetrics = await disabledService.getMetrics();

      // Disabled mode should not expose any trapmap signals
      expect(disabledMetrics).not.toContain('trapmap_http_requests_total');
    });
  });
});
