/**
 * Live Retrieval Version Comparison CLI
 *
 * Compares live eval reports from two different snapshot versions.
 * Produces a structured diff showing metric changes per slice and case.
 *
 * Usage:
 *   pnpm eval:retrieval:live:compare --baseline ./reports/live-baseline.json --current ./reports/live-current.json
 */

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import type {
  LiveEvalCaseDiff,
  LiveEvalComparisonReport,
  LiveEvalSliceDiff,
} from '../types/index.js';

// =============================================================================
// Report Shape (matches the JSON output from run.ts)
// =============================================================================

interface LiveReportCase {
  caseId: string;
  endpoint: string;
  tier: string;
  stability: string;
  passed: boolean;
  outcomeMatch: boolean;
  governancePassed: boolean;
  durationMs: number;
  hitAt1: number;
  hitAt5: number;
  hitAt10: number;
  mrr: number;
  ndcg: number;
  recallAt10: number;
  fallbackApplied: boolean;
}

interface LiveReport {
  meta: {
    snapshotVersion: string;
    snapshotFingerprint: string;
    restoreMode: string;
    timestamp: string;
    durationMs: number;
  };
  summary: {
    totalCases: number;
    passedCases: number;
    failedCases: number;
    passRate: number;
  };
  cases: LiveReportCase[];
}

// =============================================================================
// Comparison Logic
// =============================================================================

function compareSlices(baseline: LiveReport, current: LiveReport): LiveEvalSliceDiff[] {
  const endpoints = new Set([
    ...baseline.cases.map((c) => c.endpoint),
    ...current.cases.map((c) => c.endpoint),
  ]);

  const diffs: LiveEvalSliceDiff[] = [];

  for (const endpoint of endpoints) {
    const baselineCases = baseline.cases.filter((c) => c.endpoint === endpoint);
    const currentCases = current.cases.filter((c) => c.endpoint === endpoint);

    const avgHitAt1 = (cases: LiveReportCase[]) =>
      cases.length > 0 ? cases.reduce((sum, c) => sum + c.hitAt1, 0) / cases.length : 0;
    const avgMrr = (cases: LiveReportCase[]) =>
      cases.length > 0 ? cases.reduce((sum, c) => sum + c.mrr, 0) / cases.length : 0;
    const govFailures = (cases: LiveReportCase[]) =>
      cases.filter((c) => !c.governancePassed).length;

    const hitAt1Baseline = avgHitAt1(baselineCases);
    const hitAt1Current = avgHitAt1(currentCases);
    const mrrBaseline = avgMrr(baselineCases);
    const mrrCurrent = avgMrr(currentCases);

    const hitAt1Diff = hitAt1Current - hitAt1Baseline;
    const mrrDiff = mrrCurrent - mrrBaseline;

    let verdict: 'improved' | 'regressed' | 'stable';
    if (hitAt1Diff < -0.05 || mrrDiff < -0.05) {
      verdict = 'regressed';
    } else if (hitAt1Diff > 0.05 || mrrDiff > 0.05) {
      verdict = 'improved';
    } else {
      verdict = 'stable';
    }

    diffs.push({
      endpoint: endpoint as LiveEvalSliceDiff['endpoint'],
      caseCount: Math.max(baselineCases.length, currentCases.length),
      hitAt1Baseline,
      hitAt1Current,
      hitAt1Diff,
      mrrBaseline,
      mrrCurrent,
      mrrDiff,
      governanceFailuresBaseline: govFailures(baselineCases),
      governanceFailuresCurrent: govFailures(currentCases),
      verdict,
    });
  }

  return diffs;
}

function compareCases(baseline: LiveReport, current: LiveReport): LiveEvalCaseDiff[] {
  const baselineMap = new Map(baseline.cases.map((c) => [c.caseId, c]));
  const currentMap = new Map(current.cases.map((c) => [c.caseId, c]));

  const allCaseIds = new Set([...baselineMap.keys(), ...currentMap.keys()]);
  const diffs: LiveEvalCaseDiff[] = [];

  for (const caseId of allCaseIds) {
    const b = baselineMap.get(caseId);
    const c = currentMap.get(caseId);

    if (!b || !c) continue;

    const hitAt1Diff = c.hitAt1 - b.hitAt1;
    const mrrDiff = c.mrr - b.mrr;
    const outcomeChanged = b.outcomeMatch !== c.outcomeMatch;
    const governanceChanged = b.governancePassed !== c.governancePassed;
    const fallbackChanged =
      b.endpoint === '/v3/retrieval/search' ? b.fallbackApplied !== c.fallbackApplied : undefined;

    let verdict: LiveEvalCaseDiff['verdict'];
    if (governanceChanged && !c.governancePassed) {
      verdict = 'regressed';
    } else if (outcomeChanged && !c.outcomeMatch) {
      verdict = 'regressed';
    } else if (hitAt1Diff > 0.05 || mrrDiff > 0.05) {
      verdict = 'improved';
    } else if (hitAt1Diff < -0.05 || mrrDiff < -0.05) {
      verdict = 'regressed';
    } else if (fallbackChanged) {
      verdict = 'diverged';
    } else {
      verdict = 'stable';
    }

    diffs.push({
      caseId,
      endpoint: c.endpoint as LiveEvalCaseDiff['endpoint'],
      hitAt1Diff,
      mrrDiff,
      outcomeChanged,
      governanceChanged,
      fallbackChanged,
      verdict,
    });
  }

  return diffs;
}

// =============================================================================
// CLI
// =============================================================================

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      baseline: { type: 'string' },
      current: { type: 'string' },
      json: { type: 'boolean', default: false },
    },
    strict: true,
  });

  if (!values.baseline || !values.current) {
    console.error('Usage: --baseline <path> --current <path> [--json]');
    process.exit(1);
  }

  const [baselineRaw, currentRaw] = await Promise.all([
    readFile(values.baseline, 'utf8'),
    readFile(values.current, 'utf8'),
  ]);

  const baseline = JSON.parse(baselineRaw) as LiveReport;
  const current = JSON.parse(currentRaw) as LiveReport;

  const slices = compareSlices(baseline, current);
  const cases = compareCases(baseline, current);

  // Overall verdict
  const hasRegressed = slices.some((s) => s.verdict === 'regressed');
  const hasImproved = slices.some((s) => s.verdict === 'improved');
  let overallVerdict: LiveEvalComparisonReport['overallVerdict'];
  if (hasRegressed && hasImproved) overallVerdict = 'mixed';
  else if (hasRegressed) overallVerdict = 'regressed';
  else if (hasImproved) overallVerdict = 'improved';
  else overallVerdict = 'stable';

  const report: LiveEvalComparisonReport = {
    baseline: {
      snapshotVersion: baseline.meta.snapshotVersion,
      snapshotFingerprint: baseline.meta.snapshotFingerprint,
      restoreMode: baseline.meta.restoreMode as LiveEvalComparisonReport['baseline']['restoreMode'],
      timestamp: baseline.meta.timestamp,
    },
    current: {
      snapshotVersion: current.meta.snapshotVersion,
      snapshotFingerprint: current.meta.snapshotFingerprint,
      restoreMode: current.meta.restoreMode as LiveEvalComparisonReport['current']['restoreMode'],
      timestamp: current.meta.timestamp,
    },
    slices,
    cases,
    overallVerdict,
  };

  if (values.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Human-readable output
  console.log('\n=== Snapshot Version Comparison ===');
  console.log(`Baseline: ${baseline.meta.snapshotVersion} (${baseline.meta.restoreMode})`);
  console.log(`Current:  ${current.meta.snapshotVersion} (${current.meta.restoreMode})`);
  console.log(`Overall:  ${overallVerdict.toUpperCase()}`);

  for (const slice of slices) {
    const arrow = (v: number) => (v > 0 ? `+${v.toFixed(3)}` : v < 0 ? v.toFixed(3) : '±0.000');
    const label = (v: string) =>
      v === 'improved' ? 'IMPROVED' : v === 'regressed' ? 'REGRESSED' : 'STABLE';

    console.log(`\n[${slice.endpoint}] (${slice.caseCount} cases)`);
    console.log(
      `  Hit@1:  ${slice.hitAt1Baseline.toFixed(3)} → ${slice.hitAt1Current.toFixed(3)} (${arrow(slice.hitAt1Diff)}) ${label(slice.verdict)}`,
    );
    console.log(
      `  MRR:    ${slice.mrrBaseline.toFixed(3)} → ${slice.mrrCurrent.toFixed(3)} (${arrow(slice.mrrDiff)})`,
    );
    console.log(
      `  Gov failures: ${slice.governanceFailuresBaseline} → ${slice.governanceFailuresCurrent}`,
    );
  }

  // Case-level diffs for non-stable cases
  const significantDiffs = cases.filter((d) => d.verdict !== 'stable');
  if (significantDiffs.length > 0) {
    console.log('\n=== Case-level Diffs ===');
    for (const diff of significantDiffs) {
      const parts = [`Hit@1 ${diff.hitAt1Diff >= 0 ? '+' : ''}${diff.hitAt1Diff.toFixed(2)}`];
      if (diff.fallbackChanged) parts.push('fallback changed');
      console.log(`  ${diff.caseId}: ${parts.join(', ')} (${diff.verdict.toUpperCase()})`);
    }
  }

  console.log('');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
