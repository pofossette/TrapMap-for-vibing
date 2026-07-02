/**
 * Internal types for the retrieval orchestrator pipeline.
 * These types are used within the retrieval module and are not part of the public API.
 */

import type { BoundaryExplanation } from '@trapmap/contracts';
import type { KnowledgeRecord, SkillArtifactRecord } from '@trapmap/server/lib/store.js';

/**
 * Governance and query metadata filters for artifact eligibility.
 *
 * Governance fields (teamId, securityLevel, isSystemAdmin) control access.
 * Query metadata fields (scopes, labels) constrain retrieval to matching
 * artifacts so that v2 capsule output respects the caller's requested filters.
 */
export interface ArtifactGovernanceFilters {
  /** Team ID filter */
  teamId: string | null;
  /** Security level filter */
  securityLevel: number;
  /** Is system admin */
  isSystemAdmin: boolean;
  /** Scope filter: restrict to global, project, or both */
  scopes: Array<'global' | 'project'>;
  /** Label filter: artifact must carry all requested labels (AND semantics) */
  labels: string[];
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
 * Intent category for classification of query intent.
 * Used for observability and future strategy routing.
 * Not part of the client contract.
 */
export type IntentCategory =
  | 'debugging'
  | 'configuration'
  | 'deployment'
  | 'performance'
  | 'integration'
  | 'security'
  | 'data'
  | 'testing'
  | 'general';

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
  /** Intent category classification (LLM-only, null for regex) */
  category: IntentCategory | null;
  /** LLM-optimized semantic search query (LLM-only, null for regex) */
  semanticQuery: string | null;
  /** Which parser produced this result */
  parseMethod: 'regex' | 'llm';
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
  /** Contextual prefix match score [0, 1] (Anthropic Contextual Retrieval) */
  contextScore: number;
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

// =============================================================================
// Phase 1 v2 Multi-Recall: Capsule recall channel types
// Internal types for multi-channel capsule retrieval architecture.
// =============================================================================

/**
 * Capsule recall channel identifiers.
 * Each channel provides a distinct recall strategy for capsule retrieval.
 */
export type CapsuleRecallChannelName =
  | 'capsule-semantic'
  | 'capsule-keyword'
  | 'capsule-graph'
  | 'capsule-heuristic';

/**
 * Candidate produced by a single capsule recall channel.
 * Carries evidence from one channel for later merge and rerank.
 */
export interface CapsuleRecallCandidate {
  /** Capsule identifier */
  capsuleId: string;
  /** Parent artifact identifier */
  artifactId: string;
  /** Revision number */
  revision: number;
  /** The recall channel that produced this candidate */
  channel: CapsuleRecallChannelName;
  /** Normalized score for this channel, in [0, 1] */
  score: number;
  /** Token match details (keyword channel only) */
  matchedTokens?: string[];
  /** Graph evidence (graph channel only) */
  graphEvidence?: string[];
}

/**
 * Merged candidate combining evidence from multiple capsule recall channels.
 * Produced by the merge stage and consumed by rerank.
 */
export interface MergedCapsuleCandidate {
  /** Capsule identifier */
  capsuleId: string;
  /** Parent artifact identifier */
  artifactId: string;
  /** Revision number */
  revision: number;
  /** Which channels contributed to this candidate */
  channels: CapsuleRecallChannelName[];
  /** Per-channel scores for audit trail */
  channelScores: Partial<Record<CapsuleRecallChannelName, number>>;
  /** Combined score after merge (pre-rerank) */
  preRerankScore: number;
  /** Final score after reranking */
  finalScore: number;
  /** Human-readable reason for the match */
  reason: string;
}

/**
 * Capsule recall channel interface.
 * Each channel implements a single recall strategy for capsule retrieval.
 */
export interface CapsuleRecallChannel {
  readonly name: CapsuleRecallChannelName;
  /**
   * Execute recall and return capsule candidates.
   * @param artifacts - Governed skill artifact records
   * @param intent - Parsed intent from seed
   * @param filters - Governance filters
   * @param maxResults - Maximum candidates to return
   */
  recall(
    artifacts: SkillArtifactRecord[],
    intent: ParsedIntent,
    filters: ArtifactGovernanceFilters,
    maxResults: number,
  ): Promise<CapsuleRecallCandidate[]>;
}
