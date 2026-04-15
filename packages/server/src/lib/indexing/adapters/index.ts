/**
 * Index adapters for lifecycle-driven indexing.
 *
 * This module exports:
 * - Vector adapter: generates and persists embeddings
 * - Keyword adapter: persists normalized tokens
 * - Helper functions for query-time token reuse
 *
 * Adapters are registered with the pipeline and called during
 * lifecycle transitions (approval, update, deactivation).
 */

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
