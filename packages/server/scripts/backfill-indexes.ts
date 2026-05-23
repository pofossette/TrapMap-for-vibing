#!/usr/bin/env node
/**
 * CLI command: pnpm backfill-indexes
 *
 * Backfills existing entries into PostgreSQL indexes.
 * Run after deploying pgvector infrastructure.
 *
 * Usage:
 *   pnpm backfill-indexes           # Run backfill
 *   pnpm backfill-indexes --dry-run # Preview without writing
 *   pnpm backfill-indexes --cleanup # Also clean up stale indexes
 *
 * Required environment variables:
 *   TRAPMAP_DATABASE_URL - PostgreSQL connection string
 *
 * Optional environment variables:
 *   BACKFILL_BATCH_SIZE - Number of entries per batch (default: 50)
 */

import { Pool } from 'pg';

import {
  backfillKnowledgeIndexes,
  cleanupStaleIndexes,
} from '@trapmap/server/lib/persistence/backfill-indexes';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store';

async function main(): Promise<void> {
  const databaseUrl = process.env.TRAPMAP_DATABASE_URL;

  if (!databaseUrl) {
    console.error('Error: TRAPMAP_DATABASE_URL environment variable is required');
    console.error('');
    console.error('Usage:');
    console.error('  TRAPMAP_DATABASE_URL=postgres://user:pass@host:port/db pnpm backfill-indexes');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry-run');
  const doCleanup = process.argv.includes('--cleanup');
  const batchSize = Number.parseInt(process.env.BACKFILL_BATCH_SIZE ?? '50', 10);

  console.log('='.repeat(60));
  console.log('TrapMap PostgreSQL Index Backfill');
  console.log('='.repeat(60));
  console.log(`Database URL: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Cleanup: ${doCleanup}`);
  console.log('='.repeat(60));
  console.log('');

  const pool = new Pool({ connectionString: databaseUrl });
  const store = new PostgresStore(pool);

  try {
    // Run backfill
    console.log('[Step 1] Backfilling knowledge indexes...');
    const result = await backfillKnowledgeIndexes({
      pool,
      store,
      batchSize,
      dryRun,
    });

    console.log('');
    console.log('Backfill Summary:');
    console.log(`  Total entries: ${result.totalEntries}`);
    console.log(`  Synced: ${result.entriesSynced}`);
    console.log(`  Skipped: ${result.entriesSkipped}`);
    console.log(`  Errors: ${result.errors.length}`);
    console.log(`  Duration: ${(result.durationMs / 1000).toFixed(2)}s`);

    if (result.errors.length > 0) {
      console.log('');
      console.log('Errors (first 10):');
      for (const { entryId, error } of result.errors.slice(0, 10)) {
        console.log(`  ${entryId}: ${error}`);
      }
      if (result.errors.length > 10) {
        console.log(`  ... and ${result.errors.length - 10} more`);
      }
    }

    // Optionally cleanup stale indexes
    if (doCleanup && !dryRun) {
      console.log('');
      console.log('[Step 2] Cleaning up stale indexes...');
      const cleanup = await cleanupStaleIndexes({ pool, store });
      console.log(`  Removed embeddings: ${cleanup.removedEmbeddings}`);
      console.log(`  Removed keywords: ${cleanup.removedKeywords}`);
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('Backfill complete!');
    console.log('='.repeat(60));

    await store.close();
    process.exit(result.errors.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('');
    console.error('Error during backfill:');
    console.error(error instanceof Error ? error.message : String(error));
    await store.close().catch(() => {});
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
