/**
 * Index adapters for lifecycle-driven indexing.
 *
 * This module exports:
 * - Vector adapter: generates and persists embeddings
 * - Keyword adapter: persists normalized tokens
 * - Helper functions for query-time token reuse
 * - Default adapter list for server bootstrap
 *
 * Adapters are registered with the pipeline and called during
 * lifecycle transitions (approval, update, deactivation).
 */

import type { IndexAdapter } from '../types.js';
import { graphIndexAdapter } from './graph.js';
import { keywordIndexAdapter } from './keyword.js';
import { vectorIndexAdapter } from './vector.js';

export {
  vectorIndexAdapter,
  upsertVectorIndex,
  removeVectorIndex,
  getVectorPayload,
  type VectorIndexPayload,
} from './vector.js';

export {
  keywordIndexAdapter,
  upsertKeywordIndex,
  removeKeywordIndex,
  getIndexedKeywordTokens,
  hasIndexedKeywordTokens,
  type KeywordIndexPayload,
} from './keyword.js';

export {
  graphIndexAdapter,
  clearGraphCache,
  getCachedGraphIndexDocuments,
  setCachedGraphIndexDocuments,
} from './graph.js';

/**
 * Get the default index adapter list for server bootstrap.
 *
 * This function returns the standard set of adapters that should be
 * registered at server startup. The adapters are called in order during
 * lifecycle transitions.
 *
 * @returns Array of registered index adapters
 */
export function buildDefaultIndexAdapters(): IndexAdapter[] {
  return [vectorIndexAdapter, keywordIndexAdapter, graphIndexAdapter];
}
