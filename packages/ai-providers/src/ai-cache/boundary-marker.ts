/**
 * Static/dynamic boundary marker for prompt section caching.
 *
 * Splits a list of CacheSection objects into a static prefix (cacheable)
 * and a dynamic suffix (per-request, not cacheable) based on the
 * __CACHE_BOUNDARY__ sentinel in the rendered content.
 */

import type { CacheSection } from '../ai-providers/types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CACHE_BOUNDARY_MARKER = '__CACHE_BOUNDARY__';

// ---------------------------------------------------------------------------
// Boundary splitting
// ---------------------------------------------------------------------------

export interface BoundarySplit {
  staticPrefix: CacheSection[];
  dynamicSuffix: CacheSection[];
}

/**
 * Split prompt sections into static (cacheable) and dynamic (non-cacheable)
 * portions. The boundary is determined by the presence of the
 * `__CACHE_BOUNDARY__` marker in any section's content.
 *
 * If no marker is found, all sections are treated as dynamic (suffix).
 */
export function splitPromptByBoundary(promptSections: CacheSection[]): BoundarySplit {
  const boundaryIndex = promptSections.findIndex((section) =>
    section.content.includes(CACHE_BOUNDARY_MARKER),
  );

  if (boundaryIndex === -1) {
    return {
      staticPrefix: [],
      dynamicSuffix: promptSections,
    };
  }

  return {
    staticPrefix: promptSections.slice(0, boundaryIndex),
    dynamicSuffix: promptSections.slice(boundaryIndex + 1),
  };
}
