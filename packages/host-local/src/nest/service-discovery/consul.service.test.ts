import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConsulService } from './consul.service.js';
import { LifecycleManagerService } from '../lifecycle/lifecycle-manager.service.js';
import type { ServiceRegistration } from '@trapmap/backend-core';

// ─── Mock Consul ────────────────────────────────────────────────────────

function createMockConsul(opts?: { failHealth?: boolean; failKV?: boolean; failRegister?: boolean }) {
  const failHealth = opts?.failHealth ?? false;
  const failKV = opts?.failKV ?? false;
  const failRegister = opts?.failRegister ?? false;

  return {
    health: {
      service: vi.fn().mockImplementation(async () => {
        if (failHealth) throw new Error('connection refused');
        return [];
      }),
    },
    agent: {
      service: {
        register: vi.fn().mockImplementation(async () => {
          if (failRegister) throw new Error('connection refused');
        }),
        deregister: vi.fn().mockResolvedValue(undefined),
      },
    },
    kv: {
      get: vi.fn().mockImplementation(async () => {
        if (failKV) throw new Error('connection refused');
        return { Value: 'test-value' };
      }),
      set: vi.fn().mockImplementation(async () => {
        if (failKV) throw new Error('connection refused');
      }),
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────

function createConfigService(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    CONSUL_ENABLED: 'true',
    CONSUL_HOST: 'localhost',
    CONSUL_PORT: '8500',
    CONSUL_AUTO_REGISTER: 'false',
    SERVICE_NAME: 'trapmap',
    SERVICE_HOST: 'localhost',
    PORT: '4000',
    INSTANCE_ID: 'test-1',
    npm_package_version: '0.0.1-test',
    NODE_ENV: 'test',
  };
  const merged = { ...defaults, ...overrides };
  return {
    get: vi.fn((key: string, fallback?: string) => merged[key] ?? fallback ?? undefined),
  };
}

// We need to replace the Consul constructor in the module scope.
// Since ConsulService imports `Consul from 'consul'`, we intercept
// it at runtime via the mock.
let lastMockConsul: ReturnType<typeof createMockConsul>;

vi.mock('consul', () => {
  return {
    default: vi.fn().mockImplementation(() => lastMockConsul),
  };
});

const ConsulMock = (await import('consul')).default as unknown as ReturnType<typeof vi.fn>;

function createService(configOverrides: Record<string, string> = {}) {
  const config = createConfigService(configOverrides);
  const lifecycleManager = new LifecycleManagerService();
  const service = new ConsulService(config as any, lifecycleManager);
  return { service, config, lifecycleManager };
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('ConsulService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('consulEnabled=false', () => {
    it('should skip initialization entirely when consul is disabled', async () => {
      lastMockConsul = createMockConsul();
      const { service, lifecycleManager } = createService({ CONSUL_ENABLED: 'false' });

      await service.onModuleInit();

      expect(service.isAvailable()).toBe(false);
      // Should not have attempted to create a Consul client for service calls
      // The health check should still be registered
      const results = await lifecycleManager.runHealthChecks();
      const consulResult = results.find((r) => r.name === 'consul');
      expect(consulResult).toBeDefined();
      expect(consulResult!.status).toBe('healthy');
      expect(consulResult!.message).toBe('Consul integration disabled');
    });

    it('discover returns empty array when disabled', async () => {
      lastMockConsul = createMockConsul();
      const { service } = createService({ CONSUL_ENABLED: 'false' });
      await service.onModuleInit();

      const result = await service.discover('trapmap');
      expect(result).toEqual([]);
    });

    it('register is no-op when disabled', async () => {
      lastMockConsul = createMockConsul();
      const { service } = createService({ CONSUL_ENABLED: 'false' });
      await service.onModuleInit();

      await service.register({
        id: 'test',
        name: 'test',
        address: 'localhost',
        port: 4000,
      });

      // Consul agent.service.register should never have been called
      expect(lastMockConsul.agent.service.register).not.toHaveBeenCalled();
    });
  });

  describe('Consul unavailable on init', () => {
    it('should enter degraded mode when Consul connection fails', async () => {
      lastMockConsul = createMockConsul({ failHealth: true });
      const { service, lifecycleManager } = createService();

      // Must not throw — the app should start
      await service.onModuleInit();

      expect(service.isAvailable()).toBe(false);

      // Health check should report unhealthy
      const results = await lifecycleManager.runHealthChecks();
      const consulResult = results.find((r) => r.name === 'consul');
      expect(consulResult!.status).toBe('unhealthy');
      expect(consulResult!.message).toBe('Consul is not reachable');
    });

    it('should not attempt auto-registration when Consul is unreachable', async () => {
      lastMockConsul = createMockConsul({ failHealth: true });
      const { service } = createService({ CONSUL_AUTO_REGISTER: 'true' });

      await service.onModuleInit();

      expect(lastMockConsul.agent.service.register).not.toHaveBeenCalled();
    });
  });

  describe('graceful degradation (all methods)', () => {
    async function initDegraded() {
      lastMockConsul = createMockConsul({ failHealth: true });
      const svc = createService();
      await svc.service.onModuleInit();
      return svc.service;
    }

    it('discover returns empty array in degraded mode', async () => {
      const service = await initDegraded();
      const result = await service.discover('trapmap');
      expect(result).toEqual([]);
    });

    it('getKV returns undefined in degraded mode', async () => {
      const service = await initDegraded();
      const result = await service.getKV('my-key');
      expect(result).toBeUndefined();
    });

    it('setKV is a no-op in degraded mode', async () => {
      const service = await initDegraded();
      // Should not throw
      await service.setKV('my-key', 'my-value');
      expect(lastMockConsul.kv.set).not.toHaveBeenCalled();
    });

    it('register is a no-op in degraded mode', async () => {
      const service = await initDegraded();
      const reg: ServiceRegistration = {
        id: 'svc-1',
        name: 'my-svc',
        address: '10.0.0.1',
        port: 8080,
      };
      await service.register(reg);
      expect(lastMockConsul.agent.service.register).not.toHaveBeenCalled();
    });

    it('deregister is a no-op in degraded mode', async () => {
      const service = await initDegraded();
      await service.deregister('svc-1');
      expect(lastMockConsul.agent.service.deregister).not.toHaveBeenCalled();
    });
  });

  describe('runtime failures (Consul goes down after init)', () => {
    it('should switch to degraded mode when discover fails at runtime', async () => {
      lastMockConsul = createMockConsul();
      const { service } = createService();
      await service.onModuleInit();
      expect(service.isAvailable()).toBe(true);

      // Now make consul fail
      lastMockConsul.health.service.mockRejectedValue(new Error('connection lost'));

      const result = await service.discover('trapmap');
      expect(result).toEqual([]);
      expect(service.isAvailable()).toBe(false);
    });

    it('should switch to degraded mode when getKV fails at runtime', async () => {
      lastMockConsul = createMockConsul();
      const { service } = createService();
      await service.onModuleInit();

      lastMockConsul.kv.get.mockRejectedValue(new Error('connection lost'));

      const result = await service.getKV('key');
      expect(result).toBeUndefined();
      expect(service.isAvailable()).toBe(false);
    });

    it('should switch to degraded mode when setKV fails at runtime', async () => {
      lastMockConsul = createMockConsul();
      const { service } = createService();
      await service.onModuleInit();

      lastMockConsul.kv.set.mockRejectedValue(new Error('connection lost'));

      await service.setKV('key', 'value');
      expect(service.isAvailable()).toBe(false);
    });

    it('should switch to degraded mode when register fails at runtime', async () => {
      lastMockConsul = createMockConsul({ failRegister: false });
      const { service } = createService({ CONSUL_AUTO_REGISTER: 'false' });
      await service.onModuleInit();
      expect(service.isAvailable()).toBe(true);

      // Make future register calls fail
      lastMockConsul.agent.service.register.mockRejectedValue(
        new Error('connection lost'),
      );

      await service.register({
        id: 'svc-1',
        name: 'my-svc',
        address: '10.0.0.1',
        port: 8080,
      });
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('successful operations', () => {
    it('should remain available when all operations succeed', async () => {
      lastMockConsul = createMockConsul();
      const { service } = createService();
      await service.onModuleInit();

      expect(service.isAvailable()).toBe(true);

      await service.register({
        id: 'svc-1',
        name: 'my-svc',
        address: '10.0.0.1',
        port: 8080,
      });
      expect(service.isAvailable()).toBe(true);

      const results = await service.discover('my-svc');
      expect(results).toEqual([]);
      expect(service.isAvailable()).toBe(true);

      const val = await service.getKV('key');
      expect(val).toBe('test-value');
      expect(service.isAvailable()).toBe(true);

      await service.setKV('key', 'value');
      expect(service.isAvailable()).toBe(true);
    });
  });

  describe('health check integration', () => {
    it('should report healthy when Consul is connected', async () => {
      lastMockConsul = createMockConsul();
      const { service, lifecycleManager } = createService();
      await service.onModuleInit();

      const results = await lifecycleManager.runHealthChecks();
      const consulResult = results.find((r) => r.name === 'consul');
      expect(consulResult!.status).toBe('healthy');
    });

    it('should report unhealthy when Consul health check probe fails', async () => {
      // Start with a working consul, then make the health probe fail
      lastMockConsul = createMockConsul();
      const { service, lifecycleManager } = createService();
      await service.onModuleInit();
      expect(service.isAvailable()).toBe(true);

      // Make health probe fail on next call
      lastMockConsul.health.service.mockRejectedValue(new Error('gone'));

      const results = await lifecycleManager.runHealthChecks();
      const consulResult = results.find((r) => r.name === 'consul');
      expect(consulResult!.status).toBe('unhealthy');
      expect(service.isAvailable()).toBe(false);
    });
  });
});
