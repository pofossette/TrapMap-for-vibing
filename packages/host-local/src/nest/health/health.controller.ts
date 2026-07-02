import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HealthStatus } from '@trapmap/contracts';
import type { HealthCheckResult } from '@trapmap/backend-core';
import { PrometheusService } from '../observability/prometheus.service.js';
import { LifecycleManagerService } from '../lifecycle/lifecycle-manager.service.js';

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
    private readonly prometheus: PrometheusService,
    private readonly lifecycle: LifecycleManagerService,
    private readonly config: ConfigService,
  ) {}

  @Get('health')
  async health(): Promise<HealthStatus> {
    const dependencies = await this.mapDependencies(
      await this.lifecycle.runHealthChecks(),
    );

    const profile = this.config.get<string>(
      'TRAPMAP_DEPLOYMENT_PROFILE',
      'local-agent',
    );
    const preset = this.config.get<string>(
      'TRAPMAP_DEPLOYMENT_PRESET',
      undefined,
    );

    const hasUnhealthy = dependencies.some((d) => d.status === 'unhealthy');
    const hasDegraded = dependencies.some((d) => d.status === 'degraded');
    const status: HealthStatus['status'] = hasUnhealthy
      ? 'unhealthy'
      : hasDegraded
        ? 'degraded'
        : 'ok';

    return {
      status,
      timestamp: new Date().toISOString(),
      startedAt: this.startedAt,
      uptime: process.uptime(),
      readiness: 'ready',
      liveness: 'alive',
      dependencies,
      deployment: {
        profile,
        ...(preset ? { preset } : {}),
      },
    };
  }

  @Get('ready')
  async ready() {
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

  // ─── private helpers ─────────────────────────────────────────────

  /**
   * Map HealthCheckResult[] from the lifecycle manager to the
   * DependencyStatus[] shape expected by the health contract.
   */
  private mapDependencies(
    results: HealthCheckResult[],
  ): HealthStatus['dependencies'] {
    return results.map((r) => ({
      name: r.name,
      status: r.status === 'unknown' ? ('unknown' as const) : r.status,
      ...(r.latencyMs !== undefined ? { latencyMs: r.latencyMs } : {}),
      ...(r.message ? { message: r.message } : {}),
      lastChecked: new Date().toISOString(),
    }));
  }
}

