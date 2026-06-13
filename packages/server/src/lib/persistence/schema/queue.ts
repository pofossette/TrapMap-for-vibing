/**
 * Task queue domain table.
 *
 * Covers: durable task queue backed by PostgreSQL SKIP LOCKED.
 */
import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

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
export const taskQueue = pgTable(
  'task_queue',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    payload: text('payload').notNull(),
    status: text('status').notNull().default('pending'),
    priority: integer('priority').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    lastError: text('last_error'),
    /** Opaque key for idempotent enqueue -- prevents duplicate (type, key) pairs */
    dedupeKey: text('dedupe_key'),
    processAfter: timestamp('process_after', { withTimezone: true }).notNull().defaultNow(),
    workerId: text('worker_id'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('task_queue_type_dedupe_idx').on(table.type, table.dedupeKey),
    index('task_queue_running_lease_idx')
      .on(table.type, table.leaseUntil, table.updatedAt)
      .where(sql`${table.status} = 'running'`),
    uniqueIndex('task_queue_dedupe_pending_idx')
      .on(table.type, table.dedupeKey)
      .where(sql`${table.status} IN ('pending', 'running')`),
  ],
);

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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('workflow_runs_type_subject_idx').on(table.workflowType, table.subjectId),
    index('workflow_runs_status_updated_idx').on(table.status, table.updatedAt),
  ],
);
