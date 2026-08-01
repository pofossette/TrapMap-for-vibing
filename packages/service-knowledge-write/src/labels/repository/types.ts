/**
 * Re-exports canonical label catalog types from @trapmap/contracts.
 *
 * These types were moved to the shared contracts package to allow
 * cross-service type imports without violating architecture boundaries.
 */

export type {
  CanonicalLabelRecord,
  LabelAliasRecord,
  LabelAlignmentEventRecord,
  LabelRepository,
} from '@trapmap/contracts';
