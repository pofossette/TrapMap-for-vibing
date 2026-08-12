import type {
  LabelAlignmentEvalCase,
  LabelAlignmentEvalCaseResult,
  LabelAlignmentEvalFixture,
  LabelAlignmentEvalReport,
  LabelAlignmentRecallReason,
} from '../../packages/contracts/src/domain/evals/label-alignment.js';
import { labelAlignmentEvalFixtureSchema } from '../../packages/contracts/src/domain/evals/label-alignment.js';

import { coreFixtures } from './archived/fixtures/core.js';
import { smokeFixtures } from './fixtures/smoke.js';
import { formatLabelAlignmentReport } from './lib/format.js';
import { calculateCaseMetrics } from './lib/metrics.js';
import { runDeterministicRecall } from './lib/recall-eval.js';

export interface LoadFixtureOptions {
  tier: 'smoke' | 'core';
}

export async function loadLabelAlignmentFixtures(
  options: LoadFixtureOptions,
): Promise<LabelAlignmentEvalFixture[]> {
  const fixtures = options.tier === 'smoke' ? smokeFixtures : coreFixtures;
  return fixtures.map((fixture) => labelAlignmentEvalFixtureSchema.parse(fixture));
}

export function formatRunResult(report: LabelAlignmentEvalReport): string {
  return formatLabelAlignmentReport(report);
}

/**
 * Evaluate one label-alignment case with the deterministic dry-run pipeline:
 * `runDeterministicRecall` → `inferRecallReason` → `calculateCaseMetrics`.
 * Used by the promptfoo bridge's provider executor (the native case loop was
 * removed in the promptfoo cutover).
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
