/**
 * Task queue domain table.
 *
 * Covers: durable task queue backed by PostgreSQL SKIP LOCKED.
 */
import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [index('task_queue_type_dedupe_idx').on(table.type, table.dedupeKey)],
);
