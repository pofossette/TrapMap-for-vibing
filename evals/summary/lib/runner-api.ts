/**
 * Programmatic API for the summary evaluation runner.
 *
 * Phase 28-01: EOPS-01
 *
 * Wraps the summary runner for consumption by eval-all.ts.
 * Provides a function-based API that returns structured results
 * instead of writing directly to stdout.
 */

import {
  type SummaryEvalCase,
  type SummaryEvalEndpoint,
  type SummaryEvalTier,
  summaryEvalCaseSchema,
} from '../../../packages/contracts/src/index.js';

import { coreCases } from '../core.js';
import { summarySmokeCases } from '../smoke.js';

import { evaluateSummaryVerdicts } from './assertions.js';
import { createJudge, fallbackJudge } from './judge.js';
import { buildSummaryReport } from './report.js';
import type { JudgeProvider, RunnerOptions, SummaryCaseResult } from './types.js';

// =============================================================================
// Types
// =============================================================================

export interface RunSummaryOptions {
  tier: SummaryEvalTier;
  dryRun?: boolean;
  allowEmpty?: boolean;
  endpoint?: SummaryEvalEndpoint;
  verbose?: number;
  provider?: JudgeProvider;
}

export interface RunSummaryResult {
  passed: boolean;
  report: unknown;
  summary: {
    totalCases: number;
    passedCases: number;
    failedCases: number;
    passRate: number;
    avgGroundedness: number;
    avgCoverage: number;
    forbiddenClaimHits: number;
  };
  durationMs: number;
}

// =============================================================================
// Case Loading
// =============================================================================

/**
 * Load cases for the specified tier.
 */
function loadCasesForTier(tier: SummaryEvalTier): SummaryEvalCase[] {
  const rawCases = tier === 'smoke' ? summarySmokeCases : coreCases;

  const validatedCases: SummaryEvalCase[] = [];
  for (const rawCase of rawCases) {
    try {
      const parsed = summaryEvalCaseSchema.parse(rawCase);
      validatedCases.push(parsed);
    } catch (error) {
      console.error(`Invalid case in ${tier} tier:`, error);
      throw error;
    }
  }

  return validatedCases;
}

/**
 * Filter cases by endpoint if specified.
 */
function filterCasesByEndpoint(
  cases_: SummaryEvalCase[],
  endpoint?: SummaryEvalEndpoint,
): SummaryEvalCase[] {
  if (!endpoint) return cases_;
  return cases_.filter((c) => c.endpoint === endpoint);
}

// =============================================================================
// Mock Execution (for dry-run and testing)
// =============================================================================

/**
 * Generate mock summary for testing.
 */
function generateMockSummary(case_: SummaryEvalCase): string {
  const parts: string[] = [];

  if (case_.expected.requiredFacts.length > 0) {
    parts.push(case_.expected.requiredFacts[0]!);
  }

  parts.push('This is a summary of the retrieved knowledge.');
  return parts.join(' ');
}

/**
 * Generate mock context for testing.
 */
function generateMockContext(case_: SummaryEvalCase): string[] {
  const context: string[] = [];

  for (const fact of case_.expected.requiredFacts) {
    context.push(`Knowledge entry: ${fact}. This is relevant information.`);
  }

  return context;
}

// =============================================================================
// Programmatic Runner
// =============================================================================

/**
 * Run summary evaluation programmatically.
 *
 * @param options - Runner options
 * @returns Structured evaluation result
 */
export async function runSummaryEvaluation(options: RunSummaryOptions): Promise<RunSummaryResult> {
  const startTime = Date.now();
  const tier = options.tier;
  const dryRun = options.dryRun ?? false;
  const allowEmpty = options.allowEmpty ?? false;
  const provider = options.provider ?? 'fallback';

  // Load and validate cases
  let cases_ = loadCasesForTier(tier);
  cases_ = filterCasesByEndpoint(cases_, options.endpoint);

  if (cases_.length === 0) {
    if (allowEmpty) {
      return {
        passed: true,
        report: null,
        summary: {
          totalCases: 0,
          passedCases: 0,
          failedCases: 0,
          passRate: 0,
          avgGroundedness: 0,
          avgCoverage: 0,
          forbiddenClaimHits: 0,
        },
        durationMs: Date.now() - startTime,
      };
    }
    throw new Error(`No cases found for tier '${tier}'. Use allowEmpty to skip.`);
  }

  if (dryRun) {
    return {
      passed: true,
      report: null,
      summary: {
        totalCases: cases_.length,
        passedCases: cases_.length,
        failedCases: 0,
        passRate: 1,
        avgGroundedness: 1,
        avgCoverage: 1,
        forbiddenClaimHits: 0,
      },
      durationMs: Date.now() - startTime,
    };
  }

  // Execute cases
  const caseResults: SummaryCaseResult[] = [];

  for (const case_ of cases_) {
    const caseStartTime = Date.now();
    const warnings: Array<{ code: string; message: string }> = [];

    // Generate mock summary and context (Phase 27-02 implementation)
    const mockSummary = generateMockSummary(case_);
    const mockContext = generateMockContext(case_);

    // Run judge evaluation
    const judge = createJudge({ provider });
    const judgeResult = judge.evaluate(mockSummary, mockContext, {
      requiredFacts: case_.expected.requiredFacts,
      forbiddenClaims: case_.expected.forbiddenClaims,
    });

    // Evaluate verdicts
    const { verdicts, passed } = evaluateSummaryVerdicts({
      case_,
      judgeResult,
    });

    const durationMs = Date.now() - caseStartTime;

    caseResults.push({
      case: case_,
      judgeResult,
      passed,
      durationMs,
      warnings,
    });
  }

  // Build canonical report
  const runnerOptions: RunnerOptions = {
    tier,
    endpoint: options.endpoint,
    json: false,
    jsonPath: undefined,
    allowEmpty,
    dryRun,
    verbose: options.verbose ?? 0,
    llmProvider: provider,
  };

  const report = buildSummaryReport({
    caseResults,
    options: runnerOptions,
    durationMs: Date.now() - startTime,
    llmProvider: provider,
  });

  const totalCases = caseResults.length;
  const passedCases = caseResults.filter((r) => r.passed).length;

  return {
    passed: passedCases === totalCases,
    report,
    summary: {
      totalCases,
      passedCases,
      failedCases: totalCases - passedCases,
      passRate: totalCases > 0 ? passedCases / totalCases : 0,
      avgGroundedness: report.summary.avgGroundedness,
      avgCoverage: report.summary.avgCoverage,
      forbiddenClaimHits: report.summary.forbiddenClaimHits,
    },
    durationMs: Date.now() - startTime,
  };
}
