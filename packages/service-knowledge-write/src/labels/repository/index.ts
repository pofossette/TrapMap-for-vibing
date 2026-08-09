/**
 * Canonical label catalog repository barrel.
 *
 * Re-exports all public types, the PgLabelRepository implementation,
 * and the read projection factory so consumers can import from
 * either `labels/repository.js` or `labels/repository/index.js`.
 */

export type {
  CanonicalLabelRecord,
  LabelAliasRecord,
  LabelRepository,
} from './types.js';

export { PgLabelRepository } from './pg-repository.js';
export { createPgLabelRepository } from './factory.js';
