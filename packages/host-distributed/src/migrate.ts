import { runMigrations } from '@trapmap/db';
import pg from 'pg';

import { loadServiceConfig } from './config/index.js';

export const distributedMigrationRunners = [runMigrations] as const;

type MigrationRunner = (pool: pg.Pool) => Promise<void>;
type MigrationPool = Pick<pg.Pool, 'end' | 'query'>;

export function createDistributedMigrationRunner({
  createPool = (connectionString: string): MigrationPool => new pg.Pool({ connectionString }),
  runners = distributedMigrationRunners,
}: {
  createPool?: (connectionString: string) => MigrationPool;
  runners?: readonly MigrationRunner[];
} = {}): () => Promise<void> {
  return async () => {
    const config = loadServiceConfig('identity-access');
    if (!config.databaseUrl) {
      throw new Error('Database URL required for distributed migrations');
    }
    const pool = createPool(config.databaseUrl);
    try {
      for (const runner of runners) await runner(pool as pg.Pool);
    } finally {
      await pool.end();
    }
  };
}

export async function runDistributedMigrations(): Promise<void> {
  await createDistributedMigrationRunner()();
}

const isDirectExecution = process.argv[1]?.endsWith('/dist/migrate.js');

if (isDirectExecution) {
  runDistributedMigrations().catch((error) => {
    console.error('Distributed migration failed:', error);
    process.exitCode = 1;
  });
}
