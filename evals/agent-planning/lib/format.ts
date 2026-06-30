import type { AgentPlanningEvalReport } from '@trapmap/contracts/evals';

export function formatReport(report: AgentPlanningEvalReport): string {
  const lines = [
    `Agent Planning Eval (${report.meta.options.tier})`,
    `Cases: ${report.summary.passedCases}/${report.summary.totalCases} passed`,
    `Avg score: ${report.summary.avgScore.toFixed(2)}`,
    '',
    'Slices:',
  ];

  for (const slice of report.slices) {
    lines.push(
      `- ${slice.dimension}=${slice.value}: avg=${slice.avgScore.toFixed(2)} pass=${slice.passRate.toFixed(2)}`,
    );
  }

  return lines.join('\n');
}
