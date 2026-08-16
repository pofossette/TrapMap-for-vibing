import type { LabelAlignmentEvalReport } from '../../types/label-alignment.js';

export function formatLabelAlignmentReport(report: LabelAlignmentEvalReport): string {
  const lines = [
    '',
    '=== Label Alignment Eval ===',
    `Mode: ${report.meta.mode}`,
    `Tier: ${report.meta.options.tier}`,
    `Cases: ${report.summary.totalCases}`,
    `Passed: ${report.summary.passedCases}`,
    `Failed: ${report.summary.failedCases}`,
    `Accuracy: ${(report.summary.alignmentAccuracy * 100).toFixed(1)}%`,
    `False merges: ${report.summary.falseMerges}`,
    `Missed merges: ${report.summary.missedMerges}`,
    '',
  ];

  for (const case_ of report.cases) {
    lines.push(
      `${case_.caseId}: ${case_.passed ? 'PASS' : 'FAIL'} | accuracy=${case_.alignmentAccuracy.toFixed(2)} | falseMerges=${case_.falseMerges} | missedMerges=${case_.missedMerges}`,
    );
  }

  lines.push('');
  return lines.join('\n');
}
