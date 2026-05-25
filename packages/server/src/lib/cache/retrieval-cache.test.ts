import { beforeEach, describe, expect, it } from 'vitest';

import {
  RetrievalCache,
  clearRetrievalCacheRegistry,
  getRetrievalCacheStats,
} from './retrieval-cache.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearRetrievalCacheRegistry();
});

// ---------------------------------------------------------------------------
// 1. get returns null for non-existent key
// ---------------------------------------------------------------------------

describe('RetrievalCache.get', () => {
  it('returns null for non-existent key', () => {
    const cache = new RetrievalCache<string>();
    expect(cache.get('missing')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 2. set then get returns value
  // -------------------------------------------------------------------------

  it('returns value after set', () => {
    const cache = new RetrievalCache<string>();
    cache.set('k', 'v');
    expect(cache.get('k')).toBe('v');
  });

  // -------------------------------------------------------------------------
  // 3. get returns null for expired entry (TTL)
  // -------------------------------------------------------------------------

  it('returns null for expired entry', async () => {
    const cache = new RetrievalCache<string>({ ttlMs: 10 });
    cache.set('k', 'v');
    // wait > TTL
    await new Promise((r) => setTimeout(r, 20));
    expect(cache.get('k')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 4. LRU eviction: after writing maxSize entries, oldest is evicted on next set
  // -------------------------------------------------------------------------

  it('evicts oldest entry when at capacity', () => {
    const cache = new RetrievalCache<number>({ maxSize: 3 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    // cache is now full: [a, b, c]
    cache.set('d', 4); // should evict 'a'
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  // -------------------------------------------------------------------------
  // 5. LRU promotion: accessing an old entry prevents its eviction
  // -------------------------------------------------------------------------

  it('promotes accessed entry so it is not evicted', () => {
    const cache = new RetrievalCache<number>({ maxSize: 3 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    // access 'a' to promote it — order becomes [b, c, a]
    cache.get('a');
    cache.set('d', 4); // should evict 'b' (oldest unaccessed)
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeNull();
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  // -------------------------------------------------------------------------
  // 6. has returns false for expired entry
  // -------------------------------------------------------------------------

  it('has returns false for expired entry', async () => {
    const cache = new RetrievalCache<string>({ ttlMs: 10 });
    cache.set('k', 'v');
    expect(cache.has('k')).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(cache.has('k')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. delete removes specific key
// ---------------------------------------------------------------------------

describe('RetrievalCache.delete', () => {
  it('removes a specific key', () => {
    const cache = new RetrievalCache<string>();
    cache.set('k', 'v');
    expect(cache.delete('k')).toBe(true);
    expect(cache.get('k')).toBeNull();
    expect(cache.delete('nonexistent')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. clear empties all entries
// ---------------------------------------------------------------------------

describe('RetrievalCache.clear', () => {
  it('empties all entries', () => {
    const cache = new RetrievalCache<number>();
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 9. stats correctly counts hits / misses / evictions
// ---------------------------------------------------------------------------

describe('RetrievalCache.stats', () => {
  it('counts hits, misses, and evictions', () => {
    const cache = new RetrievalCache<number>({ maxSize: 2 });

    // 2 misses
    cache.get('x'); // miss
    cache.get('y'); // miss

    cache.set('a', 1);
    cache.set('b', 2);

    // 2 hits
    cache.get('a'); // hit
    cache.get('b'); // hit

    // trigger 1 eviction
    cache.set('c', 3); // evicts 'a'

    const s = cache.stats;
    expect(s.hits).toBe(2);
    expect(s.misses).toBe(2);
    expect(s.evictions).toBe(1);
    expect(s.size).toBe(2);
    expect(s.hitRate).toBe(0.5);
  });

  it('returns hitRate 0 when no requests', () => {
    const cache = new RetrievalCache<string>();
    expect(cache.stats.hitRate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 10. getRetrievalCacheStats aggregates by namespace
// ---------------------------------------------------------------------------

describe('getRetrievalCacheStats', () => {
  it('aggregates stats by namespace from multiple instances', () => {
    const cacheA1 = new RetrievalCache<string>({ namespace: 'alpha' });
    const cacheA2 = new RetrievalCache<string>({ namespace: 'alpha' });
    const cacheB = new RetrievalCache<string>({ namespace: 'beta' });

    cacheA1.set('k1', 'v1');
    cacheA1.get('k1'); // hit
    cacheA1.get('missing'); // miss

    cacheA2.set('k2', 'v2');
    cacheA2.get('k2'); // hit

    cacheB.set('k3', 'v3');

    const agg = getRetrievalCacheStats();

    expect(agg['alpha']).toBeDefined();
    expect(agg['beta']).toBeDefined();

    // alpha: cacheA1 has 1 hit + 1 miss, cacheA2 has 1 hit
    expect(agg['alpha']!.hits).toBe(2);
    expect(agg['alpha']!.misses).toBe(1);
    expect(agg['alpha']!.size).toBe(2); // 1 entry each

    // beta: no hits or misses
    expect(agg['beta']!.hits).toBe(0);
    expect(agg['beta']!.misses).toBe(0);
    expect(agg['beta']!.size).toBe(1);
  });
});
