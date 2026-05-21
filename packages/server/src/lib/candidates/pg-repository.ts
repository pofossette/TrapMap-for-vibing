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
import type { Pool } from 'pg';

import {
  candidates,
  candidateAnalyses,
  candidateDuplicateCases,
  candidateDuplicateMatches,
  candidateManualResults,
} from '../persistence/schema.js';
import type { CandidateRepository } from './repository.js';
import { createManualResultRecord } from './repository.js';

/**
 * PostgreSQL-backed repository for candidate CRUD operations.
 * Implements row-level locking for concurrent-safe updates.
 */
export class PgCandidateRepository implements CandidateRepository {
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
      await this.writeAnalysisToSubTable(candidate.id, candidate.analysisSnapshot);
    }
    if (candidate.duplicateCase) {
      await this.writeDuplicateCaseToSubTables(candidate.duplicateCase);
    }
    if (candidate.manualResult) {
      await this.writeManualResultToSubTable(candidate.id, candidate.manualResult);
    }
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
      this.readAnalysisFromSubTable(candidateId),
      this.readDuplicateCaseFromSubTables(candidateId),
      this.readManualResultFromSubTable(candidateId),
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
        `INSERT INTO candidate_analyses (candidate_id, normalized_at, fingerprint, keywords, tokens)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (candidate_id) DO UPDATE SET
           normalized_at = EXCLUDED.normalized_at,
           fingerprint = EXCLUDED.fingerprint,
           keywords = EXCLUDED.keywords,
           tokens = EXCLUDED.tokens`,
        [
          candidateId,
          snapshot.normalizedAt,
          snapshot.fingerprint,
          JSON.stringify(snapshot.keywords),
          JSON.stringify(snapshot.tokens),
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
        'UPDATE candidates SET duplicate_case = $1, updated_at = $2 WHERE id = $3',
        [JSON.stringify(duplicateCase), now, candidateId],
      );

      // Write to structured sub-tables
      await client.query(
        `INSERT INTO candidate_duplicate_cases (id, candidate_id, detected_at, detection_version, highest_similarity, has_exact_duplicate, duplicate_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           candidate_id = EXCLUDED.candidate_id,
           detected_at = EXCLUDED.detected_at,
           detection_version = EXCLUDED.detection_version,
           highest_similarity = EXCLUDED.highest_similarity,
           has_exact_duplicate = EXCLUDED.has_exact_duplicate,
           duplicate_type = EXCLUDED.duplicate_type`,
        [
          duplicateCase.id,
          candidateId,
          duplicateCase.detectedAt,
          duplicateCase.detectionVersion,
          Math.round(duplicateCase.highestSimilarity * 100),
          duplicateCase.hasExactDuplicate ? 1 : 0,
          duplicateCase.duplicateType,
        ],
      );

      // Delete existing matches and re-insert
      await client.query(
        'DELETE FROM candidate_duplicate_matches WHERE duplicate_case_id = $1',
        [duplicateCase.id],
      );

      for (const match of duplicateCase.matches) {
        await client.query(
          `INSERT INTO candidate_duplicate_matches (duplicate_case_id, entity_type, entity_id, entity_title, similarity_score, match_type, shared_keywords, shared_tokens, text_overlap_percent)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            duplicateCase.id,
            match.entityType,
            match.entityId,
            match.entityTitle,
            Math.round(match.similarityScore * 100),
            match.matchType,
            JSON.stringify(match.overlapDetails.sharedKeywords),
            JSON.stringify(match.overlapDetails.sharedTokens),
            match.overlapDetails.textOverlapPercent,
          ],
        );
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
  // Private helpers for structured sub-table I/O
  // =============================================================================

  private async writeAnalysisToSubTable(
    candidateId: string,
    snapshot: AnalysisSnapshot,
  ): Promise<void> {
    await this.db
      .insert(candidateAnalyses)
      .values({
        candidateId,
        normalizedAt: new Date(snapshot.normalizedAt),
        fingerprint: snapshot.fingerprint,
        keywords: snapshot.keywords,
        tokens: snapshot.tokens,
      })
      .onConflictDoUpdate({
        target: candidateAnalyses.candidateId,
        set: {
          normalizedAt: new Date(snapshot.normalizedAt),
          fingerprint: snapshot.fingerprint,
          keywords: snapshot.keywords,
          tokens: snapshot.tokens,
        },
      });
  }

  private async writeDuplicateCaseToSubTables(duplicateCase: DuplicateCase): Promise<void> {
    await this.db
      .insert(candidateDuplicateCases)
      .values({
        id: duplicateCase.id,
        candidateId: duplicateCase.candidateId,
        detectedAt: new Date(duplicateCase.detectedAt),
        detectionVersion: duplicateCase.detectionVersion,
        highestSimilarity: Math.round(duplicateCase.highestSimilarity * 100),
        hasExactDuplicate: duplicateCase.hasExactDuplicate ? 1 : 0,
        duplicateType: duplicateCase.duplicateType,
      })
      .onConflictDoUpdate({
        target: candidateDuplicateCases.id,
        set: {
          candidateId: duplicateCase.candidateId,
          detectedAt: new Date(duplicateCase.detectedAt),
          detectionVersion: duplicateCase.detectionVersion,
          highestSimilarity: Math.round(duplicateCase.highestSimilarity * 100),
          hasExactDuplicate: duplicateCase.hasExactDuplicate ? 1 : 0,
          duplicateType: duplicateCase.duplicateType,
        },
      });

    // Delete and re-insert matches
    const client = await this.pool.connect();
    try {
      await client.query(
        'DELETE FROM candidate_duplicate_matches WHERE duplicate_case_id = $1',
        [duplicateCase.id],
      );
      for (const match of duplicateCase.matches) {
        await client.query(
          `INSERT INTO candidate_duplicate_matches (duplicate_case_id, entity_type, entity_id, entity_title, similarity_score, match_type, shared_keywords, shared_tokens, text_overlap_percent)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            duplicateCase.id,
            match.entityType,
            match.entityId,
            match.entityTitle,
            Math.round(match.similarityScore * 100),
            match.matchType,
            JSON.stringify(match.overlapDetails.sharedKeywords),
            JSON.stringify(match.overlapDetails.sharedTokens),
            match.overlapDetails.textOverlapPercent,
          ],
        );
      }
    } finally {
      client.release();
    }
  }

  private async writeManualResultToSubTable(
    candidateId: string,
    manualResult: CandidateSubmission['manualResult'],
  ): Promise<void> {
    if (!manualResult) return;

    await this.db
      .insert(candidateManualResults)
      .values({
        candidateId,
        decision: manualResult.decision,
        notes: manualResult.notes,
        mergedWithEntityType: manualResult.mergedWith?.entityType ?? null,
        mergedWithEntityId: manualResult.mergedWith?.entityId ?? null,
        mergedWithEntityTitle: manualResult.mergedWith?.entityTitle ?? null,
        submittedAt: new Date(manualResult.submittedAt),
        submittedByUserId: manualResult.submittedBy,
      })
      .onConflictDoUpdate({
        target: candidateManualResults.candidateId,
        set: {
          decision: manualResult.decision,
          notes: manualResult.notes,
          mergedWithEntityType: manualResult.mergedWith?.entityType ?? null,
          mergedWithEntityId: manualResult.mergedWith?.entityId ?? null,
          mergedWithEntityTitle: manualResult.mergedWith?.entityTitle ?? null,
          submittedAt: new Date(manualResult.submittedAt),
          submittedByUserId: manualResult.submittedBy,
        },
      });
  }

  private async readAnalysisFromSubTable(
    candidateId: string,
  ): Promise<AnalysisSnapshot | null> {
    const result = await this.db
      .select()
      .from(candidateAnalyses)
      .where(eq(candidateAnalyses.candidateId, candidateId))
      .limit(1);

    if (result.length === 0) return null;
    const row = result[0]!;
    return {
      normalizedAt: row.normalizedAt.toISOString(),
      fingerprint: row.fingerprint,
      keywords: row.keywords as string[],
      tokens: row.tokens as string[],
    };
  }

  private async readDuplicateCaseFromSubTables(
    candidateId: string,
  ): Promise<DuplicateCase | null> {
    const caseResult = await this.db
      .select()
      .from(candidateDuplicateCases)
      .where(eq(candidateDuplicateCases.candidateId, candidateId))
      .limit(1);

    if (caseResult.length === 0) return null;
    const caseRow = caseResult[0]!;

    const matchRows = await this.db
      .select()
      .from(candidateDuplicateMatches)
      .where(eq(candidateDuplicateMatches.duplicateCaseId, caseRow.id));

    return {
      id: caseRow.id,
      candidateId: caseRow.candidateId,
      detectedAt: caseRow.detectedAt.toISOString(),
      detectionVersion: caseRow.detectionVersion,
      highestSimilarity: caseRow.highestSimilarity / 100,
      hasExactDuplicate: caseRow.hasExactDuplicate === 1,
      duplicateType: caseRow.duplicateType as 'exact' | 'semantic' | 'none',
      matches: matchRows.map((m) => ({
        entityType: m.entityType as 'trap' | 'skill',
        entityId: m.entityId,
        entityTitle: m.entityTitle,
        similarityScore: m.similarityScore / 100,
        matchType: m.matchType as 'exact' | 'high-overlap' | 'semantic-similar',
        overlapDetails: {
          sharedKeywords: m.sharedKeywords as string[],
          sharedTokens: m.sharedTokens as string[],
          textOverlapPercent: m.textOverlapPercent,
        },
      })),
    };
  }

  private async readManualResultFromSubTable(
    candidateId: string,
  ): Promise<CandidateSubmission['manualResult'] | null> {
    const result = await this.db
      .select()
      .from(candidateManualResults)
      .where(eq(candidateManualResults.candidateId, candidateId))
      .limit(1);

    if (result.length === 0) return null;
    const row = result[0]!;

    return {
      decision: row.decision as 'independent' | 'merged',
      notes: row.notes,
      mergedWith: row.mergedWithEntityType
        ? {
            entityType: row.mergedWithEntityType as 'trap' | 'skill',
            entityId: row.mergedWithEntityId!,
            entityTitle: row.mergedWithEntityTitle ?? undefined,
          }
        : undefined,
      submittedAt: row.submittedAt.toISOString(),
      submittedBy: row.submittedByUserId,
    };
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
  submittedByUserId: string;
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
    submittedBy: row.submittedByUserId,
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
