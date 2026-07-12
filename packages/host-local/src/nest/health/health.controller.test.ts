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

function createMockReply() {
  const reply: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      reply.statusCode = code;
      return reply;
    },
    send(data: unknown) {
      reply.body = data;
      return reply;
    },
  };
  return reply;
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

  describe('/health', () => {
    it('should return contract-shaped HealthStatus', async () => {
      const result = await controller.health();

      const parsed = healthStatusSchema.safeParse(result);
      expect(parsed.success).toBe(true);

      expect(result.status).toBe('ok');
      expect(result.readiness).toBe('not-ready');
      expect(result.liveness).toBe('alive');
      expect(result.dependencies).toEqual([]);
      expect(result.deployment).toEqual({
        profile: 'local-agent',
        preset: 'monolith',
      });
      expect(result.startedAt).toBeDefined();
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should report readiness not-ready before onModuleInit', async () => {
      const result = await controller.health();
      expect(result.readiness).toBe('not-ready');
    });

    it('should report readiness ready after onModuleInit with healthy deps', async () => {
      await lifecycle.onModuleInit();
      const result = await controller.health();
      expect(result.readiness).toBe('ready');
    });

    it('should report readiness degraded when lifecycle is ready but deps are unhealthy', async () => {
      await lifecycle.onModuleInit();
      lifecycle.registerHealthCheck({
        name: 'database',
        check: async () => ({
          name: 'database',
          status: 'unhealthy',
          message: 'Connection refused',
        }),
      });

      const result = await controller.health();
      expect(result.readiness).toBe('degraded');
    });

    it('should report readiness degraded when lifecycle is ready but deps are degraded', async () => {
      await lifecycle.onModuleInit();
      lifecycle.registerHealthCheck({
        name: 'cache',
        check: async () => ({
          name: 'cache',
          status: 'degraded',
        }),
      });

      const result = await controller.health();
      expect(result.readiness).toBe('degraded');
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
  });

  describe('/ready', () => {
    it('should return 503 when lifecycle is not ready', async () => {
      const reply = createMockReply();
      await controller.ready(reply);

      expect(reply.statusCode).toBe(503);
      expect(reply.body.status).toBe('not-ready');
      expect(reply.body.timestamp).toBeDefined();
    });

    it('should return 200 with ready when lifecycle is ready and deps are healthy', async () => {
      await lifecycle.onModuleInit();
      const reply = createMockReply();
      await controller.ready(reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.body.status).toBe('ready');
      expect(reply.body.timestamp).toBeDefined();
    });

    it('should return 200 with degraded when lifecycle is ready but deps are degraded', async () => {
      await lifecycle.onModuleInit();
      lifecycle.registerHealthCheck({
        name: 'cache',
        check: async () => ({
          name: 'cache',
          status: 'degraded',
        }),
      });

      const reply = createMockReply();
      await controller.ready(reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.body.status).toBe('degraded');
    });

    it('should return 503 when lifecycle is ready but deps are unhealthy', async () => {
      await lifecycle.onModuleInit();
      lifecycle.registerHealthCheck({
        name: 'database',
        check: async () => ({
          name: 'database',
          status: 'unhealthy',
          message: 'Connection refused',
        }),
      });

      const reply = createMockReply();
      await controller.ready(reply);

      expect(reply.statusCode).toBe(503);
      expect(reply.body.status).toBe('unhealthy');
    });

    it('keeps readiness available when an optional telemetry dependency is unhealthy', async () => {
      await lifecycle.onModuleInit();
      lifecycle.registerHealthCheck({
        name: 'otlp-exporter',
        critical: false,
        check: async () => ({
          name: 'otlp-exporter',
          status: 'unhealthy',
          message: 'Collector unavailable',
        }),
      });

      const reply = createMockReply();
      await controller.ready(reply);
      const health = await controller.health();

      expect(reply.statusCode).toBe(200);
      expect(reply.body.status).toBe('degraded');
      expect(health.status).toBe('unhealthy');
      expect(health.readiness).toBe('degraded');
    });
  });

  describe('/live', () => {
    it('should return alive status', async () => {
      const result = await controller.live();

      expect(result.status).toBe('alive');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('/metrics', () => {
    it('should return metrics', async () => {
      const result = await controller.metrics();

      expect(typeof result).toBe('string');
    });
  });
});
