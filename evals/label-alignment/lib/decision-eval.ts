import type { ChatProvider, EmbeddingsProvider } from '@trapmap/ai-providers';
import { alignLabel, type LabelRepository } from '@trapmap/service-knowledge-write';
import type {
  LabelAlignmentEvalCase,
  LabelAlignmentEvalCaseResult,
} from '../../../packages/contracts/src/domain/evals/label-alignment.js';

import { buildCatalogSeed, seedCatalogEntries } from './catalog-seed.js';
import { calculateCaseMetrics } from './metrics.js';
import { runDeterministicRecall } from './recall-eval.js';

export interface LiveDecisionContext {
  repository?: LabelRepository;
  chat?: ChatProvider;
  embeddings?: EmbeddingsProvider;
  cleanupCatalog?: () => Promise<void>;
}

export async function runLiveDecisionEvaluation(
  case_: LabelAlignmentEvalCase,
  context: LiveDecisionContext,
): Promise<Omit<LabelAlignmentEvalCaseResult, 'durationMs' | 'mode'>> {
  const fallback = runDeterministicRecall(case_);

  if (!context.repository || !context.chat || !context.cleanupCatalog) {
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
        'Live isolation adapters unavailable; used deterministic dry-run scaffold.',
      ],
    };
  }

  await seedCatalogEntries(context.repository, buildCatalogSeed(case_).entries);
  const predictions = [];
  try {
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
  } finally {
    await context.cleanupCatalog();
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
