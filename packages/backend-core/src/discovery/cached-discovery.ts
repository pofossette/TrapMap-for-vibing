/**
 * Caching decorator for DiscoveryPort.
 *
 * Wraps any DiscoveryPort with a TTL-based cache for `discover()` calls.
 * All other methods are delegated directly to the upstream implementation.
 *
 * Features:
 * - Configurable TTL (default 30 s) and max cache entries
 * - Stale-while-error: returns cached data when upstream is unavailable
 * - Per-service invalidation
 * - Hit / miss counters for observability
 */

import type {
  DiscoveredService,
  DiscoveryPort,
  ServiceRegistration,
} from '../ports/discovery-ports.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CacheEntry {
  instances: DiscoveredService[];
  storedAt: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  staleRecoveries: number;
}

export interface CachedDiscoveryOptions {
  /** Time-to-live in milliseconds (default 30 000 ms = 30 s). */
  ttlMs?: number;
  /** Maximum number of cached service entries (default 256). */
  maxEntries?: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class CachedDiscovery implements DiscoveryPort {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  /** Observable counters — read-only from outside. */
  readonly stats: CacheStats = { hits: 0, misses: 0, staleRecoveries: 0 };

  constructor(
    private readonly upstream: DiscoveryPort,
    options?: CachedDiscoveryOptions,
  ) {
    this.ttlMs = options?.ttlMs ?? 30_000;
    this.maxEntries = options?.maxEntries ?? 256;
  }

  // -------------------------------------------------------------------------
  // DiscoveryPort implementation
  // -------------------------------------------------------------------------

  async register(registration: ServiceRegistration): Promise<void> {
    return this.upstream.register(registration);
  }

  async deregister(serviceId: string): Promise<void> {
    return this.upstream.deregister(serviceId);
  }

  async discover(serviceName: string): Promise<DiscoveredService[]> {
    const entry = this.cache.get(serviceName);

    // Cache hit — return if still fresh
    if (entry && this.isFresh(entry)) {
      this.stats.hits++;
      return entry.instances;
    }

    // Cache miss or expired — fetch from upstream
    try {
      const instances = await this.upstream.discover(serviceName);
      this.store(serviceName, instances);
      this.stats.misses++;
      return instances;
    } catch (err) {
      // Graceful degradation: return stale data if available
      if (entry) {
        this.stats.staleRecoveries++;
        return entry.instances;
      }
      throw err;
    }
  }

  async getKV(key: string): Promise<string | undefined> {
    return this.upstream.getKV(key);
  }

  async setKV(key: string, value: string): Promise<void> {
    return this.upstream.setKV(key, value);
  }

  // -------------------------------------------------------------------------
  // Cache management
  // -------------------------------------------------------------------------

  /** Clear the cached entry for a single service name. */
  invalidate(serviceName: string): void {
    this.cache.delete(serviceName);
  }

  /** Clear every cached entry. */
  invalidateAll(): void {
    this.cache.clear();
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private isFresh(entry: CacheEntry): boolean {
    return Date.now() - entry.storedAt < this.ttlMs;
  }

  private store(serviceName: string, instances: DiscoveredService[]): void {
    // Evict oldest entry when at capacity
    if (this.cache.size >= this.maxEntries && !this.cache.has(serviceName)) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(serviceName, {
      instances,
      storedAt: Date.now(),
    });
  }
}
