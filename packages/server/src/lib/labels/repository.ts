/**
 * Canonical label catalog repository.
 *
 * Barrel re-export. The implementation lives in sub-modules under
 * `repository/`. This file preserves backward compatibility so
 * existing import paths continue to work unchanged.
 */

export type {
  CanonicalLabelRecord,
  LabelAliasRecord,
  LabelRepository,
} from './repository/index.js';

export { PgLabelRepository } from './repository/index.js';
export { createLabelReadProjection } from './repository/index.js';
