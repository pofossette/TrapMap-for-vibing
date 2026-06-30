import type {
  LabelAlignmentEvalCase,
  LabelAlignmentEvalCaseResult,
} from '../../../packages/contracts/src/domain/evals/label-alignment.js';
import type { ChatProvider, EmbeddingsProvider } from '@trapmap/server/lib/ai/types.js';
import { alignLabel } from '@trapmap/server/lib/labels/llm-align.js';
import type { LabelRepository } from '@trapmap/server/lib/labels/repository.js';

import { calculateCaseMetrics } from './metrics.js';
import { runDeterministicRecall } from './recall-eval.js';

export interface LiveDecisionContext {
  repository?: LabelRepository;
  chat?: ChatProvider;
  embeddings?: EmbeddingsProvider;
}

export async function runLiveDecisionEvaluation(
  case_: LabelAlignmentEvalCase,
  context: LiveDecisionContext,
): Promise<Omit<LabelAlignmentEvalCaseResult, 'durationMs' | 'mode'>> {
  const fallback = runDeterministicRecall(case_);

  if (!context.repository || !context.chat) {
    const metrics = calculateCaseMetrics(case_, fallback.predictions);
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
      recallReasonDistribution: {
        ...metrics.recallReasonDistribution,
        'live-decision': 0,
      },
      notes: [
        ...fallback.notes,
        'Live interfaces unavailable; used deterministic dry-run scaffold.',
      ],
    };
  }

  const predictions = [];
  for (const annotation of case_.goldenAnnotations) {
    const result = await alignLabel(
      context.repository,
      context.chat,
      annotation.rawLabel,
      `${case_.skillId}:${case_.caseId}:${annotation.rawLabel}`,
      undefined,
      {
        embeddings: case_.embeddingEnabled ? context.embeddings : undefined,
        sourceContext: 'label-alignment-eval',
      },
    );

    const predictedCanonicalLabel = await normalizePredictedCanonicalLabel(
      result,
      context.repository,
    );
    predictions.push({
      rawLabel: annotation.rawLabel,
      predictedCanonicalLabel,
      predictedGroupId: annotation.groupId,
      recallReason: 'live-decision' as const,
    });
  }

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
    recallReasonDistribution: {
      ...metrics.recallReasonDistribution,
      'live-decision': case_.goldenAnnotations.length,
    },
    notes: ['Executed through live label-alignment interfaces.'],
  };
}

async function normalizePredictedCanonicalLabel(
  result: Awaited<ReturnType<typeof alignLabel>>,
  repository?: LabelRepository,
): Promise<string> {
  if (result.decision.canonicalName) {
    return result.decision.canonicalName;
  }

  if (result.decision.canonicalLabelId) {
    const canonicalLabel = await repository?.findCanonicalById(result.decision.canonicalLabelId);
    if (canonicalLabel) {
      return canonicalLabel.canonicalName;
    }
  }

  return result.decision.canonicalLabelId ?? '';
}
