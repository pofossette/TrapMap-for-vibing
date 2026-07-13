import pg from 'pg';

import { runIdentityAccessMigrations } from '@trapmap/service-identity-access';
import { runKnowledgeWriteMigrations } from '@trapmap/service-knowledge-write';
import { runCandidateIngestionMigrations } from '@trapmap/service-candidate-ingestion';
import { runGovernanceReviewMigrations } from '@trapmap/service-governance-review';
import { runJobRuntimeMigrations } from '@trapmap/service-job-runtime';
import { runKnowledgeReadMigrations } from '@trapmap/service-knowledge-read';
import { loadServiceConfig } from './config/index.js';

export const distributedMigrationRunners = [
  runIdentityAccessMigrations,
  runKnowledgeWriteMigrations,
  runCandidateIngestionMigrations,
  runGovernanceReviewMigrations,
  runJobRuntimeMigrations,
  runKnowledgeReadMigrations,
] as const;

export async function runDistributedMigrations(
  createPool: (connectionString: string) => Pick<pg.Pool, 'end' | 'query'> = (connectionString) =>
    new pg.Pool({ connectionString }),
  migrate?: (pool: pg.Pool) => Promise<void>,
  runners: readonly ((pool: pg.Pool) => Promise<void>)[] = distributedMigrationRunners,
): Promise<void> {
  const config = loadServiceConfig('identity-access');
  if (!config.databaseUrl) {
    throw new Error('Database URL required for distributed migrations');
  }
  const pool = createPool(config.databaseUrl);
  try {
    if (migrate) await migrate(pool as pg.Pool);
    else for (const runner of runners) await runner(pool as pg.Pool);
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
