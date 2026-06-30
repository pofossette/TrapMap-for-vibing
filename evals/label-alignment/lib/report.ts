import type {
  LabelAlignmentEvalCaseResult,
  LabelAlignmentEvalReport,
} from '../../../packages/contracts/src/domain/evals/label-alignment.js';
import { labelAlignmentEvalReportSchema } from '../../../packages/contracts/src/domain/evals/label-alignment.js';

import { summarizeCaseResults } from './metrics.js';

export function buildLabelAlignmentReport(input: {
  tier: 'smoke' | 'core';
  mode: 'dry-run' | 'live';
  fixtureIds: string[];
  durationMs: number;
  cases: LabelAlignmentEvalCaseResult[];
}): LabelAlignmentEvalReport {
  const summary = summarizeCaseResults(input.cases);
  return labelAlignmentEvalReportSchema.parse({
    meta: {
      schemaVersion: 1,
      timestamp: new Date().toISOString(),
      durationMs: input.durationMs,
      mode: input.mode,
      options: {
        tier: input.tier,
        fixtureIds: input.fixtureIds,
      },
    },
    summary: {
      totalCases: summary.totalCases,
      passedCases: summary.passedCases,
      failedCases: summary.failedCases,
      passRate: summary.passRate,
      synonymEliminationCount: summary.synonymEliminationCount,
      synonymEliminationRate: summary.synonymEliminationRate,
      missedMerges: summary.missedMerges,
      falseMerges: summary.falseMerges,
      alignmentAccuracy: summary.alignmentAccuracy,
      recallReasonDistribution: summary.recallReasonDistribution,
    },
    cases: input.cases,
  });
}
