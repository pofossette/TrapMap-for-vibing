/**
 * Barrel re-export for the retrieval scoring sub-modules.
 *
 * Consolidates public API from boundary-match, boundary-query, merge,
 * and rerank so external consumers can import from a single entry point.
 */

// ---------------------------------------------------------------------------
// Boundary match — boundary-aware filtering and scoring
// ---------------------------------------------------------------------------

export {
  BOUNDARY_EXCLUDED_PENALTY,
  BOUNDARY_PREFERRED_BOOST,
  filterByBoundary,
  computeBoundaryScoreDelta,
  buildBoundaryExplanation,
} from './boundary-match.js';

// ---------------------------------------------------------------------------
// Boundary query — back-reference lookup helpers
// ---------------------------------------------------------------------------

export type { BoundaryQueryConstraint } from './boundary-query.js';
export {
  findEntriesByBoundaryConstraint,
  findEntriesByGraphNode,
} from './boundary-query.js';

// ---------------------------------------------------------------------------
// Merge — hybrid candidate merging
// ---------------------------------------------------------------------------

export {
  DEFAULT_SEMANTIC_WEIGHT,
  DEFAULT_KEYWORD_WEIGHT,
  mergeCandidates,
  toScoredEntry,
  toScoredEntries,
  createSemanticCandidate,
  hasBothChannels,
} from './merge.js';

// ---------------------------------------------------------------------------
// Rerank — deterministic heuristic reranking
// ---------------------------------------------------------------------------

export {
  DEFAULT_BOTH_CHANNEL_BOOST,
  DEFAULT_TOKEN_DENSITY_BOOST,
  DEFAULT_STALE_DECAY_PENALTY,
  rerankCandidates,
  toScoredEntriesFromReranked,
} from './rerank.js';
