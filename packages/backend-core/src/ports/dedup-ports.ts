/**
 * Dedup-strategy judgment node contract (design D8).
 *
 * Selects and runs the candidate duplicate-detection strategy. The rule
 * implementation wraps the pre-contract Jaccard/fingerprint detector
 * (`createCandidateDuplicateDetector`); an LLM variant can plug in behind
 * the same port.
 */

import type {
  AnalysisSnapshot,
  CandidateCorpusReadPort,
  CandidateSubmission,
  DuplicateCase,
  JudgmentMode,
} from '@trapmap/contracts';

import type { NormalizedDuplicateInput } from '../candidate-ingestion/domain/dedup.js';

/** Input to duplicate detection. */
export interface DedupStrategyInput {
  /** The candidate submission being analyzed. */
  candidate: CandidateSubmission;
  /** Normalized (fingerprinted) duplicate input derived from the candidate. */
  normalized: NormalizedDuplicateInput;
  /** Corpus of approved entries to compare against. */
  corpus: CandidateCorpusReadPort;
}

/** Result of duplicate detection. */
export interface DedupStrategyResult {
  /** Detected duplicate case (null when the candidate is independent). */
  duplicateCase: DuplicateCase | null;
  /** Analysis snapshot recorded for review/debugging. */
  analysisSnapshot: AnalysisSnapshot;
  /** Which strategy implementation produced the result. */
  strategy: JudgmentMode;
}

/**
 * Judgment-node contract for candidate duplicate-strategy selection.
 */
export interface DedupStrategyPort {
  detect(input: DedupStrategyInput): Promise<DedupStrategyResult>;
}
