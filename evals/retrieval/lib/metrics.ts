/**
 * Ranking metric calculators for retrieval evaluation.
 *
 * Phase 26-01: REVAL-03
 * Implements deterministic calculations for Hit@K, MRR, nDCG, and Recall@K.
 *
 * All metrics use binary relevance (an ID is either relevant or not).
 * Empty target policy: returns 0 for all metrics when no relevant IDs exist.
 */

import type { CaseMetrics, NormalizedResult } from './types.js';

// =============================================================================
// Empty Target Policy
// =============================================================================

/**
 * Policy for handling empty relevant ID sets.
 * We use 'zero' policy: return 0 for all metrics when there are no relevant IDs.
 * This is serialized into report metadata for reproducibility.
 */
export const EMPTY_TARGET_POLICY = 'zero' as const;

// =============================================================================
// Metric Calculators
// =============================================================================

/**
 * Calculate Hit@K: whether any relevant ID appears in top K results.
 * Returns 1 if any relevant ID is in top K, 0 otherwise.
 *
 * @param returnedIds - IDs returned by the system, ranked by score descending
 * @param relevantIds - IDs that are relevant (ground truth)
 * @param k - Number of top results to consider
 * @returns 1 if hit, 0 otherwise (0 if no relevant IDs)
 */
export function hitAtK(returnedIds: string[], relevantIds: string[], k: number): number {
  if (relevantIds.length === 0) return 0;

  const topK = new Set(returnedIds.slice(0, k));
  return relevantIds.some((id) => topK.has(id)) ? 1 : 0;
}

/**
 * Calculate Mean Reciprocal Rank: 1/rank of first relevant result.
 * Returns 0 if no relevant ID appears in results, or if no relevant IDs exist.
 *
 * @param returnedIds - IDs returned by the system, ranked by score descending
 * @param relevantIds - IDs that are relevant (ground truth)
 * @returns 1/rank of first relevant result, 0 if none found or no relevant IDs
 */
export function mrr(returnedIds: string[], relevantIds: string[]): number {
  if (relevantIds.length === 0) return 0;

  const relevantSet = new Set(relevantIds);

  for (let i = 0; i < returnedIds.length; i++) {
    if (relevantSet.has(returnedIds[i]!)) {
      return 1 / (i + 1);
    }
  }

  return 0;
}

/**
 * Calculate nDCG (Normalized Discounted Cumulative Gain).
 * Uses binary relevance: gain is 1 for relevant items, 0 otherwise.
 * Ideal DCG is computed from the ideal ordering.
 *
 * @param returnedIds - IDs returned by the system, ranked by score descending
 * @param relevantIds - IDs that are relevant (ground truth)
 * @param idealOrder - Ideal ranking order (optional, uses relevantIds if not provided)
 * @returns nDCG score in [0, 1], 0 if no relevant IDs
 */
export function ndcg(
  returnedIds: string[],
  relevantIds: string[],
  idealOrder?: string[],
): number {
  if (relevantIds.length === 0) return 0;

  const relevantSet = new Set(relevantIds);

  // DCG: sum of gain / log2(rank + 1) for each relevant item
  let dcg = 0;
  for (let i = 0; i < returnedIds.length; i++) {
    if (relevantSet.has(returnedIds[i]!)) {
      // Binary gain: 1 if relevant
      dcg += 1 / Math.log2(i + 2); // i+2 because rank is 1-indexed
    }
  }

  // IDCG: ideal DCG from ideal ordering (or relevantIds if no ideal order)
  const idealRanking = idealOrder ?? relevantIds;
  let idcg = 0;
  const idealRelevantSet = new Set(relevantIds);
  for (let i = 0; i < idealRanking.length; i++) {
    if (idealRelevantSet.has(idealRanking[i]!)) {
      idcg += 1 / Math.log2(i + 2);
    }
  }

  if (idcg === 0) return 0;
  return dcg / idcg;
}

/**
 * Calculate Recall@K: fraction of relevant items found in top K results.
 * Returns 0 if no relevant IDs exist.
 *
 * @param returnedIds - IDs returned by the system, ranked by score descending
 * @param relevantIds - IDs that are relevant (ground truth)
 * @param k - Number of top results to consider
 * @returns Fraction of relevant items in top K, 0 if no relevant IDs
 */
export function recallAtK(returnedIds: string[], relevantIds: string[], k: number): number {
  if (relevantIds.length === 0) return 0;

  const topK = new Set(returnedIds.slice(0, k));
  const relevantInTopK = relevantIds.filter((id) => topK.has(id)).length;

  return relevantInTopK / relevantIds.length;
}

// =============================================================================
// Combined Metrics Calculation
// =============================================================================

/**
 * Calculate all ranking metrics for a case.
 *
 * @param result - Normalized retrieval result
 * @param relevantIds - IDs that are relevant (ground truth)
 * @param idealOrder - Ideal ranking order (optional)
 * @returns All metrics for the case
 */
export function calculateMetrics(
  result: NormalizedResult,
  relevantIds: string[],
  idealOrder?: string[],
): CaseMetrics {
  const returnedIds = result.returnedIds;

  return {
    hitAt1: hitAtK(returnedIds, relevantIds, 1),
    hitAt5: hitAtK(returnedIds, relevantIds, 5),
    hitAt10: hitAtK(returnedIds, relevantIds, 10),
    mrr: mrr(returnedIds, relevantIds),
    ndcg: ndcg(returnedIds, relevantIds, idealOrder),
    recallAt10: recallAtK(returnedIds, relevantIds, 10),
  };
}

/**
 * Average metrics across multiple cases.
 * Returns 0 for all metrics if no cases provided.
 */
export function averageMetrics(metrics: CaseMetrics[]): CaseMetrics {
  if (metrics.length === 0) {
    return {
      hitAt1: 0,
      hitAt5: 0,
      hitAt10: 0,
      mrr: 0,
      ndcg: 0,
      recallAt10: 0,
    };
  }

  const sum = metrics.reduce(
    (acc, m) => ({
      hitAt1: acc.hitAt1 + m.hitAt1,
      hitAt5: acc.hitAt5 + m.hitAt5,
      hitAt10: acc.hitAt10 + m.hitAt10,
      mrr: acc.mrr + m.mrr,
      ndcg: acc.ndcg + m.ndcg,
      recallAt10: acc.recallAt10 + m.recallAt10,
    }),
    { hitAt1: 0, hitAt5: 0, hitAt10: 0, mrr: 0, ndcg: 0, recallAt10: 0 },
  );

  return {
    hitAt1: sum.hitAt1 / metrics.length,
    hitAt5: sum.hitAt5 / metrics.length,
    hitAt10: sum.hitAt10 / metrics.length,
    mrr: sum.mrr / metrics.length,
    ndcg: sum.ndcg / metrics.length,
    recallAt10: sum.recallAt10 / metrics.length,
  };
}
