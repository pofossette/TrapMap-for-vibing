/**
 * Label merge repair CLI runner.
 *
 * Usage:
 *   pnpm label-merge:repair
 *   pnpm label-merge:repair -- --dry-run
 *
 * Requires DATABASE_URL environment variable.
 */

import { createGraphIndexRepository } from '@trapmap/server/lib/graph-index/repository.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';

import { repairGraphDocuments } from './merge-repair.js';
import { createLabelReadProjection } from './repository.js';
import {
  logLabelRunnerCompletion,
  runLabelRunnerMain,
  withLabelRunnerPool,
} from './runner-helpers.js';

export async function main() {
  const dryRun = process.argv.includes('--dry-run');

  await withLabelRunnerPool(async (pool) => {
    const repository = createLabelReadProjection({ pool });
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
    logLabelRunnerCompletion(report.warnings);
  });
}

runLabelRunnerMain(import.meta.url, process.argv[1], main, 'Merge repair');
