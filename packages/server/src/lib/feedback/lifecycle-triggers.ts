/**
 * Lifecycle transition triggers based on feedback patterns.
 *
 * Implements automatic state transitions when feedback patterns
 * indicate quality issues with a knowledge entry.
 */

import type { DecayState, LifecycleTriggerRule } from '@trapmap/contracts';
import { DEFAULT_LIFECYCLE_TRIGGER_RULES } from '@trapmap/contracts';

import type { FeedbackQueueRecord } from '@trapmap/server/lib/store.js';

/**
 * Result of checking lifecycle triggers for an entry.
 */
interface LifecycleTriggerResult {
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
 * Get lifecycle trigger rules from environment or defaults.
 */
export function getLifecycleTriggerRules(): LifecycleTriggerRule[] {
  // For now, use defaults. Could be extended to read from env/config.
  return DEFAULT_LIFECYCLE_TRIGGER_RULES;
}
