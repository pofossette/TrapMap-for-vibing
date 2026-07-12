import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Counter, Gauge, Histogram, register, collectDefaultMetrics } from 'prom-client';
import { normalizeObservabilityRouteFamily } from '@trapmap/contracts';

@Injectable()
export class PrometheusService {
  private readonly logger = new Logger(PrometheusService.name);

  readonly httpRequestsTotal: Counter;
  readonly httpRequestDuration: Histogram;
  readonly activeConnections: Gauge;

  constructor(private readonly config: ConfigService) {
    const enabled = this.config.get<string>('TRAPMAP_METRICS_ENABLED', 'true');
    if (enabled !== 'true') {
      this.logger.warn('Prometheus metrics collection disabled');
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
    this.httpRequestsTotal.inc({
      method: method.toUpperCase(),
      route_family: normalizeObservabilityRouteFamily(route),
      status_class: `${statusCode.slice(0, 1)}xx`,
    });
  }

  observeDuration(method: string, route: string, duration: number) {
    this.httpRequestDuration.observe(
      {
        method: method.toUpperCase(),
        route_family: normalizeObservabilityRouteFamily(route),
        status_class: '2xx',
      },
      duration,
    );
  }

  incrementConnections() {
    this.activeConnections.inc();
  }

  decrementConnections() {
    this.activeConnections.dec();
  }

  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  getContentType(): string {
    return register.contentType;
  }
}
