export { filterByBoundary } from './boundary-match.js';
export { findEntriesByBoundaryConstraint, findEntriesByGraphNode } from './boundary-query.js';
export type { BoundaryQueryConstraint } from './boundary-query.js';
export {
  mergeCandidates,
  toScoredEntry,
  toScoredEntries,
  createSemanticCandidate,
  hasBothChannels,
} from './merge.js';
export { DEFAULT_SEMANTIC_WEIGHT, DEFAULT_KEYWORD_WEIGHT } from './merge.js';
export { rerankCandidates, toScoredEntriesFromReranked } from './rerank.js';
export {
  DEFAULT_BOTH_CHANNEL_BOOST,
  DEFAULT_TOKEN_DENSITY_BOOST,
  DEFAULT_STALE_DECAY_PENALTY,
} from './rerank.js';
export {
  BOUNDARY_EXCLUDED_PENALTY,
  BOUNDARY_PREFERRED_BOOST,
  computeBoundaryScoreDelta,
  buildBoundaryExplanation,
} from './boundary-match.js';
