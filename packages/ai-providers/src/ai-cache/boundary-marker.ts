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

/**
 * Inject a __CACHE_BOUNDARY__ marker into the rendered prompt string
 * at the position where static content ends and dynamic content begins.
 *
 * The marker is placed after the closing tag of the last static section
 * in the XML-rendered content. If no static section is found in the content,
 * the original content is returned unchanged.
 */
export function insertBoundaryMarker(renderedContent: string, staticSections: string[]): string {
  if (staticSections.length === 0) return renderedContent;

  // Find the position after the last static section's closing XML tag
  let boundaryPos = -1;
  for (const section of staticSections) {
    const closeTag = `</${section}>`;
    const idx = renderedContent.lastIndexOf(closeTag);
    if (idx !== -1) {
      const endPos = idx + closeTag.length;
      if (endPos > boundaryPos) {
        boundaryPos = endPos;
      }
    }
  }

  if (boundaryPos === -1) return renderedContent;

  return `${renderedContent.slice(0, boundaryPos)}\n${CACHE_BOUNDARY_MARKER}\n${renderedContent.slice(boundaryPos)}`;
}
