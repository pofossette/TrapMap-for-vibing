import {
  type AgentPlanningCaseResult,
  type AgentPlanningContextSetKind,
  type AgentPlanningEvalReport,
  type AgentPlanningEvalTier,
  type AgentPlanningInterferenceLevel,
  type AgentPlanningSliceDimension,
  agentPlanningEvalReportSchema,
} from '@trapmap/contracts/evals';

export interface AgentPlanningReportOptions {
  tier: AgentPlanningEvalTier;
  dryRun: boolean;
  provider: 'fallback' | 'openai';
  promptTemplateId: string;
}

const epsilon = 0.000001;
const interferenceOrder: AgentPlanningInterferenceLevel[] = ['none', 'low', 'medium', 'high'];
const sliceDimensions: AgentPlanningSliceDimension[] = [
  'taskType',
  'taskComplexity',
  'contextSetKind',
  'interferenceLevel',
  'matchStrategy',
  'sourceQualityMix',
];

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4));
}

function passRate(results: AgentPlanningCaseResult[]): number {
  if (results.length === 0) {
    return 0;
  }

  return results.filter((result) => result.passed).length / results.length;
}

function compareContextSet(
  results: AgentPlanningCaseResult[],
  kind: AgentPlanningContextSetKind,
): number | null {
  const filtered = results.filter((result) => result.contextSetKind === kind);
  return filtered.length === 0 ? null : average(filtered.map((result) => result.totalScore));
}

function buildGroups(results: AgentPlanningCaseResult[]) {
  const byTaskId = new Map<string, AgentPlanningCaseResult[]>();
  for (const result of results) {
    const collection = byTaskId.get(result.taskId) ?? [];
    collection.push(result);
    byTaskId.set(result.taskId, collection);
  }

  return [...byTaskId.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([taskId, taskResults]) => {
      const skillSetAvg = compareContextSet(taskResults, 'skill-set');
      const planGraphSetAvg = compareContextSet(taskResults, 'plan-graph-set');
      const absoluteDiff =
        skillSetAvg === null || planGraphSetAvg === null
          ? null
          : Number((planGraphSetAvg - skillSetAvg).toFixed(4));
      const relativeLift =
        skillSetAvg === null || planGraphSetAvg === null
          ? null
          : Number(((planGraphSetAvg - skillSetAvg) / Math.max(skillSetAvg, epsilon)).toFixed(4));
      const interferenceComparisons = interferenceOrder
        .map((level) => {
          const levelResults = taskResults.filter((result) => result.interferenceLevel === level);
          return {
            level,
            avg:
              levelResults.length === 0
                ? null
                : average(levelResults.map((result) => result.totalScore)),
          };
        })
        .filter((entry) => entry.avg !== null);
      const baseline = interferenceComparisons[0];

      return {
        taskId,
        variantCount: taskResults.length,
        skillSetAvg,
        planGraphSetAvg,
        absoluteDiff,
        relativeLift,
        interferenceComparisons:
          baseline === undefined
            ? []
            : interferenceComparisons.slice(1).map((candidate) => ({
                baselineLevel: baseline.level,
                candidateLevel: candidate.level,
                baselineAvg: baseline.avg ?? 0,
                candidateAvg: candidate.avg ?? 0,
                absoluteDiff: Number(((candidate.avg ?? 0) - (baseline.avg ?? 0)).toFixed(4)),
              })),
        capsuleMatchAvg: compareContextSet(taskResults, 'capsule-match-set'),
        skillSummaryAvg: compareContextSet(taskResults, 'skill-summary-set'),
        capsuleAbsoluteLift: (() => {
          const cm = compareContextSet(taskResults, 'capsule-match-set');
          const ss = compareContextSet(taskResults, 'skill-summary-set');
          return cm === null || ss === null ? null : Number((cm - ss).toFixed(4));
        })(),
        capsuleRelativeLift: (() => {
          const cm = compareContextSet(taskResults, 'capsule-match-set');
          const ss = compareContextSet(taskResults, 'skill-summary-set');
          return cm === null || ss === null
            ? null
            : Number(((cm - ss) / Math.max(ss, epsilon)).toFixed(4));
        })(),
      };
    });
}

function buildSlices(results: AgentPlanningCaseResult[]) {
  const slices = [];

  for (const dimension of sliceDimensions) {
    // Skip slice dimensions that have no data (e.g. optional fields)
    const values = [
      ...new Set(
        results
          .map((result) => {
            const val = result[dimension as keyof AgentPlanningCaseResult];
            return val !== undefined && val !== null ? String(val) : null;
          })
          .filter((v): v is string => v !== null),
      ),
    ].sort((left, right) => left.localeCompare(right));

    if (values.length === 0) {
      continue;
    }

    for (const value of values) {
      const matchingResults = results.filter(
        (result) => String(result[dimension as keyof AgentPlanningCaseResult]) === value,
      );
      slices.push({
        dimension,
        value,
        caseCount: matchingResults.length,
        avgScore: average(matchingResults.map((result) => result.totalScore)),
        passRate: passRate(matchingResults),
      });
    }
  }

  return slices;
}

export function buildAgentPlanningReport(
  caseResults: AgentPlanningCaseResult[],
  options: AgentPlanningReportOptions,
  durationMs: number,
): AgentPlanningEvalReport {
  const report = {
    meta: {
      schemaVersion: 1 as const,
      timestamp: new Date().toISOString(),
      durationMs,
      runner: 'agent-planning' as const,
      options,
    },
    summary: {
      totalCases: caseResults.length,
      passedCases: caseResults.filter((result) => result.passed).length,
      failedCases: caseResults.filter((result) => !result.passed).length,
      passRate: passRate(caseResults),
      avgScore: average(caseResults.map((result) => result.totalScore)),
    },
    cases: caseResults,
    groups: buildGroups(caseResults),
    slices: buildSlices(caseResults),
  };

  return agentPlanningEvalReportSchema.parse(report);
}
