import { Module } from '@nestjs/common';
import { LifecycleModule } from '../lifecycle/lifecycle.module.js';
import { PrometheusModule } from '../observability/prometheus.module.js';
import { HealthController } from './health.controller.js';

/**
 * Health check module.
 *
 * Registers /health, /ready, /live, and /metrics endpoints.
 * Depends on PrometheusModule for the /metrics endpoint and
 * LifecycleModule for health check aggregation.
 */
@Module({
  imports: [PrometheusModule, LifecycleModule],
  controllers: [HealthController],
})
export class HealthModule {}
