/**
 * Cache hit/miss metrics for prompt section caching.
 *
 * Tracks aggregate hit rates and per-reason breakdowns for
 * monitoring cache effectiveness.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CacheMissReason = 'content_changed' | 'model_changed' | 'ttl_expired';

export interface CacheMetrics {
  hitRate: number;
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  breakReasons: {
    contentChanged: number;
    modelChanged: number;
    ttlExpired: number;
  };
}

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let metrics: CacheMetrics = {
  hitRate: 0,
  totalRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  breakReasons: {
    contentChanged: 0,
    modelChanged: 0,
    ttlExpired: 0,
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a cache hit for the given section.
 */
export function trackCacheHit(_sectionName: string): void {
  metrics.cacheHits++;
  metrics.totalRequests++;
  metrics.hitRate = metrics.cacheHits / metrics.totalRequests;
}

/**
 * Record a cache miss for the given section with a reason.
 */
export function trackCacheMiss(_sectionName: string, reason: CacheMissReason): void {
  metrics.cacheMisses++;
  metrics.totalRequests++;
  metrics.hitRate = metrics.cacheHits / metrics.totalRequests;

  switch (reason) {
    case 'content_changed':
      metrics.breakReasons.contentChanged++;
      break;
    case 'model_changed':
      metrics.breakReasons.modelChanged++;
      break;
    case 'ttl_expired':
      metrics.breakReasons.ttlExpired++;
      break;
  }
}

/**
 * Get a snapshot of the current cache metrics.
 */
export function getCacheMetrics(): CacheMetrics {
  return {
    ...metrics,
    breakReasons: { ...metrics.breakReasons },
  };
}

/**
 * Reset all metrics (useful for testing).
 */
export function resetCacheMetrics(): void {
  metrics = {
    hitRate: 0,
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    breakReasons: {
      contentChanged: 0,
      modelChanged: 0,
      ttlExpired: 0,
    },
  };
}
