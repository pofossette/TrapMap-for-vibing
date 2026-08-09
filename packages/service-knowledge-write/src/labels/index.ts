export { backfillLabels, type BackfillOptions, type BackfillReport } from './backfill.js';
export {
  repairGraphDocuments,
  type MergeRepairOptions,
  type MergeRepairReport,
} from './merge-repair.js';
export { alignLabel, type LabelAlignmentResult } from './llm-align.js';
export { createPgLabelRepository, PgLabelRepository } from './repository.js';
export type {
  CanonicalLabelRecord,
  LabelAliasRecord,
  LabelRepository,
} from './repository.js';
