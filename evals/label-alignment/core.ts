import type {
  LabelAlignmentEvalCase,
  LabelAlignmentEvalCaseResult,
  LabelAlignmentEvalFixture,
  LabelAlignmentEvalReport,
  LabelAlignmentRecallReason,
} from '../../packages/contracts/src/domain/evals/label-alignment.js';
import { labelAlignmentEvalFixtureSchema } from '../../packages/contracts/src/domain/evals/label-alignment.js';

import { coreFixtures } from './fixtures/core.js';
import { smokeFixtures } from './fixtures/smoke.js';
import { type LiveDecisionContext, runLiveDecisionEvaluation } from './lib/decision-eval.js';
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
  const fixtures = options.tier === 'smoke' ? smokeFixtures : coreFixtures;
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

      const dryResult = evaluateLabelAlignmentCaseDryRun(case_);
      caseResults.push({ ...dryResult, mode: 'dry-run', durationMs: Date.now() - caseStart });
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

/**
 * Evaluate one label-alignment case with the deterministic dry-run pipeline:
 * `runDeterministicRecall` → `inferRecallReason` → `calculateCaseMetrics`.
 * Shared by the native `runLabelAlignmentSuite` and the promptfoo bridge so
 * `--runner promptfoo` is per-case identical to native.
 */
export function evaluateLabelAlignmentCaseDryRun(
  case_: LabelAlignmentEvalCase,
): Omit<LabelAlignmentEvalCaseResult, 'durationMs' | 'mode'> {
  const recallResult = runDeterministicRecall(case_);
  const predictions = recallResult.predictions.map((prediction) => ({
    ...prediction,
    recallReason: inferRecallReason(case_, prediction.rawLabel),
  }));
  const metrics = calculateCaseMetrics(case_, predictions);
  return {
    caseId: case_.caseId,
    skillId: case_.skillId,
    variantId: case_.variantId,
    variantGroupId: case_.variantGroupId,
    tier: case_.tier,
    passed: metrics.passed,
    synonymEliminationCount: metrics.synonymEliminationCount,
    synonymEliminationRate: metrics.synonymEliminationRate,
    missedMerges: metrics.missedMerges,
    falseMerges: metrics.falseMerges,
    alignmentAccuracy: metrics.alignmentAccuracy,
    recallReasonDistribution: metrics.recallReasonDistribution,
    notes: recallResult.notes,
  };
}

function inferRecallReason(
  case_: LabelAlignmentEvalCase,
  rawLabel: string,
): LabelAlignmentRecallReason {
  if (case_.catalogSeed.length === 0) {
    return 'catalog-empty';
  }

  const normalizedRawLabel = normalizeLabel(rawLabel);
  for (const entry of case_.catalogSeed) {
    if (entry.aliases.includes(rawLabel)) {
      return 'exact-alias';
    }

    if (normalizeLabel(entry.canonicalName) === normalizedRawLabel) {
      return 'normalized-name';
    }
  }

  return case_.embeddingEnabled ? 'semantic-embedding' : 'normalized-name';
}

function normalizeLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}
