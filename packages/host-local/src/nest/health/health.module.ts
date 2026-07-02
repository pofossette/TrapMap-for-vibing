import { Module } from '@nestjs/common';
import { PrometheusModule } from '../observability/prometheus.module.js';
import { HealthController } from './health.controller.js';

/**
 * Health check module.
 *
 * Registers /health, /ready, /live, and /metrics endpoints.
 * Depends on PrometheusModule for the /metrics endpoint.
 */
@Module({
  imports: [PrometheusModule],
  controllers: [HealthController],
})
export class HealthModule {}
