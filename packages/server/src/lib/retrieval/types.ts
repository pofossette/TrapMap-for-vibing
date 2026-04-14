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
