import { describe, expect, it } from 'vitest';

import {
  isRetryExhausted,
  OUTBOX_CLAIM_BATCH_SIZE,
  OUTBOX_LEASE_MS,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_POLL_INTERVAL_MS,
  OUTBOX_STATUS_COMPLETED,
  OUTBOX_STATUS_FAILED,
  OUTBOX_STATUS_PENDING,
  OUTBOX_STATUS_PROCESSING,
  retryBackoffMs,
  statusAfterTaskFailure,
  TASK_DEFAULT_MAX_ATTEMPTS,
  TASK_DEFAULT_PRIORITY,
  TASK_LEASE_MS,
  TASK_RETRY_BASE_DELAY_MS,
  TASK_STATUS_COMPLETED,
  TASK_STATUS_DEAD,
  TASK_STATUS_PENDING,
  TASK_STATUS_RUNNING,
} from '../../../src/job-runtime/domain/index.js';

describe('job-runtime queue policy', () => {
  it('exhausts the retry budget when attempts reach the maximum', () => {
    expect(isRetryExhausted(0, 3)).toBe(false);
    expect(isRetryExhausted(2, 3)).toBe(false);
    expect(isRetryExhausted(3, 3)).toBe(true);
    expect(isRetryExhausted(4, 3)).toBe(true);
  });

  it('applies exponential backoff from the base delay', () => {
    expect(TASK_RETRY_BASE_DELAY_MS).toBe(5000);
    expect(retryBackoffMs(1)).toBe(5000);
    expect(retryBackoffMs(2)).toBe(10_000);
    expect(retryBackoffMs(3)).toBe(20_000);
  });

  it('marks a task dead on terminal failure and pending for retry otherwise', () => {
    expect(statusAfterTaskFailure(3, 3)).toBe(TASK_STATUS_DEAD);
    expect(statusAfterTaskFailure(2, 3)).toBe(TASK_STATUS_PENDING);
    expect(statusAfterTaskFailure(0, TASK_DEFAULT_MAX_ATTEMPTS)).toBe(TASK_STATUS_PENDING);
  });

  it('defaults task enqueue to zero priority and three attempts', () => {
    expect(TASK_DEFAULT_PRIORITY).toBe(0);
    expect(TASK_DEFAULT_MAX_ATTEMPTS).toBe(3);
  });

  it('grants a 30 second processing lease to tasks and outbox events', () => {
    expect(TASK_LEASE_MS).toBe(30_000);
    expect(OUTBOX_LEASE_MS).toBe(30_000);
  });

  it('fails outbox events only after the retry budget is spent', () => {
    expect(OUTBOX_MAX_ATTEMPTS).toBe(3);
    expect(OUTBOX_STATUS_PENDING).toBe('pending');
    expect(OUTBOX_STATUS_PROCESSING).toBe('processing');
    expect(OUTBOX_STATUS_COMPLETED).toBe('completed');
    expect(OUTBOX_STATUS_FAILED).toBe('failed');
    expect(TASK_STATUS_PENDING).toBe('pending');
    expect(TASK_STATUS_RUNNING).toBe('running');
    expect(TASK_STATUS_COMPLETED).toBe('completed');
    expect(TASK_STATUS_DEAD).toBe('dead');
  });

  it('configures the outbox worker with a batch of ten and a two second poll', () => {
    expect(OUTBOX_CLAIM_BATCH_SIZE).toBe(10);
    expect(OUTBOX_POLL_INTERVAL_MS).toBe(2000);
  });
});
