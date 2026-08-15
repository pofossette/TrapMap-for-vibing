/**
 * Job-runtime bounded context — queue / outbox / worker policy rules.
 *
 * Pure retry / reclaim / status-decision rules with zero framework, DB or
 * I/O imports. The service infrastructure renders these rules into SQL
 * statements and worker loops; the owner SQL-condition rendering lives in
 * `service-job-runtime`.
 */

// ---------------------------------------------------------------------------
// Status vocabulary
// ---------------------------------------------------------------------------

export const TASK_STATUS_PENDING = 'pending' as const;
export const TASK_STATUS_RUNNING = 'running' as const;
export const TASK_STATUS_COMPLETED = 'completed' as const;
export const TASK_STATUS_DEAD = 'dead' as const;

export const OUTBOX_STATUS_PENDING = 'pending' as const;
export const OUTBOX_STATUS_PROCESSING = 'processing' as const;
export const OUTBOX_STATUS_COMPLETED = 'completed' as const;
export const OUTBOX_STATUS_FAILED = 'failed' as const;

// ---------------------------------------------------------------------------
// Retry / lease policy
// ---------------------------------------------------------------------------

/** Default scheduling priority for tasks enqueued without an explicit one. */
export const TASK_DEFAULT_PRIORITY = 0;

/** Default maximum processing attempts before a task is considered dead. */
export const TASK_DEFAULT_MAX_ATTEMPTS = 3;

/** Processing lease duration granted to a worker that claims a task/event. */
export const TASK_LEASE_MS = 30_000;
export const OUTBOX_LEASE_MS = 30_000;

/** Base exponential-retry delay (ms) applied after the first failure. */
export const TASK_RETRY_BASE_DELAY_MS = 5_000;

/** Maximum attempts before an outbox event is marked failed. */
export const OUTBOX_MAX_ATTEMPTS = 3;

/** Worker constants: default claim batch size and poll interval. */
export const OUTBOX_CLAIM_BATCH_SIZE = 10;
export const OUTBOX_POLL_INTERVAL_MS = 2_000;

/** Whether a task has exhausted its retry budget (`attempts >= maxAttempts`). */
export function isRetryExhausted(attempts: number, maxAttempts: number): boolean {
  return attempts >= maxAttempts;
}

/** Exponential backoff delay (ms) before retrying after the given attempt. */
export function retryBackoffMs(attempts: number): number {
  return TASK_RETRY_BASE_DELAY_MS * 2 ** (attempts - 1);
}

/** Status a task transitions to after a failed attempt (dead vs pending retry). */
export function statusAfterTaskFailure(
  attempts: number,
  maxAttempts: number,
): typeof TASK_STATUS_DEAD | typeof TASK_STATUS_PENDING {
  return isRetryExhausted(attempts, maxAttempts) ? TASK_STATUS_DEAD : TASK_STATUS_PENDING;
}
