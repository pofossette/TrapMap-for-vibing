/**
 * Candidate-ingestion bounded context — LLM dedup judgment rules.
 *
 * Pure LLM duplicate-judgment shape and taxonomy rules with zero
 * framework / DB / I/O imports. The service layer composes its transport
 * zod schema from these; these declarations are the single source of the
 * judgment vocabulary.
 */

/** Overlap taxonomy the LLM judgment classifies a candidate pair into. */
export const LLM_DUPLICATE_OVERLAP_TYPES = ['exact', 'semantic', 'none'] as const;

export type LlmDuplicateOverlapType = (typeof LLM_DUPLICATE_OVERLAP_TYPES)[number];

/** Bounds applied to the LLM judgment confidence and reasoning fields. */
export const LLM_DUPLICATE_CONFIDENCE_MIN = 0;

export const LLM_DUPLICATE_CONFIDENCE_MAX = 1;

export const LLM_DUPLICATE_REASONING_MIN = 1;

export const LLM_DUPLICATE_REASONING_MAX = 1024;

/** Structured judgment returned by the dedup LLM for one candidate pair. */
export interface LlmDuplicateJudgment {
  /** Whether the candidate is considered a duplicate of the existing entry */
  isDuplicate: boolean;
  /** Confidence score between 0 and 1 */
  confidence: number;
  /** Classification of the overlap relationship */
  overlapType: LlmDuplicateOverlapType;
  /** Human-readable explanation of the judgment */
  reasoning: string;
}
