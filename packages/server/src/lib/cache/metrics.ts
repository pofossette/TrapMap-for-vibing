export { getRetrievalCacheStats } from './retrieval-cache.js';
export type { CacheStats } from './retrieval-cache.js';
export {
  getCacheFreshnessSnapshot,
  resetCacheFreshnessForTests,
} from './invalidation.js';
export type { CacheFreshnessSnapshot, CacheInvalidationEvent } from './invalidation.js';

import { getCacheFreshnessSnapshot } from './invalidation.js';
import { getRetrievalCacheStats, type CacheStats } from './retrieval-cache.js';

export interface CacheMetricsSnapshot extends CacheStats {
  staleRecoveries: number;
  pendingInvalidation: boolean;
  lastInvalidatedAt: string | null;
  lastRecoveredAt: string | null;
}

export function getCacheMetricsSnapshot(): Record<string, CacheMetricsSnapshot> {
  const stats = getRetrievalCacheStats();
  const freshness = getCacheFreshnessSnapshot();
  const namespaces = new Set([...Object.keys(stats), ...Object.keys(freshness)]);

  return Object.fromEntries(
    [...namespaces].map((namespace) => {
      const cacheStats = stats[namespace] ?? {
        hits: 0,
        misses: 0,
        evictions: 0,
        invalidations: 0,
        size: 0,
        hitRate: 0,
      };
      const freshnessStats = freshness[namespace];

      return [
        namespace,
        {
          ...cacheStats,
          staleRecoveries: freshnessStats?.staleRecoveries ?? 0,
          pendingInvalidation: freshnessStats?.pendingInvalidation ?? false,
          lastInvalidatedAt: freshnessStats?.lastInvalidatedAt ?? null,
          lastRecoveredAt: freshnessStats?.lastRecoveredAt ?? null,
        },
      ];
    }),
  );
}
