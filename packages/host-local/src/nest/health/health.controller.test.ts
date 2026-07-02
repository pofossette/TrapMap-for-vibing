import { describe, it, expect, beforeEach } from 'vitest';
import { HealthController } from './health.controller.js';
import { PrometheusService } from '../observability/prometheus.service.js';
import { ConfigService } from '@nestjs/config';
import { register } from 'prom-client';

function createMockConfig() {
  return {
    get: (key: string, defaultValue?: string) => defaultValue,
  } as unknown as ConfigService;
}

describe('HealthController', () => {
  let controller: HealthController;
  let prometheus: PrometheusService;

  beforeEach(() => {
    register.clear();
    prometheus = new PrometheusService(createMockConfig());
    controller = new HealthController(prometheus);
  });

  it('should return health status', async () => {
    const result = await controller.health();

    expect(result.status).toBe('ok');
    expect(result.timestamp).toBeDefined();
    expect(result.startedAt).toBeDefined();
    expect(result.uptime).toBeDefined();
  });

  it('should return ready status', async () => {
    const result = await controller.ready();

    expect(result.status).toBe('ready');
    expect(result.timestamp).toBeDefined();
  });

  it('should return alive status', async () => {
    const result = await controller.live();

    expect(result.status).toBe('alive');
    expect(result.timestamp).toBeDefined();
  });

  it('should return metrics', async () => {
    const result = await controller.metrics();

    expect(typeof result).toBe('string');
  });
});
