import pg from 'pg';

import { runCandidateIngestionMigrations } from '@trapmap/service-candidate-ingestion';
import { runCronMigrations } from '@trapmap/service-cron';
import { runGovernanceReviewMigrations } from '@trapmap/service-governance-review';
import { runIdentityAccessMigrations } from '@trapmap/service-identity-access';
import { runJobRuntimeMigrations } from '@trapmap/service-job-runtime';
import { runKnowledgeReadMigrations } from '@trapmap/service-knowledge-read';
import { runKnowledgeWriteMigrations } from '@trapmap/service-knowledge-write';
import { loadServiceConfig } from './config/index.js';

export const distributedMigrationRunners = [
  runIdentityAccessMigrations,
  runKnowledgeWriteMigrations,
  runCandidateIngestionMigrations,
  runGovernanceReviewMigrations,
  runJobRuntimeMigrations,
  runKnowledgeReadMigrations,
  runCronMigrations,
] as const;

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
