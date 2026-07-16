import type { CandidateRepositoryPort } from '@trapmap/backend-core';
import type {
  AnalysisSnapshot,
  CandidateStatus,
  CandidateSubmission,
  DuplicateCase,
  EntityLineage,
  ManualResultSubmission,
  ResolutionOutcome,
} from '@trapmap/contracts';
import type { Pool, PoolClient } from 'pg';

type Queryable = Pick<Pool, 'query'>;
type TransactionPool = Pick<Pool, 'connect'>;
type TransactionClient = Pick<PoolClient, 'query' | 'release'>;
type Row = Record<string, unknown>;

export interface CandidateDuplicateCaseRepository {
  upsert(duplicateCase: DuplicateCase): Promise<void>;
  getById(duplicateCaseId: string): Promise<DuplicateCase | null>;
  listByCandidate(candidateId: string): Promise<DuplicateCase[]>;
}

export interface CandidateResolutionOutcomeRepository {
  upsert(outcome: ResolutionOutcome): Promise<void>;
  getByCandidateId(candidateId: string): Promise<ResolutionOutcome | null>;
}

export interface CandidateLineageRepository {
  insert(lineage: EntityLineage): Promise<void>;
  getById(lineageId: string): Promise<EntityLineage | null>;
  listByCandidate(candidateId: string): Promise<EntityLineage[]>;
}

export interface CandidateIngestionPgOwnerBundle {
  candidateRepo: CandidateRepositoryPort;
  duplicateCases: CandidateDuplicateCaseRepository;
  resolutionOutcomes: CandidateResolutionOutcomeRepository;
  lineage: CandidateLineageRepository;
}

async function withTransaction<TResult>(
  pool: TransactionPool,
  work: (client: TransactionClient) => Promise<TResult>,
): Promise<TResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function nullableIso(value: unknown): string | null {
  return value ? toIso(value) : null;
}

function rowToCandidate(row: Row): CandidateSubmission {
  return {
    id: String(row.id),
    sourceType: row.source_type as CandidateSubmission['sourceType'],
    submittedBy: String(row.submitted_by_user_id),
    teamId: (row.team_id as string | null) ?? null,
    status: row.status as CandidateStatus,
    originalPayload: row.original_payload as CandidateSubmission['originalPayload'],
    analysisSnapshot: (row.analysis_snapshot as AnalysisSnapshot | null) ?? null,
    duplicateCase: (row.duplicate_case as DuplicateCase | null) ?? null,
    receivedAt: toIso(row.received_at),
    queuedAt: nullableIso(row.queued_at),
    analyzingAt: nullableIso(row.analyzing_at),
    completedAt: nullableIso(row.completed_at),
    lastError: (row.last_error as string | null) ?? null,
    retryCount: Number(row.retry_count ?? 0),
    manualResult: (row.manual_result as CandidateSubmission['manualResult']) ?? null,
  };
}

async function updateCandidateStatus(
  client: Pick<PoolClient, 'query'>,
  candidateId: string,
  status: CandidateStatus,
  error?: string,
): Promise<void> {
  const existing = await lockCandidate(client, candidateId);
  const errorMessage = error ?? 'Unknown error';
  if (existing.status === status && (status !== 'error' || existing.last_error === errorMessage))
    return;

  const now = new Date().toISOString();
  const statusUpdates: Partial<Record<CandidateStatus, [string, unknown[]]>> = {
    queued: [
      'UPDATE candidates SET status = $1, queued_at = $2, updated_at = $2 WHERE id = $3',
      [status, now, candidateId],
    ],
    analyzing: [
      'UPDATE candidates SET status = $1, analyzing_at = $2, updated_at = $2 WHERE id = $3',
      [status, now, candidateId],
    ],
    error: [
      'UPDATE candidates SET status = $1, last_error = $2, completed_at = $3, retry_count = retry_count + 1, updated_at = $3 WHERE id = $4',
      [status, errorMessage, now, candidateId],
    ],
    resolved: [
      'UPDATE candidates SET status = $1, completed_at = $2, updated_at = $2 WHERE id = $3',
      [status, now, candidateId],
    ],
    ready_for_review: [
      'UPDATE candidates SET status = $1, completed_at = $2, updated_at = $2 WHERE id = $3',
      [status, now, candidateId],
    ],
    duplicate_detected: [
      'UPDATE candidates SET status = $1, completed_at = $2, updated_at = $2 WHERE id = $3',
      [status, now, candidateId],
    ],
  };
  const update = statusUpdates[status] ?? [
    'UPDATE candidates SET status = $1, updated_at = $2 WHERE id = $3',
    [status, now, candidateId],
  ];
  await client.query(update[0], update[1]);
}

function rowToAnalysis(row: Row): AnalysisSnapshot {
  return {
    normalizedAt: toIso(row.normalized_at),
    fingerprint: String(row.fingerprint),
    keywords: (row.keywords as string[]) ?? [],
    tokens: (row.tokens as string[]) ?? [],
    duplicateTrace: (row.duplicate_trace as AnalysisSnapshot['duplicateTrace']) ?? undefined,
  };
}

function rowToManualResult(row: Row): NonNullable<CandidateSubmission['manualResult']> {
  return {
    decision: row.decision as 'independent' | 'merged',
    notes: String(row.notes),
    mergedWith: row.merged_with_entity_type
      ? {
          entityType: row.merged_with_entity_type as 'trap' | 'skill',
          entityId: String(row.merged_with_entity_id),
          entityTitle: (row.merged_with_entity_title as string | null) ?? undefined,
        }
      : undefined,
    submittedAt: toIso(row.submitted_at),
    submittedBy: String(row.submitted_by_user_id),
  };
}

function rowToDuplicateCase(caseRow: Row, matchRows: Row[]): DuplicateCase {
  return {
    id: String(caseRow.id),
    candidateId: String(caseRow.candidate_id),
    detectedAt: toIso(caseRow.detected_at),
    detectionVersion: String(caseRow.detection_version),
    highestSimilarity: Number(caseRow.highest_similarity),
    hasExactDuplicate: Number(caseRow.has_exact_duplicate) === 1,
    duplicateType: caseRow.duplicate_type as DuplicateCase['duplicateType'],
    matches: matchRows.map((match) => ({
      entityType: match.entity_type as 'trap' | 'skill',
      entityId: String(match.entity_id),
      entityTitle: String(match.entity_title),
      similarityScore: Number(match.similarity_score),
      matchType: match.match_type as 'exact' | 'high-overlap' | 'semantic-similar',
      overlapDetails: {
        sharedKeywords: (match.shared_keywords as string[]) ?? [],
        sharedTokens: (match.shared_tokens as string[]) ?? [],
        textOverlapPercent: Number(match.text_overlap_percent),
      },
    })),
  };
}

function rowToOutcome(row: Row): ResolutionOutcome {
  return {
    candidateId: String(row.candidate_id),
    decision: row.decision as ResolutionOutcome['decision'],
    publishedEntityId: (row.published_entity_id as string | null) ?? null,
    mergedIntoEntityId: (row.merged_into_entity_id as string | null) ?? null,
    entityType: (row.entity_type as ResolutionOutcome['entityType']) ?? null,
    resolvedAt: toIso(row.resolved_at),
    resolvedBy: String(row.resolved_by),
    notes: String(row.notes),
  };
}

function rowToLineage(row: Row): EntityLineage {
  return {
    id: String(row.id),
    candidateId: String(row.candidate_id),
    relationshipType: row.relationship_type as EntityLineage['relationshipType'],
    sourceType: row.source_type as EntityLineage['sourceType'],
    sourceId: String(row.source_id),
    targetType: row.target_type as EntityLineage['targetType'],
    targetId: String(row.target_id),
    createdAt: toIso(row.created_at),
    notes: (row.notes as string | null) ?? null,
  };
}

async function lockCandidate(client: Pick<PoolClient, 'query'>, candidateId: string): Promise<Row> {
  const { rows } = await client.query(
    'SELECT id, status, last_error, retry_count FROM candidates WHERE id = $1 FOR UPDATE',
    [candidateId],
  );
  const candidate = rows[0] as Row | undefined;
  if (!candidate) throw new Error(`Candidate ${candidateId} not found`);
  return candidate;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameAnalysis(existing: AnalysisSnapshot, incoming: AnalysisSnapshot): boolean {
  return sameJson(existing, incoming);
}

function sameManualResult(
  existing: NonNullable<CandidateSubmission['manualResult']>,
  incoming: ManualResultSubmission,
  reviewedBy: string,
): boolean {
  return (
    existing.decision === incoming.decision &&
    existing.notes === incoming.notes &&
    existing.submittedBy === reviewedBy &&
    sameJson(existing.mergedWith, incoming.mergedWith)
  );
}

function sameDuplicateCase(existing: DuplicateCase, incoming: DuplicateCase): boolean {
  return sameJson(existing, incoming);
}

async function writeAnalysis(
  client: Pick<PoolClient, 'query'>,
  candidateId: string,
  snapshot: AnalysisSnapshot,
): Promise<void> {
  await client.query(
    `INSERT INTO candidate_analyses (candidate_id, normalized_at, fingerprint, keywords, tokens, duplicate_trace)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
     ON CONFLICT (candidate_id) DO UPDATE SET normalized_at = EXCLUDED.normalized_at,
       fingerprint = EXCLUDED.fingerprint, keywords = EXCLUDED.keywords, tokens = EXCLUDED.tokens,
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
}

async function writeDuplicateCase(
  client: Pick<PoolClient, 'query'>,
  duplicateCase: DuplicateCase,
): Promise<boolean> {
  const existing = await readDuplicateCaseFromClient(client, duplicateCase.id);
  if (existing && sameDuplicateCase(existing, duplicateCase)) return false;
  await client.query(
    `INSERT INTO candidate_duplicate_cases (
       id, candidate_id, detected_at, detection_version, highest_similarity, has_exact_duplicate, duplicate_type
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET candidate_id = EXCLUDED.candidate_id,
       detected_at = EXCLUDED.detected_at, detection_version = EXCLUDED.detection_version,
       highest_similarity = EXCLUDED.highest_similarity, has_exact_duplicate = EXCLUDED.has_exact_duplicate,
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
      `INSERT INTO candidate_duplicate_matches (
         duplicate_case_id, entity_type, entity_id, entity_title, similarity_score, match_type,
         shared_keywords, shared_tokens, text_overlap_percent
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)`,
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
  return true;
}

async function writeManualResult(
  client: Pick<PoolClient, 'query'>,
  candidateId: string,
  result: ManualResultSubmission,
  reviewedBy: string,
  submittedAt: string,
): Promise<void> {
  await client.query(
    `INSERT INTO candidate_manual_results (
       candidate_id, decision, notes, merged_with_entity_type, merged_with_entity_id,
       merged_with_entity_title, submitted_at, submitted_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (candidate_id) DO UPDATE SET decision = EXCLUDED.decision, notes = EXCLUDED.notes,
       merged_with_entity_type = EXCLUDED.merged_with_entity_type,
       merged_with_entity_id = EXCLUDED.merged_with_entity_id,
       merged_with_entity_title = EXCLUDED.merged_with_entity_title,
       submitted_at = EXCLUDED.submitted_at, submitted_by_user_id = EXCLUDED.submitted_by_user_id`,
    [
      candidateId,
      result.decision,
      result.notes,
      result.mergedWith?.entityType ?? null,
      result.mergedWith?.entityId ?? null,
      result.mergedWith?.entityTitle ?? null,
      submittedAt,
      reviewedBy,
    ],
  );
}

async function readDuplicateCase(
  pool: Queryable,
  duplicateCaseId: string,
): Promise<DuplicateCase | null> {
  return readDuplicateCaseFromClient(pool, duplicateCaseId);
}

async function readDuplicateCaseFromClient(
  client: Pick<PoolClient, 'query'>,
  duplicateCaseId: string,
): Promise<DuplicateCase | null> {
  const { rows } = await client.query('SELECT * FROM candidate_duplicate_cases WHERE id = $1', [
    duplicateCaseId,
  ]);
  const caseRow = rows[0] as Row | undefined;
  if (!caseRow) return null;
  const matches = await client.query(
    'SELECT * FROM candidate_duplicate_matches WHERE duplicate_case_id = $1 ORDER BY id',
    [duplicateCaseId],
  );
  return rowToDuplicateCase(caseRow, matches.rows as Row[]);
}

export function createCandidateIngestionPgOwnerBundle(pool: Pool): CandidateIngestionPgOwnerBundle {
  const candidateRepo: CandidateRepositoryPort = {
    async insert(candidate) {
      await withTransaction(pool, async (client) => {
        await client.query(
          `INSERT INTO candidates (
             id, source_type, submitted_by_user_id, team_id, status, original_payload, analysis_snapshot,
             duplicate_case, received_at, queued_at, analyzing_at, completed_at, last_error, retry_count, manual_result
           ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13, $14, $15::jsonb)
           ON CONFLICT (id) DO NOTHING`,
          [
            candidate.id,
            candidate.sourceType,
            candidate.submittedBy,
            candidate.teamId,
            candidate.status,
            JSON.stringify(candidate.originalPayload),
            candidate.analysisSnapshot ? JSON.stringify(candidate.analysisSnapshot) : null,
            candidate.duplicateCase ? JSON.stringify(candidate.duplicateCase) : null,
            candidate.receivedAt,
            candidate.queuedAt,
            candidate.analyzingAt,
            candidate.completedAt,
            candidate.lastError,
            candidate.retryCount,
            candidate.manualResult ? JSON.stringify(candidate.manualResult) : null,
          ],
        );
        if (candidate.analysisSnapshot)
          await writeAnalysis(client, candidate.id, candidate.analysisSnapshot);
        if (candidate.duplicateCase) await writeDuplicateCase(client, candidate.duplicateCase);
        if (candidate.manualResult) {
          await writeManualResult(
            client,
            candidate.id,
            candidate.manualResult,
            candidate.manualResult.submittedBy,
            candidate.manualResult.submittedAt,
          );
        }
      });
    },
    async getById(candidateId) {
      const { rows } = await pool.query('SELECT * FROM candidates WHERE id = $1', [candidateId]);
      const row = rows[0] as Row | undefined;
      if (!row) return null;
      const candidate = rowToCandidate(row);
      const [analysisResult, duplicate, manualResult] = await Promise.all([
        pool.query('SELECT * FROM candidate_analyses WHERE candidate_id = $1', [candidateId]),
        readDuplicateCaseByCandidate(pool, candidateId),
        pool.query('SELECT * FROM candidate_manual_results WHERE candidate_id = $1', [candidateId]),
      ]);
      if (analysisResult.rows[0])
        candidate.analysisSnapshot = rowToAnalysis(analysisResult.rows[0] as Row);
      if (duplicate) candidate.duplicateCase = duplicate;
      if (manualResult.rows[0])
        candidate.manualResult = rowToManualResult(manualResult.rows[0] as Row);
      return candidate;
    },
    async updateStatus(candidateId, status, error) {
      await withTransaction(pool, (client) =>
        updateCandidateStatus(client, candidateId, status, error),
      );
    },
    async attachAnalysis(candidateId, snapshot) {
      await withTransaction(pool, async (client) => {
        await lockCandidate(client, candidateId);
        const { rows } = await client.query(
          'SELECT * FROM candidate_analyses WHERE candidate_id = $1',
          [candidateId],
        );
        if (rows[0] && sameAnalysis(rowToAnalysis(rows[0] as Row), snapshot)) return;
        await client.query(
          'UPDATE candidates SET analysis_snapshot = $1::jsonb, updated_at = $2 WHERE id = $3',
          [JSON.stringify(snapshot), new Date().toISOString(), candidateId],
        );
        await writeAnalysis(client, candidateId, snapshot);
      });
    },
    async attachDuplicateCase(candidateId, duplicateCase) {
      await withTransaction(pool, async (client) => {
        await lockCandidate(client, candidateId);
        const existing = await readDuplicateCaseFromClient(client, duplicateCase.id);
        if (existing && sameDuplicateCase(existing, duplicateCase)) return;
        await client.query(
          'UPDATE candidates SET duplicate_case = $1::jsonb, updated_at = $2 WHERE id = $3',
          [JSON.stringify(duplicateCase), new Date().toISOString(), candidateId],
        );
        await writeDuplicateCase(client, duplicateCase);
      });
    },
    async attachManualResult(candidateId, result, reviewedBy) {
      await withTransaction(pool, async (client) => {
        await lockCandidate(client, candidateId);
        const { rows } = await client.query(
          'SELECT * FROM candidate_manual_results WHERE candidate_id = $1',
          [candidateId],
        );
        if (rows[0] && sameManualResult(rowToManualResult(rows[0] as Row), result, reviewedBy))
          return;
        const submittedAt = new Date().toISOString();
        const manualResult = { ...result, submittedAt, submittedBy: reviewedBy };
        await client.query(
          'UPDATE candidates SET manual_result = $1::jsonb, updated_at = $2 WHERE id = $3',
          [JSON.stringify(manualResult), submittedAt, candidateId],
        );
        await writeManualResult(client, candidateId, result, reviewedBy, submittedAt);
      });
    },
    async listByStatus(status) {
      const { rows } = await pool.query(
        'SELECT * FROM candidates WHERE status = $1 ORDER BY received_at',
        [status],
      );
      return rows.map((row) => rowToCandidate(row as Row));
    },
    async markResolved(candidateId) {
      await candidateRepo.updateStatus(candidateId, 'resolved');
    },
    async findByFingerprint(fingerprint) {
      const { rows } = await pool.query(
        `SELECT c.id FROM candidates c
         JOIN candidate_analyses a ON a.candidate_id = c.id
         WHERE a.fingerprint = $1 ORDER BY c.received_at LIMIT 1`,
        [fingerprint],
      );
      return rows[0] ? String((rows[0] as Row).id) : null;
    },
  };

  const duplicateCases: CandidateDuplicateCaseRepository = {
    async upsert(duplicateCase) {
      await withTransaction(pool, (client) => writeDuplicateCase(client, duplicateCase));
    },
    getById(duplicateCaseId) {
      return readDuplicateCase(pool, duplicateCaseId);
    },
    async listByCandidate(candidateId) {
      const { rows } = await pool.query(
        'SELECT id FROM candidate_duplicate_cases WHERE candidate_id = $1',
        [candidateId],
      );
      return (
        await Promise.all(rows.map((row) => readDuplicateCase(pool, String((row as Row).id))))
      ).filter((duplicateCase): duplicateCase is DuplicateCase => duplicateCase !== null);
    },
  };

  const resolutionOutcomes: CandidateResolutionOutcomeRepository = {
    async upsert(outcome) {
      await withTransaction(pool, async (client) => {
        await client.query(
          `INSERT INTO candidate_resolution_outcomes (
             candidate_id, decision, published_entity_id, merged_into_entity_id, entity_type, resolved_at, resolved_by, notes
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (candidate_id) DO UPDATE SET decision = EXCLUDED.decision,
             published_entity_id = EXCLUDED.published_entity_id,
             merged_into_entity_id = EXCLUDED.merged_into_entity_id, entity_type = EXCLUDED.entity_type,
             resolved_at = EXCLUDED.resolved_at, resolved_by = EXCLUDED.resolved_by, notes = EXCLUDED.notes`,
          [
            outcome.candidateId,
            outcome.decision,
            outcome.publishedEntityId,
            outcome.mergedIntoEntityId,
            outcome.entityType,
            outcome.resolvedAt,
            outcome.resolvedBy,
            outcome.notes,
          ],
        );
      });
    },
    async getByCandidateId(candidateId) {
      const { rows } = await pool.query(
        'SELECT * FROM candidate_resolution_outcomes WHERE candidate_id = $1',
        [candidateId],
      );
      return rows[0] ? rowToOutcome(rows[0] as Row) : null;
    },
  };

  const lineage: CandidateLineageRepository = {
    async insert(record) {
      await withTransaction(pool, async (client) => {
        await client.query(
          `INSERT INTO entity_lineage (
             id, candidate_id, relationship_type, source_type, source_id, target_type, target_id, created_at, notes
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING`,
          [
            record.id,
            record.candidateId,
            record.relationshipType,
            record.sourceType,
            record.sourceId,
            record.targetType,
            record.targetId,
            record.createdAt,
            record.notes,
          ],
        );
      });
    },
    async getById(lineageId) {
      const { rows } = await pool.query('SELECT * FROM entity_lineage WHERE id = $1', [lineageId]);
      return rows[0] ? rowToLineage(rows[0] as Row) : null;
    },
    async listByCandidate(candidateId) {
      const { rows } = await pool.query(
        'SELECT * FROM entity_lineage WHERE candidate_id = $1 ORDER BY created_at',
        [candidateId],
      );
      return rows.map((row) => rowToLineage(row as Row));
    },
  };

  return { candidateRepo, duplicateCases, resolutionOutcomes, lineage };
}

async function readDuplicateCaseByCandidate(
  pool: Queryable,
  candidateId: string,
): Promise<DuplicateCase | null> {
  const { rows } = await pool.query(
    'SELECT id FROM candidate_duplicate_cases WHERE candidate_id = $1 ORDER BY detected_at DESC LIMIT 1',
    [candidateId],
  );
  return rows[0] ? readDuplicateCase(pool, String((rows[0] as Row).id)) : null;
}
