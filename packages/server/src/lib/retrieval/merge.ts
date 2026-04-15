/**
 * Candidate merge module for hybrid retrieval.
 *
 * This module provides:
 * - Merging of semantic and keyword recall candidates
 * - Deduplication by entry ID
 * - Combined score calculation with configurable weights
 * - Preservation of per-channel evidence for reranking
 * - Deterministic, stable ordering for identical inputs
 *
 * The merge strategy combines scores from both channels:
 * - Semantic score reflects embedding similarity
 * - Keyword score reflects lexical overlap
 * - Combined score uses weighted average (default: 0.6 semantic, 0.4 keyword)
 *
 * This module is server-internal (BOUND-01, BOUND-02) and does not change
 * the public response schema.
 */

import type { KnowledgeRecord } from '../store.js';
import type { MergedCandidate, RecallCandidate, ScoredEntry } from './types.js';

/**
 * Default weights for combining semantic and keyword scores.
 * Semantic gets higher weight because embedding similarity is typically
 * more semantically meaningful than pure lexical overlap.
 */
export const DEFAULT_SEMANTIC_WEIGHT = 0.6;
export const DEFAULT_KEYWORD_WEIGHT = 0.4;

/**
 * Configuration for merge behavior.
 */
export interface MergeConfig {
  /** Weight for semantic channel score (default 0.6) */
  semanticWeight?: number;
  /** Weight for keyword channel score (default 0.4) */
  keywordWeight?: number;
  /** Maximum candidates to return after merge (default: use maxResults from query) */
  maxCandidates?: number;
}

/**
 * Merge semantic and keyword candidates into a unified list.
 *
 * @param semanticCandidates - Candidates from semantic recall channel
 * @param keywordCandidates - Candidates from keyword recall channel
 * @param config - Optional merge configuration
 * @returns Merged candidates sorted by descending combined score
 *
 * Deduplication: When the same entry appears in both channels,
 * the scores are combined using weighted average. The merged candidate
 * preserves both scores and all token match evidence.
 *
 * Determinism: Results are sorted by combined score, then by entry ID
 * for stable ordering when scores are equal.
 */
export function mergeCandidates(
  semanticCandidates: RecallCandidate[],
  keywordCandidates: RecallCandidate[],
  config?: MergeConfig,
): MergedCandidate[] {
  const semanticWeight = config?.semanticWeight ?? DEFAULT_SEMANTIC_WEIGHT;
  const keywordWeight = config?.keywordWeight ?? DEFAULT_KEYWORD_WEIGHT;

  // Build a map keyed by entry ID for O(n) merge
  const mergedMap = new Map<string, MergedCandidate>();

  // Process semantic candidates
  for (const candidate of semanticCandidates) {
    const entryId = candidate.entry.id;
    mergedMap.set(entryId, {
      entry: candidate.entry,
      semanticScore: candidate.score,
      keywordScore: 0,
      graphScore: 0,
      combinedScore: candidate.score * semanticWeight,
      tokenMatches: [],
      channels: ['semantic'],
    });
  }

  // Process keyword candidates - merge or add new
  for (const candidate of keywordCandidates) {
    const entryId = candidate.entry.id;
    const existing = mergedMap.get(entryId);

    if (existing) {
      // Entry exists from semantic - merge the evidence
      existing.keywordScore = candidate.score;
      existing.tokenMatches = candidate.tokenMatches;
      existing.channels = ['semantic', 'keyword'];
      // Recalculate combined score with both channels
      existing.combinedScore =
        existing.semanticScore * semanticWeight + candidate.score * keywordWeight;
    } else {
      // Entry only from keyword channel
      mergedMap.set(entryId, {
        entry: candidate.entry,
        semanticScore: 0,
        keywordScore: candidate.score,
        graphScore: 0,
        combinedScore: candidate.score * keywordWeight,
        tokenMatches: candidate.tokenMatches,
        channels: ['keyword'],
      });
    }
  }

  // Convert to array and sort deterministically
  const merged = Array.from(mergedMap.values());

  // Sort by combined score descending, then by entry ID ascending for stability
  merged.sort((a, b) => {
    const scoreDiff = b.combinedScore - a.combinedScore;
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    // Stable sort: use entry ID as tiebreaker
    return a.entry.id.localeCompare(b.entry.id);
  });

  // Apply max candidates limit if specified
  if (config?.maxCandidates !== undefined && config.maxCandidates > 0) {
    return merged.slice(0, config.maxCandidates);
  }

  return merged;
}

/**
 * Convert a merged candidate to a scored entry for response assembly.
 * Uses the combined score as the final relevance score.
 *
 * @param merged - Merged candidate with combined evidence
 * @returns Scored entry for assembly pipeline
 */
export function toScoredEntry(merged: MergedCandidate): ScoredEntry {
  return {
    entry: merged.entry,
    score: merged.combinedScore,
  };
}

/**
 * Convert merged candidates to scored entries for the assembly pipeline.
 *
 * @param mergedCandidates - Merged candidates from hybrid recall
 * @returns Scored entries sorted by combined score
 */
export function toScoredEntries(mergedCandidates: MergedCandidate[]): ScoredEntry[] {
  return mergedCandidates.map(toScoredEntry);
}

/**
 * Create a semantic-only candidate from a knowledge entry.
 * Used when building semantic recall results for merge.
 *
 * @param entry - Knowledge entry
 * @param score - Semantic relevance score [0, 1]
 * @returns Recall candidate with semantic channel
 */
export function createSemanticCandidate(
  entry: KnowledgeRecord,
  score: number,
): RecallCandidate {
  return {
    entry,
    channel: 'semantic',
    score,
    tokenMatches: [],
  };
}

/**
 * Check if a merged candidate has both semantic and keyword evidence.
 * Useful for determining if reranking should consider combined signals.
 *
 * @param merged - Merged candidate
 * @returns true if candidate appears in both channels
 */
export function hasBothChannels(merged: MergedCandidate): boolean {
  return merged.channels.includes('semantic') && merged.channels.includes('keyword');
}
