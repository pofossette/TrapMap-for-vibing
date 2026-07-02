/**
 * Barrel re-export for the recall sub-modules.
 *
 * Consolidates public API from keyword, semantic, db-search, graph-assisted,
 * pg-keyword, and query-graph-labels so external consumers can import from
 * a single entry point.
 */

// ---------------------------------------------------------------------------
// Keyword recall — lexical matching
// ---------------------------------------------------------------------------

export { tokenize, normalizeQuery, keywordRecall, keywordChannel } from './keyword.js';

// ---------------------------------------------------------------------------
// Semantic recall — embedding-based retrieval
// ---------------------------------------------------------------------------

export {
  buildEmbeddingText,
  computeLexicalIntentBoost,
  cosineSimilarity,
  computeScore,
  getEntryEmbedding,
  getQueryEmbedding,
  getBatchEmbeddings,
  optimizedSemanticRecall,
  semanticChannel,
} from './semantic.js';

// ---------------------------------------------------------------------------
// DB search — pgvector similarity search
// ---------------------------------------------------------------------------

export type {
  VectorSearchOptions,
  VectorSearchResult,
  VectorSearchStats,
  VectorSearchResultWithStats,
} from './db-search.js';
export {
  vectorSimilaritySearch,
  vectorSimilaritySearchWithStats,
  ensureVectorIndex,
  dropVectorIndex,
  hasVectorIndex,
  getVectorIndexStats,
} from './db-search.js';

// ---------------------------------------------------------------------------
// Graph-assisted recall — relationship-augmented retrieval
// ---------------------------------------------------------------------------

export { graphAssistedRecall, createGraphChannel } from './graph-assisted.js';

// ---------------------------------------------------------------------------
// PG keyword recall — PostgreSQL lexical search
// ---------------------------------------------------------------------------

export type { KeywordRecallFilters } from './pg-keyword.js';
export { createPgKeywordRecall } from './pg-keyword.js';

// ---------------------------------------------------------------------------
// Query graph labels — query normalization for graph recall
// ---------------------------------------------------------------------------

export { normalizeQueryGraphLabels } from './query-graph-labels.js';
