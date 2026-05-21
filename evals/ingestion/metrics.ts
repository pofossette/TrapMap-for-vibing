/**
 * Ingestion Eval Metrics & Reporting
 *
 * Computes aggregate statistics and formats terminal reports.
 */

import type { DerivationAssertionResult } from './assertions.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DerivationAggregateMetrics {
  totalBundles: number;
  passedBundles: number;
  failedBundles: number;
  passRate: number;
  profileNonNullRate: number;
  profileSummaryNonEmptyRate: number;
  avgSummaryLength: number;
  avgCapsulesPerSkill: number;
  minCapsules: number;
  maxCapsules: number;
  capsulesNonEmptyRate: number;
  allCapsulesHaveContentRate: number;
  keywordsNonEmptyRate: number;
  clientManifestNonNullRate: number;
  allSourceHashesValid: boolean;
  allTimestampsValid: boolean;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export function aggregateMetrics(
  results: DerivationAssertionResult[],
  capsuleCounts: number[],
): DerivationAggregateMetrics {
  const n = results.length;
  if (n === 0) {
    return {
      totalBundles: 0,
      passedBundles: 0,
      failedBundles: 0,
      passRate: 0,
      profileNonNullRate: 0,
      profileSummaryNonEmptyRate: 0,
      avgSummaryLength: 0,
      avgCapsulesPerSkill: 0,
      minCapsules: 0,
      maxCapsules: 0,
      capsulesNonEmptyRate: 0,
      allCapsulesHaveContentRate: 0,
      keywordsNonEmptyRate: 0,
      clientManifestNonNullRate: 0,
      allSourceHashesValid: true,
      allTimestampsValid: true,
    };
  }

  const count = (pred: (r: DerivationAssertionResult) => boolean) =>
    results.filter(pred).length / n;

  return {
    totalBundles: n,
    passedBundles: results.filter((r) => r.passed).length,
    failedBundles: results.filter((r) => !r.passed).length,
    passRate: results.filter((r) => r.passed).length / n,
    profileNonNullRate: count((r) => r.assertions.profileNonNull),
    profileSummaryNonEmptyRate: count((r) => r.assertions.profileSummaryNonEmpty),
    avgSummaryLength: 0, // computed separately
    avgCapsulesPerSkill:
      capsuleCounts.length > 0 ? capsuleCounts.reduce((a, b) => a + b, 0) / n : 0,
    minCapsules: capsuleCounts.length > 0 ? Math.min(...capsuleCounts) : 0,
    maxCapsules: capsuleCounts.length > 0 ? Math.max(...capsuleCounts) : 0,
    capsulesNonEmptyRate: count((r) => r.assertions.capsulesNonEmpty),
    allCapsulesHaveContentRate: count((r) => r.assertions.allCapsulesHaveContent),
    keywordsNonEmptyRate: count((r) => r.assertions.profileKeywordsNonEmpty),
    clientManifestNonNullRate: count((r) => r.assertions.clientManifestMatchesInput),
    allSourceHashesValid: results.every((r) => r.assertions.sourceHashNonEmpty),
    allTimestampsValid: results.every((r) => r.assertions.derivedAtValid),
  };
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

export function formatDerivationReport(
  results: DerivationAssertionResult[],
  metrics: DerivationAggregateMetrics,
  dryRun: boolean,
): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('============================================================');
  lines.push('         Ingestion / Derivation Evaluation Report');
  lines.push('============================================================');
  lines.push('');
  lines.push(`Mode: ${dryRun ? 'DRY-RUN (bundled fixtures)' : 'LIVE (downloaded skills)'}`);
  lines.push(`Total bundles: ${metrics.totalBundles}`);
  lines.push(`Passed: ${metrics.passedBundles}`);
  lines.push(`Failed: ${metrics.failedBundles}`);
  lines.push(`Pass rate: ${(metrics.passRate * 100).toFixed(1)}%`);
  lines.push('');

  // Aggregate metrics table
  lines.push('=== Aggregate Metrics ===');
  lines.push('');
  lines.push('Metric                      | Value');
  lines.push('----------------------------|--------');
  lines.push(`Profile non-null rate       | ${(metrics.profileNonNullRate * 100).toFixed(1)}%`);
  lines.push(
    `Summary non-empty rate      | ${(metrics.profileSummaryNonEmptyRate * 100).toFixed(1)}%`,
  );
  lines.push(`Keywords non-empty rate     | ${(metrics.keywordsNonEmptyRate * 100).toFixed(1)}%`);
  lines.push(`Capsules non-empty rate     | ${(metrics.capsulesNonEmptyRate * 100).toFixed(1)}%`);
  lines.push(
    `All capsules have content   | ${(metrics.allCapsulesHaveContentRate * 100).toFixed(1)}%`,
  );
  lines.push(
    `Client manifest match rate  | ${(metrics.clientManifestNonNullRate * 100).toFixed(1)}%`,
  );
  lines.push(`Avg capsules per skill      | ${metrics.avgCapsulesPerSkill.toFixed(1)}`);
  lines.push(`Min / Max capsules          | ${metrics.minCapsules} / ${metrics.maxCapsules}`);
  lines.push(`All source hashes valid     | ${metrics.allSourceHashesValid ? 'YES' : 'NO'}`);
  lines.push(`All timestamps valid        | ${metrics.allTimestampsValid ? 'YES' : 'NO'}`);
  lines.push('');

  // Per-bundle details
  lines.push('=== Per-Bundle Results ===');
  lines.push('');
  lines.push('Bundle ID                  | Profile | Summary | Keywords | Capsules | Status');
  lines.push('---------------------------|---------|---------|----------|----------|-------');

  for (const r of results) {
    const id = r.fixtureId.padEnd(25);
    const profile = r.assertions.profileNonNull ? '  OK   ' : ' FAIL  ';
    const summary = r.assertions.profileSummaryNonEmpty ? '  OK   ' : ' FAIL  ';
    const keywords = r.assertions.profileKeywordsNonEmpty ? '  OK   ' : ' FAIL  ';
    const capsules = r.assertions.capsulesNonEmpty ? '  OK   ' : ' FAIL  ';
    const status = r.passed ? '  PASS' : '  FAIL';
    lines.push(`${id} | ${profile} | ${summary} | ${keywords} | ${capsules} | ${status}`);
  }

  lines.push('');

  // Failed bundles detail
  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) {
    lines.push('=== Failed Assertions ===');
    for (const r of failed) {
      lines.push(`\n  ${r.fixtureId} (${r.title}):`);
      for (const [key, val] of Object.entries(r.assertions)) {
        if (!val) {
          lines.push(`    - ${key}: FAILED`);
        }
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
