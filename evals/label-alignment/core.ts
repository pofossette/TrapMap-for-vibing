import type {
  LabelAlignmentEvalCaseResult,
  LabelAlignmentEvalFixture,
  LabelAlignmentEvalReport,
} from '../../packages/contracts/src/domain/evals/label-alignment.js';
import { labelAlignmentEvalFixtureSchema } from '../../packages/contracts/src/domain/evals/label-alignment.js';

import { smokeFixtures } from './fixtures/smoke.js';
import { runLiveDecisionEvaluation, type LiveDecisionContext } from './lib/decision-eval.js';
import { formatLabelAlignmentReport } from './lib/format.js';
import { calculateCaseMetrics } from './lib/metrics.js';
import { runDeterministicRecall } from './lib/recall-eval.js';
import { buildLabelAlignmentReport } from './lib/report.js';

export interface LoadFixtureOptions {
  tier: 'smoke' | 'core';
}

export interface RunLabelAlignmentSuiteOptions extends LoadFixtureOptions {
  mode: 'dry-run' | 'live';
  fixtureIds?: string[];
  live?: LiveDecisionContext;
}

export async function loadLabelAlignmentFixtures(
  options: LoadFixtureOptions,
): Promise<LabelAlignmentEvalFixture[]> {
  const fixtures =
    options.tier === 'smoke'
      ? smokeFixtures
      : smokeFixtures.map((fixture) => ({
          ...fixture,
          fixtureId: `${fixture.fixtureId}-core`,
          tags: [...fixture.tags, 'core'],
          cases: fixture.cases.map((case_) => ({
            ...case_,
            caseId: `${case_.caseId}-core`,
            tier: 'core' as const,
            tags: [...case_.tags, 'core'],
          })),
        }));
  return fixtures.map((fixture) => labelAlignmentEvalFixtureSchema.parse(fixture));
}

export async function runLabelAlignmentSuite(
  options: RunLabelAlignmentSuiteOptions,
): Promise<LabelAlignmentEvalReport> {
  const startTime = Date.now();
  const fixtures = await loadLabelAlignmentFixtures({ tier: options.tier });
  const filteredFixtures = options.fixtureIds?.length
    ? fixtures.filter((fixture) => options.fixtureIds?.includes(fixture.fixtureId))
    : fixtures;

  const caseResults: LabelAlignmentEvalCaseResult[] = [];
  for (const fixture of filteredFixtures) {
    for (const case_ of fixture.cases.filter((entry) => entry.tier === options.tier)) {
      const caseStart = Date.now();
      if (options.mode === 'live') {
        const liveResult = await runLiveDecisionEvaluation(case_, options.live ?? {});
        caseResults.push({
          ...liveResult,
          mode: 'live',
          durationMs: Date.now() - caseStart,
        });
        continue;
      }

      const recallResult = runDeterministicRecall(case_);
      const metrics = calculateCaseMetrics(case_, recallResult.predictions);
      caseResults.push({
        caseId: case_.caseId,
        skillId: case_.skillId,
        variantId: case_.variantId,
        variantGroupId: case_.variantGroupId,
        tier: case_.tier,
        mode: 'dry-run',
        passed: metrics.passed,
        durationMs: Date.now() - caseStart,
        synonymEliminationCount: metrics.synonymEliminationCount,
        synonymEliminationRate: metrics.synonymEliminationRate,
        missedMerges: metrics.missedMerges,
        falseMerges: metrics.falseMerges,
        alignmentAccuracy: metrics.alignmentAccuracy,
        recallReasonDistribution: metrics.recallReasonDistribution,
        notes: recallResult.notes,
      });
    }
  }

  return buildLabelAlignmentReport({
    tier: options.tier,
    mode: options.mode,
    fixtureIds: filteredFixtures.map((fixture) => fixture.fixtureId),
    durationMs: Date.now() - startTime,
    cases: caseResults,
  });
}

export function formatRunResult(report: LabelAlignmentEvalReport): string {
  return formatLabelAlignmentReport(report);
}
