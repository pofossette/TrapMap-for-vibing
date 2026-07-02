import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamicDiscovery } from './dynamic-discovery.js';
import type { DiscoveryPort, DiscoveredService } from '../ports/discovery-ports.js';

function createMockDiscoveryPort(services: DiscoveredService[] = []): DiscoveryPort {
  return {
    register: vi.fn(),
    deregister: vi.fn(),
    discover: vi.fn().mockResolvedValue(services),
    getKV: vi.fn(),
    setKV: vi.fn(),
  };
}

const mockServices: DiscoveredService[] = [
  { id: 'svc-1', address: '10.0.0.1', port: 4001 },
  { id: 'svc-2', address: '10.0.0.2', port: 4002 },
  { id: 'svc-3', address: '10.0.0.3', port: 4003 },
];

describe('DynamicDiscovery', () => {
  it('should discover services from the port', async () => {
    const port = createMockDiscoveryPort(mockServices);
    const discovery = new DynamicDiscovery(port);

    const result = await discovery.getServiceAddress('test-service');

    expect(port.discover).toHaveBeenCalledWith('test-service');
    expect(result).toBeDefined();
    expect(mockServices).toContainEqual(result);
  });

  it('should throw when no services are found', async () => {
    const port = createMockDiscoveryPort([]);
    const discovery = new DynamicDiscovery(port);

    await expect(discovery.getServiceAddress('missing')).rejects.toThrow(
      'No healthy instances of "missing" found',
    );
  });

  it('should use cache on subsequent calls within TTL', async () => {
    const port = createMockDiscoveryPort(mockServices);
    const discovery = new DynamicDiscovery(port, { cacheTTLMs: 5000 });

    await discovery.getServiceAddress('test-service');
    await discovery.getServiceAddress('test-service');

    expect(port.discover).toHaveBeenCalledTimes(1);
  });

  it('should round-robin across services', async () => {
    const port = createMockDiscoveryPort(mockServices);
    const discovery = new DynamicDiscovery(port);

    const results = new Set<string>();
    for (let i = 0; i < mockServices.length; i++) {
      const svc = await discovery.getServiceAddress('test-service');
      results.add(svc.id);
    }

    // With 3 services and round-robin, we should get all 3 distinct IDs
    expect(results.size).toBe(mockServices.length);
  });

  it('should invalidate cache for specific service', async () => {
    const port = createMockDiscoveryPort(mockServices);
    const discovery = new DynamicDiscovery(port);

    await discovery.getServiceAddress('test-service');
    discovery.invalidateCache('test-service');
    await discovery.getServiceAddress('test-service');

    expect(port.discover).toHaveBeenCalledTimes(2);
  });

  it('should invalidate all cache', async () => {
    const port = createMockDiscoveryPort(mockServices);
    const discovery = new DynamicDiscovery(port);

    await discovery.getServiceAddress('svc-a');
    discovery.invalidateCache();
    await discovery.getServiceAddress('svc-a');

    expect(port.discover).toHaveBeenCalledTimes(2);
  });
});
