import type { AgentPlanningEvalReport } from '../../types/index.js';

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

  // Skill identification summary
  const hasCapsuleData = report.groups.some(
    (g) => g.capsuleMatchAvg !== undefined && g.capsuleMatchAvg !== null,
  );

  if (hasCapsuleData) {
    const allCapsuleScores = report.groups
      .map((g) => g.capsuleMatchAvg)
      .filter((v): v is number => v !== undefined && v !== null);
    const allSummaryScores = report.groups
      .map((g) => g.skillSummaryAvg)
      .filter((v): v is number => v !== undefined && v !== null);

    if (allCapsuleScores.length > 0 || allSummaryScores.length > 0) {
      const capsuleAvg =
        allCapsuleScores.length > 0
          ? allCapsuleScores.reduce((s, v) => s + v, 0) / allCapsuleScores.length
          : 0;
      const summaryAvg =
        allSummaryScores.length > 0
          ? allSummaryScores.reduce((s, v) => s + v, 0) / allSummaryScores.length
          : 0;
      const absLift = capsuleAvg - summaryAvg;
      const relLift = summaryAvg > 0 ? (absLift / summaryAvg) * 100 : 0;

      lines.push('', '=== Skill Identification Summary ===');
      lines.push(`Capsule Match Avg: ${capsuleAvg.toFixed(2)}`);
      lines.push(`Skill Summary Avg: ${summaryAvg.toFixed(2)}`);
      lines.push(`Absolute Lift:    ${absLift >= 0 ? '+' : ''}${absLift.toFixed(2)}`);
      lines.push(`Relative Lift:    ${relLift >= 0 ? '+' : ''}${relLift.toFixed(1)}%`);
    }
  }

  return lines.join('\n');
}
