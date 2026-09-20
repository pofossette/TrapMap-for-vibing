/**
 * Capsule retrieval scoring — pure functions, no I/O.
 *
 * **Provenance**: the original v2 capsule pipeline was retired together with the
 * deleted `packages/server` (Wave-10); `MIN_CAPSULE_SCORE` and the capsule
 * scorer have no surviving implementation. This module is a **re-implementation
 * guided by the weights documented in `docs/architecture/components/RETRIEVAL.md:49`**
 * (problem 0.30 / situation 0.21 / goal 0.17 / keyword 0.17 / contextualPrefix 0.15),
 * not a restoration. Anything the documentation did not pin down is called out
 * below so the choice is reviewable rather than silent.
 */

/** Per-dimension weights for the final capsule score. Sums to 1.0 exactly. */
export const CAPSULE_DIMENSION_WEIGHTS = {
  problem: 0.3,
  situation: 0.21,
  goal: 0.17,
  keyword: 0.17,
  contextualPrefix: 0.15,
} as const;

/**
 * Reciprocal-rank-fusion constant. 60 is the value from the original RRF paper
 * and is not documented for this repo; chosen for consistency with the
 * `preRerankScore = Σ 1/(k+rank)` formula in `RETRIEVAL.md:49`.
 */
export const CAPSULE_RRF_K = 60;

/** Default capsule score floor. Overridable via `TRAPMAP_MIN_CAPSULE_SCORE`. */
export const DEFAULT_MIN_CAPSULE_SCORE = 0.15;

export function resolveMinCapsuleScore(
  env: Record<string, string | undefined> = process.env,
): number {
  const parsed = Number.parseFloat(env.TRAPMAP_MIN_CAPSULE_SCORE ?? '');
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : DEFAULT_MIN_CAPSULE_SCORE;
}

/** The capsule fields the scorer reads. Structural — accepts DB rows as-is. */
export interface ScorableCapsule {
  capsuleId: string;
  situation: string | null;
  problem: string | null;
  goal: string | null;
  contextualPrefix?: string | null;
  content: string;
  labels: string[];
}

export interface CapsuleDimensionScores {
  problem: number;
  situation: number;
  goal: number;
  keyword: number;
  contextualPrefix: number;
  /** Weighted sum in [0, 1]. */
  total: number;
}

export function tokenizeForScoring(text: string | null | undefined): Set<string> {
  if (!text) return new Set();
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1),
  );
}

/**
 * Coverage of the query by a field: the share of query tokens present in the
 * field, in [0, 1].
 *
 * Chosen over Jaccard because capsule fields are much longer than the query —
 * a Jaccard denominator would compress every score toward zero and make the
 * threshold gate meaningless.
 */
function coverage(queryTokens: Set<string>, fieldTokens: Set<string>): number {
  if (queryTokens.size === 0) return 0;
  let hits = 0;
  for (const token of queryTokens) {
    if (fieldTokens.has(token)) hits += 1;
  }
  return hits / queryTokens.size;
}

export function scoreCapsuleDimensions(
  queryTokens: Set<string>,
  capsule: ScorableCapsule,
): CapsuleDimensionScores {
  const problem = coverage(queryTokens, tokenizeForScoring(capsule.problem));
  const situation = coverage(queryTokens, tokenizeForScoring(capsule.situation));
  const goal = coverage(queryTokens, tokenizeForScoring(capsule.goal));
  const contextualPrefix = coverage(queryTokens, tokenizeForScoring(capsule.contextualPrefix));

  // The keyword dimension scores the capsule body. There is no pre-tokenized
  // column to read: the ones the Drizzle schema declares are absent from the
  // applied database and were never populated by any writer.
  const keyword = coverage(queryTokens, tokenizeForScoring(capsule.content));

  const total =
    problem * CAPSULE_DIMENSION_WEIGHTS.problem +
    situation * CAPSULE_DIMENSION_WEIGHTS.situation +
    goal * CAPSULE_DIMENSION_WEIGHTS.goal +
    keyword * CAPSULE_DIMENSION_WEIGHTS.keyword +
    contextualPrefix * CAPSULE_DIMENSION_WEIGHTS.contextualPrefix;

  return { problem, situation, goal, keyword, contextualPrefix, total };
}

/** Reciprocal rank contribution for a 1-based rank. */
export function rrfContribution(rank: number, k: number = CAPSULE_RRF_K): number {
  return rank < 1 ? 0 : 1 / (k + rank);
}

/**
 * Fuse per-channel ranked id lists into `preRerankScore` per capsule.
 *
 * A capsule absent from a channel simply contributes nothing for it — this is
 * what makes the fusion robust to a channel returning nothing (e.g. no vector
 * index rows yet).
 */
export function fuseChannelRanks(
  channels: Record<string, string[]>,
  k: number = CAPSULE_RRF_K,
): Map<string, number> {
  const fused = new Map<string, number>();
  for (const ids of Object.values(channels)) {
    ids.forEach((id, index) => {
      fused.set(id, (fused.get(id) ?? 0) + rrfContribution(index + 1, k));
    });
  }
  return fused;
}

/**
 * Normalise fused scores to [0, 1] by the best possible fusion (rank 1 in every
 * channel), so the value can be compared across channel counts.
 */
export function normalizeFused(
  fused: Map<string, number>,
  channelCount: number,
): Map<string, number> {
  const best = channelCount > 0 ? channelCount * rrfContribution(1) : 1;
  const normalized = new Map<string, number>();
  for (const [id, score] of fused) normalized.set(id, best > 0 ? score / best : 0);
  return normalized;
}

/**
 * Final score = dimension score, blended with the fusion score.
 *
 * `preRerankScore` decides *which* candidates survive (it is channel-driven),
 * the dimension weights decide their order (they are content-driven). The 0.7/0.3
 * split is a judgement call — the documentation only says "rerank uses
 * intent-aware features and finalScore", without stating a blend ratio.
 */
export const CAPSULE_CONTENT_WEIGHT = 0.7;
export const CAPSULE_FUSION_WEIGHT = 0.3;

export function combineFinalScore(dimensionTotal: number, normalizedFusion: number): number {
  const blended =
    dimensionTotal * CAPSULE_CONTENT_WEIGHT + normalizedFusion * CAPSULE_FUSION_WEIGHT;
  return Math.min(1, Math.max(0, blended));
}
