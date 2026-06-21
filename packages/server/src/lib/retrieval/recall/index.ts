export {
  vectorSimilaritySearch,
  vectorSimilaritySearchWithStats,
  ensureVectorIndex,
  dropVectorIndex,
  hasVectorIndex,
  getVectorIndexStats,
} from './db-search.js';
export type {
  VectorSearchOptions,
  VectorSearchResult,
  VectorSearchStats,
  VectorSearchResultWithStats,
} from './db-search.js';
export {
  optimizedSemanticRecall,
  getQueryEmbedding,
  getEntryEmbedding,
  cosineSimilarity,
  computeScore,
  buildEmbeddingText,
} from './semantic.js';
export { keywordRecall, normalizeQuery } from './keyword.js';
export { createPgKeywordRecall } from './pg-keyword.js';
export { graphAssistedRecall } from './graph-assisted.js';
