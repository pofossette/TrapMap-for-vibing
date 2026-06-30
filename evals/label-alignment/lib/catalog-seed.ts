import type {
  LabelAlignmentCatalogSeed,
  LabelAlignmentEvalCase,
  LabelAlignmentGoldenAnnotation,
} from '../../../packages/contracts/src/domain/evals/label-alignment.js';

export interface SeededCatalogEntry {
  canonicalLabel: string;
  aliases: string[];
}

export function buildCatalogSeed(case_: LabelAlignmentEvalCase): {
  seed: LabelAlignmentCatalogSeed;
  entries: SeededCatalogEntry[];
} {
  if (case_.catalogSeed === 'catalog-empty') {
    return {
      seed: case_.catalogSeed,
      entries: [],
    };
  }

  const byCanonical = new Map<string, LabelAlignmentGoldenAnnotation[]>();
  for (const annotation of case_.goldenAnnotations) {
    const annotations = byCanonical.get(annotation.canonicalLabel) ?? [];
    annotations.push(annotation);
    byCanonical.set(annotation.canonicalLabel, annotations);
  }

  const entries = Array.from(byCanonical.entries()).map(([canonicalLabel, annotations]) => ({
    canonicalLabel,
    aliases: annotations.map((annotation) => annotation.rawLabel).slice(0, 2),
  }));

  return {
    seed: case_.catalogSeed,
    entries,
  };
}
