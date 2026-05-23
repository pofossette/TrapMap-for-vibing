/**
 * Migration script to backfill existing candidates from JSONB snapshot to relational table.
 *
 * Run once after deploying the candidates table infrastructure:
 * 1. Ensure candidates table exists (created via Drizzle migration)
 * 2. Run this migration script
 *
 * Usage:
 *   # Dry run to see what would be migrated
 *   pnpm migrate-candidates --dry-run
 *
 *   # Actual migration
 *   pnpm migrate-candidates
 *
 * Phase: 61 (WRITE-01)
 */

import type { Pool } from 'pg';

import { PgCandidateRepository } from '@trapmap/server/lib/candidates/pg-repository.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';

export interface MigrationConfig {
  /** PostgreSQL connection pool */
  pool: Pool;
  /** Store to read candidates from */
  store: SkillShareerStore;
  /** If true, don't write to database, just report what would be done */
  dryRun?: boolean;
  /** Progress callback */
  onProgress?: (info: {
    processed: number;
    total: number;
    candidateId: string;
  }) => void;
}

export interface MigrationError {
  candidateId: string;
  error: string;
}

export interface MigrationResult {
  /** Total candidates examined */
  totalCandidates: number;
  /** Candidates successfully migrated */
  migrated: number;
  /** Candidates skipped (already exist in table) */
  skipped: number;
  /** Errors encountered */
  errors: MigrationError[];
  /** Total duration in milliseconds */
  durationMs: number;
}

/**
 * Migrate candidate submissions from JSONB snapshot to relational candidates table.
 *
 * This function:
 * 1. Reads all candidateSubmissions from the store snapshot
 * 2. For each candidate, checks if it already exists in the relational table
 * 3. Inserts candidates that don't exist (idempotent)
 * 4. Reports progress and errors
 *
 * The migration is designed to be safe to run multiple times:
 * - Candidates already in the table are skipped
 * - Errors don't stop the migration - they're recorded and processing continues
 * - Dry-run mode allows verification before actual migration
 *
 * @param config - Migration configuration
 * @returns Summary of migration operation
 */
export async function migrateCandidates(config: MigrationConfig): Promise<MigrationResult> {
  const { pool, store, dryRun = false, onProgress } = config;

  const startTime = Date.now();
  const result: MigrationResult = {
    totalCandidates: 0,
    migrated: 0,
    skipped: 0,
    errors: [],
    durationMs: 0,
  };

  // Get snapshot of all candidates from JSONB store
  const data = await store.snapshot();
  const candidates = data.candidateSubmissions;
  result.totalCandidates = candidates.length;

  if (candidates.length === 0) {
    result.durationMs = Date.now() - startTime;
    return result;
  }

  // Create repository for relational table operations
  const repo = new PgCandidateRepository(pool);

  // Process each candidate
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (!candidate) continue;

    try {
      if (dryRun) {
        // In dry-run mode, count everything as skipped
        result.skipped++;
      } else {
        // Check if already migrated (idempotent)
        const existing = await repo.getById(candidate.id);
        if (existing) {
          result.skipped++;
        } else {
          await repo.insert(candidate);
          result.migrated++;
        }
      }
    } catch (error) {
      result.errors.push({
        candidateId: candidate.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Report progress (called even on error)
    onProgress?.({
      processed: i + 1,
      total: result.totalCandidates,
      candidateId: candidate.id,
    });
  }

  result.durationMs = Date.now() - startTime;
  return result;
}
