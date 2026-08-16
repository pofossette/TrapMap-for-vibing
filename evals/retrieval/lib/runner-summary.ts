/**
 * Shared retrieval runner-summary builders.
 *
 * `aggregateSliceMetrics` + `buildRunnerSummary` + `formatRunnerSummary` produce
 * the same slice aggregation, summary object and terminal text the native CLI
 * prints, so `--runner promptfoo` output is identical to native. Shared by the
 * native runner and the promptfoo bridge.
 */

import type { RetrievalEvalTier } from '../../types/index.js';

import { averageMetrics } from './metrics.js';
import type { CaseResult, RunnerOptions, RunnerSummary, SliceKey, SliceMetrics } from './types.js';

/**
 * Aggregate metrics by slice.
 */
export function aggregateSliceMetrics(results: CaseResult[]): SliceMetrics[] {
  const sliceMap = new Map<string, CaseResult[]>();

  for (const result of results) {
    const key: SliceKey = {
      tier: result.case.tier,
      endpoint: result.case.endpoint,
      ...(result.case.request.mode !== undefined ? { mode: result.case.request.mode } : {}),
    };
    const keyStr = `${key.tier}:${key.endpoint}:${key.mode ?? 'none'}`;

    const existing = sliceMap.get(keyStr) ?? [];
    existing.push(result);
    sliceMap.set(keyStr, existing);
  }

  const slices: SliceMetrics[] = [];

  for (const [keyStr, sliceResults] of sliceMap) {
    const [tier, endpoint, mode] = keyStr.split(':');
    const metrics = averageMetrics(sliceResults.map((r) => r.metrics));
    const governanceFailures = sliceResults.filter((r) => !r.governance.passed).length;

    const modeCounts = new Map<string, number>();
    for (const r of sliceResults) {
      if (r.execution.selectedMode) {
        modeCounts.set(
          r.execution.selectedMode,
          (modeCounts.get(r.execution.selectedMode) ?? 0) + 1,
        );
      }
    }
    let selectedMode: string | undefined;
    let maxCount = 0;
    for (const [m, count] of modeCounts) {
      if (count > maxCount) {
        maxCount = count;
        selectedMode = m;
      }
    }

    const fallbackApplied = sliceResults.some((r) => r.execution.fallbackApplied);

    slices.push({
      slice: {
        tier: tier as RetrievalEvalTier,
        endpoint: endpoint as SliceKey['endpoint'],
        ...(mode !== 'none' ? { mode: mode as 'semantic' | 'hybrid' | 'graph-assisted' } : {}),
      },
      caseCount: sliceResults.length,
      avgHitAt1: metrics.hitAt1,
      avgHitAt5: metrics.hitAt5,
      avgHitAt10: metrics.hitAt10,
      avgMrr: metrics.mrr,
      avgNdcg: metrics.ndcg,
      avgRecallAt10: metrics.recallAt10,
      governanceFailures,
      ...(selectedMode !== undefined
        ? {
            selectedMode: selectedMode as 'naive' | 'local' | 'global' | 'hybrid' | 'mix' | 'auto',
          }
        : {}),
      fallbackApplied,
      regressionStatus: 'no-baseline',
    });
  }

  return slices;
}

/**
 * Build the runner summary object the CLI serializes as JSON.
 */
export function buildRunnerSummary(
  caseResults: CaseResult[],
  options: RunnerOptions,
  durationMs: number,
): RunnerSummary {
  const passedCases = caseResults.filter((r) => r.passed).length;
  return {
    options,
    caseResults,
    sliceMetrics: aggregateSliceMetrics(caseResults),
    totalCases: caseResults.length,
    passedCases,
    failedCases: caseResults.length - passedCases,
    passRate: caseResults.length > 0 ? passedCases / caseResults.length : 0,
    timestamp: new Date().toISOString(),
    durationMs,
  };
}

/**
 * Format the terminal summary the native CLI prints.
 */
export function formatRunnerSummary(results: CaseResult[], slices: SliceMetrics[]): string {
  const lines: string[] = [];
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const passRate = results.length > 0 ? passed / results.length : 0;

  lines.push('\n=== Evaluation Summary ===');
  lines.push(`Total cases: ${results.length}`);
  lines.push(`Passed: ${passed}`);
  lines.push(`Failed: ${failed}`);
  lines.push(`Pass rate: ${(passRate * 100).toFixed(1)}%`);
  lines.push('');

  lines.push('=== Slice Metrics ===');
  for (const slice of slices) {
    const modeStr = slice.slice.mode ? ` (${slice.slice.mode})` : '';
    lines.push(`\n[${slice.slice.tier}] ${slice.slice.endpoint}${modeStr}`);
    lines.push(`  Cases: ${slice.caseCount}`);
    lines.push(`  Avg Hit@1: ${slice.avgHitAt1.toFixed(2)}`);
    lines.push(`  Avg Hit@5: ${slice.avgHitAt5.toFixed(2)}`);
    lines.push(`  Avg Hit@10: ${slice.avgHitAt10.toFixed(2)}`);
    lines.push(`  Avg MRR: ${slice.avgMrr.toFixed(2)}`);
    lines.push(`  Avg nDCG: ${slice.avgNdcg.toFixed(2)}`);
    lines.push(`  Avg Recall@10: ${slice.avgRecallAt10.toFixed(2)}`);
    lines.push(`  Governance failures: ${slice.governanceFailures}`);
  }

  const govFailures = results.filter((r) => !r.governance.passed);
  if (govFailures.length > 0) {
    lines.push('\n=== Governance Failures ===');
    for (const result of govFailures) {
      lines.push(`\n${result.case.caseId}:`);
      for (const failure of result.governance.failures) {
        lines.push(`  - [${failure.kind}] ${failure.description}`);
      }
    }
  }

  const graphPlanFailures = results.filter((r) => r.graphPlanResult && !r.graphPlanResult.passed);
  if (graphPlanFailures.length > 0) {
    lines.push('\n=== Graph-Plan Structural Failures ===');
    for (const result of graphPlanFailures) {
      lines.push(`\n${result.case.caseId}:`);
      for (const failure of result.graphPlanResult!.failures) {
        lines.push(`  - [${failure.kind}] ${failure.description}`);
        if (failure.expected.length > 0) {
          lines.push(`    expected: ${failure.expected.join(', ')}`);
        }
        if (failure.actual.length > 0) {
          lines.push(`    actual: ${failure.actual.join(', ')}`);
        }
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}
