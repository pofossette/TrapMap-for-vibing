/**
 * Programmatic API for the retrieval evaluation runner.
 *
 * Phase 28-01: EOPS-01
 *
 * Wraps the retrieval runner for consumption by eval-all.ts.
 * Provides a function-based API that returns structured results
 * instead of writing directly to stdout.
 */

import {
  type RetrievalEvalCase,
  type RetrievalEvalTier,
  retrievalEvalCaseSchema,
} from '@trapmap/contracts/evals';

import { coreCases } from '../core.js';
import { smokeCases } from '../smoke.js';

import {
  closeExecutionContext,
  createExecutionContext,
  executeCase,
  seedScenarioFixtures,
} from './adapters.js';
import { evaluateGovernance } from './governance.js';
import { filterByEndpoint, loadCases } from './load.js';
import { averageMetrics, calculateMetrics } from './metrics.js';
import { buildReport } from './report.js';
import type { CaseResult, RunnerSummary, SliceKey, SliceMetrics } from './types.js';

// =============================================================================
// Types
// =============================================================================

export interface RunRetrievalOptions {
  tier: RetrievalEvalTier;
  dryRun?: boolean;
  allowEmpty?: boolean;
  endpoint?:
    | '/v1/retrieval/search'
    | '/v1/retrieval/skills/search-by-content'
    | '/v2/retrieval/search'
    | '/v3/retrieval/search';
  verbose?: number;
}

export interface RunRetrievalResult {
  passed: boolean;
  report: unknown;
  summary: {
    totalCases: number;
    passedCases: number;
    failedCases: number;
    passRate: number;
  };
  slices: Array<{
    slice: { tier: string; endpoint: string; mode?: string };
    caseCount: number;
    passedCount: number;
    failedCount: number;
    passRate: number;
    avgHitAt1: number;
    avgMrr: number;
    avgNdcg: number;
  }>;
  durationMs: number;
}

// =============================================================================
// Programmatic Runner
// =============================================================================

/**
 * Run retrieval evaluation programmatically.
 *
 * @param options - Runner options
 * @returns Structured evaluation result
 */
export async function runRetrievalEvaluation(
  options: RunRetrievalOptions,
): Promise<RunRetrievalResult> {
  const startTime = Date.now();
  const tier = options.tier;
  const dryRun = options.dryRun ?? false;
  const allowEmpty = options.allowEmpty ?? false;

  // Load and validate cases
  const cases_ = loadCases(tier);
  const filtered = filterByEndpoint(cases_, options.endpoint);

  if (filtered.length === 0) {
    if (allowEmpty) {
      return {
        passed: true,
        report: null,
        summary: { totalCases: 0, passedCases: 0, failedCases: 0, passRate: 0 },
        slices: [],
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
        totalCases: filtered.length,
        passedCases: filtered.length,
        failedCases: 0,
        passRate: 1,
      },
      slices: [],
      durationMs: Date.now() - startTime,
    };
  }

  // Execute cases (each case gets isolated context to prevent data accumulation)
  const results: CaseResult[] = [];

  for (const case_ of filtered) {
    // Create isolated context for each case to prevent fixture bleeding
    const ctx = await createExecutionContext();

    try {
      // Seed fixture data for this case's scenario
      await seedScenarioFixtures(ctx, case_);

      const adapterResult = await executeCase(ctx, case_);
      const governance = evaluateGovernance(case_, adapterResult.result);
      const metrics = calculateMetrics(
        adapterResult.result,
        case_.expected.relevance.relevantIds,
        case_.expected.relevance.idealOrder,
      );

      const outcomeMatch =
        (case_.expected.outcome === 'empty' && adapterResult.result.isEmpty) ||
        (case_.expected.outcome === 'non-empty' && !adapterResult.result.isEmpty);
      const passed = governance.passed && outcomeMatch;

      results.push({
        case: case_,
        result: adapterResult.result,
        execution: adapterResult.execution,
        governance,
        metrics,
        passed,
        warnings: adapterResult.warnings,
      });
    } finally {
      await closeExecutionContext(ctx);
    }
  }

  // Build canonical report
  const report = buildReport(
    results,
    {
      tier,
      endpoint: options.endpoint,
      dryRun,
      allowEmpty,
      verbose: options.verbose ?? 0,
    },
    Date.now() - startTime,
  );

  // Aggregate slices
  const sliceMap = new Map<string, CaseResult[]>();
  for (const result of results) {
    const key: SliceKey = {
      tier: result.case.tier,
      endpoint: result.case.endpoint,
      mode: result.case.request.mode,
    };
    const keyStr = `${key.tier}:${key.endpoint}:${key.mode ?? 'none'}`;
    const existing = sliceMap.get(keyStr) ?? [];
    existing.push(result);
    sliceMap.set(keyStr, existing);
  }

  const slices = Array.from(sliceMap.entries()).map(([keyStr, sliceResults]) => {
    const [tier, endpoint, mode] = keyStr.split(':');
    const metrics = averageMetrics(sliceResults.map((r) => r.metrics));
    const passedCount = sliceResults.filter((r) => r.passed).length;

    return {
      slice: { tier, endpoint, mode: mode === 'none' ? undefined : mode },
      caseCount: sliceResults.length,
      passedCount,
      failedCount: sliceResults.length - passedCount,
      passRate: sliceResults.length > 0 ? passedCount / sliceResults.length : 0,
      avgHitAt1: metrics.hitAt1,
      avgMrr: metrics.mrr,
      avgNdcg: metrics.ndcg,
    };
  });

  const totalCases = results.length;
  const passedCases = results.filter((r) => r.passed).length;

  return {
    passed: passedCases === totalCases,
    report,
    summary: {
      totalCases,
      passedCases,
      failedCases: totalCases - passedCases,
      passRate: totalCases > 0 ? passedCases / totalCases : 0,
    },
    slices,
    durationMs: Date.now() - startTime,
  };
}
