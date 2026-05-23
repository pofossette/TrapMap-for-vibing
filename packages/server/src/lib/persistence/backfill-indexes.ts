/**
 * Migration script to backfill existing entries into PostgreSQL indexes.
 *
 * Run once after deploying pgvector infrastructure:
 * 1. Enable pgvector extension (done by PostgresStore)
 * 2. Run db:push to create tables
 * 3. Run this backfill script
 *
 * Usage:
 *   # Dry run to see what would be synced
 *   pnpm backfill-indexes --dry-run
 *
 *   # Actual backfill
 *   pnpm backfill-indexes
 */

import { buildHybridAdapterRegistry } from '@trapmap/server/lib/indexing/adapters/index.js';
import { normalizeKnowledgeIndexDocument } from '@trapmap/server/lib/indexing/normalize.js';
import type { IndexSyncResult } from '@trapmap/server/lib/indexing/types.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import type { Pool } from 'pg';

export interface BackfillConfig {
  /** PostgreSQL connection pool */
  pool: Pool;
  /** Store to read entries from */
  store: SkillShareerStore;
  /** Number of entries to process per batch */
  batchSize?: number;
  /** If true, don't write to database, just report what would be done */
  dryRun?: boolean;
  /** Progress callback */
  onProgress?: (info: { processed: number; total: number; entryId: string }) => void;
}

export interface BackfillError {
  entryId: string;
  error: string;
}

export interface BackfillResult {
  /** Total entries examined */
  totalEntries: number;
  /** Entries successfully synced */
  entriesSynced: number;
  /** Entries skipped (already synced or not approved) */
  entriesSkipped: number;
  /** Errors encountered */
  errors: BackfillError[];
  /** Total duration in milliseconds */
  durationMs: number;
}

/**
 * Backfill PostgreSQL indexes from existing store data.
 *
 * This function:
 * 1. Reads all knowledge entries from the store
 * 2. Filters to approved entries only
 * 3. Processes in batches to avoid memory pressure
 * 4. Reports progress and errors
 *
 * @param config - Backfill configuration
 * @returns Summary of backfill operation
 */
export async function backfillKnowledgeIndexes(config: BackfillConfig): Promise<BackfillResult> {
  const { pool, store, batchSize = 50, dryRun = false, onProgress } = config;

  const startTime = Date.now();
  const result: BackfillResult = {
    totalEntries: 0,
    entriesSynced: 0,
    entriesSkipped: 0,
    errors: [],
    durationMs: 0,
  };

  // Create adapters for backfill (always use PostgreSQL adapters)
  const registry = buildHybridAdapterRegistry({
    pool,
    usePgVector: () => true,
    usePgKeyword: () => true,
  });

  // Get snapshot of all entries
  const data = await store.snapshot();
  const approvedEntries = data.knowledgeEntries.filter((e) => e.lifecycleState === 'approved');
  result.totalEntries = approvedEntries.length;

  console.log(`[Backfill] Starting backfill of ${result.totalEntries} approved entries...`);

  // Process in batches
  for (let i = 0; i < approvedEntries.length; i += batchSize) {
    const batch = approvedEntries.slice(i, i + batchSize);

    for (const entry of batch) {
      try {
        if (dryRun) {
          result.entriesSkipped++;
        } else {
          // Normalize the entry to a document
          const document = normalizeKnowledgeIndexDocument(entry);

          // Sync to all adapters
          const syncResults: IndexSyncResult[] = [];
          for (const adapter of registry.all()) {
            const syncResult = await adapter.sync(document);
            syncResults.push(syncResult);
          }

          // Check if any adapter did work
          const didWork = syncResults.some((r) => r.performedWork);
          if (didWork) {
            result.entriesSynced++;
          } else {
            result.entriesSkipped++;
          }
        }

        // Report progress
        onProgress?.({
          processed: i + batch.indexOf(entry) + 1,
          total: result.totalEntries,
          entryId: entry.id,
        });
      } catch (error) {
        result.errors.push({
          entryId: entry.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Log batch progress
    const processed = Math.min(i + batchSize, result.totalEntries);
    console.log(
      `[Backfill] Processed ${processed}/${result.totalEntries} entries (${result.entriesSynced} synced, ${result.errors.length} errors)`,
    );
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

/**
 * Remove stale index entries that no longer have corresponding knowledge entries.
 *
 * This should be run after backfill to clean up orphaned index records.
 */
export async function cleanupStaleIndexes(config: {
  pool: Pool;
  store: SkillShareerStore;
}): Promise<{ removedEmbeddings: number; removedKeywords: number }> {
  const { pool, store } = config;
  const data = await store.snapshot();
  const validEntryIds = new Set(data.knowledgeEntries.map((e) => e.id));

  // Remove stale embeddings
  const embeddingsResult = await pool.query(
    `DELETE FROM knowledge_embeddings WHERE entry_id NOT IN (${Array.from(validEntryIds)
      .map((_, i) => `$${i + 1}`)
      .join(',')}) RETURNING id`,
    Array.from(validEntryIds),
  );
  const removedEmbeddings = embeddingsResult.rowCount ?? 0;

  // Remove stale keywords
  const keywordsResult = await pool.query(
    `DELETE FROM knowledge_keywords WHERE entry_id NOT IN (${Array.from(validEntryIds)
      .map((_, i) => `$${i + 1}`)
      .join(',')}) RETURNING id`,
    Array.from(validEntryIds),
  );
  const removedKeywords = keywordsResult.rowCount ?? 0;

  console.log(
    `[Cleanup] Removed ${removedEmbeddings} stale embeddings, ${removedKeywords} stale keywords`,
  );

  return { removedEmbeddings, removedKeywords };
}
