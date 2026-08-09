/**
 * Factory function for creating a LabelRepository instance.
 *
 * Requires a PostgreSQL pool (pgvector is mandatory).
 */

import type { Pool } from 'pg';

import { PgLabelRepository } from './pg-repository.js';
import type { LabelRepository } from './types.js';

/**
 * Create a LabelRepository. Requires a PostgreSQL pool (pgvector is mandatory).
 */
export function createPgLabelRepository(config: { pool: Pool }): LabelRepository {
  return new PgLabelRepository(config.pool);
}
