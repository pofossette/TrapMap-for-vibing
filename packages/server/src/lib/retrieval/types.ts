/**
 * Internal types for the retrieval orchestrator pipeline.
 * These types are used within the retrieval module and are not part of the public API.
 */

import type {
  BoundaryContext,
  BoundaryExplanation,
  RetrievalQuery,
  RetrievalStrategy,
  RouteFamily,
  RoutingReason,
} from '@trapmap/contracts';
import type { ResolvedAuthContext } from '../context.js';
import type { KnowledgeRecord } from '../store.js';

/**
 * Internal pipeline context passed through retrieval stages.
 * Encapsulates auth, query, and data snapshot for consistent filtering and scoring.
 */
interface RetrievalPipelineContext {
  /** Auth context of the caller */
  auth: ResolvedAuthContext;
  /** Parsed and validated retrieval query */
  query: RetrievalQuery;
  /** Boundary context from query for boundary-aware retrieval */
  boundaryContext: BoundaryContext;
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
  /** Boundary explanation for why this entry is applicable */
  boundaryExplanation?: BoundaryExplanation;
}

/**
 * Retrieval pipeline statistics.
 * Used for debugging and monitoring retrieval behavior.
 */
interface RetrievalStats {
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
export type RecallChannel = string;

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
  /** Per-channel scores map for extensible channel tracking */
  channelScores: Record<string, number>;
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
  /** Score delta from boundary matching (negative = penalty, positive = boost) */
  boundaryScoreDelta?: number;
  /** Applied freshness decay multiplier (DECAY-02) */
  decayMultiplier?: number;
  /** Boundary explanation for applicability context (BOUND-05) */
  boundaryExplanation?: BoundaryExplanation;
}

// =============================================================================
// Phase 14: Seed Intent Parsing and Capsule Retrieval Types (RETR-02)
// Internal types for server-side intent decomposition and capsule ranking.
// These are NOT exported through contracts - server-internal only per RETR-02.
// =============================================================================

/**
 * Normalized token extracted from a seed string.
 * Used for deterministic intent parsing without external model dependencies.
 */
export interface NormalizedToken {
  /** The normalized token text */
  token: string;
  /** Original form before normalization */
  original: string;
  /** Whether this token appears to be a technical term */
  isTechnical: boolean;
}

/**
 * Stack or path hint extracted from seed.
 * Indicates technology stack, file paths, or domain context.
 */
export interface StackPathHint {
  /** The extracted hint text */
  hint: string;
  /** Type classification */
  kind: 'stack' | 'path' | 'domain';
  /** Confidence level for this extraction */
  confidence: number;
}

/**
 * Parsed intent from a natural-language seed (RETR-02).
 * Server-internal decomposition of seed into structured fields for capsule ranking.
 * NOT part of the client contract - derived internally per RETR-02.
 */
export interface ParsedIntent {
  /** Original seed string */
  seed: string;
  /** Normalized seed text for matching */
  normalized: string;
  /** Extracted situation context (e.g., "deploying containers") */
  situation: string | null;
  /** Extracted problem statement (e.g., "permission denied error") */
  problem: string | null;
  /** Extracted goal or intent (e.g., "fix permissions") */
  goal: string | null;
  /** Extracted error text if seed contains error message */
  errorText: string | null;
  /** Normalized tokens for keyword matching */
  tokens: NormalizedToken[];
  /** Stack and path hints for ranking boosts */
  stackPathHints: StackPathHint[];
}

/**
 * Capsule candidate with scoring breakdown.
 * Used internally for capsule-level ranking before response assembly.
 */
export interface CapsuleCandidate {
  /** Capsule identifier */
  capsuleId: string;
  /** Parent artifact identifier */
  artifactId: string;
  /** Revision number */
  revision: number;
  /** Situation match score [0, 1] */
  situationScore: number;
  /** Problem match score [0, 1] */
  problemScore: number;
  /** Goal match score [0, 1] */
  goalScore: number;
  /** Error text match score [0, 1] if applicable */
  errorScore: number | null;
  /** Stack/path boost factor */
  stackPathBoost: number;
  /** Combined final score after all factors */
  finalScore: number;
  /** Reason string for the match */
  reason: string;
}

// =============================================================================
// Phase 29: Routing Decision Types (EOPS-03)
// Server-local routing model that captures strategy selection and trace metadata.
// Uses contracts-layer enums for stable strategy/reason identifiers.
// =============================================================================

/**
 * Channel identifier used in routing trace metadata.
 * Extends the entry-only RecallChannel with capsule, profile, and plan channels
 * to cover v1, v2, and GraphRAG-lite wrapper retrieval paths.
 */
export type RoutingChannel = string;

/**
 * Routing decision produced by the shared router.
 * Captures the full provenance of a mode selection so the orchestrator
 * can emit trace metadata and evaluation slices can compare behavior.
 */
interface RoutingDecision {
  /** The internal strategy selected by the router */
  selectedMode: RetrievalStrategy;
  /** Whether this retrieval follows the entry or capsule route family */
  routeFamily: RouteFamily;
  /** Machine-readable reason code for the routing decision */
  routingReason: RoutingReason;
  /** Whether a fallback strategy was applied after initial selection failed */
  fallbackApplied: boolean;
  /** Recall channels that the router plans to execute */
  channelsPlanned: RoutingChannel[];
  /** Channels that actually contributed to the final result set (populated after recall) */
  channelsUsed: RoutingChannel[];
}
