/**
 * PostgreSQL schema definition for the task queue table.
 *
 * Extracted from task-queue.ts for separation of concerns.
 */

export { taskQueue } from '@trapmap/persistence-schema';

// =============================================================================
// Schema Definition
// =============================================================================

/**
 * Task queue table using PostgreSQL SKIP LOCKED for concurrent processing.
 */

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
  workerId: string | null;
  startedAt: Date | null;
  heartbeatAt: Date | null;
  leaseUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface TaskQueueConfig {
  pool: import('pg').Pool;
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

interface LeaseSnapshot {
  workerId: string | null;
  startedAt: string | null;
  heartbeatAt: string | null;
  leaseUntil: string | null;
}

export interface DequeueOptions {
  workerId?: string;
}

export interface TaskQueueStatusSnapshot {
  pending: number;
  running: number;
  dead: number;
  staleRunning: number;
  backlogOldestAgeSeconds: number | null;
  runningOldestAgeSeconds: number | null;
  deadOldestAgeSeconds: number | null;
  reclaimCount: number;
  recentDeadLetters: Task[];
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
// Helpers
// =============================================================================

export interface TaskRow {
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

export function rowToTask<T>(row: TaskRow): Task<T> {
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

export function isUniqueViolation(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export function parseNullableInt(value: string | null | undefined): number | null {
  if (value == null) return null;
  return Number.parseInt(value, 10);
}
