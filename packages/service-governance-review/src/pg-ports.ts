import { randomUUID } from 'node:crypto';

import type { FeedbackQueueRecord, FeedbackRepositoryPort } from '@trapmap/backend-core';
import { getTableName } from 'drizzle-orm';
import type { Pool } from 'pg';
import { feedbackCustomAnswers, feedbackRecords } from '@trapmap/persistence-schema';

export interface GovernanceReviewPgOwnerBundle {
  feedbackRepo: FeedbackRepositoryPort;
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

export function createGovernanceReviewPgOwnerBundle(pool: Queryable): GovernanceReviewPgOwnerBundle {
  const feedbackRepo: FeedbackRepositoryPort = {
    async nextId() {
      return `feedback_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    },
    async insert(feedback) {
      const record = feedback as FeedbackQueueRecord & Record<string, unknown>;
      await pool.query(
        `INSERT INTO ${feedbackRecordsTable} (${feedbackRecordColumns})
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                 $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)`,
        [
          feedback.id, feedback.entryId, record.entryType, feedback.problemType, record.description,
          record.context ?? null, record.querySeed ?? null, record.queryId ?? null,
          record.routeFamily ?? null, record.failureClassification ?? null,
          record.expectedCorrection ?? null, record.selectedResultSnapshot ?? null,
          record.submittedAt, record.submittedByUserId, record.submittedByHandle, feedback.status,
          record.adminNotes ?? null, record.resolvedAt ?? null, record.resolvedByUserId ?? null,
          record.triggeredTransition ?? null, record.remediationStatus ?? null,
          record.remediationOpenedAt ?? null, record.remediationOpenedByUserId ?? null,
          record.remediationResolvedAt ?? null, record.remediationResolvedByUserId ?? null,
          record.createdAt, record.updatedAt,
        ],
      );
      const customAnswers = record.customAnswers as Array<{ prompt: string; answer: string }> | null;
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
      return Promise.all(rows.map(async (row) => rowToFeedbackRecord(row as FeedbackRow, await getCustomAnswers(pool, String((row as FeedbackRow).id)))));
    },
    async listByStatus(status) {
      const { rows } = await pool.query(
        `SELECT ${feedbackRecordColumns} FROM ${feedbackRecordsTable} WHERE status = $1`,
        [status],
      );
      return Promise.all(rows.map(async (row) => rowToFeedbackRecord(row as FeedbackRow, await getCustomAnswers(pool, String((row as FeedbackRow).id)))));
    },
    async listByFilter(filter) {
      const conditions: string[] = [];
      const values: unknown[] = [];
      const add = (condition: string, value: unknown) => {
        values.push(value);
        conditions.push(`${condition} $${values.length}`);
      };
      if (filter.status?.length) add('status = ANY', filter.status);
      if (filter.problemType?.length) add('problem_type = ANY', filter.problemType);
      if (filter.entryId) add('entry_id =', filter.entryId);
      if (filter.entryType) add('entry_type =', filter.entryType);
      const { rows } = await pool.query(
        `SELECT ${feedbackRecordColumns} FROM ${feedbackRecordsTable}${conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''}`,
        values,
      );
      return Promise.all(rows.map(async (row) => rowToFeedbackRecord(row as FeedbackRow, await getCustomAnswers(pool, String((row as FeedbackRow).id)))));
    },
    async update(feedbackId, updates) {
      const updateColumns: Record<string, string> = {
        status: 'status', adminNotes: 'admin_notes', resolvedAt: 'resolved_at',
        resolvedByUserId: 'resolved_by_user_id', triggeredTransition: 'triggered_transition',
        description: 'description', context: 'context', querySeed: 'query_seed', queryId: 'query_id',
        routeFamily: 'route_family', failureClassification: 'failure_classification',
        expectedCorrection: 'expected_correction', selectedResultSnapshot: 'selected_result_snapshot',
        remediationStatus: 'remediation_status', remediationOpenedAt: 'remediation_opened_at',
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
  return { feedbackRepo };
}
