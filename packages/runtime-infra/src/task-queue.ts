/**
 * PostgreSQL-based task queue for reliable async processing.
 *
 * Uses SKIP LOCKED for concurrent worker safety without additional infrastructure.
 * Supports retry with exponential backoff, dead letter queue, and task priorities.
 *
 * Phase: Replace setTimeout-based retry with persistent queue
 */

import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import {
  createTaskWorkerFromQueue,
  type DequeueOptions,
  type Task,
  type TaskWorkerConfig as ContractTaskWorkerConfig,
  type TaskQueueStatusSnapshot,
  type TaskStatus,
} from '@trapmap/contracts';
import { taskQueue } from '@trapmap/persistence-schema';
import type { Pool, PoolClient } from 'pg';
import { recordQueueMetric, recordRuntimeReclaim } from './metrics.js';

export { taskQueue };
export type {
  DequeueOptions,
  Task,
  TaskHandler,
  TaskQueueStatusSnapshot,
  TaskStatus,
} from '@trapmap/contracts';

// =============================================================================
// Types
// =============================================================================

export interface TaskQueueConfig {
  pool: Pool;
  /** Default max attempts for tasks */
  defaultMaxAttempts?: number;
  /** Base delay for exponential backoff (ms) */
  baseRetryDelayMs?: number;
  /** Maximum delay for retries (ms) */
  maxRetryDelayMs?: number;
  /** Lease duration for claimed tasks in ms */
  leaseDurationMs?: number;
}

export interface EnqueueOptions {
  /** Task priority (higher = more urgent) */
  priority?: number;
  /** Maximum retry attempts */
  maxAttempts?: number;
  /** Delay before processing (ms) */
  delayMs?: number;
  /** Opaque deduplication key — prevents duplicate (type, key) pairs */
  dedupeKey?: string;
}

// =============================================================================
// Task Queue Implementation
// =============================================================================

const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 5000; // 5 seconds
const MAX_RETRY_DELAY_MS = 300000; // 5 minutes
const DEFAULT_LEASE_DURATION_MS = 30_000;

/**
 * Create a PostgreSQL-backed task queue.
 */
export function createTaskQueue(config: TaskQueueConfig) {
  const {
    pool,
    defaultMaxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseRetryDelayMs = BASE_RETRY_DELAY_MS,
    maxRetryDelayMs = MAX_RETRY_DELAY_MS,
    leaseDurationMs = DEFAULT_LEASE_DURATION_MS,
  } = config;

  const db = drizzle(pool, { schema: { taskQueue } });
  let reclaimCount = 0;

  /**
   * Generate a unique task ID.
   */
  function generateTaskId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `task_${timestamp}_${random}`;
  }

  /**
   * Calculate exponential backoff delay.
   */
  function calculateBackoff(attempts: number): number {
    const delay = baseRetryDelayMs * 2 ** (attempts - 1);
    return Math.min(delay, maxRetryDelayMs);
  }

  /**
   * Enqueue a new task.
   */
  async function enqueueViaClient<T>(
    client: Pick<PoolClient, 'query'>,
    type: string,
    payload: T,
    options: EnqueueOptions = {},
  ): Promise<Task<T>> {
    const startedAt = Date.now();
    const id = generateTaskId();
    const processAfter = options.delayMs ? new Date(Date.now() + options.delayMs) : new Date();
    const dedupeKey = options.dedupeKey ?? null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await client.query<TaskRow>(
          `
          INSERT INTO task_queue (
            id, type, payload, status, priority, attempts, max_attempts, dedupe_key,
            process_after, worker_id, started_at, heartbeat_at, lease_until,
            created_at, updated_at, completed_at, last_error
          )
          VALUES (
            $1, $2, $3, 'pending', $4, 0, $5, $6, $7, NULL, NULL, NULL, NULL, NOW(), NOW(), NULL, NULL
          )
          RETURNING *
          `,
          [
            id,
            type,
            JSON.stringify(payload),
            options.priority ?? 0,
            options.maxAttempts ?? defaultMaxAttempts,
            dedupeKey,
            processAfter,
          ],
        );

        const row = result.rows[0];
        if (!row) {
          throw new Error(`Failed to insert task ${id}`);
        }

        recordQueueMetric({
          serviceName: 'server-compatibility-seam',
          queueKind: 'task',
          operation: 'enqueue',
          latencyMs: Date.now() - startedAt,
          success: true,
        });

        return rowToTask<T>(row);
      } catch (error) {
        if (!(dedupeKey && isUniqueViolation(error))) {
          recordQueueMetric({
            serviceName: 'server-compatibility-seam',
            queueKind: 'task',
            operation: 'enqueue',
            latencyMs: Date.now() - startedAt,
            success: false,
          });
          throw error;
        }

        const existing = await findActiveTaskByDedupeKeyWithClient<T>(client, type, dedupeKey);
        if (existing) {
          return existing;
        }

        if (attempt === 1) {
          throw new Error(
            `Task enqueue for type "${type}" with dedupeKey "${dedupeKey}" conflicted without an active task`,
          );
        }
      }
    }

    throw new Error(`Failed to enqueue task ${id}`);
  }

  async function enqueue<T>(
    type: string,
    payload: T,
    options: EnqueueOptions = {},
  ): Promise<Task<T>> {
    return enqueueViaClient(pool, type, payload, options);
  }

  async function findActiveTaskByDedupeKeyWithClient<T>(
    client: Pick<PoolClient, 'query'>,
    type: string,
    dedupeKey: string,
  ): Promise<Task<T> | null> {
    // Concurrent dedupe depends on the database partial unique index for
    // (type, dedupe_key) WHERE status IN ('pending', 'running'). When that
    // index rejects a competing insert, we read back the surviving active task.
    const result = await client.query<TaskRow>(
      `
      SELECT * FROM task_queue
      WHERE type = $1
        AND dedupe_key = $2
        AND status IN ('pending', 'running')
      ORDER BY created_at ASC
      LIMIT 1
      `,
      [type, dedupeKey],
    );

    const row = result.rows[0];
    return row ? rowToTask<T>(row) : null;
  }

  /**
   * Dequeue the next pending task for a given type (with SKIP LOCKED).
   */
  async function dequeue<T>(type: string, options: DequeueOptions = {}): Promise<Task<T> | null> {
    const startedAt = Date.now();
    const workerId = options.workerId ?? `worker_${process.pid}`;
    await reclaimExpiredLeases(type);

    // Use SKIP LOCKED for safe concurrent processing
    const result = await pool.query<TaskRow>(
      `
      UPDATE task_queue
      SET status = 'running',
          attempts = attempts + 1,
          worker_id = $2,
          started_at = COALESCE(started_at, NOW()),
          heartbeat_at = NOW(),
          lease_until = NOW() + ($3 * INTERVAL '1 millisecond'),
          updated_at = NOW()
      WHERE id = (
        SELECT id FROM task_queue
        WHERE type = $1
          AND status = 'pending'
          AND process_after <= NOW()
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
      `,
      [type, workerId, leaseDurationMs],
    );

    if (result.rows.length === 0) {
      recordQueueMetric({
        serviceName: 'server-compatibility-seam',
        queueKind: 'task',
        operation: 'claim',
        latencyMs: Date.now() - startedAt,
        success: true,
      });
      return null;
    }

    const row = result.rows[0];
    if (!row) return null;

    recordQueueMetric({
      serviceName: 'server-compatibility-seam',
      queueKind: 'task',
      operation: 'claim',
      latencyMs: Date.now() - startedAt,
      success: true,
    });

    return rowToTask(row);
  }

  /**
   * Mark task as completed.
   */
  async function complete(taskId: string): Promise<void> {
    const startedAt = Date.now();
    await db
      .update(taskQueue)
      .set({
        status: 'completed',
        workerId: null,
        startedAt: null,
        heartbeatAt: null,
        leaseUntil: null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(taskQueue.id, taskId));
    recordQueueMetric({
      serviceName: 'server-compatibility-seam',
      queueKind: 'task',
      operation: 'complete',
      latencyMs: Date.now() - startedAt,
      success: true,
    });
  }

  /**
   * Mark task as failed and schedule retry or dead letter.
   */
  async function fail(taskId: string, error: string): Promise<void> {
    const startedAt = Date.now();
    const result = await pool.query<Pick<TaskRow, 'attempts' | 'max_attempts' | 'status'>>(
      'SELECT attempts, max_attempts, status FROM task_queue WHERE id = $1',
      [taskId],
    );

    const row = result.rows[0];
    if (!row) return;

    const newAttempts = row.status === 'running' ? row.attempts : row.attempts + 1;
    const isDead = newAttempts >= row.max_attempts;

    if (isDead) {
      await db
        .update(taskQueue)
        .set({
          status: 'dead',
          attempts: newAttempts,
          lastError: error,
          workerId: null,
          heartbeatAt: null,
          leaseUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(taskQueue.id, taskId));
    } else {
      const processAfter = new Date(Date.now() + calculateBackoff(newAttempts));
      await db
        .update(taskQueue)
        .set({
          status: 'pending',
          attempts: newAttempts,
          lastError: error,
          processAfter,
          workerId: null,
          heartbeatAt: null,
          leaseUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(taskQueue.id, taskId));
    }
    recordQueueMetric({
      serviceName: 'server-compatibility-seam',
      queueKind: 'task',
      operation: 'fail',
      latencyMs: Date.now() - startedAt,
      success: true,
    });
  }

  /**
   * Get pending task count for a type.
   */
  async function getPendingCount(type: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      'SELECT COUNT(*) FROM task_queue WHERE type = $1 AND status IN ($2, $3)',
      [type, 'pending', 'running'],
    );
    return Number.parseInt(result.rows[0]?.count ?? '0', 10);
  }

  /**
   * Get dead letter tasks for inspection.
   */
  async function getDeadTasks(limit = 100): Promise<Task[]> {
    const result = await pool.query<TaskRow>(
      'SELECT * FROM task_queue WHERE status = $1 ORDER BY created_at DESC LIMIT $2',
      ['dead', limit],
    );
    return result.rows.map(rowToTask);
  }

  /**
   * Requeue a dead task for retry.
   */
  async function requeue(taskId: string): Promise<void> {
    const taskResult = await pool.query<TaskRow>('SELECT * FROM task_queue WHERE id = $1 LIMIT 1', [
      taskId,
    ]);
    const task = taskResult.rows[0];
    if (!task || task.status !== 'dead') {
      return;
    }

    if (task.dedupe_key) {
      const activeSibling = await pool.query<Pick<TaskRow, 'id'>>(
        `
        SELECT id FROM task_queue
        WHERE type = $1
          AND dedupe_key = $2
          AND status IN ('pending', 'running')
          AND id <> $3
        LIMIT 1
        `,
        [task.type, task.dedupe_key, taskId],
      );

      if (activeSibling.rows[0]) {
        return;
      }
    }

    await db
      .update(taskQueue)
      .set({
        status: 'pending',
        attempts: 0,
        lastError: null,
        processAfter: new Date(),
        workerId: null,
        startedAt: null,
        heartbeatAt: null,
        leaseUntil: null,
        updatedAt: new Date(),
      })
      .where(and(eq(taskQueue.id, taskId), eq(taskQueue.status, 'dead')));
  }

  async function heartbeat(taskId: string, workerId: string): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE task_queue
      SET heartbeat_at = NOW(),
          lease_until = NOW() + ($3 * INTERVAL '1 millisecond'),
          updated_at = NOW()
      WHERE id = $1
        AND worker_id = $2
        AND status = 'running'
      `,
      [taskId, workerId, leaseDurationMs],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async function reclaimExpiredLeases(type?: string): Promise<number> {
    const params: unknown[] = [];
    let typeClause = '';
    if (type) {
      params.push(type);
      typeClause = ` AND type = $${params.length}`;
    }

    const result = await pool.query(
      `
      UPDATE task_queue
      SET status = 'pending',
          worker_id = NULL,
          heartbeat_at = NULL,
          lease_until = NULL,
          process_after = NOW(),
          updated_at = NOW()
      WHERE status = 'running'
        AND lease_until IS NOT NULL
        AND lease_until < NOW()
        ${typeClause}
      `,
      params,
    );
    const count = result.rowCount ?? 0;
    if (count > 0) {
      reclaimCount += count;
      recordRuntimeReclaim('task-queue', count);
    }
    return count;
  }

  async function getStatusSnapshot(
    type?: string,
    deadLetterLimit = 10,
  ): Promise<TaskQueueStatusSnapshot> {
    const params: unknown[] = [];
    const whereClauses: string[] = [];
    if (type) {
      params.push(type);
      whereClauses.push(`type = $${params.length}`);
    }
    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const summaryResult = await pool.query<{
      pending: string;
      running: string;
      dead: string;
      stale_running: string;
      backlog_oldest_age_seconds: string | null;
      running_oldest_age_seconds: string | null;
      dead_oldest_age_seconds: string | null;
    }>(
      `
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'running') AS running,
        COUNT(*) FILTER (WHERE status = 'dead') AS dead,
        COUNT(*) FILTER (WHERE status = 'running' AND lease_until IS NOT NULL AND lease_until < NOW()) AS stale_running,
        MAX(FLOOR(EXTRACT(EPOCH FROM (NOW() - created_at)))) FILTER (WHERE status = 'pending')::text AS backlog_oldest_age_seconds,
        MAX(FLOOR(EXTRACT(EPOCH FROM (NOW() - started_at)))) FILTER (WHERE status = 'running' AND started_at IS NOT NULL)::text AS running_oldest_age_seconds,
        MAX(FLOOR(EXTRACT(EPOCH FROM (NOW() - updated_at)))) FILTER (WHERE status = 'dead')::text AS dead_oldest_age_seconds
      FROM task_queue
      ${where}
      `,
      params,
    );

    const deadParams = [...params, deadLetterLimit];
    const deadWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(' AND ')}` : '';
    const deadResult = await pool.query<TaskRow>(
      `
      SELECT *,
        FLOOR(EXTRACT(EPOCH FROM (NOW() - created_at)))::int AS age_seconds
      FROM task_queue
      WHERE status = 'dead'
        ${deadWhere}
      ORDER BY updated_at DESC
      LIMIT $${deadParams.length}
      `,
      deadParams,
    );

    const summary = summaryResult.rows[0];
    return {
      pending: Number(summary?.pending ?? 0),
      running: Number(summary?.running ?? 0),
      dead: Number(summary?.dead ?? 0),
      staleRunning: Number(summary?.stale_running ?? 0),
      backlogOldestAgeSeconds: parseNullableInt(summary?.backlog_oldest_age_seconds),
      runningOldestAgeSeconds: parseNullableInt(summary?.running_oldest_age_seconds),
      deadOldestAgeSeconds: parseNullableInt(summary?.dead_oldest_age_seconds),
      reclaimCount,
      recentDeadLetters: deadResult.rows.map((row) => rowToTask(row)),
    };
  }

  /**
   * Clean up completed tasks older than retention period.
   */
  async function cleanup(retentionDays = 7): Promise<number> {
    const result = await pool.query(
      `DELETE FROM task_queue
       WHERE status = 'completed'
         AND completed_at < NOW() - INTERVAL '${retentionDays} days'
       RETURNING id`,
    );
    return result.rowCount ?? 0;
  }

  return {
    enqueue,
    enqueueTx: enqueueViaClient,
    dequeue,
    complete,
    fail,
    heartbeat,
    reclaimExpiredLeases,
    getStatusSnapshot,
    getPendingCount,
    getDeadTasks,
    requeue,
    cleanup,
  };
}

export type TaskWorkerConfig = ContractTaskWorkerConfig<Pool>;

export function createTaskWorker(config: TaskWorkerConfig) {
  return createTaskWorkerFromQueue(config, (pool) => createTaskQueue({ pool }));
}

// =============================================================================
// Helpers
// =============================================================================

interface TaskRow {
  id: string;
  type: string;
  payload: string;
  status: string;
  priority: number;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  dedupe_key: string | null;
  process_after: Date;
  worker_id: string | null;
  started_at: Date | null;
  heartbeat_at: Date | null;
  lease_until: Date | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

function rowToTask<T>(row: TaskRow): Task<T> {
  return {
    id: row.id,
    type: row.type,
    payload: JSON.parse(row.payload) as T,
    status: row.status as TaskStatus,
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error,
    dedupeKey: row.dedupe_key,
    processAfter: row.process_after,
    workerId: row.worker_id,
    startedAt: row.started_at,
    heartbeatAt: row.heartbeat_at,
    leaseUntil: row.lease_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function parseNullableInt(value: string | null | undefined): number | null {
  if (value == null) return null;
  return Number.parseInt(value, 10);
}
