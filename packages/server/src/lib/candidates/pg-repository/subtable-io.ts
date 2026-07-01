/**
 * Structured sub-table read/write helpers for the candidate PG repository.
 *
 * These functions manage the candidate_analyses, candidate_duplicate_cases,
 * candidate_duplicate_matches, and candidate_manual_results sub-tables.
 * They are extracted as standalone functions that receive db/pool/client
 * as explicit parameters.
 */

import type { AnalysisSnapshot, CandidateSubmission, DuplicateCase } from '@trapmap/contracts';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';

import {
  candidateAnalyses,
  candidateDuplicateCases,
  candidateDuplicateMatches,
  candidateManualResults,
} from '@trapmap/server/lib/persistence/schema.js';

/** Local alias for the Drizzle instance type returned by drizzle(). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type DrizzleDb = ReturnType<typeof drizzle>;

// =============================================================================
// Write helpers (Drizzle ORM)
// =============================================================================

export async function writeAnalysisToSubTable(
  db: DrizzleDb,
  candidateId: string,
  snapshot: AnalysisSnapshot,
): Promise<void> {
  await db
    .insert(candidateAnalyses)
    .values({
      candidateId,
      normalizedAt: new Date(snapshot.normalizedAt),
      fingerprint: snapshot.fingerprint,
      keywords: snapshot.keywords,
      tokens: snapshot.tokens,
      duplicateTrace: snapshot.duplicateTrace ?? null,
    })
    .onConflictDoUpdate({
      target: candidateAnalyses.candidateId,
      set: {
        normalizedAt: new Date(snapshot.normalizedAt),
        fingerprint: snapshot.fingerprint,
        keywords: snapshot.keywords,
        tokens: snapshot.tokens,
        duplicateTrace: snapshot.duplicateTrace ?? null,
      },
    });
}

export async function writeDuplicateCaseToSubTables(
  db: DrizzleDb,
  pool: Pool,
  duplicateCase: DuplicateCase,
): Promise<void> {
  await db
    .insert(candidateDuplicateCases)
    .values({
      id: duplicateCase.id,
      candidateId: duplicateCase.candidateId,
      detectedAt: new Date(duplicateCase.detectedAt),
      detectionVersion: duplicateCase.detectionVersion,
      highestSimilarity: duplicateCase.highestSimilarity,
      hasExactDuplicate: duplicateCase.hasExactDuplicate ? 1 : 0,
      duplicateType: duplicateCase.duplicateType,
    })
    .onConflictDoUpdate({
      target: candidateDuplicateCases.id,
      set: {
        candidateId: duplicateCase.candidateId,
        detectedAt: new Date(duplicateCase.detectedAt),
        detectionVersion: duplicateCase.detectionVersion,
        highestSimilarity: duplicateCase.highestSimilarity,
        hasExactDuplicate: duplicateCase.hasExactDuplicate ? 1 : 0,
        duplicateType: duplicateCase.duplicateType,
      },
    });

  // Delete and re-insert matches
  const client = await pool.connect();
  try {
    await client.query('DELETE FROM candidate_duplicate_matches WHERE duplicate_case_id = $1', [
      duplicateCase.id,
    ]);
    for (const match of duplicateCase.matches) {
      await client.query(
        `INSERT INTO candidate_duplicate_matches (duplicate_case_id, entity_type, entity_id, entity_title, similarity_score, match_type, shared_keywords, shared_tokens, text_overlap_percent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          duplicateCase.id,
          match.entityType,
          match.entityId,
          match.entityTitle,
          match.similarityScore,
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

export async function writeDuplicateCaseToSubTablesTx(
  client: PoolClient,
  duplicateCase: DuplicateCase,
): Promise<void> {
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
      duplicateCase.candidateId,
      duplicateCase.detectedAt,
      duplicateCase.detectionVersion,
      duplicateCase.highestSimilarity,
      duplicateCase.hasExactDuplicate ? 1 : 0,
      duplicateCase.duplicateType,
    ],
  );

  await client.query('DELETE FROM candidate_duplicate_matches WHERE duplicate_case_id = $1', [
    duplicateCase.id,
  ]);

  for (const match of duplicateCase.matches) {
    await client.query(
      `INSERT INTO candidate_duplicate_matches (duplicate_case_id, entity_type, entity_id, entity_title, similarity_score, match_type, shared_keywords, shared_tokens, text_overlap_percent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        duplicateCase.id,
        match.entityType,
        match.entityId,
        match.entityTitle,
        match.similarityScore,
        match.matchType,
        JSON.stringify(match.overlapDetails.sharedKeywords),
        JSON.stringify(match.overlapDetails.sharedTokens),
        match.overlapDetails.textOverlapPercent,
      ],
    );
  }
}

export async function writeManualResultToSubTable(
  db: DrizzleDb,
  candidateId: string,
  manualResult: CandidateSubmission['manualResult'],
): Promise<void> {
  if (!manualResult) return;

  await db
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

// =============================================================================
// Read helpers (Drizzle ORM)
// =============================================================================

export async function readAnalysisFromSubTable(
  db: DrizzleDb,
  candidateId: string,
): Promise<AnalysisSnapshot | null> {
  const result = await db
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
    duplicateTrace:
      (row.duplicateTrace as AnalysisSnapshot['duplicateTrace'] | null | undefined) ?? undefined,
  };
}

export async function readDuplicateCaseFromSubTables(
  db: DrizzleDb,
  candidateId: string,
): Promise<DuplicateCase | null> {
  const caseResult = await db
    .select()
    .from(candidateDuplicateCases)
    .where(eq(candidateDuplicateCases.candidateId, candidateId))
    .limit(1);

  if (caseResult.length === 0) return null;
  const caseRow = caseResult[0]!;

  const matchRows = await db
    .select()
    .from(candidateDuplicateMatches)
    .where(eq(candidateDuplicateMatches.duplicateCaseId, caseRow.id));

  return {
    id: caseRow.id,
    candidateId: caseRow.candidateId,
    detectedAt: caseRow.detectedAt.toISOString(),
    detectionVersion: caseRow.detectionVersion,
    highestSimilarity: caseRow.highestSimilarity,
    hasExactDuplicate: caseRow.hasExactDuplicate === 1,
    duplicateType: caseRow.duplicateType as 'exact' | 'semantic' | 'none',
    matches: matchRows.map((m) => ({
      entityType: m.entityType as 'trap' | 'skill',
      entityId: m.entityId,
      entityTitle: m.entityTitle,
      similarityScore: m.similarityScore,
      matchType: m.matchType as 'exact' | 'high-overlap' | 'semantic-similar',
      overlapDetails: {
        sharedKeywords: m.sharedKeywords as string[],
        sharedTokens: m.sharedTokens as string[],
        textOverlapPercent: m.textOverlapPercent,
      },
    })),
  };
}

export async function readManualResultFromSubTable(
  db: DrizzleDb,
  candidateId: string,
): Promise<CandidateSubmission['manualResult'] | null> {
  const result = await db
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
