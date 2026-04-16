/**
 * Internal types for the retrieval orchestrator pipeline.
 * These types are used within the retrieval module and are not part of the public API.
 */

import type { RetrievalQuery } from '@skill-shareer/contracts';
import type { ResolvedAuthContext } from '../context.js';
import type { KnowledgeRecord } from '../store.js';

/**
 * Internal pipeline context passed through retrieval stages.
 * Encapsulates auth, query, and data snapshot for consistent filtering and scoring.
 */
export interface RetrievalPipelineContext {
  /** Auth context of the caller */
  auth: ResolvedAuthContext;
  /** Parsed and validated retrieval query */
  query: RetrievalQuery;
  /** Store data snapshot at query time */
  dataSnapshot: {
    knowledgeEntries: KnowledgeRecord[];
  };
}

/**
 * Eligible entry with computed embedding and score.
 * Represents an entry that passed all filters and has been scored.
 */
export interface ScoredEntry {
  /** The knowledge entry record */
  entry: KnowledgeRecord;
  /** Relevance score [0, 1] */
  score: number;
}

/**
 * Retrieval pipeline statistics.
 * Used for debugging and monitoring retrieval behavior.
 */
export interface RetrievalStats {
  /** Total entries in the store */
  totalEntries: number;
  /** Entries that passed eligibility filters */
  eligibleEntries: number;
  /** Entries returned (limited by maxResults) */
  returnedEntries: number;
  /** Whether refinement was attempted */
  refinementAttempted: boolean;
}

// =============================================================================
// Channel-Aware Retrieval Candidate Types (Phase 7 Hybrid Groundwork)
// These internal types support multi-path recall and are not part of the public API.
// =============================================================================

/**
 * The recall channel that produced a candidate.
 * Used to track evidence source during hybrid merge and rerank stages.
 */
export type RecallChannel = 'semantic' | 'keyword' | 'graph';

/**
 * Token match detail for keyword recall evidence.
 * Records which query tokens matched which entry fields.
 */
export interface TokenMatchDetail {
  /** The normalized token that matched */
  token: string;
  /** The field(s) where the match occurred */
  fields: Array<'shortcut' | 'detail' | 'labels'>;
}

/**
 * Internal candidate metadata for a single recall channel.
 * Carries evidence from semantic or keyword scoring for later merge/rerank.
 */
export interface RecallCandidate {
  /** The knowledge entry record */
  entry: KnowledgeRecord;
  /** The recall channel that produced this candidate */
  channel: RecallChannel;
  /** Normalized score for this channel, in [0, 1] */
  score: number;
  /** Token match details (keyword channel only, empty for semantic) */
  tokenMatches: TokenMatchDetail[];
}

/**
 * Merged candidate combining evidence from multiple recall channels.
 * Produced by the merge stage for reranking.
 */
export interface MergedCandidate {
  /** The knowledge entry record */
  entry: KnowledgeRecord;
  /** Semantic channel score, or 0 if not recalled via semantic */
  semanticScore: number;
  /** Keyword channel score, or 0 if not recalled via keyword */
  keywordScore: number;
  /** Graph channel score, or 0 if not recalled via graph (optional for backward compatibility) */
  graphScore?: number;
  /** Combined score after merge, in [0, 1] - this is the pre-rerank score */
  combinedScore: number;
  /** All token matches from keyword channel (empty if keyword not used) */
  tokenMatches: TokenMatchDetail[];
  /** Which channels contributed to this candidate */
  channels: RecallChannel[];
  /** Pre-rerank score preserved for citation audit trail */
  preRerankScore: number;
  /** Final score after reranking (same as combinedScore if no rerank applied) */
  finalScore: number;
}
