// @ts-nocheck
/**
 * Unified Cache Port for Node and Go - P5
 * Key = sha256(canonicalJsonStringify(payload))
 */
export interface CachePort {
  get(key: string): Promise<{ hit: true; value: unknown } | { hit: false }>;
  set(key: string, value: unknown, ttlMs: number): Promise<void>;
  invalidate(prefix: string): Promise<void>;
  metrics(): { hitRate: number; hits: number; misses: number };
}

export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}

export function cacheKeyFromPayload(payload: unknown): string {
  // Use sha256 via @trapmap/lib
  // For now, simple hash
  const { createHash } = require('node:crypto');
  return createHash('sha256').update(canonicalJsonStringify(payload)).digest('hex');
}

// In-memory LRU implementation for Node (placeholder for Go lru+singleflight)
export class InMemoryCachePort implements CachePort {
  private store = new Map<string, { value: unknown; expires: number }>();
  private hits = 0;
  private misses = 0;
  async get(key: string) {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expires) {
      this.misses++;
      return { hit: false as const };
    }
    this.hits++;
    return { hit: true as const, value: entry.value };
  }
  async set(key: string, value: unknown, ttlMs: number) {
    this.store.set(key, { value, expires: Date.now() + ttlMs });
  }
  async invalidate(prefix: string) {
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) this.store.delete(k);
    }
  }
  metrics() {
    const total = this.hits + this.misses;
    return { hitRate: total ? this.hits / total : 0, hits: this.hits, misses: this.misses };
  }
}
