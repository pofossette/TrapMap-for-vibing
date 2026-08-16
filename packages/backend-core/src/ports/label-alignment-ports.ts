/**
 * Label-alignment judgment node contract (design D8).
 *
 * Decides how a raw label aligns against the canonical label catalog
 * (existing / new / unsure). The rule implementation is an exact-match
 * strategy; the LLM implementation wraps the pre-contract `alignLabel`
 * LLM judgment — both share the same contract-level assertions.
 */

import type {
  LabelAlignmentCandidate,
  LabelAlignmentDecision,
  LabelAlignmentInput,
} from '@trapmap/contracts';

/** Result of a label-alignment judgment. */
export interface LabelAlignmentResult {
  /** The alignment decision. */
  decision: LabelAlignmentDecision;
  /** The candidates that were presented to the strategy. */
  candidates: LabelAlignmentCandidate[];
  /** Whether an LLM produced the decision (false = rule/fallback path). */
  llmSuccess: boolean;
}

/**
 * Judgment-node contract for label alignment strategy.
 */
export interface LabelAlignmentPort {
  align(input: LabelAlignmentInput): Promise<LabelAlignmentResult>;
}
