import { randomUUID } from 'node:crypto';
import type { FeedbackRepositoryPort } from '@trapmap/backend-core';
import type { Pool } from 'pg';

export interface GovernanceReviewPgOwnerBundle {
  feedbackRepo: FeedbackRepositoryPort;
}

function buildSetClauses(updates: Record<string, unknown>): { clauses: string[]; values: unknown[] } {
  const columns = new Set([
    'status',
    'description',
    'context',
    'entry_type',
    'problem_type',
    'admin_notes',
    'resolved_at',
    'resolved_by_user_id',
    'triggered_transition',
    'remediation_status',
    'remediation_opened_at',
    'remediation_opened_by_user_id',
    'remediation_resolved_at',
    'remediation_resolved_by_user_id',
  ]);
  const clauses: string[] = [];
  const values: unknown[] = [];
  for (const [column, value] of Object.entries(updates)) {
    if (!columns.has(column)) continue;
    values.push(value);
    clauses.push(`${column} = $${values.length}`);
  }
  return { clauses, values };
}

export function createGovernanceReviewPgOwnerBundle(pool: Pick<Pool, 'query'>): GovernanceReviewPgOwnerBundle {
  const feedbackRepo: FeedbackRepositoryPort = {
    async nextId() {
      return `f_${randomUUID()}`;
    },
    async insert(feedback) {
      await pool.query(
        `INSERT INTO feedback_queue (id, entry_id, problem_type, description, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [
          feedback.id,
          feedback.entryId,
          feedback.problemType,
          (feedback as Record<string, unknown>).description ?? '',
          feedback.status ?? 'open',
        ],
      );
    },
    async getById(feedbackId) {
      const { rows } = await pool.query('SELECT * FROM feedback_queue WHERE id = $1', [feedbackId]);
      return (rows[0] as Awaited<ReturnType<FeedbackRepositoryPort['getById']>>) ?? null;
    },
    async listByEntry(entryId) {
      const { rows } = await pool.query('SELECT * FROM feedback_queue WHERE entry_id = $1', [entryId]);
      return rows as Awaited<ReturnType<FeedbackRepositoryPort['listByEntry']>>;
    },
    async listByStatus(status) {
      const { rows } = await pool.query('SELECT * FROM feedback_queue WHERE status = $1', [status]);
      return rows as Awaited<ReturnType<FeedbackRepositoryPort['listByStatus']>>;
    },
    async listByFilter(filter) {
      const conditions: string[] = [];
      const values: unknown[] = [];
      const add = (sql: string, value: unknown) => {
        values.push(value);
        conditions.push(sql.replace('$?', `$${values.length}`));
      };
      if (filter.status?.length) add('status = ANY($?)', filter.status);
      if (filter.problemType?.length) add('problem_type = ANY($?)', filter.problemType);
      if (filter.entryId) add('entry_id = $?', filter.entryId);
      if (filter.entryType) add('entry_type = $?', filter.entryType);
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const { rows } = await pool.query(
        `SELECT * FROM feedback_queue ${where} ORDER BY created_at DESC LIMIT 100`,
        values,
      );
      return rows as Awaited<ReturnType<FeedbackRepositoryPort['listByFilter']>>;
    },
    async update(feedbackId, updates) {
      const { clauses, values } = buildSetClauses(updates as Record<string, unknown>);
      if (!clauses.length) return;
      clauses.push('updated_at = NOW()');
      await pool.query(
        `UPDATE feedback_queue SET ${clauses.join(', ')} WHERE id = $${values.length + 1}`,
        [...values, feedbackId],
      );
    },
  };
  return { feedbackRepo };
}
