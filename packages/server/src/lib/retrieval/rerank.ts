/**
 * Deterministic rerank module for hybrid retrieval.
 *
 * This module provides:
 * - Reordering of merged candidates using combined channel evidence
 * - Heuristic scoring boosts for multi-channel matches
 * - Deterministic, stable ordering for identical inputs
 * - No external model dependencies (Phase 7 scope)
 *
 * Rerank strategy:
 * - Candidates appearing in both channels get a boost (cross-channel agreement)
 * - Token match density boosts keyword-heavy candidates
 * - Semantic scores are preserved for embedding similarity
 * - Stale entries receive a ranking penalty (soft decay)
 *
 * This module is server-internal (BOUND-03, BOUND-05) and does not change
 * the public response schema.
 *
 * Security note: Rerank only reorders existing safe candidates from the merge
 * stage. It never introduces new entries or bypasses filter constraints.
 */

import type {
  BoundaryContext,
  BoundaryExplanation,
  DecayState,
  FreshnessDecayConfig,
} from '@trapmap/contracts';
import { computeFreshnessMultiplier } from '../decay/freshness.js';
import { buildBoundaryExplanation, computeBoundaryScoreDelta } from './boundary-match.js';
import type { MergedCandidate, ScoredEntry } from './types.js';

/**
 * Default boost for candidates that appear in both channels.
 * When an entry matches both semantic and keyword recall, it gets
 * a score boost because cross-channel agreement is a strong relevance signal.
 */
export const DEFAULT_BOTH_CHANNEL_BOOST = 0.15;

/**
 * Default boost for candidates with high token match density.
 * When many query tokens match an entry, it indicates strong lexical relevance.
 */
export const DEFAULT_TOKEN_DENSITY_BOOST = 0.1;

/**
 * Default penalty for stale entries (soft decay).
 * Entries with decayState === 'stale' have their score reduced by this amount.
 */
export const DEFAULT_STALE_DECAY_PENALTY = 0.1;

/**
 * Configuration for rerank behavior.
 */
export interface RerankConfig {
  /** Boost for candidates appearing in both channels (default 0.15) */
  bothChannelBoost?: number;
  /** Boost for high token match density (default 0.10) */
  tokenDensityBoost?: number;
  /** Maximum candidates to return after rerank (default: no limit) */
  maxCandidates?: number;
  /** Penalty applied to stale entries' scores (default 0.1). Set to 0 to disable. */
  staleDecayPenalty?: number;
  /** Boundary context from query for boundary-aware scoring */
  boundaryContext?: BoundaryContext;
  /** Freshness decay configuration for age-based scoring (DECAY-02) */
  freshnessConfig?: FreshnessDecayConfig;
  /**
   * Skip candidates with combinedScore below this fraction of the top score.
   * E.g., 0.3 means skip candidates with score < 30% of the highest score.
   * This is a relative threshold, not absolute. (Phase 77)
   */
  earlyTerminationThreshold?: number;
}

/**
 * Rerank merged candidates using deterministic heuristics.
 *
 * @param mergedCandidates - Candidates from the merge stage
 * @param queryTokens - Normalized query tokens for density calculation
 * @param config - Optional rerank configuration
 * @returns Reranked candidates sorted by descending final score
 *
 * Rerank applies these heuristics in order:
 * 1. Base score: combinedScore from merge stage
 * 2. Both-channel boost: +0.15 if candidate appears in semantic AND keyword
 * 3. Token density boost: +0.10 if >50% of query tokens matched
 * 4. Stale decay penalty: -0.10 if entry has decayState === 'stale'
 *
 * Determinism: Results are sorted by final score, then by entry ID
 * for stable ordering when scores are equal.
 *
 * Security: This function only reorders existing candidates. It cannot
 * introduce new entries or bypass filter constraints.
 */
export function rerankCandidates(
  mergedCandidates: MergedCandidate[],
  queryTokens: string[],
  config?: RerankConfig,
): MergedCandidate[] {
  const bothChannelBoost = config?.bothChannelBoost ?? DEFAULT_BOTH_CHANNEL_BOOST;
  const tokenDensityBoost = config?.tokenDensityBoost ?? DEFAULT_TOKEN_DENSITY_BOOST;
  const staleDecayPenalty = config?.staleDecayPenalty ?? DEFAULT_STALE_DECAY_PENALTY;

  // Performance optimization: hoist Date creation outside the loop (O(n) -> O(1))
  const now = new Date();

  // Performance optimization: cache freshness multiplier by lastVerifiedAt
  const freshnessCache = new Map<string, number>();

  // Performance optimization: pre-filter candidates below relative threshold
  // Threshold is relative to top score (e.g., 0.3 means keep candidates with
  // score >= 30% of the highest score). This avoids filtering out valid results
  // when all scores are uniformly low. (Phase 77)
  let candidates = mergedCandidates;
  if (config?.earlyTerminationThreshold !== undefined && mergedCandidates.length > 0) {
    const topScore = Math.max(...mergedCandidates.map((c) => c.combinedScore));
    const threshold = topScore * config.earlyTerminationThreshold;
    candidates = candidates.filter((c) => c.combinedScore >= threshold);
  }

  // Calculate rerank scores
  const reranked = candidates.map((candidate) => {
    // Preserve pre-rerank score for audit trail
    const preRerankScore = candidate.combinedScore;
    let finalScore = preRerankScore;

    // Boost for cross-channel agreement
    if (hasBothChannels(candidate)) {
      finalScore += bothChannelBoost;
    }

    // Boost for high token match density
    if (queryTokens.length > 0 && candidate.tokenMatches.length > 0) {
      const uniqueMatchedTokens = new Set(candidate.tokenMatches.map((m) => m.token));
      const density = uniqueMatchedTokens.size / queryTokens.length;
      if (density >= 0.5) {
        finalScore += tokenDensityBoost;
      }
    }

    // Apply soft decay penalty for stale entries
    if (staleDecayPenalty > 0 && hasStaleDecayState(candidate)) {
      finalScore -= staleDecayPenalty;
    }

    // Apply boundary scoring if context provided
    if (config?.boundaryContext) {
      const delta = computeBoundaryScoreDelta(candidate.entry, config.boundaryContext);
      finalScore += delta;
      candidate.boundaryScoreDelta = delta;
      // Performance optimization: skip boundary explanation for zero-delta cases
      if (delta !== 0) {
        candidate.boundaryExplanation = buildBoundaryExplanation(
          candidate.entry,
          config.boundaryContext,
          delta,
        );
      }
    }

    // Apply freshness decay multiplier if config provided (DECAY-02)
    if (config?.freshnessConfig) {
      // Performance optimization: use hoisted `now` instead of creating new Date per call
      // and cache results by lastVerifiedAt for entries with same timestamp
      const lastVerifiedAt = candidate.entry.decayMeta?.lastVerifiedAt;
      let multiplier: number;
      if (
        lastVerifiedAt !== undefined &&
        lastVerifiedAt !== null &&
        freshnessCache.has(lastVerifiedAt)
      ) {
        multiplier = freshnessCache.get(lastVerifiedAt)!;
      } else {
        multiplier = computeFreshnessMultiplier(candidate.entry, config.freshnessConfig, now);
        if (lastVerifiedAt !== undefined && lastVerifiedAt !== null) {
          freshnessCache.set(lastVerifiedAt, multiplier);
        }
      }
      finalScore *= multiplier;
      if (multiplier < 1.0) {
        candidate.decayMultiplier = multiplier;
      }
    }

    // Cap at 1.0 to maintain score bounds
    finalScore = Math.min(1, Math.max(0, finalScore));

    return {
      ...candidate,
      combinedScore: finalScore,
      preRerankScore,
      finalScore,
    };
  });

  // Sort deterministically: by final score descending, then by entry ID ascending
  reranked.sort((a, b) => {
    const scoreDiff = b.combinedScore - a.combinedScore;
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    // Stable sort: use entry ID as tiebreaker
    return a.entry.id.localeCompare(b.entry.id);
  });

  // Apply max candidates limit if specified
  if (config?.maxCandidates !== undefined && config.maxCandidates > 0) {
    return reranked.slice(0, config.maxCandidates);
  }

  return reranked;
}

/**
 * Check if a merged candidate has both semantic and keyword evidence.
 */
function hasBothChannels(candidate: MergedCandidate): boolean {
  return candidate.channels.includes('semantic') && candidate.channels.includes('keyword');
}

/**
 * Check if a merged candidate's associated entry has stale decay state.
 * The entry must carry decay metadata with decayState === 'stale'.
 */
function hasStaleDecayState(candidate: MergedCandidate): boolean {
  return candidate.entry.decayMeta?.decayState === 'stale';
}

/**
 * Convert reranked candidates to scored entries for assembly.
 * Uses the final combined score after rerank.
 * Includes boundary explanation when available (BOUND-05).
 *
 * @param rerankedCandidates - Reranked candidates from the rerank stage
 * @returns Scored entries sorted by final score
 */
export function toScoredEntriesFromReranked(rerankedCandidates: MergedCandidate[]): ScoredEntry[] {
  return rerankedCandidates.map((candidate) => {
    const result: ScoredEntry = {
      entry: candidate.entry,
      score: candidate.combinedScore,
    };
    if (candidate.boundaryExplanation !== undefined) {
      result.boundaryExplanation = candidate.boundaryExplanation;
    }
    return result;
  });
}
