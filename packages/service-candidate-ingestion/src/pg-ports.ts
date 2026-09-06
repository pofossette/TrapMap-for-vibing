import type { CandidateRepositoryPort } from '@trapmap/backend-core';
import {
  isStatusUpdateNoop,
  sameAnalysis,
  sameDuplicateCase,
  sameManualResult,
} from '@trapmap/backend-core';
import type {
  AnalysisSnapshot,
  CandidateStatus,
  CandidateSubmission,
  DuplicateCase,
  EntityLineage,
  ManualResultSubmission,
  ResolutionOutcome,
} from '@trapmap/contracts';
import { nowIso } from '@trapmap/lib';

interface Queryable {
  query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
}
export interface TransactionClient extends Queryable {
  release(): void;
}
export interface TransactionPool extends Queryable {
  connect(): Promise<TransactionClient>;
}
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
    analysisSnapshot: null,
    duplicateCase: null,
    receivedAt: toIso(row.received_at),
    queuedAt: nullableIso(row.queued_at),
    analyzingAt: nullableIso(row.analyzing_at),
    completedAt: nullableIso(row.completed_at),
    lastError: (row.last_error as string | null) ?? null,
    retryCount: Number(row.retry_count ?? 0),
    manualResult: null,
  };
}

async function updateCandidateStatus(
  client: TransactionClient,
  candidateId: string,
  status: CandidateStatus,
  error?: string,
): Promise<void> {
  const existing = await lockCandidate(client, candidateId);
  const errorMessage = error ?? 'Unknown error';
  if (
    isStatusUpdateNoop(
      existing.status as string,
      existing.last_error as string | null,
      status,
      error,
    )
  )
    return;

  const now = nowIso();
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

async function lockCandidate(client: TransactionClient, candidateId: string): Promise<Row> {
  const { rows } = await client.query(
    'SELECT id, status, last_error, retry_count FROM candidates WHERE id = $1 FOR UPDATE',
    [candidateId],
  );
  const candidate = rows[0] as Row | undefined;
  if (!candidate) throw new Error(`Candidate ${candidateId} not found`);
  return candidate;
}

async function writeAnalysis(
  client: TransactionClient,
  candidateId: string,
  snapshot: AnalysisSnapshot,
): Promise<void> {
  await client.query(
    `UPDATE candidates SET analysis = $2::jsonb, updated_at = NOW() WHERE id = $1`,
    [candidateId, JSON.stringify(snapshot)],
  );
}

async function writeDuplicateCase(
  client: TransactionClient,
  duplicateCase: DuplicateCase,
): Promise<boolean> {
  const existing = await readDuplicateCaseFromClient(client, duplicateCase.id);
  if (existing && sameDuplicateCase(existing, duplicateCase)) return false;
  await client.query(
    `INSERT INTO candidate_duplicate_cases (
       id, candidate_id, detected_at, detection_version, highest_similarity, has_exact_duplicate, duplicate_type, matches
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (id) DO UPDATE SET candidate_id = EXCLUDED.candidate_id,
       detected_at = EXCLUDED.detected_at, detection_version = EXCLUDED.detection_version,
       highest_similarity = EXCLUDED.highest_similarity, has_exact_duplicate = EXCLUDED.has_exact_duplicate,
       duplicate_type = EXCLUDED.duplicate_type, matches = EXCLUDED.matches`,
    [
      duplicateCase.id,
      duplicateCase.candidateId,
      duplicateCase.detectedAt,
      duplicateCase.detectionVersion,
      duplicateCase.highestSimilarity,
      duplicateCase.hasExactDuplicate ? 1 : 0,
      duplicateCase.duplicateType,
      JSON.stringify(
        duplicateCase.matches.map((m) => ({
          entityType: m.entityType,
          entityId: m.entityId,
          entityTitle: m.entityTitle,
          similarityScore: m.similarityScore,
          matchType: m.matchType,
          sharedKeywords: m.overlapDetails.sharedKeywords,
          sharedTokens: m.overlapDetails.sharedTokens,
          textOverlapPercent: m.overlapDetails.textOverlapPercent,
        })),
      ),
    ],
  );
  return true;
}

async function writeManualResult(
  client: TransactionClient,
  candidateId: string,
  result: ManualResultSubmission,
  reviewedBy: string,
  submittedAt: string,
): Promise<void> {
  await client.query(
    `INSERT INTO candidate_outcomes (
       candidate_id, kind, decision, notes, merged_with_entity_type, merged_with_entity_id,
       merged_with_entity_title, submitted_at, submitted_by_user_id
     ) VALUES ($1, 'manual', $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (candidate_id) DO UPDATE SET kind='manual', decision = EXCLUDED.decision, notes = EXCLUDED.notes,
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
  return readDuplicateCaseFromClient(pool as TransactionClient, duplicateCaseId);
}

async function readDuplicateCaseFromClient(
  client: TransactionClient,
  duplicateCaseId: string,
): Promise<DuplicateCase | null> {
  const { rows } = await client.query('SELECT * FROM candidate_duplicate_cases WHERE id = $1', [
    duplicateCaseId,
  ]);
  const caseRow = rows[0] as Row | undefined;
  if (!caseRow) return null;
  // matches are stored as jsonb in candidate_duplicate_cases.matches
  const rawMatches = (caseRow.matches as unknown[] | null) ?? [];
  const matchRows = (rawMatches as Record<string, unknown>[]).map((m) => ({
    entity_type: (m as Record<string, unknown>).entityType,
    entity_id: (m as Record<string, unknown>).entityId,
    entity_title: (m as Record<string, unknown>).entityTitle,
    similarity_score: (m as Record<string, unknown>).similarityScore,
    match_type: (m as Record<string, unknown>).matchType,
    shared_keywords: (m as Record<string, unknown>).sharedKeywords,
    shared_tokens: (m as Record<string, unknown>).sharedTokens,
    text_overlap_percent: (m as Record<string, unknown>).textOverlapPercent,
  }));
  return rowToDuplicateCase(caseRow, matchRows as Row[]);
}

export function createCandidateIngestionPgOwnerBundle(
  pool: TransactionPool,
): CandidateIngestionPgOwnerBundle {
  const candidateRepo: CandidateRepositoryPort = {
    async insert(candidate) {
      await withTransaction(pool, async (client) => {
        await client.query(
          `INSERT INTO candidates (
             id, source_type, submitted_by_user_id, team_id, status, original_payload,
             received_at, queued_at, analyzing_at, completed_at, last_error, retry_count
           ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO NOTHING`,
          [
            candidate.id,
            candidate.sourceType,
            candidate.submittedBy,
            candidate.teamId,
            candidate.status,
            JSON.stringify(candidate.originalPayload),
            candidate.receivedAt,
            candidate.queuedAt,
            candidate.analyzingAt,
            candidate.completedAt,
            candidate.lastError,
            candidate.retryCount,
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
      // analysis is now stored as jsonb in candidates.analysis
      if (row.analysis) {
        const a = row.analysis as Record<string, unknown>;
        // stored as AnalysisSnapshot jsonb
        candidate.analysisSnapshot = {
          normalizedAt: String((a as Record<string, unknown>).normalizedAt ?? a.normalized_at),
          fingerprint: String((a as Record<string, unknown>).fingerprint),
          keywords: ((a as Record<string, unknown>).keywords as string[]) ?? [],
          tokens: ((a as Record<string, unknown>).tokens as string[]) ?? [],
          duplicateTrace:
            ((a as Record<string, unknown>).duplicateTrace as AnalysisSnapshot['duplicateTrace']) ??
            undefined,
        };
      }
      const [duplicate, manualResult] = await Promise.all([
        readDuplicateCaseByCandidate(pool, candidateId),
        pool.query("SELECT * FROM candidate_outcomes WHERE candidate_id = $1 AND kind='manual'", [
          candidateId,
        ]),
      ]);
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
        const { rows } = await client.query('SELECT analysis FROM candidates WHERE id = $1', [
          candidateId,
        ]);
        const existing = rows[0]?.analysis as AnalysisSnapshot | null;
        if (existing && sameAnalysis(existing, snapshot)) return;
        // fallback for legacy row shape
        if (rows[0]?.fingerprint && sameAnalysis(rowToAnalysis(rows[0] as Row), snapshot)) return;
        await writeAnalysis(client, candidateId, snapshot);
      });
    },
    async attachDuplicateCase(candidateId, duplicateCase) {
      await withTransaction(pool, async (client) => {
        await lockCandidate(client, candidateId);
        const existing = await readDuplicateCaseFromClient(client, duplicateCase.id);
        if (existing && sameDuplicateCase(existing, duplicateCase)) return;
        await writeDuplicateCase(client, duplicateCase);
      });
    },
    async attachManualResult(candidateId, result, reviewedBy) {
      await withTransaction(pool, async (client) => {
        await lockCandidate(client, candidateId);
        const { rows } = await client.query(
          "SELECT * FROM candidate_outcomes WHERE candidate_id = $1 AND kind='manual'",
          [candidateId],
        );
        if (rows[0] && sameManualResult(rowToManualResult(rows[0] as Row), result, reviewedBy))
          return;
        const submittedAt = nowIso();
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
        `SELECT id FROM candidates WHERE analysis->>'fingerprint' = $1 ORDER BY received_at LIMIT 1`,
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
          `INSERT INTO candidate_outcomes (
             candidate_id, kind, decision, published_entity_id, merged_into_entity_id, entity_type, resolved_at, resolved_by, notes
           ) VALUES ($1, 'resolution', $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (candidate_id) DO UPDATE SET kind='resolution', decision = EXCLUDED.decision,
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
        "SELECT * FROM candidate_outcomes WHERE candidate_id = $1 AND kind='resolution'",
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
