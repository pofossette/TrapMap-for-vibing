import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DiscoveredService,
  DiscoveryPort,
  ServiceRegistration,
} from '../ports/discovery-ports.js';
import { CachedDiscovery } from './cached-discovery.js';

// ---------------------------------------------------------------------------
// Stub upstream
// ---------------------------------------------------------------------------

function makeInstances(n: number): DiscoveredService[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `svc-${i}`,
    address: `10.0.0.${i + 1}`,
    port: 8080 + i,
  }));
}

class StubUpstream implements DiscoveryPort {
  discoverResults: DiscoveredService[][] = [];
  private discoverIdx = 0;
  discoverError: Error | undefined;

  registerCalls: ServiceRegistration[] = [];
  deregisterCalls: string[] = [];
  kvStore = new Map<string, string>();

  async discover(_serviceName: string): Promise<DiscoveredService[]> {
    if (this.discoverError) throw this.discoverError;
    const result = this.discoverResults[this.discoverIdx] ?? [];
    this.discoverIdx++;
    return result;
  }

  async register(registration: ServiceRegistration): Promise<void> {
    this.registerCalls.push(registration);
  }

  async deregister(serviceId: string): Promise<void> {
    this.deregisterCalls.push(serviceId);
  }

  async getKV(key: string): Promise<string | undefined> {
    return this.kvStore.get(key);
  }

  async setKV(key: string, value: string): Promise<void> {
    this.kvStore.set(key, value);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CachedDiscovery', () => {
  let upstream: StubUpstream;

  beforeEach(() => {
    upstream = new StubUpstream();
  });

  it('returns cached results on repeated calls within TTL', async () => {
    const instances = makeInstances(3);
    upstream.discoverResults = [instances, makeInstances(99)];

    const cached = new CachedDiscovery(upstream, { ttlMs: 60_000 });

    const first = await cached.discover('auth');
    const second = await cached.discover('auth');

    expect(first).toEqual(instances);
    expect(second).toEqual(instances);
    // Upstream should only have been called once
    expect(cached.stats.misses).toBe(1);
    expect(cached.stats.hits).toBe(1);
  });

  it('fetches fresh data after TTL expires', async () => {
    const firstInstances = makeInstances(2);
    const secondInstances = makeInstances(4);
    upstream.discoverResults = [firstInstances, secondInstances];

    const cached = new CachedDiscovery(upstream, { ttlMs: 1 });

    const first = await cached.discover('auth');
    expect(first).toEqual(firstInstances);

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 5));

    const second = await cached.discover('auth');
    expect(second).toEqual(secondInstances);
    expect(cached.stats.misses).toBe(2);
  });

  it('falls back to stale cache when upstream errors', async () => {
    const instances = makeInstances(2);
    upstream.discoverResults = [instances];

    const cached = new CachedDiscovery(upstream, { ttlMs: 1 });

    // Prime the cache
    await cached.discover('auth');
    // Let it expire
    await new Promise((r) => setTimeout(r, 5));

    // Now upstream will error
    upstream.discoverError = new Error('connection refused');

    const result = await cached.discover('auth');
    expect(result).toEqual(instances);
    expect(cached.stats.staleRecoveries).toBe(1);
  });

  it('re-throws when no stale cache exists and upstream errors', async () => {
    upstream.discoverError = new Error('boom');

    const cached = new CachedDiscovery(upstream, { ttlMs: 1 });

    await expect(cached.discover('auth')).rejects.toThrow('boom');
  });

  it('invalidate() clears a single service entry', async () => {
    const first = makeInstances(2);
    const second = makeInstances(1);
    upstream.discoverResults = [first, second];

    const cached = new CachedDiscovery(upstream, { ttlMs: 60_000 });

    await cached.discover('auth');
    cached.invalidate('auth');

    const result = await cached.discover('auth');
    expect(result).toEqual(second);
    expect(cached.stats.misses).toBe(2);
  });

  it('invalidateAll() clears all cached entries', async () => {
    const a = makeInstances(2);
    const b = makeInstances(3);
    const a2 = makeInstances(1);
    const b2 = makeInstances(1);
    upstream.discoverResults = [a, b, a2, b2];

    const cached = new CachedDiscovery(upstream, { ttlMs: 60_000 });

    await cached.discover('auth');
    await cached.discover('billing');
    cached.invalidateAll();

    await cached.discover('auth');
    await cached.discover('billing');
    expect(cached.stats.misses).toBe(4);
  });

  it('delegates register/deregister/getKV/setKV to upstream', async () => {
    const cached = new CachedDiscovery(upstream);

    const reg: ServiceRegistration = {
      id: 'svc-1',
      name: 'auth',
      address: '127.0.0.1',
      port: 8080,
    };
    await cached.register(reg);
    expect(upstream.registerCalls).toEqual([reg]);

    await cached.deregister('svc-1');
    expect(upstream.deregisterCalls).toEqual(['svc-1']);

    await cached.setKV('key', 'value');
    const val = await cached.getKV('key');
    expect(val).toBe('value');
  });

  it('enforces maxEntries by evicting the oldest entry', async () => {
    const cached = new CachedDiscovery(upstream, { ttlMs: 60_000, maxEntries: 2 });
    upstream.discoverResults = [makeInstances(1), makeInstances(1), makeInstances(1)];

    await cached.discover('a');
    await cached.discover('b');
    // This should evict 'a'
    await cached.discover('c');

    // 'a' should no longer be cached — next discover is a miss
    await cached.discover('a');
    expect(cached.stats.misses).toBe(4); // a, b, c, then a again
  });
});
