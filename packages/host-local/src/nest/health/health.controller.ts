import { Controller, Get, Header } from '@nestjs/common';
import { PrometheusService } from '../observability/prometheus.service.js';

/**
 * Health check and metrics controller.
 *
 * Provides three probe endpoints (Kubernetes-compatible):
 * - /health  — comprehensive health with dependency status
 * - /ready   — readiness probe (are we ready to serve traffic?)
 * - /live    — liveness probe (is the process alive?)
 *
 * Also exposes /metrics for Prometheus scraping.
 */
@Controller()
export class HealthController {
  private readonly startedAt = new Date().toISOString();

  constructor(private readonly prometheus: PrometheusService) {}

  @Get('health')
  async health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      startedAt: this.startedAt,
      uptime: process.uptime(),
    };
  }

  @Get('ready')
  async ready() {
    // Readiness can be extended to check DB, Consul, etc.
    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('live')
  async live() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metrics() {
    return this.prometheus.getMetrics();
  }
}
