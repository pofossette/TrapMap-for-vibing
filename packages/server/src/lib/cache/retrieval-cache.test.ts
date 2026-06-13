import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

afterEach(() => {
  vi.useRealTimers();
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

  it('returns null for expired entry', () => {
    vi.useFakeTimers();
    const cache = new RetrievalCache<string>({ ttlMs: 10 });
    cache.set('k', 'v');
    // advance past TTL
    vi.advanceTimersByTime(20);
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

  it('has returns false for expired entry', () => {
    vi.useFakeTimers();
    const cache = new RetrievalCache<string>({ ttlMs: 10 });
    cache.set('k', 'v');
    expect(cache.has('k')).toBe(true);
    vi.advanceTimersByTime(20);
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

  it('tracks invalidations when clear removes entries', () => {
    const cache = new RetrievalCache<number>();
    cache.set('a', 1);
    cache.set('b', 2);

    cache.clear();

    expect(cache.stats.invalidations).toBe(2);
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

    expect(agg.alpha).toBeDefined();
    expect(agg.beta).toBeDefined();

    // alpha: cacheA1 has 1 hit + 1 miss, cacheA2 has 1 hit
    expect(agg.alpha!.hits).toBe(2);
    expect(agg.alpha!.misses).toBe(1);
    expect(agg.alpha!.size).toBe(2); // 1 entry each

    // beta: no hits or misses
    expect(agg.beta!.hits).toBe(0);
    expect(agg.beta!.misses).toBe(0);
    expect(agg.beta!.size).toBe(1);
  });

  it('uses default namespace when none specified', () => {
    const cache = new RetrievalCache<string>();
    cache.set('k', 'v');
    cache.get('k');

    const agg = getRetrievalCacheStats();
    expect(agg.default).toBeDefined();
    expect(agg.default!.hits).toBe(1);
    expect(agg.default!.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 11. has() does not inflate hit/miss metrics
// ---------------------------------------------------------------------------

describe('RetrievalCache.has side-effect isolation', () => {
  it('does not increment hits or misses', () => {
    const cache = new RetrievalCache<string>();
    cache.set('k', 'v');

    cache.has('k'); // should not count as a hit
    cache.has('k'); // should not count as a hit
    cache.has('zzz'); // should not count as a miss

    const s = cache.stats;
    expect(s.hits).toBe(0);
    expect(s.misses).toBe(0);
  });
});

describe('RetrievalCache.deleteByPrefix', () => {
  it('removes matching keys and tracks invalidations', () => {
    const cache = new RetrievalCache<string>();
    cache.set('skill:1', 'a');
    cache.set('skill:2', 'b');
    cache.set('trap:1', 'c');

    const removed = cache.deleteByPrefix('skill:');

    expect(removed).toBe(2);
    expect(cache.get('skill:1')).toBeNull();
    expect(cache.get('skill:2')).toBeNull();
    expect(cache.get('trap:1')).toBe('c');
    expect(cache.stats.invalidations).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 12. set() resets TTL on existing key
// ---------------------------------------------------------------------------

describe('RetrievalCache.set TTL reset', () => {
  it('resets TTL when updating an existing key', () => {
    vi.useFakeTimers();
    const cache = new RetrievalCache<string>({ ttlMs: 100 });
    cache.set('k', 'v1');

    // advance 80ms — entry is still alive
    vi.advanceTimersByTime(80);
    expect(cache.get('k')).toBe('v1');

    // update the key — TTL should reset
    cache.set('k', 'v2');

    // advance another 80ms (total 160ms from original set, but only 80ms from update)
    vi.advanceTimersByTime(80);
    expect(cache.get('k')).toBe('v2');

    // advance past the new TTL
    vi.advanceTimersByTime(30);
    expect(cache.get('k')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 13. values() generator
// ---------------------------------------------------------------------------

describe('RetrievalCache.values', () => {
  it('iterates all non-expired values on a populated cache', () => {
    const cache = new RetrievalCache<number>();
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    const result = Array.from(cache.values());
    expect(result).toEqual([1, 2, 3]);
  });

  it('returns nothing on an empty cache', () => {
    const cache = new RetrievalCache<string>();

    const result = Array.from(cache.values());
    expect(result).toEqual([]);
  });

  it('deletes expired entries during iteration', () => {
    vi.useFakeTimers();
    const cache = new RetrievalCache<string>({ ttlMs: 50 });
    cache.set('k1', 'v1');
    cache.set('k2', 'v2');

    expect(cache.size).toBe(2);

    // advance past TTL so both entries expire
    vi.advanceTimersByTime(60);

    const result = Array.from(cache.values());
    expect(result).toEqual([]);
    // expired entries should have been cleaned up
    expect(cache.size).toBe(0);
  });

  it('yields only alive values and removes expired keys in a mixed cache', () => {
    vi.useFakeTimers();
    const cache = new RetrievalCache<string>({ ttlMs: 100 });
    cache.set('early', 'expires-soon');
    cache.set('late', 'survives');

    // advance 50ms — 'early' was set at t=0, still alive
    vi.advanceTimersByTime(50);
    // 'late' was set at t=0, update it now to reset its TTL
    cache.set('late', 'survives');

    // advance another 60ms — total 110ms from start
    // 'early' (set at t=0) is now expired (110 > 100)
    // 'late' (reset at t=50) is still alive (60 < 100)
    vi.advanceTimersByTime(60);

    expect(cache.size).toBe(2); // both still in store (lazy eviction)

    const result = Array.from(cache.values());
    expect(result).toEqual(['survives']);
    // expired 'early' key should have been removed
    expect(cache.size).toBe(1);
  });
});
