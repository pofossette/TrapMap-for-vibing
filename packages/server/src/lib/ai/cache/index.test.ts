import { beforeEach, describe, expect, it } from 'vitest';

import type { CacheSection } from '../providers/types.js';
import {
  CACHE_BOUNDARY_MARKER,
  buildCacheControlForSection,
  buildSystemPromptBlocks,
  clearAllSections,
  computeHash,
  getCacheMetrics,
  getCachedSection,
  getSectionCacheSize,
  insertBoundaryMarker,
  invalidateSection,
  resetCacheMetrics,
  resetSectionCache,
  splitPromptByBoundary,
  trackCacheHit,
  trackCacheMiss,
} from './index.js';

// ---------------------------------------------------------------------------
// section-cache: computeHash
// ---------------------------------------------------------------------------

describe('computeHash', () => {
  it('returns a 64-char hex string (SHA-256)', () => {
    const hash = computeHash('hello world');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns different hashes for different inputs', () => {
    expect(computeHash('a')).not.toBe(computeHash('b'));
  });

  it('returns same hash for same input', () => {
    expect(computeHash('test')).toBe(computeHash('test'));
  });
});

// ---------------------------------------------------------------------------
// section-cache: getCachedSection
// ---------------------------------------------------------------------------

describe('getCachedSection', () => {
  beforeEach(() => {
    resetSectionCache();
    resetCacheMetrics();
  });

  it('computes and caches content on first call', () => {
    const result = getCachedSection('role', () => 'role content');
    expect(result).toBe('role content');
    expect(getSectionCacheSize()).toBe(1);
  });

  it('returns cached content on second call without calling computeFn', () => {
    getCachedSection('role', () => 'first call');
    const result = getCachedSection('role', () => 'second call');
    expect(result).toBe('first call');
    expect(getSectionCacheSize()).toBe(1);
  });

  it('invalidates and recomputes after invalidateSection', () => {
    getCachedSection('role', () => 'old');
    invalidateSection('role');
    const result = getCachedSection('role', () => 'new');
    expect(result).toBe('new');
  });

  it('clears all entries with clearAllSections', () => {
    getCachedSection('a', () => 'content a');
    getCachedSection('b', () => 'content b');
    expect(getSectionCacheSize()).toBe(2);
    clearAllSections();
    expect(getSectionCacheSize()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// section-cache: LRU eviction
// ---------------------------------------------------------------------------

describe('section-cache LRU eviction', () => {
  beforeEach(() => {
    resetSectionCache({ max: 3 });
    resetCacheMetrics();
  });

  it('evicts oldest entry when max is exceeded', () => {
    getCachedSection('a', () => 'a');
    getCachedSection('b', () => 'b');
    getCachedSection('c', () => 'c');
    expect(getSectionCacheSize()).toBe(3);

    // Adding a 4th should evict 'a'
    getCachedSection('d', () => 'd');
    expect(getSectionCacheSize()).toBe(3);

    // 'a' should be recomputed (evicted)
    const result = getCachedSection('a', () => 'a-new');
    expect(result).toBe('a-new');
  });
});

// ---------------------------------------------------------------------------
// metrics: tracking
// ---------------------------------------------------------------------------

describe('cache metrics', () => {
  beforeEach(() => {
    resetCacheMetrics();
  });

  it('starts with zero metrics', () => {
    const metrics = getCacheMetrics();
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.cacheHits).toBe(0);
    expect(metrics.cacheMisses).toBe(0);
    expect(metrics.hitRate).toBe(0);
  });

  it('tracks hits and computes hit rate', () => {
    trackCacheHit('section:a');
    trackCacheHit('section:a');
    trackCacheMiss('section:b', 'content_changed');

    const metrics = getCacheMetrics();
    expect(metrics.totalRequests).toBe(3);
    expect(metrics.cacheHits).toBe(2);
    expect(metrics.cacheMisses).toBe(1);
    expect(metrics.hitRate).toBeCloseTo(2 / 3);
  });

  it('tracks miss reasons independently', () => {
    trackCacheMiss('a', 'content_changed');
    trackCacheMiss('b', 'model_changed');
    trackCacheMiss('c', 'ttl_expired');
    trackCacheMiss('d', 'content_changed');

    const metrics = getCacheMetrics();
    expect(metrics.breakReasons.contentChanged).toBe(2);
    expect(metrics.breakReasons.modelChanged).toBe(1);
    expect(metrics.breakReasons.ttlExpired).toBe(1);
  });

  it('resets to zero', () => {
    trackCacheHit('a');
    trackCacheMiss('b', 'content_changed');
    resetCacheMetrics();

    const metrics = getCacheMetrics();
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.cacheHits).toBe(0);
    expect(metrics.cacheMisses).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// boundary-marker: splitPromptByBoundary
// ---------------------------------------------------------------------------

describe('splitPromptByBoundary', () => {
  const makeSection = (
    name: string,
    content: string,
    cacheScope: 'global' | null,
  ): CacheSection => ({
    name,
    content,
    cacheScope,
  });

  it('splits at the boundary marker', () => {
    const sections: CacheSection[] = [
      makeSection('role', 'role content', 'global'),
      makeSection('__boundary__', CACHE_BOUNDARY_MARKER, null),
      makeSection('metadata', '{}', null),
    ];

    const { staticPrefix, dynamicSuffix } = splitPromptByBoundary(sections);
    expect(staticPrefix).toHaveLength(1);
    expect(staticPrefix[0].name).toBe('role');
    expect(dynamicSuffix).toHaveLength(1);
    expect(dynamicSuffix[0].name).toBe('metadata');
  });

  it('returns all as dynamic when no marker present', () => {
    const sections: CacheSection[] = [
      makeSection('role', 'role content', 'global'),
      makeSection('task', 'task content', null),
    ];

    const { staticPrefix, dynamicSuffix } = splitPromptByBoundary(sections);
    expect(staticPrefix).toHaveLength(0);
    expect(dynamicSuffix).toHaveLength(2);
  });

  it('handles empty sections array', () => {
    const { staticPrefix, dynamicSuffix } = splitPromptByBoundary([]);
    expect(staticPrefix).toHaveLength(0);
    expect(dynamicSuffix).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// boundary-marker: insertBoundaryMarker
// ---------------------------------------------------------------------------

describe('insertBoundaryMarker', () => {
  it('returns content unchanged (current implementation is no-op)', () => {
    const content = '<role>test</role><task>task</task>';
    const result = insertBoundaryMarker(content, ['role']);
    expect(result).toBe(content);
  });

  it('returns content unchanged when no static sections', () => {
    const content = '<task>task</task>';
    const result = insertBoundaryMarker(content, []);
    expect(result).toBe(content);
  });
});

// ---------------------------------------------------------------------------
// api-integration: buildCacheControlForSection
// ---------------------------------------------------------------------------

describe('buildCacheControlForSection', () => {
  it('returns ephemeral global header for global scope', () => {
    const section: CacheSection = { name: 'role', content: 'x', cacheScope: 'global' };
    expect(buildCacheControlForSection(section)).toEqual({
      type: 'ephemeral',
      scope: 'global',
    });
  });

  it('returns ephemeral organization header for org scope', () => {
    const section: CacheSection = { name: 'task', content: 'x', cacheScope: 'org' };
    expect(buildCacheControlForSection(section)).toEqual({
      type: 'ephemeral',
      scope: 'organization',
    });
  });

  it('returns null for null scope (not cacheable)', () => {
    const section: CacheSection = { name: 'metadata', content: '{}', cacheScope: null };
    expect(buildCacheControlForSection(section)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// api-integration: buildSystemPromptBlocks
// ---------------------------------------------------------------------------

describe('buildSystemPromptBlocks', () => {
  const makeSection = (
    name: string,
    content: string,
    cacheScope: 'global' | null,
  ): CacheSection => ({
    name,
    content,
    cacheScope,
  });

  it('groups static sections into a single cached block and dynamic as individual blocks', () => {
    const sections: CacheSection[] = [
      makeSection('role', 'role content', 'global'),
      makeSection('task', 'task content', 'global'),
      makeSection('__boundary__', CACHE_BOUNDARY_MARKER, null),
      makeSection('metadata', '{}', null),
    ];

    const blocks = buildSystemPromptBlocks(sections);
    expect(blocks).toHaveLength(2);

    // First block: static prefix merged, with cache control
    expect(blocks[0].content).toContain('role content');
    expect(blocks[0].content).toContain('task content');
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral', scope: 'global' });

    // Second block: dynamic section, no cache control
    expect(blocks[1].content).toBe('{}');
    expect(blocks[1].cache_control).toBeUndefined();
  });

  it('produces no cached block when all sections are dynamic', () => {
    const sections: CacheSection[] = [
      makeSection('task', 'task content', null),
      makeSection('metadata', '{}', null),
    ];

    const blocks = buildSystemPromptBlocks(sections);
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.cache_control === undefined)).toBe(true);
  });

  it('handles empty sections', () => {
    const blocks = buildSystemPromptBlocks([]);
    expect(blocks).toHaveLength(0);
  });
});
