/**
 * Lifecycle transition triggers based on feedback patterns.
 *
 * Implements automatic state transitions when feedback patterns
 * indicate quality issues with a knowledge entry.
 */

import type { DecayState, FeedbackProblemType, LifecycleTriggerRule } from '@trapmap/contracts';
import { DEFAULT_LIFECYCLE_TRIGGER_RULES } from '@trapmap/contracts';

import type { FeedbackQueueRecord, KnowledgeRecord, SkillArtifactRecord } from '../store.js';

/**
 * Result of checking lifecycle triggers for an entry.
 */
export interface LifecycleTriggerResult {
  /** Whether a transition should occur */
  shouldTransition: boolean;
  /** Target decay state if transition should occur */
  targetState: DecayState | null;
  /** Human-readable reason for the transition */
  reason: string;
}

/**
 * Check if lifecycle triggers should fire for an entry.
 *
 * @param entryId - Entry ID to check
 * @param feedbackQueue - All feedback items
 * @param rules - Trigger rules to evaluate
 * @param now - Current timestamp
 * @returns Trigger result with transition recommendation
 */
export function checkLifecycleTriggers(
  entryId: string,
  feedbackQueue: FeedbackQueueRecord[],
  rules: LifecycleTriggerRule[],
  now: Date,
): LifecycleTriggerResult {
  // Filter to non-dismissed feedback for this entry
  const entryFeedback = feedbackQueue.filter(
    (f) => f.entryId === entryId && f.status !== 'dismissed',
  );

  // Evaluate rules in order (first match wins)
  for (const rule of rules) {
    const matchingFeedback = entryFeedback.filter((f) => {
      if (f.problemType !== rule.problemType) return false;

      const ageDays = (now.getTime() - new Date(f.submittedAt).getTime()) / (1000 * 60 * 60 * 24);
      return ageDays <= rule.timeWindowDays;
    });

    if (matchingFeedback.length >= rule.minCount) {
      return {
        shouldTransition: true,
        targetState: rule.targetDecayState,
        reason: `${matchingFeedback.length} '${rule.problemType}' feedback in last ${rule.timeWindowDays} days`,
      };
    }
  }

  return { shouldTransition: false, targetState: null, reason: '' };
}

/**
 * Apply lifecycle trigger to an entry if conditions are met.
 *
 * @param entry - Knowledge entry or skill artifact
 * @param feedbackQueue - All feedback items
 * @param rules - Trigger rules to evaluate
 * @param now - Current timestamp
 * @returns True if a transition was applied
 */
export function applyLifecycleTrigger(
  entry: KnowledgeRecord | SkillArtifactRecord,
  feedbackQueue: FeedbackQueueRecord[],
  rules: LifecycleTriggerRule[],
  now: Date,
): boolean {
  const result = checkLifecycleTriggers(entry.id, feedbackQueue, rules, now);

  if (!result.shouldTransition || !result.targetState) {
    return false;
  }

  // Don't transition if already in target state or "worse" state
  const currentState = entry.decayMeta?.decayState;
  if (currentState) {
    const stateOrder: DecayState[] = ['active', 'review-due', 'stale', 'expired', 'superseded'];
    const currentIndex = stateOrder.indexOf(currentState);
    const targetIndex = stateOrder.indexOf(result.targetState);

    // Don't transition "backwards" to a better state
    if (targetIndex <= currentIndex) {
      return false;
    }
  }

  // Apply the transition
  const nowStr = now.toISOString();
  entry.decayMeta = {
    lastVerifiedAt: entry.decayMeta?.lastVerifiedAt ?? entry.updatedAt,
    decayState: result.targetState,
    supersededById: entry.decayMeta?.supersededById ?? null,
    decayStateComputedAt: nowStr,
    freshnessType: entry.decayMeta?.freshnessType ?? 'evergreen',
  };
  entry.updatedAt = nowStr;

  return true;
}

/**
 * Get lifecycle trigger rules from environment or defaults.
 */
export function getLifecycleTriggerRules(): LifecycleTriggerRule[] {
  // For now, use defaults. Could be extended to read from env/config.
  return DEFAULT_LIFECYCLE_TRIGGER_RULES;
}
