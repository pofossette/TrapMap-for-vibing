/**
 * Shared runner result and judge types for summary evaluation.
 *
 * Phase 27-01: SEVAL-01, SEVAL-02
 * These types support the judge-driven verification, scoring, and reporting.
 */

import type {
  SummaryEvalCase,
  SummaryEvalEndpoint,
  SummaryEvalTier,
} from '@trapmap/contracts/evals';

// =============================================================================
// Judge Provider Type
// =============================================================================

/**
 * LLM provider for judge-driven verification.
 * - openai: Primary OpenAI GPT-based judge
 * - fallback: Local/deterministic fallback when LLM unavailable
 */
export type JudgeProvider = 'openai' | 'fallback';

// =============================================================================
// Claim Extraction Types
// =============================================================================

/**
 * A claim extracted from a summary for verification.
 * Claims are atomic assertions that can be verified against retrieved context.
 */
export interface ExtractedClaim {
  /** The claim text */
  text: string;
  /** Optional citation ID if the claim references a specific source */
  citationId?: string;
}

// =============================================================================
// Claim Verification Types
// =============================================================================

/**
 * Result of verifying a single claim against context.
 * The judge determines if the claim is supported by the retrieved context.
 */
export interface ClaimVerification {
  /** The claim text */
  text: string;
  /** Whether the claim is supported by context */
  supported: boolean;
  /** Supporting evidence from context (if supported) */
  evidence?: string;
}

// =============================================================================
// Judge Result Types
// =============================================================================

/**
 * Complete result from the summary judge.
 * Contains all verification results for groundedness and coverage scoring.
 */
export interface SummaryJudgeResult {
  /** Verification results for each extracted claim */
  claims: ClaimVerification[];
  /** Groundedness score (ratio of supported claims) */
  groundednessScore: number;
  /** Coverage score (ratio of required facts covered) */
  coverageScore: number;
  /** Required facts that were found in the summary */
  requiredFactsCovered: string[];
  /** Required facts that were missing from the summary */
  requiredFactsMissing: string[];
  /** Forbidden claims that were found in the summary */
  forbiddenClaimsFound: string[];
  /** Provider used for this judge result */
  provider: JudgeProvider;
}

// =============================================================================
// Case Result Types
// =============================================================================

/**
 * Result of evaluating a single summary eval case.
 */
export interface SummaryCaseResult {
  /** The case that was evaluated */
  case: SummaryEvalCase;
  /** Judge verification result */
  judgeResult: SummaryJudgeResult;
  /** Whether the case passed overall */
  passed: boolean;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Warnings encountered during evaluation */
  warnings: Array<{ code: string; message: string }>;
  /** Raw retrieval response for trace/debug */
  rawResponse?: unknown;
  /** Context strings extracted from retrieval results */
  contextTrace: string[];
  /** Summary text that was evaluated */
  summaryText: string | null;
}

// =============================================================================
// Runner Options Types
// =============================================================================

/**
 * Options for the summary eval runner.
 */
export interface RunnerOptions {
  /** Evaluation tier to run */
  tier: SummaryEvalTier;
  /** Endpoint filter (optional) */
  endpoint?: SummaryEvalEndpoint;
  /** Whether to produce JSON output */
  json: boolean;
  /** Output path for JSON report (optional) */
  jsonPath?: string;
  /** Whether to allow empty dataset */
  allowEmpty: boolean;
  /** Whether to skip execution (dry-run mode) */
  dryRun: boolean;
  /** Verbosity level (0=quiet, 1=normal, 2=verbose) */
  verbose: number;
  /** LLM provider for judge (optional, defaults to openai) */
  llmProvider?: JudgeProvider;
}
