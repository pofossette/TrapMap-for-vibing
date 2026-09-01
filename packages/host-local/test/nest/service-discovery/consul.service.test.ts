import type { ConfigService } from '@nestjs/config';
import type { ServiceRegistration } from '@trapmap/backend-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LifecycleManagerService } from '../../../src/nest/lifecycle/lifecycle-manager.service.js';
import { ConsulService } from '../../../src/nest/service-discovery/consul.service.js';

// ─── Mock globalThis.fetch for the shared ConsulHttpAdapter ───────────

interface MockFetchOptions {
  failHealth?: boolean;
  failKV?: boolean;
  failRegister?: boolean;
  kvValue?: string;
}

const originalFetch = globalThis.fetch;

function installMockFetch(opts: MockFetchOptions = {}) {
  const { failHealth = false, failKV = false, failRegister = false, kvValue = 'test-value' } = opts;

  const healthService = vi.fn().mockImplementation(async () => {
    if (failHealth) throw new Error('connection refused');
    return new Response(JSON.stringify([]), { status: 200 });
  });

  const register = vi.fn().mockImplementation(async () => {
    if (failRegister) throw new Error('connection refused');
    return new Response('', { status: 200 });
  });

  const deregister = vi.fn().mockResolvedValue(new Response('', { status: 200 }));

  const kvGet = vi.fn().mockImplementation(async () => {
    if (failKV) throw new Error('connection refused');
    return new Response(kvValue, { status: 200 });
  });

  const kvSet = vi.fn().mockImplementation(async () => {
    if (failKV) throw new Error('connection refused');
    return new Response('', { status: 200 });
  });

  globalThis.fetch = vi
    .fn()
    .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/v1/health/service/')) {
        return healthService();
      }
      if (url.includes('/v1/agent/service/register')) {
        return register();
      }
      if (url.includes('/v1/agent/service/deregister/')) {
        return deregister();
      }
      if (url.includes('/v1/kv/') && method === 'PUT') {
        return kvSet();
      }
      if (url.includes('/v1/kv/')) {
        return kvGet();
      }
      return new Response('Not Found', { status: 404 });
    }) as typeof fetch;

  return { healthService, register, deregister, kvGet, kvSet };
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

function createService(configOverrides: Record<string, string> = {}) {
  const config = createConfigService(configOverrides) as ConfigService;
  const lifecycleManager = new LifecycleManagerService();
  const service = new ConsulService(config, lifecycleManager);
  return { service, config, lifecycleManager };
}

let mockFetch: ReturnType<typeof installMockFetch>;

beforeEach(() => {
  mockFetch = installMockFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

// ─── Tests ──────────────────────────────────────────────────────────────

describe('ConsulService', () => {
  describe('consulEnabled=false', () => {
    it('should skip initialization entirely when consul is disabled', async () => {
      const { service, lifecycleManager } = createService({ CONSUL_ENABLED: 'false' });

      await service.onModuleInit();

      expect(service.isAvailable()).toBe(false);
      // The health check should still be registered
      const results = await lifecycleManager.runHealthChecks();
      const consulResult = results.find((r) => r.name === 'consul');
      expect(consulResult).toBeDefined();
      expect(consulResult!.status).toBe('healthy');
      expect(consulResult!.message).toBe('Consul integration disabled');
    });

    it('discover returns empty array when disabled', async () => {
      const { service } = createService({ CONSUL_ENABLED: 'false' });
      await service.onModuleInit();

      const result = await service.discover('trapmap');
      expect(result).toEqual([]);
    });

    it('register is no-op when disabled', async () => {
      const { service } = createService({ CONSUL_ENABLED: 'false' });
      await service.onModuleInit();

      await service.register({
        id: 'test',
        name: 'test',
        address: 'localhost',
        port: 4000,
      });

      // fetch should never have been called for registration
      expect(mockFetch.register).not.toHaveBeenCalled();
    });
  });

  describe('Consul unavailable on init', () => {
    it('should enter degraded mode when Consul connection fails', async () => {
      mockFetch = installMockFetch({ failHealth: true });
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
      mockFetch = installMockFetch({ failHealth: true });
      const { service } = createService({ CONSUL_AUTO_REGISTER: 'true' });

      await service.onModuleInit();

      expect(mockFetch.register).not.toHaveBeenCalled();
    });
  });

  describe('graceful degradation (all methods)', () => {
    async function initDegraded() {
      mockFetch = installMockFetch({ failHealth: true });
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
      await service.setKV('my-key', 'my-value');
      expect(mockFetch.kvSet).not.toHaveBeenCalled();
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
      expect(mockFetch.register).not.toHaveBeenCalled();
    });

    it('deregister is a no-op in degraded mode', async () => {
      const service = await initDegraded();
      await service.deregister('svc-1');
      expect(mockFetch.deregister).not.toHaveBeenCalled();
    });
  });

  describe('runtime failures (Consul goes down after init)', () => {
    it('should switch to degraded mode when discover fails at runtime', async () => {
      const { service } = createService();
      await service.onModuleInit();
      expect(service.isAvailable()).toBe(true);

      mockFetch.healthService.mockRejectedValue(new Error('connection lost'));

      const result = await service.discover('trapmap');
      expect(result).toEqual([]);
      expect(service.isAvailable()).toBe(false);
    });

    it('should switch to degraded mode when getKV fails at runtime', async () => {
      const { service } = createService();
      await service.onModuleInit();

      mockFetch.kvGet.mockRejectedValue(new Error('connection lost'));

      const result = await service.getKV('key');
      expect(result).toBeUndefined();
      expect(service.isAvailable()).toBe(false);
    });

    it('should switch to degraded mode when setKV fails at runtime', async () => {
      const { service } = createService();
      await service.onModuleInit();

      mockFetch.kvSet.mockRejectedValue(new Error('connection lost'));

      await service.setKV('key', 'value');
      expect(service.isAvailable()).toBe(false);
    });

    it('should switch to degraded mode when register fails at runtime', async () => {
      const { service } = createService({ CONSUL_AUTO_REGISTER: 'false' });
      await service.onModuleInit();
      expect(service.isAvailable()).toBe(true);

      mockFetch.register.mockRejectedValue(new Error('connection lost'));

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
      const { service, lifecycleManager } = createService();
      await service.onModuleInit();

      const results = await lifecycleManager.runHealthChecks();
      const consulResult = results.find((r) => r.name === 'consul');
      expect(consulResult!.status).toBe('healthy');
    });

    it('should report unhealthy when Consul health check probe fails', async () => {
      const { service, lifecycleManager } = createService();
      await service.onModuleInit();
      expect(service.isAvailable()).toBe(true);

      mockFetch.healthService.mockRejectedValue(new Error('gone'));

      const results = await lifecycleManager.runHealthChecks();
      const consulResult = results.find((r) => r.name === 'consul');
      expect(consulResult!.status).toBe('unhealthy');
      expect(service.isAvailable()).toBe(false);
    });
  });
});
