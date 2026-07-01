/**
 * PostgreSQL-backed implementation of CandidateRepository.
 *
 * Uses row-level SELECT FOR UPDATE locking for safe concurrent processing.
 * Each candidate is stored as a separate row, enabling concurrent operations
 * on different candidates without blocking the entire store_snapshot.
 *
 * Round 5: Writes to structured sub-tables (candidate_analyses,
 * candidate_duplicate_cases, candidate_duplicate_matches,
 * candidate_manual_results) alongside JSONB columns for read-optimization.
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
import type { Pool, PoolClient } from 'pg';

import { candidateAnalyses, candidates } from '@trapmap/server/lib/persistence/schema.js';
import type { TransactionalCandidateRepository } from '@trapmap/server/lib/candidates/repository.js';
import { createManualResultRecord } from '@trapmap/server/lib/candidates/repository.js';

import type { DrizzleCandidateRow } from './row-types.js';
import { rowToCandidateSubmission } from './row-mappers.js';
import {
  readAnalysisFromSubTable,
  readDuplicateCaseFromSubTables,
  readManualResultFromSubTable,
  writeAnalysisToSubTable,
  writeDuplicateCaseToSubTables,
  writeDuplicateCaseToSubTablesTx,
  writeManualResultToSubTable,
} from './subtable-io.js';

/**
 * PostgreSQL-backed repository for candidate CRUD operations.
 * Implements row-level locking for concurrent-safe updates.
 */
export class PgCandidateRepository implements TransactionalCandidateRepository {
  private db: ReturnType<typeof drizzle>;

  constructor(private readonly pool: Pool) {
    this.db = drizzle(pool, { schema: { candidates } });
  }

  /**
   * Insert a new candidate submission.
   */
  async insert(candidate: CandidateSubmission): Promise<void> {
    await this.db.insert(candidates).values({
      id: candidate.id,
      sourceType: candidate.sourceType,
      submittedByUserId: candidate.submittedBy,
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

    // Write to structured sub-tables if data is present
    if (candidate.analysisSnapshot) {
      await writeAnalysisToSubTable(this.db, candidate.id, candidate.analysisSnapshot);
    }
    if (candidate.duplicateCase) {
      await writeDuplicateCaseToSubTables(this.db, this.pool, candidate.duplicateCase);
    }
    if (candidate.manualResult) {
      await writeManualResultToSubTable(this.db, candidate.id, candidate.manualResult);
    }
  }

  async insertTx(client: PoolClient, candidate: CandidateSubmission): Promise<void> {
    await client.query(
      `INSERT INTO candidates (
        id, source_type, submitted_by_user_id, team_id, status, original_payload,
        analysis_snapshot, duplicate_case, received_at, queued_at, analyzing_at,
        completed_at, last_error, retry_count, manual_result
      ) VALUES (
        $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13, $14, $15::jsonb
      )`,
      [
        candidate.id,
        candidate.sourceType,
        candidate.submittedBy,
        candidate.teamId,
        candidate.status,
        JSON.stringify(candidate.originalPayload),
        candidate.analysisSnapshot ? JSON.stringify(candidate.analysisSnapshot) : null,
        candidate.duplicateCase ? JSON.stringify(candidate.duplicateCase) : null,
        new Date(candidate.receivedAt),
        candidate.queuedAt ? new Date(candidate.queuedAt) : null,
        candidate.analyzingAt ? new Date(candidate.analyzingAt) : null,
        candidate.completedAt ? new Date(candidate.completedAt) : null,
        candidate.lastError,
        candidate.retryCount,
        candidate.manualResult ? JSON.stringify(candidate.manualResult) : null,
      ],
    );
  }

  /**
   * Get a candidate by ID.
   * Returns null if not found.
   * Reads structured data from sub-tables, falling back to JSONB columns.
   */
  async getById(candidateId: string): Promise<CandidateSubmission | null> {
    const result = await this.db
      .select()
      .from(candidates)
      .where(eq(candidates.id, candidateId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const row = result[0]! as DrizzleCandidateRow;
    const submission = rowToCandidateSubmission(row);

    // Enrich with structured sub-table data
    const [analysis, duplicateCase, manualResult] = await Promise.all([
      readAnalysisFromSubTable(this.db, candidateId),
      readDuplicateCaseFromSubTables(this.db, candidateId),
      readManualResultFromSubTable(this.db, candidateId),
    ]);

    if (analysis) submission.analysisSnapshot = analysis;
    if (duplicateCase) submission.duplicateCase = duplicateCase;
    if (manualResult) submission.manualResult = manualResult;

    return submission;
  }

  /**
   * Update candidate status with proper timestamp handling.
   * Uses SELECT FOR UPDATE for row-level locking.
   */
  async updateStatus(candidateId: string, status: CandidateStatus, error?: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.updateStatusTx(client, candidateId, status, error);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async updateStatusTx(
    client: PoolClient,
    candidateId: string,
    status: CandidateStatus,
    error?: string,
  ): Promise<void> {
    const { rows } = await client.query<{ id: string }>(
      'SELECT id FROM candidates WHERE id = $1 FOR UPDATE',
      [candidateId],
    );

    if (rows.length === 0) {
      throw new Error(`Candidate ${candidateId} not found`);
    }

    const now = new Date().toISOString();
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
  }

  /**
   * Attach analysis snapshot to candidate.
   * Writes to both structured sub-table and JSONB column.
   */
  async attachAnalysis(candidateId: string, snapshot: AnalysisSnapshot): Promise<void> {
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

      // Write to JSONB column (read-optimization cache)
      await client.query(
        'UPDATE candidates SET analysis_snapshot = $1, updated_at = $2 WHERE id = $3',
        [JSON.stringify(snapshot), now, candidateId],
      );

      // Write to structured sub-table
      await client.query(
        `INSERT INTO candidate_analyses (
           candidate_id,
           normalized_at,
           fingerprint,
           keywords,
           tokens,
           duplicate_trace
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (candidate_id) DO UPDATE SET
           normalized_at = EXCLUDED.normalized_at,
           fingerprint = EXCLUDED.fingerprint,
           keywords = EXCLUDED.keywords,
           tokens = EXCLUDED.tokens,
           duplicate_trace = EXCLUDED.duplicate_trace`,
        [
          candidateId,
          snapshot.normalizedAt,
          snapshot.fingerprint,
          JSON.stringify(snapshot.keywords),
          JSON.stringify(snapshot.tokens),
          snapshot.duplicateTrace ? JSON.stringify(snapshot.duplicateTrace) : null,
        ],
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
   * Writes to both structured sub-tables and JSONB column.
   */
  async attachDuplicateCase(candidateId: string, duplicateCase: DuplicateCase): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.attachDuplicateCaseTx(client, candidateId, duplicateCase);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async attachDuplicateCaseTx(
    client: PoolClient,
    candidateId: string,
    duplicateCase: DuplicateCase,
  ): Promise<void> {
    const { rows } = await client.query<{ id: string }>(
      'SELECT id FROM candidates WHERE id = $1 FOR UPDATE',
      [candidateId],
    );

    if (rows.length === 0) {
      throw new Error(`Candidate ${candidateId} not found`);
    }

    const now = new Date().toISOString();
    await client.query('UPDATE candidates SET duplicate_case = $1, updated_at = $2 WHERE id = $3', [
      JSON.stringify(duplicateCase),
      now,
      candidateId,
    ]);
    await writeDuplicateCaseToSubTablesTx(client, duplicateCase);
  }

  /**
   * Attach manual result from reviewer.
   * Writes to both structured sub-table and JSONB column.
   */
  async attachManualResult(
    candidateId: string,
    result: ManualResultSubmission,
    reviewedBy: string,
  ): Promise<void> {
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

      // Write to JSONB column (read-optimization cache)
      await client.query(
        'UPDATE candidates SET manual_result = $1, updated_at = $2 WHERE id = $3',
        [JSON.stringify(manualResult), now, candidateId],
      );

      // Write to structured sub-table
      await client.query(
        `INSERT INTO candidate_manual_results (candidate_id, decision, notes, merged_with_entity_type, merged_with_entity_id, merged_with_entity_title, submitted_at, submitted_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (candidate_id) DO UPDATE SET
           decision = EXCLUDED.decision,
           notes = EXCLUDED.notes,
           merged_with_entity_type = EXCLUDED.merged_with_entity_type,
           merged_with_entity_id = EXCLUDED.merged_with_entity_id,
           merged_with_entity_title = EXCLUDED.merged_with_entity_title,
           submitted_at = EXCLUDED.submitted_at,
           submitted_by_user_id = EXCLUDED.submitted_by_user_id`,
        [
          candidateId,
          manualResult.decision,
          manualResult.notes,
          manualResult.mergedWith?.entityType ?? null,
          manualResult.mergedWith?.entityId ?? null,
          manualResult.mergedWith?.entityTitle ?? null,
          manualResult.submittedAt,
          manualResult.submittedBy,
        ],
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
    const result = await this.db.select().from(candidates).where(eq(candidates.status, status));

    return result.map((row) => rowToCandidateSubmission(row as DrizzleCandidateRow));
  }

  /**
   * Mark a candidate as resolved.
   */
  async markResolved(candidateId: string, _resolvedBy: string): Promise<void> {
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

  // =============================================================================
  // Public query helpers
  // =============================================================================

  /**
   * Find a candidate ID by exact fingerprint match using the indexed
   * candidate_analyses table.
   */
  async findByFingerprint(fingerprint: string): Promise<string | null> {
    const result = await this.db
      .select({ candidateId: candidateAnalyses.candidateId })
      .from(candidateAnalyses)
      .where(eq(candidateAnalyses.fingerprint, fingerprint))
      .limit(1);

    return result[0]?.candidateId ?? null;
  }

  async findByFingerprintTx(client: PoolClient, fingerprint: string): Promise<string | null> {
    const result = await client.query<{ candidate_id: string }>(
      'SELECT candidate_id FROM candidate_analyses WHERE fingerprint = $1 LIMIT 1',
      [fingerprint],
    );
    return result.rows[0]?.candidate_id ?? null;
  }
}
