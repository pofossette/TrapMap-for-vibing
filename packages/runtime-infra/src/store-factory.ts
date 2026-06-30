import pg from 'pg';

import { JsonStore, type SkillShareerStore } from '@trapmap/server/lib/store.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';

export interface StoreConfig {
  dataFile: string;
  databaseUrl: string | null;
}

export function createSkillShareerStore(config: StoreConfig): SkillShareerStore {
  if (config.databaseUrl) {
    const pool = new pg.Pool({ connectionString: config.databaseUrl });
    return new PostgresStore(pool);
  }

  return new JsonStore(config.dataFile);
}
