import { describe, it, expect, vi, beforeEach } from 'vitest';
import { healthStatusSchema } from '@trapmap/contracts';
import { HealthController } from './health.controller.js';
import { LifecycleManagerService } from '../lifecycle/lifecycle-manager.service.js';
import { register } from 'prom-client';

function createMockPrometheusService() {
  return {
    getMetrics: vi.fn().mockResolvedValue('# HELP trapmap_test\n'),
  } as any;
}

function createMockConfig(values: Record<string, string> = {}) {
  return {
    get: (key: string, defaultValue?: string) => values[key] ?? defaultValue,
  } as any;
}

describe('HealthController', () => {
  let controller: HealthController;
  let lifecycle: LifecycleManagerService;

  beforeEach(() => {
    register.clear();
    lifecycle = new LifecycleManagerService();
    controller = new HealthController(
      createMockPrometheusService(),
      lifecycle,
      createMockConfig({
        TRAPMAP_DEPLOYMENT_PROFILE: 'local-agent',
        TRAPMAP_DEPLOYMENT_PRESET: 'monolith',
      }),
    );
  });

  it('should return contract-shaped HealthStatus', async () => {
    const result = await controller.health();

    const parsed = healthStatusSchema.safeParse(result);
    expect(parsed.success).toBe(true);

    expect(result.status).toBe('ok');
    expect(result.readiness).toBe('ready');
    expect(result.liveness).toBe('alive');
    expect(result.dependencies).toEqual([]);
    expect(result.deployment).toEqual({
      profile: 'local-agent',
      preset: 'monolith',
    });
    expect(result.startedAt).toBeDefined();
    expect(result.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should include registered health check dependencies', async () => {
    lifecycle.registerHealthCheck({
      name: 'database',
      check: async () => ({
        name: 'database',
        status: 'healthy',
        latencyMs: 3,
      }),
    });

    lifecycle.registerHealthCheck({
      name: 'cache',
      check: async () => ({
        name: 'cache',
        status: 'degraded',
        latencyMs: 200,
        message: 'Slow response',
      }),
    });

    const result = await controller.health();

    expect(result.dependencies).toHaveLength(2);
    expect(result.dependencies[0].name).toBe('database');
    expect(result.dependencies[0].status).toBe('healthy');
    expect(result.dependencies[0].latencyMs).toBe(3);
    expect(result.dependencies[1].name).toBe('cache');
    expect(result.dependencies[1].status).toBe('degraded');
    expect(result.dependencies[1].message).toBe('Slow response');
  });

  it('should be unhealthy when any dependency is unhealthy', async () => {
    lifecycle.registerHealthCheck({
      name: 'database',
      check: async () => ({
        name: 'database',
        status: 'unhealthy',
        message: 'Connection refused',
      }),
    });

    const result = await controller.health();

    expect(result.status).toBe('unhealthy');
  });

  it('should be degraded when any dependency is degraded', async () => {
    lifecycle.registerHealthCheck({
      name: 'cache',
      check: async () => ({
        name: 'cache',
        status: 'degraded',
      }),
    });

    const result = await controller.health();

    expect(result.status).toBe('degraded');
  });

  it('should include lastChecked timestamp on dependencies', async () => {
    lifecycle.registerHealthCheck({
      name: 'test-check',
      check: async () => ({
        name: 'test-check',
        status: 'healthy',
      }),
    });

    const result = await controller.health();
    const dep = result.dependencies[0];

    expect(dep.lastChecked).toBeDefined();
    expect(new Date(dep.lastChecked!).toISOString()).toBe(dep.lastChecked);
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
