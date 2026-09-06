import { Controller, Get, Header, Inject, Res, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HealthCheckResult } from '@trapmap/backend-core';
import type { HealthStatus } from '@trapmap/contracts';
import type { FastifyReply } from 'fastify';
import { LifecycleManagerService } from '../lifecycle/lifecycle-manager.service.js';
import { PrometheusService } from '../observability/prometheus.service.js';

/**
 * Health check and metrics controller.
 *
 * Provides three probe endpoints (Kubernetes-compatible):
 * - /health  — comprehensive health with dependency status (contract-shaped)
 * - /ready   — readiness probe (are we ready to serve traffic?)
 * - /live    — liveness probe (is the process alive?)
 *
 * Also exposes /metrics for Prometheus scraping.
 */
@Controller()
export class HealthController {
  private readonly startedAt = new Date().toISOString();

  constructor(
    @Inject(PrometheusService) private readonly prometheus: PrometheusService,
    @Inject(LifecycleManagerService) private readonly lifecycle: LifecycleManagerService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  @Get('health')
  async health(): Promise<HealthStatus> {
    const dependencies = await this.mapDependencies(await this.lifecycle.runHealthChecks());

    const profile = this.config.get<string>('TRAPMAP_DEPLOYMENT_PROFILE', 'local-agent');
    const preset = this.config.get<string | undefined>('TRAPMAP_DEPLOYMENT_PRESET');

    const hasUnhealthy = dependencies.some((d) => d.status === 'unhealthy');
    const hasDegraded = dependencies.some((d) => d.status === 'degraded');
    const status: HealthStatus['status'] = hasUnhealthy
      ? 'unhealthy'
      : hasDegraded
        ? 'degraded'
        : 'ok';

    const readiness: HealthStatus['readiness'] = !this.lifecycle.isReady()
      ? 'not-ready'
      : hasUnhealthy || hasDegraded
        ? 'degraded'
        : 'ready';

    return {
      status,
      timestamp: new Date().toISOString(),
      startedAt: this.startedAt,
      uptime: process.uptime(),
      readiness,
      liveness: this.lifecycle.isAlive() ? 'alive' : 'dead',
      dependencies,
      deployment: {
        profile,
        ...(preset ? { preset } : {}),
      },
    };
  }

  @Get('ready')
  async ready(@Res() reply: FastifyReply) {
    const isReady = this.lifecycle.isReady();

    if (!isReady) {
      return reply.status(503).send({
        status: 'not-ready',
        timestamp: new Date().toISOString(),
      });
    }

    const results = await this.lifecycle.runHealthChecks();
    const hasUnhealthy = results.some((r) => r.status === 'unhealthy' && r.critical !== false);
    const hasDegraded = results.some(
      (r) => r.status === 'degraded' || (r.status === 'unhealthy' && r.critical === false),
    );

    if (hasUnhealthy) {
      return reply.status(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
      });
    }

    if (hasDegraded) {
      return reply.status(200).send({
        status: 'degraded',
        timestamp: new Date().toISOString(),
      });
    }

    return reply.status(200).send({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  }

  @Get('live')
  async live() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Expose registered Prometheus metrics for scraping.
   *
   * When `TRAPMAP_METRICS_ENABLED` is `false`, the endpoint returns 503
   * so that scrapers do not ingest an empty or default-only payload.
   */
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metrics() {
    if (!this.prometheus.enabled) {
      throw new ServiceUnavailableException('Metrics collection is disabled');
    }
    return this.prometheus.getMetrics();
  }

  // ─── private helpers ─────────────────────────────────────────────

  /**
   * Map HealthCheckResult[] from the lifecycle manager to the
   * DependencyStatus[] shape expected by the health contract.
   */
  private mapDependencies(results: HealthCheckResult[]): HealthStatus['dependencies'] {
    return results.map((r) => ({
      name: r.name,
      status: r.status === 'unknown' ? ('unknown' as const) : r.status,
      ...(r.critical !== undefined ? { critical: r.critical } : {}),
      ...(r.latencyMs !== undefined ? { latencyMs: r.latencyMs } : {}),
      ...(r.message ? { message: r.message } : {}),
      lastChecked: new Date().toISOString(),
    }));
  }
}
