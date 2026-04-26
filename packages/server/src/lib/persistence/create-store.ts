import pg from 'pg';

import { PostgresStore } from './postgres-store.js';
import { JsonStore, type SkillShareerStore } from '../store.js';

export interface StoreConfig {
  dataFile: string;
  databaseUrl: string | null;
}

/**
 * Create the appropriate store implementation based on configuration.
 *
 * - When databaseUrl is set: returns a PostgresStore backed by Drizzle/PostgreSQL
 * - Otherwise: returns the existing JsonStore file-backed implementation
 */
export function createSkillShareerStore(config: StoreConfig): SkillShareerStore {
  if (config.databaseUrl) {
    const pool = new pg.Pool({ connectionString: config.databaseUrl });
    return new PostgresStore(pool);
  }

  return new JsonStore(config.dataFile);
}
