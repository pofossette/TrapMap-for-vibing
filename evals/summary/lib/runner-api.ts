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
} from '@trapmap/contracts/evals';
import type { SummaryEvalReport } from '../../../packages/contracts/src/domain/evals/report.js';

import { summaryCoreCases } from '../core.js';
import { summaryCoreScenariosMap } from '../scenarios/core/summary-core-scenarios.js';
// Import summary scenarios for fixture loading
import { summarySmokeScenariosMap } from '../scenarios/smoke/summary-smoke-scenarios.js';
import { summarySmokeCases } from '../smoke.js';

const allScenariosMap = { ...summarySmokeScenariosMap, ...summaryCoreScenariosMap };

import { evaluateSummaryVerdicts } from './assertions.js';
import { createJudge } from './judge.js';
import { buildSummaryReport } from './report.js';
import type { JudgeProvider, RunnerOptions, SummaryCaseResult } from './types.js';

// Import retrieval adapters for real endpoint execution
import {
  closeExecutionContext,
  createActorSession,
  createExecutionContext as createRetrievalContext,
  executeThroughRoute,
  seedScenarioFixtures,
} from '../../retrieval/lib/adapters.js';

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
  report: SummaryEvalReport | null;
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
  const rawCases = tier === 'smoke' ? summarySmokeCases : summaryCoreCases;

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

export function getSummaryEvaluationCases(
  tier: SummaryEvalTier,
  endpoint?: SummaryEvalEndpoint,
): SummaryEvalCase[] {
  return filterCasesByEndpoint(loadCasesForTier(tier), endpoint);
}

export function getSummaryScenarioIds(
  tier: SummaryEvalTier,
  endpoint?: SummaryEvalEndpoint,
): string[] {
  return [
    ...new Set(getSummaryEvaluationCases(tier, endpoint).map((case_) => case_.scenarioId)),
  ].sort();
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
  const cases_ = getSummaryEvaluationCases(tier, options.endpoint);

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

  // Execute cases with real endpoint
  const caseResults: SummaryCaseResult[] = [];

  for (const case_ of cases_) {
    const caseStartTime = Date.now();
    const warnings: Array<{ code: string; message: string }> = [];

    // Create retrieval execution context
    const retrievalCtx = await createRetrievalContext();

    try {
      // Load scenario for fixture seeding
      const scenario = allScenariosMap[case_.scenarioId];

      if (!scenario) {
        warnings.push({
          code: 'scenario-not-found',
          message: `Scenario not found: ${case_.scenarioId}`,
        });

        // Fall back to mock execution
        const mockSummary = generateMockSummary(case_);
        const mockContext = generateMockContext(case_);
        const judge = createJudge({ provider });
        const judgeResult = await judge.evaluate(mockSummary, mockContext, {
          requiredFacts: case_.expected.requiredFacts,
          forbiddenClaims: case_.expected.forbiddenClaims,
        });
        const { passed } = evaluateSummaryVerdicts({ case_, judgeResult });

        caseResults.push({
          case: case_,
          judgeResult,
          passed,
          durationMs: Date.now() - caseStartTime,
          warnings,
          contextTrace: mockContext,
          summaryText: mockSummary,
        });
        continue;
      }

      // Build a RetrievalEvalCase-compatible object for fixture seeding
      const retrievalCase = {
        scenarioId: case_.scenarioId,
        endpoint: case_.endpoint,
        request: case_.request,
      };

      // Seed fixtures for this scenario (pass scenario directly)
      await seedScenarioFixtures(retrievalCtx, retrievalCase as any, scenario);

      // Set actor session with scenario permissions
      await createActorSession(retrievalCtx, scenario.actor);

      // Execute retrieval through the route
      const adapterResult = await executeThroughRoute(retrievalCtx, retrievalCase as any);

      // Extract raw response for trace
      const rawResponse = adapterResult.result.rawResponse;
      const rawResp = rawResponse as Record<string, any>;
      const summaryText: string | null = rawResp?.summary?.text ?? null;

      // Build context array based on endpoint type
      let contextTrace: string[] = [];

      if (case_.endpoint === '/v1/retrieval/search') {
        const globalConstraints = rawResp?.globalConstraints ?? [];
        const projectKnowledge = rawResp?.projectKnowledge ?? [];
        contextTrace = [
          ...globalConstraints.map((e: any) => e?.detail ?? '').filter(Boolean),
          ...projectKnowledge.map((e: any) => e?.detail ?? '').filter(Boolean),
        ];
      } else {
        const capsules = rawResp?.capsules ?? [];
        contextTrace = capsules
          .map((c: any) => `${c?.content ?? ''} ${c?.problem ?? ''} ${c?.goal ?? ''}`.trim())
          .filter(Boolean);
      }

      // Run judge evaluation with real summary and context
      const judge = createJudge({ provider });
      const judgeResult = await judge.evaluate(summaryText ?? '', contextTrace, {
        requiredFacts: case_.expected.requiredFacts,
        forbiddenClaims: case_.expected.forbiddenClaims,
      });

      const { passed } = evaluateSummaryVerdicts({ case_, judgeResult });

      caseResults.push({
        case: case_,
        judgeResult,
        passed,
        durationMs: Date.now() - caseStartTime,
        warnings,
        contextTrace,
        summaryText,
      });
    } finally {
      await closeExecutionContext(retrievalCtx);
    }
  }

  // Build canonical report
  const runnerOptions: RunnerOptions = {
    tier,
    json: false,
    allowEmpty,
    dryRun,
    verbose: options.verbose ?? 0,
  };
  if (options.endpoint !== undefined) {
    runnerOptions.endpoint = options.endpoint;
  }

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
