/**
 * API cache control integration for prompt sections.
 *
 * Converts CacheSection arrays into API-compatible blocks with
 * cache_control headers, enabling provider-level prompt caching
 * (e.g. Anthropic's prompt caching with cache_control ephemeral blocks).
 */

import type { CacheSection } from '../providers/types.js';
import { splitPromptByBoundary } from './boundary-marker.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CacheControlHeader {
  type: 'ephemeral';
  scope: 'global' | 'organization';
}

export interface PromptBlock {
  content: string;
  cache_control?: CacheControlHeader;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a cache control header for a single section, or null if the section
 * should not be cached (cacheScope === null).
 */
export function buildCacheControlForSection(section: CacheSection): CacheControlHeader | null {
  if (section.cacheScope === null) {
    return null;
  }

  return {
    type: 'ephemeral',
    scope: section.cacheScope === 'org' ? 'organization' : section.cacheScope,
  };
}

/**
 * Split prompt sections into API-compatible blocks with cache control.
 *
 * Static sections (before the cache boundary) are grouped into a single
 * block with an `ephemeral` cache_control header. Dynamic sections
 * (after the boundary) are output as individual blocks without caching.
 */
export function buildSystemPromptBlocks(promptSections: CacheSection[]): PromptBlock[] {
  const { staticPrefix, dynamicSuffix } = splitPromptByBoundary(promptSections);

  const blocks: PromptBlock[] = [];

  if (staticPrefix.length > 0) {
    const staticContent = staticPrefix.map((s) => s.content).join('\n');
    blocks.push({
      content: staticContent,
      cache_control: {
        type: 'ephemeral',
        scope: 'global',
      },
    });
  }

  for (const section of dynamicSuffix) {
    blocks.push({
      content: section.content,
    });
  }

  return blocks;
}
