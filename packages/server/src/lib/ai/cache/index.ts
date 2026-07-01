/**
 * Cache management module for prompt section caching.
 *
 * Provides LRU section caching, static/dynamic boundary splitting,
 * cache hit/miss metrics, and API cache control integration.
 */

// Section-level LRU cache
export {
  computeHash,
  getCachedSection,
  invalidateSection,
  clearAllSections,
  getSectionCacheSize,
  resetSectionCache,
} from './section-cache.js';

// Static/dynamic boundary markers
export {
  CACHE_BOUNDARY_MARKER,
  splitPromptByBoundary,
  insertBoundaryMarker,
} from './boundary-marker.js';

// Cache metrics
export {
  trackCacheHit,
  trackCacheMiss,
  getCacheMetrics,
  resetCacheMetrics,
} from './metrics.js';

// API cache control integration
export {
  buildCacheControlForSection,
  buildSystemPromptBlocks,
} from './api-integration.js';
