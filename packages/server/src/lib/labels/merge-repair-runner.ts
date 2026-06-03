/**
 * Label merge repair CLI runner.
 *
 * Usage:
 *   pnpm label-merge:repair
 *   pnpm label-merge:repair -- --dry-run
 *
 * Requires DATABASE_URL environment variable.
 */

import { Pool } from 'pg';

import { createGraphIndexRepository } from '@trapmap/server/lib/graph-index/repository.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';

import { repairGraphDocuments } from './merge-repair.js';
import { createLabelRepository } from './repository.js';

export async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const repository = createLabelRepository({ pool });
    const graphRepo = createGraphIndexRepository({
      pool,
      store: new PostgresStore(pool),
    });

    console.log(`Starting label merge repair${dryRun ? ' (DRY RUN)' : ''}...`);

    const documents = await graphRepo.listAll();
    console.log(`Found ${documents.length} graph documents to examine`);

    const report = await repairGraphDocuments(
      repository,
      documents,
      async (doc) => {
        await graphRepo.upsert(doc);
      },
      { dryRun },
    );

    console.log('\n=== Merge Repair Report ===');
    console.log(`Examined: ${report.examined}`);
    console.log(`Updated documents: ${report.updatedDocuments}`);
    console.log(`Nodes rewritten: ${report.nodesRewritten}`);
    console.log(`Edges rewritten: ${report.edgesRewritten}`);
    if (report.warnings.length > 0) {
      console.log(`Warnings: ${report.warnings.join(', ')}`);
    }

    console.log('\nDone.');
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Merge repair failed:', err);
    process.exit(1);
  });
}
