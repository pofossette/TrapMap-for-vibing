/**
 * Quality score computation from feedback signals.
 *
 * Implements the quality scoring algorithm for knowledge entries
 * based on user-submitted feedback. Scores range from 0-100.
 */

import type { FeedbackProblemType, QualityScore } from '@trapmap/contracts';
import { qualityScoreSchema } from '@trapmap/contracts';

import type { FeedbackQueueRecord } from '../store.js';

/**
 * Weights for each problem type (negative impact on quality).
 * More severe problems have larger negative weights.
 */
const PROBLEM_TYPE_WEIGHTS: Record<FeedbackProblemType, number> = {
  incorrect: -30,
  outdated: -15,
  'context-mismatch': -10,
  incomplete: -10,
  other: -5,
};

/**
 * Compute age weight for feedback.
 * Newer feedback weighs more; exponential decay with 90-day half-life.
 */
function ageWeight(submittedAt: string, now: Date): number {
  const ageDays = (now.getTime() - new Date(submittedAt).getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp(-ageDays / 90);
}

/**
 * Compute quality score for a knowledge entry from feedback signals.
 *
 * @param entryId - Entry ID to compute score for
 * @param feedbackQueue - All feedback items
 * @param now - Current timestamp
 * @returns Quality score object with breakdown
 */
export function computeQualityScore(
  entryId: string,
  feedbackQueue: FeedbackQueueRecord[],
  now: Date,
): QualityScore {
  // Filter to non-dismissed feedback for this entry
  const entryFeedback = feedbackQueue.filter(
    (f) => f.entryId === entryId && f.status !== 'dismissed',
  );

  let weightedScore = 100; // Start at 100
  const breakdown = {
    incorrect: 0,
    outdated: 0,
    contextMismatch: 0,
    incomplete: 0,
    other: 0,
  };

  for (const f of entryFeedback) {
    const baseWeight = PROBLEM_TYPE_WEIGHTS[f.problemType] ?? 0;
    const ageW = ageWeight(f.submittedAt, now);
    const impact = baseWeight * ageW;

    weightedScore += impact;

    // Track breakdown by problem type
    switch (f.problemType) {
      case 'incorrect':
        breakdown.incorrect++;
        break;
      case 'outdated':
        breakdown.outdated++;
        break;
      case 'context-mismatch':
        breakdown.contextMismatch++;
        break;
      case 'incomplete':
        breakdown.incomplete++;
        break;
      case 'other':
        breakdown.other++;
        break;
    }
  }

  // Clamp to 0-100
  const score = Math.max(0, Math.min(100, weightedScore));

  return qualityScoreSchema.parse({
    entryId,
    score,
    breakdown,
    totalFeedback: entryFeedback.length,
    computedAt: now.toISOString(),
  });
}

/**
 * Compute quality scores for multiple entries.
 */
export function computeQualityScores(
  entryIds: string[],
  feedbackQueue: FeedbackQueueRecord[],
  now: Date,
): Map<string, QualityScore> {
  const scores = new Map<string, QualityScore>();

  for (const entryId of entryIds) {
    scores.set(entryId, computeQualityScore(entryId, feedbackQueue, now));
  }

  return scores;
}
