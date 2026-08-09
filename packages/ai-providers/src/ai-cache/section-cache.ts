/**
 * Section-level LRU cache for rendered prompt sections.
 *
 * Pure TypeScript implementation — no external dependencies.
 * Uses a Map with manual LRU eviction (Map preserves insertion order in V8).
 */

import { createHash } from 'node:crypto';

import { trackCacheHit, trackCacheMiss } from './metrics.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SectionCacheEntry {
  content: string;
  hash: string;
  timestamp: number;
}

interface SectionCacheOptions {
  /** Maximum number of entries. Default: 1000. */
  max?: number;
  /** TTL in milliseconds. Default: 1 hour. */
  ttlMs?: number;
}

// ---------------------------------------------------------------------------
// LRU implementation
// ---------------------------------------------------------------------------

const DEFAULT_MAX = 1000;
const DEFAULT_TTL_MS = 1000 * 60 * 60; // 1 hour

class SectionLRUCache {
  private readonly store = new Map<string, SectionCacheEntry>();
  private readonly max: number;
  private readonly ttlMs: number;

  constructor(options?: SectionCacheOptions) {
    this.max = options?.max ?? DEFAULT_MAX;
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  }

  get(key: string): SectionCacheEntry | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.store.delete(key);
      trackCacheMiss(key, 'ttl_expired');
      return undefined;
    }

    // Move to end (most recently used) — delete + re-insert
    this.store.delete(key);
    this.store.set(key, entry);
    return entry;
  }

  set(key: string, entry: SectionCacheEntry): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.max) {
      // Evict oldest (first) entry
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) {
        this.store.delete(oldest);
      }
    }
    this.store.set(key, entry);
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

// ---------------------------------------------------------------------------
// Singleton cache instance
// ---------------------------------------------------------------------------

const cacheInstance = new SectionLRUCache();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a SHA-256 hash of the given content.
 */
function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Retrieve a cached section or compute it via the provided function.
 *
 * If the section is cached and not expired, returns the cached content
 * and records a cache hit. Otherwise, computes the content, caches it,
 * and records a cache miss.
 */
export function getCachedSection(name: string, computeFn: () => string): string {
  const cacheKey = `section:${name}`;
  const cached = cacheInstance.get(cacheKey);

  if (cached) {
    trackCacheHit(cacheKey);
    return cached.content;
  }

  const content = computeFn();
  const hash = computeHash(content);

  cacheInstance.set(cacheKey, {
    content,
    hash,
    timestamp: Date.now(),
  });

  // Track miss — content was not in cache
  trackCacheMiss(cacheKey, 'content_changed');
  return content;
}
