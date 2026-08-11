/**
 * Job-runtime bounded context — queue / outbox / worker policy rules.
 *
 * Pure retry / reclaim / status-decision rules with zero framework, DB or
 * I/O imports. The service infrastructure renders these rules into SQL
 * statements and worker loops; the SQL-condition constants below are the
 * authoritative rendering of the same decisions (same pattern as
 * `KNOWLEDGE_PROJECTION_OPERATION_CONDITIONS` in knowledge-write).
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

/**
 * Policy for outbox events without a registered handler: they are treated
 * as already handled and acknowledged (completed) rather than retried.
 */
export function unhandledEventIsAcknowledged(hasHandler: boolean): boolean {
  return !hasHandler;
}

// ---------------------------------------------------------------------------
// Authoritative SQL condition rendering (consumed by the queue/outbox owners)
// ---------------------------------------------------------------------------

/** Dedupe lookup targets: only in-flight tasks are considered duplicates. */
export const TASK_DEDUPE_TARGET_STATUSES = [TASK_STATUS_PENDING, TASK_STATUS_RUNNING] as const;

export const TASK_DEDUPE_SQL_CONDITION = `status IN (${TASK_DEDUPE_TARGET_STATUSES.map(
  (status) => `'${status}'`,
).join(', ')})`;

/** Tasks eligible for claim: pending and past their scheduled process time. */
export const TASK_CLAIMABLE_SQL_CONDITION = `status = '${TASK_STATUS_PENDING}' AND process_after <= NOW()`;

/** Tasks whose worker lease expired are reclaimed back to pending. */
export const TASK_RECLAIM_SQL_CONDITION = `status = '${TASK_STATUS_RUNNING}' AND lease_until < NOW()`;

/** Only dead tasks can be requeued for a fresh run. */
export const TASK_REQUEUE_SQL_CONDITION = `status = '${TASK_STATUS_DEAD}'`;

/** Outbox events eligible for claim: pending and past their availability time. */
export const OUTBOX_CLAIMABLE_SQL_CONDITION = `status = '${OUTBOX_STATUS_PENDING}' AND available_at <= NOW()`;

/** Outbox events whose worker lease expired are reclaimed back to pending. */
export const OUTBOX_RECLAIM_SQL_CONDITION = `status = '${OUTBOX_STATUS_PROCESSING}' AND lease_until < NOW()`;

/** Outbox fail transition: terminal after the retry budget, pending otherwise. */
export const OUTBOX_FAIL_STATUS_SQL = `CASE WHEN attempts >= ${OUTBOX_MAX_ATTEMPTS} THEN '${OUTBOX_STATUS_FAILED}' ELSE '${OUTBOX_STATUS_PENDING}' END`;
