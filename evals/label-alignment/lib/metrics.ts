import type {
  LabelAlignmentEvalCase,
  LabelAlignmentEvalCaseResult,
  LabelAlignmentRecallReason,
} from '../../../packages/contracts/src/domain/evals/label-alignment.js';

import type { DryRunPrediction } from './recall-eval.js';

export interface CalculatedMetrics {
  synonymEliminationCount: number;
  synonymEliminationRate: number;
  missedMerges: number;
  falseMerges: number;
  alignmentAccuracy: number;
  recallReasonDistribution: Record<LabelAlignmentRecallReason, number>;
  passed: boolean;
}

export function calculateCaseMetrics(
  case_: LabelAlignmentEvalCase,
  predictions: DryRunPrediction[],
): CalculatedMetrics {
  const recallReasonDistribution: Record<LabelAlignmentRecallReason, number> = {
    'exact-alias': 0,
    'normalized-name': 0,
    'semantic-embedding': 0,
    'catalog-empty': 0,
    'live-decision': 0,
  };

  let correct = 0;
  for (const prediction of predictions) {
    recallReasonDistribution[prediction.recallReason] += 1;
    const golden = case_.goldenAnnotations.find(
      (annotation) => annotation.rawLabel === prediction.rawLabel,
    );
    if (golden && golden.canonicalLabel === prediction.predictedCanonicalLabel) {
      correct += 1;
    }
  }

  const synonymEliminationTarget = Math.max(0, case_.totalRawLabels - case_.totalCanonicalLabels);
  const synonymEliminationCount = countSuccessfulEliminations(case_, predictions);
  const synonymEliminationRate =
    synonymEliminationTarget === 0 ? 0 : synonymEliminationCount / synonymEliminationTarget;

  const missedMerges = countMissedMerges(case_, predictions);
  const falseMerges = countFalseMerges(case_, predictions);
  const alignmentAccuracy = predictions.length === 0 ? 0 : correct / predictions.length;

  return {
    synonymEliminationCount,
    synonymEliminationRate,
    missedMerges,
    falseMerges,
    alignmentAccuracy,
    recallReasonDistribution,
    passed: missedMerges === 0 && falseMerges === 0 && alignmentAccuracy >= 0.99,
  };
}

export function summarizeCaseResults(
  cases: LabelAlignmentEvalCaseResult[],
): LabelAlignmentEvalCaseResult['recallReasonDistribution'] & {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  passRate: number;
  synonymEliminationCount: number;
  synonymEliminationRate: number;
  missedMerges: number;
  falseMerges: number;
  alignmentAccuracy: number;
  recallReasonDistribution: LabelAlignmentEvalCaseResult['recallReasonDistribution'];
} {
  const totalCases = cases.length;
  const passedCases = cases.filter((case_) => case_.passed).length;
  const failedCases = totalCases - passedCases;
  const sum = <T extends number>(values: T[]) => values.reduce((acc, value) => acc + value, 0);

  const recallReasonDistribution: LabelAlignmentEvalCaseResult['recallReasonDistribution'] = {
    'exact-alias': 0,
    'normalized-name': 0,
    'semantic-embedding': 0,
    'catalog-empty': 0,
    'live-decision': 0,
  };

  for (const case_ of cases) {
    for (const [reason, count] of Object.entries(case_.recallReasonDistribution)) {
      recallReasonDistribution[reason as LabelAlignmentRecallReason] += count;
    }
  }

  return {
    totalCases,
    passedCases,
    failedCases,
    passRate: totalCases === 0 ? 0 : passedCases / totalCases,
    synonymEliminationCount: sum(cases.map((case_) => case_.synonymEliminationCount)),
    synonymEliminationRate:
      totalCases === 0 ? 0 : sum(cases.map((case_) => case_.synonymEliminationRate)) / totalCases,
    missedMerges: sum(cases.map((case_) => case_.missedMerges)),
    falseMerges: sum(cases.map((case_) => case_.falseMerges)),
    alignmentAccuracy:
      totalCases === 0 ? 0 : sum(cases.map((case_) => case_.alignmentAccuracy)) / totalCases,
    recallReasonDistribution,
    'exact-alias': 0,
    'normalized-name': 0,
    'semantic-embedding': 0,
    'catalog-empty': 0,
    'live-decision': 0,
  };
}

function countSuccessfulEliminations(
  case_: LabelAlignmentEvalCase,
  predictions: DryRunPrediction[],
): number {
  const predictedByRawLabel = new Map(
    predictions.map((prediction) => [prediction.rawLabel, prediction.predictedCanonicalLabel]),
  );

  let successfulEliminations = 0;

  for (const group of case_.expectedAlignment.canonicalGroups) {
    if (group.length < 2) {
      continue;
    }

    const predictedLabels = new Set(
      group.map((rawLabel) => predictedByRawLabel.get(rawLabel) ?? `missing:${rawLabel}`),
    );
    if (predictedLabels.size !== 1) {
      continue;
    }

    const predictedCanonicalLabel = [...predictedLabels][0];
    const hasContaminatingMerge = case_.expectedAlignment.shouldNotMerge.some(
      ([left, right]) =>
        (group.includes(left) &&
          (predictedByRawLabel.get(right) ?? `missing:${right}`) === predictedCanonicalLabel) ||
        (group.includes(right) &&
          (predictedByRawLabel.get(left) ?? `missing:${left}`) === predictedCanonicalLabel),
    );

    if (!hasContaminatingMerge) {
      successfulEliminations += group.length - 1;
    }
  }

  return successfulEliminations;
}

function countMissedMerges(case_: LabelAlignmentEvalCase, predictions: DryRunPrediction[]): number {
  const mergedPairs = buildPairSet(
    predictions.flatMap((left, leftIndex) =>
      predictions
        .slice(leftIndex + 1)
        .filter((right) => left.predictedCanonicalLabel === right.predictedCanonicalLabel)
        .map((right) => [left.rawLabel, right.rawLabel] as const),
    ),
  );

  const expectedPairs = buildPairSet(
    case_.expectedAlignment.canonicalGroups.flatMap((group) =>
      group.flatMap((left, leftIndex) =>
        group.slice(leftIndex + 1).map((right) => [left, right] as const),
      ),
    ),
  );

  let missed = 0;
  for (const pair of expectedPairs) {
    if (!mergedPairs.has(pair)) {
      missed += 1;
    }
  }
  return missed;
}

function countFalseMerges(case_: LabelAlignmentEvalCase, predictions: DryRunPrediction[]): number {
  const mergedPairs = buildPairSet(
    predictions.flatMap((left, leftIndex) =>
      predictions
        .slice(leftIndex + 1)
        .filter((right) => left.predictedCanonicalLabel === right.predictedCanonicalLabel)
        .map((right) => [left.rawLabel, right.rawLabel] as const),
    ),
  );

  const shouldNotMerge = buildPairSet(case_.expectedAlignment.shouldNotMerge);
  let falseMerges = 0;
  for (const pair of shouldNotMerge) {
    if (mergedPairs.has(pair)) {
      falseMerges += 1;
    }
  }
  return falseMerges;
}

function buildPairSet(pairs: ReadonlyArray<readonly [string, string]>): Set<string> {
  return new Set(
    pairs.map(([left, right]) => [left, right].sort((a, b) => a.localeCompare(b)).join('::')),
  );
}
