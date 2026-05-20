/**
 * Migration script to backfill existing skill artifacts from JSONB snapshot to relational tables.
 *
 * Run once after deploying the skill_artifacts table infrastructure:
 * 1. Ensure skill_artifacts table exists (created via Drizzle migration)
 * 2. Run this migration script
 *
 * Usage:
 *   # Dry run to see what would be migrated
 *   pnpm migrate-artifacts --dry-run
 *
 *   # Actual migration
 *   pnpm migrate-artifacts
 *
 * Phase: 63 (WRITE-03)
 */

import type { Pool } from 'pg';

import { PgArtifactRepository } from '../artifacts/pg-repository.js';
import type { SkillArtifactRecord, SkillShareerStore } from '../store.js';

export interface MigrationConfig {
  /** PostgreSQL connection pool */
  pool: Pool;
  /** Store to read skill artifacts from */
  store: SkillShareerStore;
  /** If true, don't write to database, just report what would be done */
  dryRun?: boolean;
  /** Batch size for processing (defaults to 100) */
  batchSize?: number;
  /** Progress callback */
  onProgress?: (info: { processed: number; total: number; artifactId: string }) => void;
}

export interface MigrationError {
  artifactId: string;
  error: string;
}

export interface MigrationResult {
  /** Total artifacts examined */
  totalArtifacts: number;
  /** Artifacts successfully migrated */
  migrated: number;
  /** Artifacts skipped (already exist in table) */
  skipped: number;
  /** Errors encountered */
  errors: MigrationError[];
  /** Total duration in milliseconds */
  durationMs: number;
}

/**
 * Migrate skill artifacts from JSONB snapshot to relational skill_artifacts table.
 *
 * This function:
 * 1. Reads all skillArtifacts from the store snapshot
 * 2. For each artifact, checks if it already exists in the relational table
 * 3. Inserts artifacts that don't exist (idempotent)
 * 4. Reports progress and errors
 * 5. Synchronizes the SEQUENCE to max(existing_ids) + 1 after migration
 *
 * The migration is designed to be safe to run multiple times:
 * - Artifacts already in the table are skipped
 * - Errors don't stop the migration - they're recorded and processing continues
 * - Dry-run mode allows verification before actual migration
 *
 * Nested data handling:
 * - Each artifact's history[] (revisions) is inserted into artifact_revisions table
 * - Each artifact's lifecycleHistory[] (events) is inserted into artifact_lifecycle_events table
 * - All nested data is inserted in a transaction for consistency
 *
 * ID preservation:
 * - Migration uses existing artifact IDs from JSONB (not SEQUENCE-generated)
 * - SEQUENCE is only used for new artifacts created post-migration
 * - After migration, SEQUENCE is set to max(existing_ids) + 1
 *
 * @param config - Migration configuration
 * @returns Summary of migration operation
 */
export async function migrateSkillArtifacts(config: MigrationConfig): Promise<MigrationResult> {
  const { pool, store, dryRun = false, onProgress } = config;

  const startTime = Date.now();
  const result: MigrationResult = {
    totalArtifacts: 0,
    migrated: 0,
    skipped: 0,
    errors: [],
    durationMs: 0,
  };

  // Get snapshot of all artifacts from JSONB store
  const data = await store.snapshot();
  const artifacts = data.skillArtifacts ?? [];
  result.totalArtifacts = artifacts.length;

  if (artifacts.length === 0) {
    result.durationMs = Date.now() - startTime;
    return result;
  }

  // Create repository for relational table operations
  const repo = new PgArtifactRepository(pool);

  // Process each artifact
  for (let i = 0; i < artifacts.length; i++) {
    const artifact = artifacts[i];
    if (!artifact) continue;

    try {
      if (dryRun) {
        // In dry-run mode, count everything as skipped
        result.skipped++;
      } else {
        // Check if already migrated (idempotent)
        const existing = await repo.getById(artifact.id);
        if (existing) {
          result.skipped++;
        } else {
          // Insert the artifact with all nested data
          await repo.insert(artifact);
          result.migrated++;
        }
      }
    } catch (error) {
      result.errors.push({
        artifactId: artifact.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Report progress
    onProgress?.({
      processed: i + 1,
      total: result.totalArtifacts,
      artifactId: artifact.id,
    });
  }

  // Synchronize SEQUENCE after migration
  if (!dryRun && result.migrated > 0) {
    await synchronizeSequence(pool, artifacts);
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

/**
 * Synchronize the skill_artifact_id_seq to be greater than all existing IDs.
 *
 * This ensures that new artifacts created after migration get IDs that don't
 * collide with migrated artifacts.
 *
 * @param pool - PostgreSQL connection pool
 * @param artifacts - All skill artifacts (migrated or not)
 */
async function synchronizeSequence(pool: Pool, artifacts: SkillArtifactRecord[]): Promise<void> {
  // Extract numeric IDs from artifact IDs (format: "artifact_N" or legacy formats)
  const numericIds: number[] = [];
  for (const artifact of artifacts) {
    // Handle "artifact_N" format
    const match = artifact.id.match(/^artifact_(\d+)$/);
    if (match) {
      numericIds.push(Number.parseInt(match[1]!, 10));
    } else {
      // For non-standard IDs, we still need to account for them
      // Use a hash-based approach to generate a reasonable numeric value
      // This ensures the sequence is set high enough
      const hash = simpleHash(artifact.id);
      numericIds.push(hash);
    }
  }

  if (numericIds.length === 0) {
    return;
  }

  const maxId = Math.max(...numericIds);

  // Set the sequence to maxId + 1
  // This ensures next nextval() will return a value greater than all existing IDs
  await pool.query(`SELECT setval('skill_artifact_id_seq', $1, false)`, [maxId + 1]);
}

/**
 * Simple hash function to generate a numeric value from a string.
 * Used for non-standard artifact IDs during sequence synchronization.
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
