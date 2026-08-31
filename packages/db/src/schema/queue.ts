/**
 * Shared task queue domain table.
 *
 * Covers: durable task queue backed by PostgreSQL SKIP LOCKED.
 */
import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { auditTimestamps, taskQueueColumns } from './column-factories.js';

// =============================================================================
// Task Queue Table
// =============================================================================

/**
 * Durable task queue backed by PostgreSQL SKIP LOCKED.
 *
 * Dequeue partial index (defined in migration 0009):
 *   CREATE INDEX task_queue_pending_dequeue_idx
 *   ON task_queue (type, process_after, priority DESC, created_at ASC)
 *   WHERE status = 'pending';
 *
 * Deduplication guard (defined in migration 0009):
 *   CREATE UNIQUE INDEX task_queue_dedupe_pending_idx
 *   ON task_queue (type, dedupe_key)
 *   WHERE status IN ('pending', 'running');
 */
export const taskQueue = pgTable('task_queue', taskQueueColumns(), (table) => [
  index('task_queue_running_lease_idx')
    .on(table.type, table.leaseUntil, table.updatedAt)
    .where(sql`${table.status} = 'running'`),
  uniqueIndex('task_queue_dedupe_pending_idx')
    .on(table.type, table.dedupeKey)
    .where(sql`${table.status} IN ('pending', 'running')`),
]);

export const workflowRuns = pgTable(
  'workflow_runs',
  {
    runId: text('run_id').primaryKey(),
    workflowType: text('workflow_type').notNull(),
    subjectId: text('subject_id').notNull(),
    status: text('status').notNull(),
    stepName: text('step_name'),
    attempt: integer('attempt').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastError: text('last_error'),
    stats: jsonb('stats').notNull(),
    ...auditTimestamps(),
  },
  (table) => [
    index('workflow_runs_type_subject_idx').on(table.workflowType, table.subjectId),
    index('workflow_runs_status_updated_idx').on(table.status, table.updatedAt),
  ],
);
