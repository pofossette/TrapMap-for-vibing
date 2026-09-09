/**
 * Label-alignment judgment node rule implementation (design D8).
 *
 * Exact-match strategy against the candidate catalog: an exact alias or
 * canonical-name hit maps to an existing label; no candidates creates a
 * new label; otherwise it is 'unsure' and requires review.
 */

import type { LabelAlignmentPort } from '@trapmap/backend-core';

/** Rule-judgment confidences — centralized names, values unchanged. */
const RULE_CONFIDENCE_NEW = 0.8;
const RULE_CONFIDENCE_EXISTING = 1;
const RULE_CONFIDENCE_UNSURE = 0;

/**
 * Create the label-alignment rule port (precise exact-match strategy).
 */
export function createRuleLabelAlignment(): LabelAlignmentPort {
  return {
    async align(input) {
      if (input.candidates.length === 0) {
        return {
          decision: {
            decision: 'new',
            canonicalName: input.rawLabel,
            confidence: RULE_CONFIDENCE_NEW,
            reasoning: 'no candidate found; create new label',
          },
          candidates: input.candidates,
          llmSuccess: false,
        };
      }

      const exact = input.candidates.find(
        (c) =>
          c.aliases.some((a) => a.toLowerCase() === input.rawLabel.toLowerCase()) ||
          c.canonicalName.toLowerCase() === input.rawLabel.toLowerCase(),
      );

      if (exact) {
        return {
          decision: {
            decision: 'existing',
            canonicalLabelId: exact.id,
            confidence: RULE_CONFIDENCE_EXISTING,
            reasoning: 'exact alias or name match',
          },
          candidates: input.candidates,
          llmSuccess: false,
        };
      }

      return {
        decision: {
          decision: 'unsure',
          confidence: RULE_CONFIDENCE_UNSURE,
          reasoning: 'no exact match; requires review',
        },
        candidates: input.candidates,
        llmSuccess: false,
      };
    },
  };
}
