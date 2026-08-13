import { Injectable, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { normalizeObservabilityRouteFamily } from '@trapmap/contracts';
import { Counter, Gauge, Histogram, collectDefaultMetrics, register } from 'prom-client';

/**
 * Prometheus metrics service for host-local.
 *
 * When `TRAPMAP_METRICS_ENABLED` is not `true`, metric registration is skipped
 * entirely, all mutation methods become no-ops, and {@link getMetrics} returns
 * an empty string.  This prevents the `/metrics` endpoint from exposing
 * default-only or stale signals in disabled mode.
 */
@Injectable()
export class PrometheusService {
  private readonly logger = new Logger(PrometheusService.name);

  /** Whether metric registration was performed. */
  readonly enabled: boolean;

  readonly httpRequestsTotal: Counter | null;
  readonly httpRequestDuration: Histogram | null;
  readonly activeConnections: Gauge | null;

  constructor(private readonly config: ConfigService) {
    const raw = this.config.get<string>('TRAPMAP_METRICS_ENABLED', 'true');
    this.enabled = raw === 'true';

    if (!this.enabled) {
      this.logger.warn('Prometheus metrics collection disabled');
      this.httpRequestsTotal = null;
      this.httpRequestDuration = null;
      this.activeConnections = null;
      return;
    }

    collectDefaultMetrics({ prefix: 'trapmap_' });

    this.httpRequestsTotal = new Counter({
      name: 'trapmap_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route_family', 'status_class'] as const,
    });

    this.httpRequestDuration = new Histogram({
      name: 'trapmap_http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route_family', 'status_class'] as const,
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    });

    this.activeConnections = new Gauge({
      name: 'trapmap_active_connections',
      help: 'Number of active connections',
    });

    this.logger.log('Prometheus metrics initialized');
  }

  incrementRequests(method: string, route: string, statusCode: string) {
    if (!this.httpRequestsTotal) return;
    this.httpRequestsTotal.inc({
      method: method.toUpperCase(),
      route_family: normalizeObservabilityRouteFamily(route),
      status_class: `${statusCode.slice(0, 1)}xx`,
    });
  }

  /**
   * Observe request duration using the **actual** status code, not a
   * hard-coded `2xx`.  The status class is derived from the first digit
   * of the status code string (e.g. `"422"` -> `"4xx"`).
   */
  observeDuration(method: string, route: string, statusCode: string, duration: number) {
    if (!this.httpRequestDuration) return;
    this.httpRequestDuration.observe(
      {
        method: method.toUpperCase(),
        route_family: normalizeObservabilityRouteFamily(route),
        status_class: `${statusCode.slice(0, 1)}xx`,
      },
      duration,
    );
  }

  incrementConnections() {
    if (!this.activeConnections) return;
    this.activeConnections.inc();
  }

  decrementConnections() {
    if (!this.activeConnections) return;
    this.activeConnections.dec();
  }

  /**
   * Render all registered metrics in Prometheus text exposition format.
   * Returns an empty string when metrics are disabled so that the
   * `/metrics` endpoint can guard on {@link enabled} before exposing.
   */
  async getMetrics(): Promise<string> {
    if (!this.enabled) return '';
    return register.metrics();
  }

  getContentType(): string {
    return register.contentType;
  }
}
