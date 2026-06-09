import { describe, expect, it, vi } from 'vitest';

import { getRuntimeMetricsSnapshot, resetRuntimeMetrics } from './metrics.js';
import { executeWithResilience } from './resilience.js';

const immediatePolicy = {
  dependencyName: 'test-dependency',
  timeoutMs: 20,
  maxAttempts: 2,
  backoffMs: () => 0,
} as const;

describe('executeWithResilience', () => {
  it('returns fallback result in fail-open mode', async () => {
    resetRuntimeMetrics();

    const result = await executeWithResilience({
      policy: {
        ...immediatePolicy,
        failureMode: 'fail-open',
      },
      operation: async () => {
        throw new Error('temporary failure');
      },
      fallbackValue: 'fallback',
    });

    expect(result).toMatchObject({
      ok: true,
      degraded: true,
      value: 'fallback',
    });
  });

  it('retries then succeeds', async () => {
    resetRuntimeMetrics();
    let attempts = 0;

    const result = await executeWithResilience({
      policy: {
        ...immediatePolicy,
        failureMode: 'fail-closed',
      },
      operation: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('temporary failure');
        }
        return 'ok';
      },
    });

    expect(result).toMatchObject({
      ok: true,
      degraded: false,
      value: 'ok',
      attempts: 2,
    });
    expect(getRuntimeMetricsSnapshot().totals.retries).toBe(1);
  });

  it('fails closed after retry exhaustion', async () => {
    resetRuntimeMetrics();

    const result = await executeWithResilience({
      policy: {
        ...immediatePolicy,
        failureMode: 'fail-closed',
      },
      operation: async () => {
        throw new Error('permanent failure');
      },
      isRetryableError: () => false,
    });

    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe('permanent');
  });

  it('classifies timeout failures', async () => {
    resetRuntimeMetrics();

    const result = await executeWithResilience({
      policy: {
        ...immediatePolicy,
        failureMode: 'fail-closed',
        timeoutMs: 1,
      },
      operation: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'late';
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe('timeout');
  });

  it('logs retries and failures when logger is provided', async () => {
    resetRuntimeMetrics();
    const warn = vi.fn();
    const error = vi.fn();

    await executeWithResilience({
      policy: {
        ...immediatePolicy,
        failureMode: 'fail-closed',
      },
      context: {
        logger: { warn, error },
        requestId: 'req_1',
      },
      operation: async () => {
        throw new Error('temporary failure');
      },
      isRetryableError: (err) => err instanceof Error && err.message.includes('temporary'),
    });

    expect(warn).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });
});
