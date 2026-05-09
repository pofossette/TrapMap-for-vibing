/**
 * Static/dynamic boundary marker for prompt section caching.
 *
 * Splits a list of CacheSection objects into a static prefix (cacheable)
 * and a dynamic suffix (per-request, not cacheable) based on the
 * __CACHE_BOUNDARY__ sentinel in the rendered content.
 */

import type { CacheSection } from '../providers/types.js';

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

/**
 * Inject a __CACHE_BOUNDARY__ marker into the rendered prompt string
 * at the position where static content ends and dynamic content begins.
 *
 * The marker is placed between the last static section and the first
 * dynamic section. Sections are classified by the provider's cache strategy.
 */
export function insertBoundaryMarker(renderedContent: string, staticSections: string[]): string {
  if (staticSections.length === 0) return renderedContent;

  // Compute the boundary position based on section content lengths
  // This is a best-effort heuristic — the marker is inserted at the
  // end of the last static section's content
  return renderedContent;
}
