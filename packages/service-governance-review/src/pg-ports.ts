import type {
  FeedbackQueueRecord,
  FeedbackRepositoryPort,
  GovernanceRemediationProjection,
  GovernanceRetrievalProjection,
} from '@trapmap/backend-core';
import { remediationState } from '@trapmap/backend-core';
import type { ConflictReadProjection, ConflictRelation } from '@trapmap/contracts';
import { prefixedId } from '@trapmap/lib';
import { feedbackCustomAnswers, feedbackRecords } from '@trapmap/persistence-schema';
import { getTableName } from 'drizzle-orm';
import type { Pool } from 'pg';

export interface GovernanceReviewPgOwnerBundle {
  feedbackRepo: FeedbackRepositoryPort;
  conflictProjection: ConflictReadProjection & {
    upsert(conflict: ConflictRelation): Promise<void>;
    getById(conflictId: string): Promise<ConflictRelation | null>;
  };
  retrievalProjection: GovernanceRetrievalProjection;
}

type Queryable = Pick<Pool, 'query'>;
type FeedbackRow = Record<string, unknown>;
const feedbackRecordsTable = getTableName(feedbackRecords);
const feedbackCustomAnswersTable = getTableName(feedbackCustomAnswers);

const feedbackRecordColumns = `
  id, entry_id, entry_type, problem_type, description, context, query_seed, query_id,
  route_family, failure_classification, expected_correction, selected_result_snapshot,
  submitted_at, submitted_by_user_id, submitted_by_handle, status, admin_notes,
  resolved_at, resolved_by_user_id, triggered_transition, remediation_status,
  remediation_opened_at, remediation_opened_by_user_id, remediation_resolved_at,
  remediation_resolved_by_user_id, created_at, updated_at`;

function asIso(value: unknown): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function rowToFeedbackRecord(
  row: FeedbackRow,
  customAnswers: Array<{ prompt: string; answer: string }>,
): FeedbackQueueRecord {
  return {
    id: String(row.id),
    entryId: String(row.entry_id),
    entryType: String(row.entry_type),
    problemType: String(row.problem_type),
    description: String(row.description),
    context: row.context ?? null,
    querySeed: row.query_seed ?? null,
    queryId: row.query_id ?? null,
    routeFamily: row.route_family ?? null,
    failureClassification: row.failure_classification ?? null,
    expectedCorrection: row.expected_correction ?? null,
    selectedResultSnapshot: row.selected_result_snapshot ?? null,
    submittedAt: asIso(row.submitted_at),
    submittedByUserId: String(row.submitted_by_user_id),
    submittedByHandle: String(row.submitted_by_handle),
    status: String(row.status),
    adminNotes: row.admin_notes ?? null,
    resolvedAt: asIso(row.resolved_at),
    resolvedByUserId: row.resolved_by_user_id ?? null,
    triggeredTransition: row.triggered_transition ?? null,
    remediationStatus: row.remediation_status ?? null,
    remediationOpenedAt: asIso(row.remediation_opened_at),
    remediationOpenedByUserId: row.remediation_opened_by_user_id ?? null,
    remediationResolvedAt: asIso(row.remediation_resolved_at),
    remediationResolvedByUserId: row.remediation_resolved_by_user_id ?? null,
    customAnswers: customAnswers.length > 0 ? customAnswers : null,
    createdAt: asIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: asIso(row.updated_at) ?? new Date().toISOString(),
  };
}

async function getCustomAnswers(
  pool: Queryable,
  feedbackId: string,
): Promise<Array<{ prompt: string; answer: string }>> {
  const { rows } = await pool.query(
    `SELECT question_key, answer_text FROM ${feedbackCustomAnswersTable} WHERE feedback_id = $1`,
    [feedbackId],
  );
  return rows.map((row) => ({
    prompt: String((row as FeedbackRow).question_key),
    answer: String((row as FeedbackRow).answer_text),
  }));
}

export function createGovernanceReviewPgOwnerBundle(
  pool: Queryable,
): GovernanceReviewPgOwnerBundle {
  const conflictProjection: GovernanceReviewPgOwnerBundle['conflictProjection'] = {
    async upsert(conflict) {
      await pool.query(
        `INSERT INTO conflict_relations
          (id, entry_id_a, entry_id_b, conflict_type, context, problem_overlap_score, solution_diff_score, detected_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (entry_id_a, entry_id_b) DO UPDATE SET
           conflict_type = EXCLUDED.conflict_type,
           context = EXCLUDED.context,
           problem_overlap_score = EXCLUDED.problem_overlap_score,
           solution_diff_score = EXCLUDED.solution_diff_score,
           detected_at = EXCLUDED.detected_at`,
        [
          conflict.id,
          conflict.entryIdA,
          conflict.entryIdB,
          conflict.conflictType,
          conflict.context,
          conflict.problemOverlapScore,
          conflict.solutionDiffScore,
          conflict.detectedAt,
        ],
      );
    },
    async listByEntryIds(entryIds) {
      if (entryIds.length === 0) return [];
      const { rows } = await pool.query(
        `SELECT id, entry_id_a, entry_id_b, conflict_type, context,
                problem_overlap_score, solution_diff_score, detected_at
           FROM conflict_relations
          WHERE entry_id_a = ANY($1) OR entry_id_b = ANY($1)`,
        [entryIds],
      );
      return rows.map((row) => {
        const record = row as FeedbackRow;
        return {
          id: String(record.id),
          entryIdA: String(record.entry_id_a),
          entryIdB: String(record.entry_id_b),
          conflictType: String(record.conflict_type) as ConflictRelation['conflictType'],
          context: String(record.context),
          problemOverlapScore: Number(record.problem_overlap_score),
          solutionDiffScore: Number(record.solution_diff_score),
          detectedAt: asIso(record.detected_at) ?? new Date().toISOString(),
        };
      });
    },
    async getById(conflictId) {
      const { rows } = await pool.query(
        `SELECT id, entry_id_a, entry_id_b, conflict_type, context,
                problem_overlap_score, solution_diff_score, detected_at
           FROM conflict_relations WHERE id = $1`,
        [conflictId],
      );
      const record = rows[0] as FeedbackRow | undefined;
      return record
        ? {
            id: String(record.id),
            entryIdA: String(record.entry_id_a),
            entryIdB: String(record.entry_id_b),
            conflictType: String(record.conflict_type) as ConflictRelation['conflictType'],
            context: String(record.context),
            problemOverlapScore: Number(record.problem_overlap_score),
            solutionDiffScore: Number(record.solution_diff_score),
            detectedAt: asIso(record.detected_at) ?? new Date().toISOString(),
          }
        : null;
    },
  };
  const feedbackRepo: FeedbackRepositoryPort = {
    async nextId() {
      return prefixedId('feedback', 12);
    },
    async insert(feedback) {
      const record = feedback as FeedbackQueueRecord & Record<string, unknown>;
      await pool.query(
        `INSERT INTO ${feedbackRecordsTable} (${feedbackRecordColumns})
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                 $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)`,
        [
          feedback.id,
          feedback.entryId,
          record.entryType,
          feedback.problemType,
          record.description,
          record.context ?? null,
          record.querySeed ?? null,
          record.queryId ?? null,
          record.routeFamily ?? null,
          record.failureClassification ?? null,
          record.expectedCorrection ?? null,
          record.selectedResultSnapshot ?? null,
          record.submittedAt,
          record.submittedByUserId,
          record.submittedByHandle,
          feedback.status,
          record.adminNotes ?? null,
          record.resolvedAt ?? null,
          record.resolvedByUserId ?? null,
          record.triggeredTransition ?? null,
          record.remediationStatus ?? null,
          record.remediationOpenedAt ?? null,
          record.remediationOpenedByUserId ?? null,
          record.remediationResolvedAt ?? null,
          record.remediationResolvedByUserId ?? null,
          record.createdAt,
          record.updatedAt,
        ],
      );
      const customAnswers = record.customAnswers as Array<{
        prompt: string;
        answer: string;
      }> | null;
      for (const answer of customAnswers ?? []) {
        await pool.query(
          `INSERT INTO ${feedbackCustomAnswersTable} (feedback_id, question_key, answer_text)
           VALUES ($1, $2, $3)`,
          [feedback.id, answer.prompt, answer.answer],
        );
      }
    },
    async getById(feedbackId) {
      const { rows } = await pool.query(
        `SELECT ${feedbackRecordColumns} FROM ${feedbackRecordsTable} WHERE id = $1`,
        [feedbackId],
      );
      const row = rows[0] as FeedbackRow | undefined;
      return row ? rowToFeedbackRecord(row, await getCustomAnswers(pool, feedbackId)) : null;
    },
    async listByEntry(entryId) {
      const { rows } = await pool.query(
        `SELECT ${feedbackRecordColumns} FROM ${feedbackRecordsTable} WHERE entry_id = $1`,
        [entryId],
      );
      return Promise.all(
        rows.map(async (row) =>
          rowToFeedbackRecord(
            row as FeedbackRow,
            await getCustomAnswers(pool, String((row as FeedbackRow).id)),
          ),
        ),
      );
    },
    async listByStatus(status) {
      const { rows } = await pool.query(
        `SELECT ${feedbackRecordColumns} FROM ${feedbackRecordsTable} WHERE status = $1`,
        [status],
      );
      return Promise.all(
        rows.map(async (row) =>
          rowToFeedbackRecord(
            row as FeedbackRow,
            await getCustomAnswers(pool, String((row as FeedbackRow).id)),
          ),
        ),
      );
    },
    async listByFilter(filter) {
      const conditions: string[] = [];
      const values: unknown[] = [];
      const add = (condition: string, value: unknown) => {
        values.push(value);
        conditions.push(condition.replace('?', `$${values.length}`));
      };
      if (filter.status?.length) add('status = ANY(?)', filter.status);
      if (filter.problemType?.length) add('problem_type = ANY(?)', filter.problemType);
      if (filter.entryId) add('entry_id = ?', filter.entryId);
      if (filter.entryType) add('entry_type = ?', filter.entryType);
      const { rows } = await pool.query(
        `SELECT ${feedbackRecordColumns} FROM ${feedbackRecordsTable}${conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''}`,
        values,
      );
      return Promise.all(
        rows.map(async (row) =>
          rowToFeedbackRecord(
            row as FeedbackRow,
            await getCustomAnswers(pool, String((row as FeedbackRow).id)),
          ),
        ),
      );
    },
    async update(feedbackId, updates) {
      const updateColumns: Record<string, string> = {
        status: 'status',
        adminNotes: 'admin_notes',
        resolvedAt: 'resolved_at',
        resolvedByUserId: 'resolved_by_user_id',
        triggeredTransition: 'triggered_transition',
        description: 'description',
        context: 'context',
        querySeed: 'query_seed',
        queryId: 'query_id',
        routeFamily: 'route_family',
        failureClassification: 'failure_classification',
        expectedCorrection: 'expected_correction',
        selectedResultSnapshot: 'selected_result_snapshot',
        remediationStatus: 'remediation_status',
        remediationOpenedAt: 'remediation_opened_at',
        remediationOpenedByUserId: 'remediation_opened_by_user_id',
        remediationResolvedAt: 'remediation_resolved_at',
        remediationResolvedByUserId: 'remediation_resolved_by_user_id',
      };
      const clauses: string[] = [];
      const values: unknown[] = [];
      for (const [key, column] of Object.entries(updateColumns)) {
        if (updates[key] !== undefined) {
          values.push(updates[key]);
          clauses.push(`${column} = $${values.length}`);
        }
      }
      if (!clauses.length) return;
      clauses.push('updated_at = NOW()');
      await pool.query(
        `UPDATE ${feedbackRecordsTable} SET ${clauses.join(', ')} WHERE id = $${values.length + 1}`,
        [...values, feedbackId],
      );
    },
  };
  const retrievalProjection: GovernanceRetrievalProjection = {
    async listFeedback() {
      const { rows } = await pool.query(
        `SELECT ${feedbackRecordColumns} FROM ${feedbackRecordsTable}`,
      );
      return Promise.all(
        rows.map(async (row) =>
          rowToFeedbackRecord(
            row as FeedbackRow,
            await getCustomAnswers(pool, String((row as FeedbackRow).id)),
          ),
        ),
      );
    },
    async listConflicts(entryIds) {
      return conflictProjection.listByEntryIds(entryIds);
    },
    async listRemediation(entryIds): Promise<GovernanceRemediationProjection[]> {
      if (entryIds.length === 0) return [];
      const allowedEntryIds = new Set(entryIds);
      const records = (await feedbackRepo.listByFilter({})) as FeedbackQueueRecord[];
      const grouped = new Map<string, FeedbackQueueRecord[]>();
      for (const record of records) {
        if (!allowedEntryIds.has(record.entryId)) continue;
        const group = grouped.get(record.entryId) ?? [];
        group.push(record);
        grouped.set(record.entryId, group);
      }
      return [...grouped.entries()].flatMap(([entryId, entryRecords]) => {
        const remediation = remediationState(
          entryRecords.map((record) => ({
            id: record.id,
            entryId: record.entryId,
            status: record.status,
            submittedAt: record.submittedAt as string,
            remediationStatus: record.remediationStatus as string | null | undefined,
            remediationOpenedAt: record.remediationOpenedAt as string | null | undefined,
            remediationOpenedByUserId: record.remediationOpenedByUserId as
              | string
              | null
              | undefined,
            remediationResolvedAt: record.remediationResolvedAt as string | null | undefined,
            remediationResolvedByUserId: record.remediationResolvedByUserId as
              | string
              | null
              | undefined,
          })),
          entryId,
        );
        return remediation ? [{ entryId, remediation }] : [];
      });
    },
  };
  return { feedbackRepo, conflictProjection, retrievalProjection };
}
