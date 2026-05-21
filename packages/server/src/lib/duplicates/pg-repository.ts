/**
 * PostgreSQL-backed implementation of DuplicateRepository.
 *
 * Uses structured tables (candidate_duplicate_cases, candidate_duplicate_matches)
 * instead of JSONB columns or in-memory arrays.
 *
 * Round 5: Structural Refactoring
 */

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import { candidateDuplicateCases, candidateDuplicateMatches } from '../persistence/schema.js';
import type { DuplicateCaseRecord } from '../store.js';
import type { DuplicateRepository } from './repository.js';

/**
 * PostgreSQL-backed repository for duplicate case CRUD operations.
 */
export class PgDuplicateRepository implements DuplicateRepository {
  private db: ReturnType<typeof drizzle>;

  constructor(private readonly pool: Pool) {
    this.db = drizzle(pool, {
      schema: { candidateDuplicateCases, candidateDuplicateMatches },
    });
  }

  async insert(duplicateCase: DuplicateCaseRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO candidate_duplicate_cases (id, candidate_id, detected_at, detection_version, highest_similarity, has_exact_duplicate, duplicate_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [
          duplicateCase.id,
          duplicateCase.candidateId,
          duplicateCase.detectedAt,
          duplicateCase.detectionVersion,
          Math.round(duplicateCase.highestSimilarity * 100),
          duplicateCase.hasExactDuplicate ? 1 : 0,
          duplicateCase.duplicateType,
        ],
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

  async getById(caseId: string): Promise<DuplicateCaseRecord | null> {
    const caseResult = await this.db
      .select()
      .from(candidateDuplicateCases)
      .where(eq(candidateDuplicateCases.id, caseId))
      .limit(1);

    if (caseResult.length === 0) return null;

    const matchRows = await this.db
      .select()
      .from(candidateDuplicateMatches)
      .where(eq(candidateDuplicateMatches.duplicateCaseId, caseId));

    return rowToDuplicateCase(caseResult[0]!, matchRows);
  }

  async listByCandidate(candidateId: string): Promise<DuplicateCaseRecord[]> {
    const cases = await this.db
      .select()
      .from(candidateDuplicateCases)
      .where(eq(candidateDuplicateCases.candidateId, candidateId));

    const results: DuplicateCaseRecord[] = [];
    for (const c of cases) {
      const matchRows = await this.db
        .select()
        .from(candidateDuplicateMatches)
        .where(eq(candidateDuplicateMatches.duplicateCaseId, c.id));
      results.push(rowToDuplicateCase(c, matchRows));
    }
    return results;
  }

  async listAll(): Promise<DuplicateCaseRecord[]> {
    const cases = await this.db.select().from(candidateDuplicateCases);

    const results: DuplicateCaseRecord[] = [];
    for (const c of cases) {
      const matchRows = await this.db
        .select()
        .from(candidateDuplicateMatches)
        .where(eq(candidateDuplicateMatches.duplicateCaseId, c.id));
      results.push(rowToDuplicateCase(c, matchRows));
    }
    return results;
  }

  async update(caseId: string, updates: Partial<DuplicateCaseRecord>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const setClauses: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (updates.candidateId !== undefined) {
        setClauses.push(`candidate_id = $${paramIdx++}`);
        params.push(updates.candidateId);
      }
      if (updates.detectedAt !== undefined) {
        setClauses.push(`detected_at = $${paramIdx++}`);
        params.push(updates.detectedAt);
      }
      if (updates.detectionVersion !== undefined) {
        setClauses.push(`detection_version = $${paramIdx++}`);
        params.push(updates.detectionVersion);
      }
      if (updates.highestSimilarity !== undefined) {
        setClauses.push(`highest_similarity = $${paramIdx++}`);
        params.push(Math.round(updates.highestSimilarity * 100));
      }
      if (updates.hasExactDuplicate !== undefined) {
        setClauses.push(`has_exact_duplicate = $${paramIdx++}`);
        params.push(updates.hasExactDuplicate ? 1 : 0);
      }
      if (updates.duplicateType !== undefined) {
        setClauses.push(`duplicate_type = $${paramIdx++}`);
        params.push(updates.duplicateType);
      }

      if (setClauses.length > 0) {
        params.push(caseId);
        await client.query(
          `UPDATE candidate_duplicate_cases SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
          params,
        );
      }

      if (updates.matches !== undefined) {
        await client.query('DELETE FROM candidate_duplicate_matches WHERE duplicate_case_id = $1', [
          caseId,
        ]);
        for (const match of updates.matches) {
          await client.query(
            `INSERT INTO candidate_duplicate_matches (duplicate_case_id, entity_type, entity_id, entity_title, similarity_score, match_type, shared_keywords, shared_tokens, text_overlap_percent)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              caseId,
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
      }

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

interface DuplicateCaseRow {
  id: string;
  candidateId: string;
  detectedAt: Date;
  detectionVersion: string;
  highestSimilarity: number;
  hasExactDuplicate: number;
  duplicateType: string;
}

interface DuplicateMatchRow {
  duplicateCaseId: string;
  entityType: string;
  entityId: string;
  entityTitle: string;
  similarityScore: number;
  matchType: string;
  sharedKeywords: string[];
  sharedTokens: string[];
  textOverlapPercent: number;
}

function rowToDuplicateCase(
  caseRow: DuplicateCaseRow,
  matchRows: DuplicateMatchRow[],
): DuplicateCaseRecord {
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
        sharedKeywords: m.sharedKeywords,
        sharedTokens: m.sharedTokens,
        textOverlapPercent: m.textOverlapPercent,
      },
    })),
  };
}
