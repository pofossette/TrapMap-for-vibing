/**
 * Shared task queue domain table.
 *
 * Covers: durable task queue backed by PostgreSQL SKIP LOCKED.
 *
 * Retired 2026-09-23: `workflow_runs` was modeled and created by the migration
 * but no job handler ever wrote or read it; long-running progress is carried by
 * `task_queue` rows plus the domain event outbox.
 */
import { sql } from 'drizzle-orm';
import { index, pgTable, uniqueIndex } from 'drizzle-orm/pg-core';
import { taskQueueColumns } from './column-factories.js';

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
