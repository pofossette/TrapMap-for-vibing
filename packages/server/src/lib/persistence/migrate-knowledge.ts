/**
 * Migration script to backfill existing knowledge entries from JSONB snapshot to relational tables.
 *
 * Run once after deploying the knowledge_entries table infrastructure:
 * 1. Ensure knowledge_entries table exists (via PgKnowledgeRepository.ensureSchema)
 * 2. Run this migration script
 *
 * Usage:
 *   # Dry run to see what would be migrated
 *   pnpm migrate-knowledge --dry-run
 *
 *   # Actual migration
 *   pnpm migrate-knowledge
 *
 * Phase: 62 (WRITE-02)
 */

import type { Pool } from 'pg';

import { PgKnowledgeRepository } from '../knowledge/pg-repository.js';
import type { KnowledgeRecord, SkillShareerStore } from '../store.js';

export interface MigrationConfig {
  /** PostgreSQL connection pool */
  pool: Pool;
  /** Store to read knowledge entries from */
  store: SkillShareerStore;
  /** If true, don't write to database, just report what would be done */
  dryRun?: boolean;
  /** Batch size for processing (defaults to 100) */
  batchSize?: number;
  /** Progress callback */
  onProgress?: (info: { processed: number; total: number; entryId: string }) => void;
}

export interface MigrationError {
  entryId: string;
  error: string;
}

export interface MigrationResult {
  /** Total entries examined */
  totalEntries: number;
  /** Entries successfully migrated */
  migrated: number;
  /** Entries skipped (already exist in table) */
  skipped: number;
  /** Errors encountered */
  errors: MigrationError[];
  /** Total duration in milliseconds */
  durationMs: number;
}

/**
 * Migrate knowledge entries from JSONB snapshot to relational knowledge_entries table.
 *
 * This function:
 * 1. Reads all knowledgeEntries from the store snapshot
 * 2. For each entry, checks if it already exists in the relational table
 * 3. Inserts entries that don't exist (idempotent)
 * 4. Reports progress and errors
 * 5. Synchronizes the SEQUENCE to max(existing_ids) + 1 after migration
 *
 * The migration is designed to be safe to run multiple times:
 * - Entries already in the table are skipped
 * - Errors don't stop the migration - they're recorded and processing continues
 * - Dry-run mode allows verification before actual migration
 *
 * Nested data handling:
 * - Each entry's history[] (revisions) is inserted into knowledge_revisions table
 * - Each entry's lifecycleHistory[] (events) is inserted into lifecycle_events table
 * - All nested data is inserted in a transaction for consistency
 *
 * ID preservation:
 * - Migration uses existing entry IDs from JSONB (not SEQUENCE-generated)
 * - SEQUENCE is only used for new entries created post-migration
 * - After migration, SEQUENCE is set to max(existing_ids) + 1
 *
 * @param config - Migration configuration
 * @returns Summary of migration operation
 */
export async function migrateKnowledgeEntries(config: MigrationConfig): Promise<MigrationResult> {
  const { pool, store, dryRun = false, batchSize = 100, onProgress } = config;

  const startTime = Date.now();
  const result: MigrationResult = {
    totalEntries: 0,
    migrated: 0,
    skipped: 0,
    errors: [],
    durationMs: 0,
  };

  // Get snapshot of all knowledge entries from JSONB store
  const data = await store.snapshot();
  const entries = data.knowledgeEntries;
  result.totalEntries = entries.length;

  if (entries.length === 0) {
    result.durationMs = Date.now() - startTime;
    return result;
  }

  // Create repository for relational table operations
  const repo = new PgKnowledgeRepository(pool);

  // Process each entry
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;

    try {
      if (dryRun) {
        // In dry-run mode, count everything as skipped
        result.skipped++;
      } else {
        // Check if already migrated (idempotent)
        const existing = await repo.getById(entry.id);
        if (existing) {
          result.skipped++;
        } else {
          // Insert the entry with all nested data
          // PgKnowledgeRepository.insert handles history and lifecycleHistory in a transaction
          await repo.insert(entry);
          result.migrated++;
        }
      }
    } catch (error) {
      result.errors.push({
        entryId: entry.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Report progress (called even on error)
    onProgress?.({
      processed: i + 1,
      total: result.totalEntries,
      entryId: entry.id,
    });
  }

  // Synchronize SEQUENCE to max(existing_ids) + 1 after migration
  if (!dryRun && result.migrated > 0) {
    await synchronizeSequence(pool, entries);
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

/**
 * Synchronize the knowledge_entry_id_seq to be greater than all existing IDs.
 *
 * This ensures that new entries created after migration get IDs that don't
 * collide with migrated entries.
 *
 * @param pool - PostgreSQL connection pool
 * @param entries - All knowledge entries (migrated or not)
 */
async function synchronizeSequence(pool: Pool, entries: KnowledgeRecord[]): Promise<void> {
  // Extract numeric IDs from entry IDs (format: "knowledge_N" or legacy formats)
  const numericIds: number[] = [];
  for (const entry of entries) {
    // Handle "knowledge_N" format
    const match = entry.id.match(/^knowledge_(\d+)$/);
    if (match) {
      numericIds.push(parseInt(match[1]!, 10));
    } else {
      // For non-standard IDs, we still need to account for them
      // Use a hash-based approach to generate a reasonable numeric value
      // This ensures the sequence is set high enough
      const hash = simpleHash(entry.id);
      numericIds.push(hash);
    }
  }

  if (numericIds.length === 0) {
    return;
  }

  const maxId = Math.max(...numericIds);

  // Set the sequence to maxId + 1
  // This ensures next nextval() will return a value greater than all existing IDs
  await pool.query(
    `SELECT setval('knowledge_entry_id_seq', $1, false)`,
    [maxId + 1],
  );
}

/**
 * Simple hash function to generate a numeric value from a string.
 * Used for non-standard entry IDs during sequence synchronization.
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
