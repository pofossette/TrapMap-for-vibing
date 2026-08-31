import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsulDiscoveryAdapter } from '../../src/gateway/consul-discovery-adapter.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const noopLogger = {
  warn: vi.fn(),
  debug: vi.fn(),
  log: vi.fn(),
};

describe('ConsulDiscoveryAdapter', () => {
  describe('discover()', () => {
    it('returns empty array when Consul is unreachable', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as typeof fetch;

      const adapter = new ConsulDiscoveryAdapter({
        consulAddress: 'http://consul.test:8500',
        logger: noopLogger,
      });

      const result = await adapter.discover('identity-access');
      expect(result).toEqual([]);
      expect(noopLogger.warn).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'));
    });

    it('returns empty array when Consul returns non-200', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(new Response('Service Unavailable', { status: 503 })) as typeof fetch;

      const adapter = new ConsulDiscoveryAdapter({
        consulAddress: 'http://consul.test:8500',
        logger: noopLogger,
      });

      const result = await adapter.discover('knowledge-read');
      expect(result).toEqual([]);
    });

    it('maps Consul health response to DiscoveredService[]', async () => {
      const consulResponse = [
        {
          Service: {
            ID: 'knowledge-read-1',
            Service: 'knowledge-read',
            Address: '10.0.0.2',
            Port: 4002,
            Meta: { version: '1.0.0' },
          },
          Node: { Address: '10.0.0.2' },
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(consulResponse), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ) as typeof fetch;

      const adapter = new ConsulDiscoveryAdapter({
        consulAddress: 'http://consul.test:8500',
        logger: noopLogger,
      });

      const result = await adapter.discover('knowledge-read');
      expect(result).toEqual([
        {
          id: 'knowledge-read-1',
          address: '10.0.0.2',
          port: 4002,
          meta: { version: '1.0.0' },
        },
      ]);
    });

    it('falls back to Node.Address when Service.Address is empty', async () => {
      const consulResponse = [
        {
          Service: {
            ID: 'job-runtime-1',
            Service: 'job-runtime',
            Address: '',
            Port: 4006,
          },
          Node: { Address: '10.0.0.99' },
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(consulResponse), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ) as typeof fetch;

      const adapter = new ConsulDiscoveryAdapter({
        consulAddress: 'http://consul.test:8500',
        logger: noopLogger,
      });

      const result = await adapter.discover('job-runtime');
      expect(result[0].address).toBe('10.0.0.99');
    });
  });

  describe('register()', () => {
    it('sends PUT to /v1/agent/service/register', async () => {
      const fetchSpy = vi.fn().mockResolvedValue(new Response('', { status: 200 })) as typeof fetch;
      globalThis.fetch = fetchSpy;

      const adapter = new ConsulDiscoveryAdapter({
        consulAddress: 'http://consul.test:8500',
        logger: noopLogger,
      });

      await adapter.register({
        id: 'gateway-1234',
        name: 'gateway',
        address: '0.0.0.0',
        port: 4000,
        check: {
          http: 'http://0.0.0.0:4000/health',
          interval: '10s',
          timeout: '5s',
        },
        meta: { version: '1.0.0' },
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://consul.test:8500/v1/agent/service/register',
        expect.objectContaining({
          method: 'PUT',
        }),
      );
    });

    it('does not throw when Consul is unreachable', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as typeof fetch;

      const adapter = new ConsulDiscoveryAdapter({
        consulAddress: 'http://consul.test:8500',
        logger: noopLogger,
      });

      await expect(
        adapter.register({
          id: 'gateway-1234',
          name: 'gateway',
          address: '0.0.0.0',
          port: 4000,
        }),
      ).resolves.toBeUndefined();

      expect(noopLogger.warn).toHaveBeenCalled();
    });
  });

  describe('deregister()', () => {
    it('does not throw when Consul is unreachable', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as typeof fetch;

      const adapter = new ConsulDiscoveryAdapter({
        consulAddress: 'http://consul.test:8500',
        logger: noopLogger,
      });

      await expect(adapter.deregister('gateway-1234')).resolves.toBeUndefined();
    });
  });

  describe('getKV()', () => {
    it('returns undefined when key does not exist (404)', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(new Response('Not Found', { status: 404 })) as typeof fetch;

      const adapter = new ConsulDiscoveryAdapter({
        consulAddress: 'http://consul.test:8500',
        logger: noopLogger,
      });

      const result = await adapter.getKV('nonexistent');
      expect(result).toBeUndefined();
    });

    it('returns undefined when Consul is unreachable', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('timeout')) as typeof fetch;

      const adapter = new ConsulDiscoveryAdapter({
        consulAddress: 'http://consul.test:8500',
        logger: noopLogger,
      });

      const result = await adapter.getKV('some-key');
      expect(result).toBeUndefined();
    });
  });

  describe('setKV()', () => {
    it('does not throw when Consul is unreachable', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('timeout')) as typeof fetch;

      const adapter = new ConsulDiscoveryAdapter({
        consulAddress: 'http://consul.test:8500',
        logger: noopLogger,
      });

      await expect(adapter.setKV('key', 'value')).resolves.toBeUndefined();
    });
  });
});
