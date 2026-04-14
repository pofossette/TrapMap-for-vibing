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
 *
 * This module is server-internal (BOUND-03, BOUND-05) and does not change
 * the public response schema.
 *
 * Security note: Rerank only reorders existing safe candidates from the merge
 * stage. It never introduces new entries or bypasses filter constraints.
 */

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
export const DEFAULT_TOKEN_DENSITY_BOOST = 0.10;

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

  // Calculate rerank scores
  const reranked = mergedCandidates.map((candidate) => {
    let finalScore = candidate.combinedScore;

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

    // Cap at 1.0 to maintain score bounds
    finalScore = Math.min(1, Math.max(0, finalScore));

    return {
      ...candidate,
      combinedScore: finalScore,
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
 * Convert reranked candidates to scored entries for assembly.
 * Uses the final combined score after rerank.
 *
 * @param rerankedCandidates - Reranked candidates from the rerank stage
 * @returns Scored entries sorted by final score
 */
export function toScoredEntriesFromReranked(rerankedCandidates: MergedCandidate[]): ScoredEntry[] {
  return rerankedCandidates.map((candidate) => ({
    entry: candidate.entry,
    score: candidate.combinedScore,
  }));
}
