/**
 * Generic LRU+TTL cache with built-in metrics.
 *
 * Pure TypeScript — no external dependencies.
 * Uses a Map with manual LRU eviction (Map preserves insertion order in V8).
 * TTL is checked lazily on get(); no background timers.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Cache instance config */
export interface RetrievalCacheOptions {
  /** Max entries, default 200 */
  maxSize?: number;
  /** TTL in ms, default 30 * 60_000 (30min) */
  ttlMs?: number;
  /** Namespace for metrics aggregation */
  namespace?: string;
}

/** Cache stats snapshot */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

/** Internal entry */
interface CacheEntry<V> {
  value: V;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_MAX_SIZE = 200;
const DEFAULT_TTL_MS = 30 * 60_000; // 30 minutes

// ---------------------------------------------------------------------------
// Module-level registry (WeakRef-based to allow GC of unreachable caches)
// ---------------------------------------------------------------------------

type CacheStatsProvider = { ns: string; stats: CacheStats };

const liveCaches = new Set<WeakRef<CacheStatsProvider>>();
const finalizationRegistry = new FinalizationRegistry((ref: WeakRef<CacheStatsProvider>) => {
  liveCaches.delete(ref);
});

function register<V>(cache: RetrievalCache<V>): void {
  const ref = new WeakRef(cache as unknown as CacheStatsProvider);
  liveCaches.add(ref);
  finalizationRegistry.register(cache, ref);
}

/** Aggregate stats from all live RetrievalCache instances by namespace */
export function getRetrievalCacheStats(): Record<string, CacheStats> {
  const result: Record<string, CacheStats> = {};

  for (const ref of liveCaches) {
    const cache = ref.deref();
    if (!cache) continue;
    const ns = cache.ns;
    const existing = result[ns];
    const s = cache.stats;

    if (existing) {
      existing.hits += s.hits;
      existing.misses += s.misses;
      existing.evictions += s.evictions;
      existing.size += s.size;
      existing.hitRate =
        existing.hits + existing.misses > 0
          ? existing.hits / (existing.hits + existing.misses)
          : 0;
    } else {
      result[ns] = { ...s };
    }
  }

  return result;
}

/**
 * Clear the registry — useful for testing.
 * Not part of the public contract; exposed only for test isolation.
 */
export function clearRetrievalCacheRegistry(): void {
  liveCaches.clear();
}

// ---------------------------------------------------------------------------
// RetrievalCache<V>
// ---------------------------------------------------------------------------

export class RetrievalCache<V> {
  private readonly store = new Map<string, CacheEntry<V>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private readonly namespace: string;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(options?: RetrievalCacheOptions) {
    this.maxSize = options?.maxSize ?? DEFAULT_MAX_SIZE;
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
    this.namespace = options?.namespace ?? 'default';

    register(this);
  }

  /**
   * Internal lookup — TTL check + LRU promotion WITHOUT bumping metrics.
   */
  private lookup(key: string): V | null {
    const entry = this.store.get(key);
    if (entry === undefined) return null;
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.store.delete(key);
      return null;
    }
    // LRU promotion: move to end
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  /**
   * Retrieve a cached value.
   *
   * Returns `null` when the key is missing or the entry has expired.
   * On hit the entry is promoted to most-recently-used and `hits` is incremented.
   */
  get(key: string): V | null {
    const value = this.lookup(key);
    if (value === null) {
      this.misses++;
    } else {
      this.hits++;
    }
    return value;
  }

  /**
   * Insert or update a cache entry.
   *
   * When the cache is at capacity the least-recently-used entry is evicted.
   * When updating an existing key the entry is moved to the end (most recent)
   * and its TTL is reset to the current time.
   */
  set(key: string, value: V): void {
    if (this.store.has(key)) {
      // Update existing — delete first to reset position
      this.store.delete(key);
    } else if (this.store.size >= this.maxSize) {
      // Evict the first (oldest / least-recently-used) entry
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) {
        this.store.delete(oldest);
        this.evictions++;
      }
    }

    this.store.set(key, { value, createdAt: Date.now() });
  }

  /**
   * Check whether a key exists and is not expired.
   *
   * Uses `lookup()` internally so that TTL enforcement and LRU promotion
   * apply WITHOUT inflating hit/miss metrics.
   */
  has(key: string): boolean {
    return this.lookup(key) !== null;
  }

  /** Remove a specific key. Returns `true` if the key existed. */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /** Remove all entries. */
  clear(): void {
    this.store.clear();
  }

  /** Current number of entries (may include expired entries not yet accessed). */
  get size(): number {
    return this.store.size;
  }

  /** Snapshot of cache metrics. */
  get stats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      size: this.store.size,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /** The namespace this cache instance is registered under. */
  get ns(): string {
    return this.namespace;
  }
}
