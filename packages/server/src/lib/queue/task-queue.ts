/**
 * PostgreSQL-based task queue for reliable async processing.
 *
 * Uses SKIP LOCKED for concurrent worker safety without additional infrastructure.
 * Supports retry with exponential backoff, dead letter queue, and task priorities.
 *
 * Phase: Replace setTimeout-based retry with persistent queue
 */

import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { Pool } from 'pg';

// =============================================================================
// Schema Definition
// =============================================================================

/**
 * Task queue table using PostgreSQL SKIP LOCKED for concurrent processing.
 */
export const taskQueue = pgTable(
  'task_queue',
  {
    id: text('id').primaryKey(),
    /** Task type for routing to handlers */
    type: text('type').notNull(),
    /** JSON payload for the task */
    payload: text('payload').notNull(),
    /** Current status */
    status: text('status').notNull().default('pending'), // pending | running | completed | failed | dead
    /** Priority (higher = more urgent) */
    priority: integer('priority').notNull().default(0),
    /** Number of retry attempts */
    attempts: integer('attempts').notNull().default(0),
    /** Maximum retry attempts before dead letter */
    maxAttempts: integer('max_attempts').notNull().default(3),
    /** Last error message */
    lastError: text('last_error'),
    /** Opaque key for idempotent enqueue — prevents duplicate (type, key) pairs */
    dedupeKey: text('dedupe_key'),
    /** When to process next (for delayed retry) */
    processAfter: timestamp('process_after', { withTimezone: true }).notNull().defaultNow(),
    /** When task was created */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** When task was last updated */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** When task was completed */
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [index('task_queue_type_dedupe_idx').on(table.type, table.dedupeKey)],
);

// =============================================================================
// Types
// =============================================================================

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'dead';

export interface Task<T = unknown> {
  id: string;
  type: string;
  payload: T;
  status: TaskStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  dedupeKey: string | null;
  processAfter: Date;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface TaskQueueConfig {
  pool: Pool;
  /** Default max attempts for tasks */
  defaultMaxAttempts?: number;
  /** Base delay for exponential backoff (ms) */
  baseRetryDelayMs?: number;
  /** Maximum delay for retries (ms) */
  maxRetryDelayMs?: number;
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

export interface TaskHandler<T = unknown> {
  /** Handler name for task type */
  type: string;
  /** Process the task, throw on error for retry */
  handle: (task: Task<T>, signal: AbortSignal) => Promise<void>;
  /** Optional: called when task exceeds max attempts */
  onDead?: (task: Task<T>) => Promise<void> | void;
}

// =============================================================================
// Task Queue Implementation
// =============================================================================

const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 5000; // 5 seconds
const MAX_RETRY_DELAY_MS = 300000; // 5 minutes

/**
 * Create a PostgreSQL-backed task queue.
 */
export function createTaskQueue(config: TaskQueueConfig) {
  const {
    pool,
    defaultMaxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseRetryDelayMs = BASE_RETRY_DELAY_MS,
    maxRetryDelayMs = MAX_RETRY_DELAY_MS,
  } = config;

  const db = drizzle(pool, { schema: { taskQueue } });

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
  async function enqueue<T>(
    type: string,
    payload: T,
    options: EnqueueOptions = {},
  ): Promise<Task<T>> {
    const id = generateTaskId();
    const processAfter = options.delayMs ? new Date(Date.now() + options.delayMs) : new Date();

    await db.insert(taskQueue).values({
      id,
      type,
      payload: JSON.stringify(payload),
      status: 'pending',
      priority: options.priority ?? 0,
      attempts: 0,
      maxAttempts: options.maxAttempts ?? defaultMaxAttempts,
      dedupeKey: options.dedupeKey ?? null,
      processAfter,
    });

    return {
      id,
      type,
      payload,
      status: 'pending',
      priority: options.priority ?? 0,
      attempts: 0,
      maxAttempts: options.maxAttempts ?? defaultMaxAttempts,
      lastError: null,
      dedupeKey: options.dedupeKey ?? null,
      processAfter,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
    };
  }

  /**
   * Dequeue the next pending task for a given type (with SKIP LOCKED).
   */
  async function dequeue<T>(type: string): Promise<Task<T> | null> {
    // Use SKIP LOCKED for safe concurrent processing
    const result = await pool.query<TaskRow>(
      `
      UPDATE task_queue
      SET status = 'running', updated_at = NOW()
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
      [type],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    if (!row) return null;

    return rowToTask(row);
  }

  /**
   * Mark task as completed.
   */
  async function complete(taskId: string): Promise<void> {
    await db
      .update(taskQueue)
      .set({
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(taskQueue.id, taskId));
  }

  /**
   * Mark task as failed and schedule retry or dead letter.
   */
  async function fail(taskId: string, error: string): Promise<void> {
    const result = await pool.query<Pick<TaskRow, 'attempts' | 'max_attempts'>>(
      'SELECT attempts, max_attempts FROM task_queue WHERE id = $1',
      [taskId],
    );

    const row = result.rows[0];
    if (!row) return;

    const newAttempts = row.attempts + 1;
    const isDead = newAttempts >= row.max_attempts;

    if (isDead) {
      await db
        .update(taskQueue)
        .set({
          status: 'dead',
          attempts: newAttempts,
          lastError: error,
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
          updatedAt: new Date(),
        })
        .where(eq(taskQueue.id, taskId));
    }
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
    await db
      .update(taskQueue)
      .set({
        status: 'pending',
        attempts: 0,
        lastError: null,
        processAfter: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(taskQueue.id, taskId), eq(taskQueue.status, 'dead')));
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
    dequeue,
    complete,
    fail,
    getPendingCount,
    getDeadTasks,
    requeue,
    cleanup,
  };
}

// =============================================================================
// Worker Implementation
// =============================================================================

export interface TaskWorkerConfig {
  pool: Pool;
  handlers: TaskHandler[];
  /** Polling interval in ms */
  pollIntervalMs?: number;
  /** Maximum concurrent tasks */
  concurrency?: number;
}

/**
 * Create a task worker that processes tasks from the queue.
 */
export function createTaskWorker(config: TaskWorkerConfig) {
  const { pool, handlers, pollIntervalMs = 1000, concurrency = 1 } = config;

  const queue = createTaskQueue({ pool });
  const handlerMap = new Map(handlers.map((h) => [h.type, h]));
  let running = false;
  const activeTasks = new Set<Promise<void>>();
  let runPromise: Promise<void> | null = null;

  async function processOneTask(): Promise<boolean> {
    for (const [type, handler] of handlerMap) {
      const task = await queue.dequeue(type);
      if (task) {
        const controller = new AbortController();
        // Use a wrapper promise to allow self-reference for cleanup
        const taskPromise = new Promise<void>((resolve) => {
          (async () => {
            try {
              await handler.handle(task, controller.signal);
              await queue.complete(task.id);
              resolve();
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              await queue.fail(task.id, errorMessage);

              // Check if dead
              const deadTasks = await queue.getDeadTasks(1);
              const deadTask = deadTasks.find((t) => t.id === task.id);
              if (deadTask && handler.onDead) {
                await handler.onDead(deadTask);
              }
              resolve(); // Resolve even on error (error handled via queue.fail)
            } finally {
              activeTasks.delete(taskPromise);
            }
          })();
        });

        activeTasks.add(taskPromise);
        return true;
      }
    }
    return false;
  }

  async function run(): Promise<void> {
    if (runPromise) {
      return runPromise;
    }

    runPromise = (async () => {
      running = true;

      while (running) {
        // Process tasks up to concurrency limit
        while (activeTasks.size < concurrency) {
          const processed = await processOneTask();
          if (!processed) break;
        }

        // Wait for poll interval or any task to complete
        if (activeTasks.size >= concurrency || !(await processOneTask())) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
      }

      // Wait for all active tasks to complete
      await Promise.all(activeTasks);
    })();

    try {
      await runPromise;
    } finally {
      runPromise = null;
      running = false;
    }
  }

  async function stop(): Promise<void> {
    running = false;
    if (runPromise) {
      await runPromise;
    }
  }

  function isRunning(): boolean {
    return running;
  }

  return { run, stop, isRunning };
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}
