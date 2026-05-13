/**
 * PostgreSQL-backed implementation of CandidateRepository.
 *
 * Uses row-level SELECT FOR UPDATE locking for safe concurrent processing.
 * Each candidate is stored as a separate row, enabling concurrent operations
 * on different candidates without blocking the entire store_snapshot.
 *
 * Phase: 61 (WRITE-01)
 */

import type {
  AnalysisSnapshot,
  CandidateStatus,
  CandidateSubmission,
  DuplicateCase,
  ManualResultSubmission,
} from '@trapmap/contracts';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import { candidates } from '../persistence/schema.js';
import type { CandidateRepository } from './repository.js';
import { createManualResultRecord } from './repository.js';

/**
 * PostgreSQL-backed repository for candidate CRUD operations.
 * Implements row-level locking for concurrent-safe updates.
 */
export class PgCandidateRepository implements CandidateRepository {
  private db: ReturnType<typeof drizzle>;
  private initialized = false;

  constructor(private readonly pool: Pool) {
    this.db = drizzle(pool, { schema: { candidates } });
  }

  /**
   * Ensure the candidates table and indexes exist.
   * Called idempotently before each operation.
   */
  private async ensureSchema(): Promise<void> {
    if (this.initialized) return;

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS candidates (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        submitted_by TEXT NOT NULL,
        team_id TEXT,
        status TEXT NOT NULL,
        original_payload JSONB NOT NULL,
        analysis_snapshot JSONB,
        duplicate_case JSONB,
        received_at TIMESTAMP WITH TIME ZONE NOT NULL,
        queued_at TIMESTAMP WITH TIME ZONE,
        analyzing_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        last_error TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        manual_result JSONB,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates (status)
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_candidates_team ON candidates (team_id) WHERE team_id IS NOT NULL
    `);

    this.initialized = true;
  }

  /**
   * Insert a new candidate submission.
   */
  async insert(candidate: CandidateSubmission): Promise<void> {
    await this.ensureSchema();

    await this.db.insert(candidates).values({
      id: candidate.id,
      sourceType: candidate.sourceType,
      submittedBy: candidate.submittedBy,
      teamId: candidate.teamId,
      status: candidate.status,
      originalPayload: candidate.originalPayload,
      analysisSnapshot: candidate.analysisSnapshot,
      duplicateCase: candidate.duplicateCase,
      receivedAt: new Date(candidate.receivedAt),
      queuedAt: candidate.queuedAt ? new Date(candidate.queuedAt) : null,
      analyzingAt: candidate.analyzingAt ? new Date(candidate.analyzingAt) : null,
      completedAt: candidate.completedAt ? new Date(candidate.completedAt) : null,
      lastError: candidate.lastError,
      retryCount: candidate.retryCount,
      manualResult: candidate.manualResult,
    });
  }

  /**
   * Get a candidate by ID.
   * Returns null if not found.
   */
  async getById(candidateId: string): Promise<CandidateSubmission | null> {
    await this.ensureSchema();

    const result = await this.db
      .select()
      .from(candidates)
      .where(eq(candidates.id, candidateId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return rowToCandidateSubmission(result[0]! as DrizzleCandidateRow);
  }

  /**
   * Update candidate status with proper timestamp handling.
   * Uses SELECT FOR UPDATE for row-level locking.
   */
  async updateStatus(candidateId: string, status: CandidateStatus, error?: string): Promise<void> {
    await this.ensureSchema();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the row for update
      const { rows } = await client.query<{ id: string }>(
        'SELECT id FROM candidates WHERE id = $1 FOR UPDATE',
        [candidateId],
      );

      if (rows.length === 0) {
        throw new Error(`Candidate ${candidateId} not found`);
      }

      const now = new Date().toISOString();

      // Determine which timestamp column to set based on status
      const terminalStatuses: CandidateStatus[] = [
        'ready_for_review',
        'duplicate_detected',
        'error',
        'resolved',
      ];

      if (status === 'queued') {
        await client.query(
          'UPDATE candidates SET status = $1, queued_at = $2, updated_at = $2 WHERE id = $3',
          [status, now, candidateId],
        );
      } else if (status === 'analyzing') {
        await client.query(
          'UPDATE candidates SET status = $1, analyzing_at = $2, updated_at = $2 WHERE id = $3',
          [status, now, candidateId],
        );
      } else if (status === 'error') {
        await client.query(
          `UPDATE candidates
           SET status = $1, completed_at = $2, last_error = $3, retry_count = retry_count + 1, updated_at = $2
           WHERE id = $4`,
          [status, now, error ?? 'Unknown error', candidateId],
        );
      } else if (terminalStatuses.includes(status)) {
        await client.query(
          'UPDATE candidates SET status = $1, completed_at = $2, updated_at = $2 WHERE id = $3',
          [status, now, candidateId],
        );
      } else {
        await client.query('UPDATE candidates SET status = $1, updated_at = $2 WHERE id = $3', [
          status,
          now,
          candidateId,
        ]);
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Attach analysis snapshot to candidate.
   */
  async attachAnalysis(candidateId: string, snapshot: AnalysisSnapshot): Promise<void> {
    await this.ensureSchema();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the row for update
      const { rows } = await client.query<{ id: string }>(
        'SELECT id FROM candidates WHERE id = $1 FOR UPDATE',
        [candidateId],
      );

      if (rows.length === 0) {
        throw new Error(`Candidate ${candidateId} not found`);
      }

      const now = new Date().toISOString();

      await client.query(
        'UPDATE candidates SET analysis_snapshot = $1, updated_at = $2 WHERE id = $3',
        [JSON.stringify(snapshot), now, candidateId],
      );

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Attach duplicate case to candidate.
   */
  async attachDuplicateCase(candidateId: string, duplicateCase: DuplicateCase): Promise<void> {
    await this.ensureSchema();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the row for update
      const { rows } = await client.query<{ id: string }>(
        'SELECT id FROM candidates WHERE id = $1 FOR UPDATE',
        [candidateId],
      );

      if (rows.length === 0) {
        throw new Error(`Candidate ${candidateId} not found`);
      }

      const now = new Date().toISOString();

      await client.query(
        'UPDATE candidates SET duplicate_case = $1, updated_at = $2 WHERE id = $3',
        [JSON.stringify(duplicateCase), now, candidateId],
      );

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Attach manual result from reviewer.
   */
  async attachManualResult(
    candidateId: string,
    result: ManualResultSubmission,
    reviewedBy: string,
  ): Promise<void> {
    await this.ensureSchema();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the row for update
      const { rows } = await client.query<{ id: string }>(
        'SELECT id FROM candidates WHERE id = $1 FOR UPDATE',
        [candidateId],
      );

      if (rows.length === 0) {
        throw new Error(`Candidate ${candidateId} not found`);
      }

      const now = new Date().toISOString();
      const manualResult = createManualResultRecord(result, reviewedBy);

      await client.query(
        'UPDATE candidates SET manual_result = $1, updated_at = $2 WHERE id = $3',
        [JSON.stringify(manualResult), now, candidateId],
      );

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * List all candidates with a specific status.
   */
  async listByStatus(status: CandidateStatus): Promise<CandidateSubmission[]> {
    await this.ensureSchema();

    const result = await this.db.select().from(candidates).where(eq(candidates.status, status));

    return result.map((row) => rowToCandidateSubmission(row as DrizzleCandidateRow));
  }

  /**
   * Mark a candidate as resolved.
   */
  async markResolved(candidateId: string, _resolvedBy: string): Promise<void> {
    await this.ensureSchema();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the row for update
      const { rows } = await client.query<{ id: string }>(
        'SELECT id FROM candidates WHERE id = $1 FOR UPDATE',
        [candidateId],
      );

      if (rows.length === 0) {
        throw new Error(`Candidate ${candidateId} not found`);
      }

      const now = new Date().toISOString();

      await client.query(
        'UPDATE candidates SET status = $1, completed_at = $2, updated_at = $2 WHERE id = $3',
        ['resolved', now, candidateId],
      );

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Database row shape returned by Drizzle ORM.
 * Drizzle maps snake_case column names to camelCase property names.
 */
interface DrizzleCandidateRow {
  id: string;
  sourceType: string;
  submittedBy: string;
  teamId: string | null;
  status: string;
  originalPayload: CandidateSubmission['originalPayload'];
  analysisSnapshot: AnalysisSnapshot | null;
  duplicateCase: DuplicateCase | null;
  receivedAt: Date;
  queuedAt: Date | null;
  analyzingAt: Date | null;
  completedAt: Date | null;
  lastError: string | null;
  retryCount: number;
  manualResult: CandidateSubmission['manualResult'];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Map a Drizzle row to CandidateSubmission shape.
 * Handles Date to ISO string conversion.
 */
function rowToCandidateSubmission(row: DrizzleCandidateRow): CandidateSubmission {
  return {
    id: row.id,
    sourceType: row.sourceType as 'trap' | 'skill',
    submittedBy: row.submittedBy,
    teamId: row.teamId,
    status: row.status as CandidateStatus,
    originalPayload: row.originalPayload,
    analysisSnapshot: row.analysisSnapshot,
    duplicateCase: row.duplicateCase,
    receivedAt: row.receivedAt.toISOString(),
    queuedAt: row.queuedAt?.toISOString() ?? null,
    analyzingAt: row.analyzingAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    lastError: row.lastError,
    retryCount: row.retryCount,
    manualResult: row.manualResult,
  };
}
