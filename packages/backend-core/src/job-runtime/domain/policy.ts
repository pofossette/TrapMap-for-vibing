/**
 * Job-runtime bounded context — queue / outbox / worker policy rules.
 *
 * Pure retry / reclaim / status-decision rules with zero framework, DB or
 * I/O imports. The service infrastructure renders these rules into SQL
 * statements and worker loops; the owner SQL-condition rendering lives in
 * `service-job-runtime`.
 *
 * 宿主调参表：经 options 注入，不读 env ———
 * 本文件的七个调参常量（TASK_DEFAULT_MAX_ATTEMPTS、TASK_LEASE_MS、
 * OUTBOX_LEASE_MS、TASK_RETRY_BASE_DELAY_MS、OUTBOX_MAX_ATTEMPTS、
 * OUTBOX_CLAIM_BATCH_SIZE、OUTBOX_POLL_INTERVAL_MS）是共享内核的命名
 * 默认值（现状值，行为零变化）。backend-core 绝不直接读 process.env；
 * 宿主如需调参，在调用侧经 options/参数注入覆盖（纯函数均已取参，如
 * isRetryExhausted / retryBackoffMs / statusAfterTaskFailure），由后续
 * host 任务打通 env。
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
