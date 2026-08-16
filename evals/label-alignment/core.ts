import type {
  LabelAlignmentEvalCase,
  LabelAlignmentEvalCaseResult,
  LabelAlignmentEvalFixture,
  LabelAlignmentEvalReport,
  LabelAlignmentRecallReason,
} from '../types/label-alignment.js';
import { labelAlignmentEvalFixtureSchema } from '../types/label-alignment.js';

import { coreFixtures } from './archived/fixtures/core.js';
import { smokeFixtures } from './fixtures/smoke.js';
import { buildLabelAlignmentCaseResult } from './lib/decision-eval.js';
import { formatLabelAlignmentReport } from './lib/format.js';
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
  return buildLabelAlignmentCaseResult(case_, predictions, recallResult.notes);
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
