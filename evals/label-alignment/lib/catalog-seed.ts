import type {
  LabelAlignmentCatalogSeedEntry,
  LabelAlignmentEvalCase,
} from '../../../packages/contracts/src/domain/evals/label-alignment.js';
import type { LabelRepository } from '@trapmap/server/lib/labels/repository.js';

export function buildCatalogSeed(case_: LabelAlignmentEvalCase): {
  entries: LabelAlignmentCatalogSeedEntry[];
} {
  return {
    entries: case_.catalogSeed,
  };
}

export async function seedCatalogEntries(
  repository: LabelRepository,
  entries: LabelAlignmentCatalogSeedEntry[],
): Promise<void> {
  for (const entry of entries) {
    await repository.upsertCanonicalLabel({
      id: entry.id,
      canonicalName: entry.canonicalName,
      kind: entry.kind ?? 'cue',
      definition: entry.definition ?? null,
      status: 'active',
    });

    for (const alias of entry.aliases) {
      await repository.upsertAlias({
        alias,
        canonicalLabelId: entry.id,
        source: 'manual',
        confidence: 1,
      });
    }
  }
}
