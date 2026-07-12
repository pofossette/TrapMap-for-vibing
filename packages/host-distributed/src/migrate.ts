import pg from 'pg';

import { runMigrations } from '@trapmap/server/lib/persistence/migration-runner.js';
import { loadServiceConfig } from './config/index.js';

export async function runDistributedMigrations(
  createPool: (connectionString: string) => Pick<pg.Pool, 'end' | 'query'> = (connectionString) =>
    new pg.Pool({ connectionString }),
  migrate: (pool: pg.Pool) => Promise<void> = runMigrations,
): Promise<void> {
  const config = loadServiceConfig('identity-access');
  if (!config.databaseUrl) {
    throw new Error('Database URL required for distributed migrations');
  }
  const pool = createPool(config.databaseUrl);
  try {
    await migrate(pool as pg.Pool);
  } finally {
    await pool.end();
  }
}

const isDirectExecution = process.argv[1]?.endsWith('/dist/migrate.js');

if (isDirectExecution) {
  runDistributedMigrations().catch((error) => {
    console.error('Distributed migration failed:', error);
    process.exitCode = 1;
  });
}
