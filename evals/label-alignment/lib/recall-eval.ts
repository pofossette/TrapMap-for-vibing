import type {
  LabelAlignmentEvalCase,
  LabelAlignmentRecallReason,
  LabelAlignmentGoldenAnnotation,
} from '../../../packages/contracts/src/domain/evals/label-alignment.js';

import { buildCatalogSeed } from './catalog-seed.js';

export interface DryRunPrediction {
  rawLabel: string;
  predictedCanonicalLabel: string;
  predictedGroupId: string;
  recallReason: LabelAlignmentRecallReason;
}

export interface DryRunRecallResult {
  predictions: DryRunPrediction[];
  notes: string[];
}

export function runDeterministicRecall(case_: LabelAlignmentEvalCase): DryRunRecallResult {
  const catalog = buildCatalogSeed(case_);
  const notes: string[] = [];

  const firstByCanonical = new Map<string, LabelAlignmentGoldenAnnotation>();
  for (const annotation of case_.goldenAnnotations) {
    if (!firstByCanonical.has(annotation.canonicalLabel)) {
      firstByCanonical.set(annotation.canonicalLabel, annotation);
    }
  }

  const predictions = case_.goldenAnnotations.map((annotation) => {
    const canonicalEntry = catalog.entries.find(
      (entry) => entry.canonicalLabel === annotation.canonicalLabel,
    );

    if (!canonicalEntry) {
      return {
        rawLabel: annotation.rawLabel,
        predictedCanonicalLabel: annotation.canonicalLabel,
        predictedGroupId: annotation.groupId,
        recallReason: 'catalog-empty' as const,
      };
    }

    const aliasHit = canonicalEntry.aliases.find((alias) => alias === annotation.rawLabel);
    if (aliasHit) {
      return {
        rawLabel: annotation.rawLabel,
        predictedCanonicalLabel: annotation.canonicalLabel,
        predictedGroupId: annotation.groupId,
        recallReason: 'exact-alias' as const,
      };
    }

    const anchor = firstByCanonical.get(annotation.canonicalLabel);
    if (anchor && case_.embeddingEnabled) {
      return {
        rawLabel: annotation.rawLabel,
        predictedCanonicalLabel: annotation.canonicalLabel,
        predictedGroupId: anchor.groupId,
        recallReason: 'semantic-embedding' as const,
      };
    }

    return {
      rawLabel: annotation.rawLabel,
      predictedCanonicalLabel: annotation.canonicalLabel,
      predictedGroupId: annotation.groupId,
      recallReason: 'normalized-name' as const,
    };
  });

  if (catalog.entries.length === 0) {
    notes.push('Catalog seed empty; dry-run falls back to golden canonical labels.');
  }
  if (case_.embeddingEnabled) {
    notes.push(
      'Embedding-enabled dry-run uses deterministic semantic grouping by canonical label.',
    );
  }

  return { predictions, notes };
}
