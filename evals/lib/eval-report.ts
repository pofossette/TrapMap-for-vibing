/**
 * Shared eval-report building helpers for the retrieval and summary suites.
 *
 * Both suites build canonical reports (meta options, pass totals, failure
 * sorting) and render summary stats blocks that used to be copy-pasted.
 */

export interface EvalReportMetaOptionsInput {
  tier: string;
  endpoint?: string | undefined;
  dryRun: boolean;
  allowEmpty: boolean;
  verbose: number;
}

export function buildEvalReportMetaOptions(options: EvalReportMetaOptionsInput): {
  tier: string;
  endpoint?: string | undefined;
  dryRun: boolean;
  allowEmpty: boolean;
  verbose: number;
} {
  return {
    tier: options.tier,
    dryRun: options.dryRun,
    allowEmpty: options.allowEmpty,
    verbose: options.verbose,
    ...(options.endpoint !== undefined ? { endpoint: options.endpoint } : {}),
  };
}

export function computeCaseTotals(caseResults: Array<{ passed: boolean }>): {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  passRate: number;
} {
  const totalCases = caseResults.length;
  const passedCases = caseResults.filter((r) => r.passed).length;
  const failedCases = totalCases - passedCases;
  const passRate = totalCases > 0 ? passedCases / totalCases : 0;
  return { totalCases, passedCases, failedCases, passRate };
}

export function compareFailuresByCaseThenKind(
  a: { caseId: string; kind: string },
  b: { caseId: string; kind: string },
): number {
  const caseCompare = a.caseId.localeCompare(b.caseId);
  if (caseCompare !== 0) return caseCompare;
  return a.kind.localeCompare(b.kind);
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function pushSummaryStats(
  lines: string[],
  summary: { totalCases: number; passedCases: number; failedCases: number; passRate: number },
): void {
  lines.push(`Total cases: ${summary.totalCases}`);
  lines.push(`Passed: ${summary.passedCases}`);
  lines.push(`Failed: ${summary.failedCases}`);
  lines.push(`Pass rate: ${(summary.passRate * 100).toFixed(1)}%`);
}

export interface SliceTableRow {
  tier: string;
  endpoint: string;
  mode: string;
  caseCount: number;
  passRate: number;
  avgHitAt1: number;
  avgMrr: number;
  avgNdcg: number;
}

export function pushSliceTable(lines: string[], rows: SliceTableRow[]): void {
  lines.push(
    'Tier     | Endpoint              | Mode          | Cases | Pass Rate | Avg Hit@1 | Avg MRR | Avg nDCG',
  );
  lines.push(
    '---------|----------------------|---------------|-------|-----------|-----------|---------|----------',
  );

  for (const slice of rows) {
    const tier = slice.tier.padEnd(8);
    const endpoint = slice.endpoint.padEnd(20);
    const modeStr = slice.mode.padEnd(13);
    const cases = String(slice.caseCount).padStart(5);
    const passRate = `${(slice.passRate * 100).toFixed(1)}%`.padStart(9);
    const hitAt1 = slice.avgHitAt1.toFixed(3).padStart(9);
    const mrr = slice.avgMrr.toFixed(3).padStart(7);
    const ndcg = slice.avgNdcg.toFixed(3).padStart(9);

    lines.push(
      `${tier} | ${endpoint} | ${modeStr} | ${cases} | ${passRate} | ${hitAt1} | ${mrr} | ${ndcg}`,
    );
  }
}
