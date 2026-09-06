export { type BackfillOptions, type BackfillReport, backfillLabels } from './backfill.js';
export { alignLabel, type LabelAlignmentResult } from './llm-align.js';
export {
  type MergeRepairOptions,
  type MergeRepairReport,
  repairGraphDocuments,
} from './merge-repair.js';
export type {
  CanonicalLabelRecord,
  LabelAliasRecord,
  LabelRepository,
} from './repository.js';
export { createPgLabelRepository, PgLabelRepository } from './repository.js';
