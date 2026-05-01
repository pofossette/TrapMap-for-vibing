/**
 * Summary verdict assertions for summary evaluation.
 *
 * Phase 27-02: SEVAL-01, SEVAL-02
 *
 * This module evaluates verdicts for summary evaluation cases.
 * Verdicts are explicit pass/fail decisions for groundedness, coverage,
 * forbidden claims, and execution success.
 *
 * Key design:
 * - Verdicts are separate from scores for explicit failure visibility
 * - Each verdict has a kind, passed status, and optional failure details
 * - Overall case passes only if all verdicts pass
 */

import type { SummaryEvalCase } from '@trapmap/contracts';
import type { SummaryJudgeResult } from './types.js';

// =============================================================================
// Verdict Types
// =============================================================================

/**
 * Kinds of verdicts for summary evaluation.
 */
export type SummaryVerdictKind = 'groundedness' | 'coverage' | 'forbidden' | 'execution';

/**
 * A single verdict for a summary evaluation case.
 */
export interface SummaryVerdict {
  /** Kind of verdict */
  kind: SummaryVerdictKind;
  /** Whether this verdict passed */
  passed: boolean;
  /** Failure details, if not passed */
  failure?: { kind: string; description: string };
}

// =============================================================================
// Verdict Evaluation
// =============================================================================

/**
 * Evaluate all verdicts for a summary evaluation case.
 *
 * Verdicts are evaluated in order:
 * 1. Groundedness - checks if groundedness score meets minimum threshold
 * 2. Coverage - checks if coverage score meets minimum threshold
 * 3. Forbidden - checks if no forbidden claims were found
 * 4. Execution - checks if execution completed without errors (always passes for now)
 *
 * @param params - The evaluation case and judge result
 * @returns All verdicts and overall passed status
 */
export function evaluateSummaryVerdicts(params: {
  case_: SummaryEvalCase;
  judgeResult: SummaryJudgeResult;
}): { verdicts: SummaryVerdict[]; passed: boolean } {
  const { case_, judgeResult } = params;
  const verdicts: SummaryVerdict[] = [];

  // 1. Groundedness verdict
  const minGroundedness = case_.expected.minGroundedness ?? 0.8;
  const groundednessPassed = judgeResult.groundednessScore >= minGroundedness;
  verdicts.push({
    kind: 'groundedness',
    passed: groundednessPassed,
    failure: groundednessPassed
      ? undefined
      : {
          kind: 'groundedness-below-threshold',
          description: `Groundedness score ${judgeResult.groundednessScore.toFixed(2)} below minimum ${minGroundedness.toFixed(2)}`,
        },
  });

  // 2. Coverage verdict
  const minCoverage = case_.expected.minCoverage ?? 0.7;
  const coveragePassed = judgeResult.coverageScore >= minCoverage;
  verdicts.push({
    kind: 'coverage',
    passed: coveragePassed,
    failure: coveragePassed
      ? undefined
      : {
          kind: 'coverage-below-threshold',
          description: `Coverage score ${judgeResult.coverageScore.toFixed(2)} below minimum ${minCoverage.toFixed(2)}`,
        },
  });

  // 3. Forbidden claims verdict
  const forbiddenPassed = judgeResult.forbiddenClaimsFound.length === 0;
  verdicts.push({
    kind: 'forbidden',
    passed: forbiddenPassed,
    failure: forbiddenPassed
      ? undefined
      : {
          kind: 'forbidden-claim-found',
          description: `Found ${judgeResult.forbiddenClaimsFound.length} forbidden claims: ${judgeResult.forbiddenClaimsFound.join(', ')}`,
        },
  });

  // 4. Execution verdict (always passes unless there's an execution error)
  verdicts.push({
    kind: 'execution',
    passed: true,
  });

  const passed = verdicts.every((v) => v.passed);

  return { verdicts, passed };
}

// =============================================================================
// Verdict Analysis Helpers
// =============================================================================

/**
 * Check if verdicts have a groundedness failure.
 *
 * @param verdicts - Array of verdicts
 * @returns True if any groundedness verdict failed
 */
export function hasGroundednessFailure(verdicts: SummaryVerdict[]): boolean {
  return verdicts.some((v) => v.kind === 'groundedness' && !v.passed);
}

/**
 * Check if verdicts have a forbidden claims failure.
 *
 * @param verdicts - Array of verdicts
 * @returns True if any forbidden verdict failed
 */
export function hasForbiddenClaimsFailure(verdicts: SummaryVerdict[]): boolean {
  return verdicts.some((v) => v.kind === 'forbidden' && !v.passed);
}

/**
 * Check if verdicts have a coverage failure.
 *
 * @param verdicts - Array of verdicts
 * @returns True if any coverage verdict failed
 */
export function hasCoverageFailure(verdicts: SummaryVerdict[]): boolean {
  return verdicts.some((v) => v.kind === 'coverage' && !v.passed);
}

/**
 * Check if verdicts have an execution failure.
 *
 * @param verdicts - Array of verdicts
 * @returns True if any execution verdict failed
 */
export function hasExecutionFailure(verdicts: SummaryVerdict[]): boolean {
  return verdicts.some((v) => v.kind === 'execution' && !v.passed);
}

// =============================================================================
// Verdict Formatting
// =============================================================================

/**
 * Format a one-line summary of verdict status.
 *
 * @param verdicts - Array of verdicts
 * @returns One-line summary string
 */
export function formatVerdictsSummary(verdicts: SummaryVerdict[]): string {
  const passed = verdicts.filter((v) => v.passed).length;
  const total = verdicts.length;
  const failedKinds = verdicts.filter((v) => !v.passed).map((v) => v.kind);

  if (failedKinds.length === 0) {
    return `All verdicts passed (${passed}/${total})`;
  }

  return `${passed}/${total} verdicts passed - failures: ${failedKinds.join(', ')}`;
}
