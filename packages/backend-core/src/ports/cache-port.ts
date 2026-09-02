/**
 * Unified Cache Port for Node and Go - P5
 * Key = sha256(canonicalJsonStringify(payload)) via @trapmap/lib
 */
import { canonicalJsonStringify, sha256CanonicalJson } from '@trapmap/lib';

export interface CachePort {
  get(key: string): Promise<{ hit: true; value: unknown } | { hit: false }>;
  set(key: string, value: unknown, ttlMs: number): Promise<void>;
  invalidate(prefix: string): Promise<void>;
  metrics(): { hitRate: number; hits: number; misses: number };
}

export function cacheKeyFromPayload(payload: unknown): string {
  return sha256CanonicalJson(payload);
}

export function canonicalKey(payload: unknown): string {
  return canonicalJsonStringify(payload);
}

// In-memory LRU with singleflight via Map + promise dedupe (Node side, Go uses lru+singleflight)
export class InMemoryCachePort implements CachePort {
  private store = new Map<string, { value: unknown; expires: number }>();
  private inflight = new Map<string, Promise<unknown>>();
  private hits = 0;
  private misses = 0;

  async get(key: string): Promise<{ hit: true; value: unknown } | { hit: false }> {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expires) {
      if (entry) this.store.delete(key);
      this.misses++;
      return { hit: false as const };
    }
    this.hits++;
    return { hit: true as const, value: entry.value };
  }

  async set(key: string, value: unknown, ttlMs: number): Promise<void> {
    this.store.set(key, { value, expires: Date.now() + ttlMs });
  }

  async invalidate(prefix: string): Promise<void> {
    for (const k of [...this.store.keys()]) {
      if (k.startsWith(prefix)) this.store.delete(k);
    }
  }

  metrics(): { hitRate: number; hits: number; misses: number } {
    const total = this.hits + this.misses;
    return { hitRate: total ? this.hits / total : 0, hits: this.hits, misses: this.misses };
  }

  // singleflight getOrLoad helper
  async getOrLoad<T>(key: string, loader: () => Promise<T>, ttlMs: number): Promise<T> {
    const hit = await this.get(key);
    if (hit.hit) return hit.value as T;
    const existing = this.inflight.get(key);
    if (existing) return (await existing) as T;
    const p = loader()
      .then(async (v) => {
        await this.set(key, v, ttlMs);
        return v;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p as Promise<unknown>);
    return (await p) as T;
  }
}
