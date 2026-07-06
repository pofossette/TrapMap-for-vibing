import { describe, expect, it, vi } from 'vitest';

import { getRuntimeMetricsSnapshot, resetRuntimeMetrics } from './metrics.js';
import { executeWithResilience } from './resilience-v2.js';

function makePolicy(
  dependencyName: string,
  overrides: Partial<{
    timeoutMs: number;
    maxAttempts: number;
    backoffMs: (attempt: number) => number;
    failureMode: 'fail-open' | 'fail-closed';
    circuitBreaker: {
      failureThreshold?: number;
      halfOpenAfterMs?: number;
    };
  }> = {},
) {
  return {
    dependencyName,
    timeoutMs: 20,
    maxAttempts: 2,
    backoffMs: () => 0,
    failureMode: 'fail-closed' as const,
    ...overrides,
  };
}

describe('executeWithResilience (cockatiel)', () => {
  it('returns successful values without degradation', async () => {
    resetRuntimeMetrics();

    const result = await executeWithResilience({
      policy: makePolicy('resilience-v2-success'),
      operation: async () => 'ok',
    });

    expect(result).toMatchObject({
      ok: true,
      degraded: false,
      value: 'ok',
      attempts: 1,
    });
    expect(getRuntimeMetricsSnapshot().totals).toMatchObject({
      executions: 1,
      retries: 0,
      permanentFailures: 0,
    });
  });

  it('retries retryable errors and eventually succeeds', async () => {
    resetRuntimeMetrics();
    let attempts = 0;

    const result = await executeWithResilience({
      policy: makePolicy('resilience-v2-retry'),
      operation: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('temporary dependency failure');
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
    expect(attempts).toBe(2);
    expect(getRuntimeMetricsSnapshot().totals).toMatchObject({
      executions: 1,
      retries: 1,
    });
  });

  it('aborts the underlying operation when timeout is reached', async () => {
    resetRuntimeMetrics();
    const abortSpy = vi.fn();

    const result = await executeWithResilience({
      policy: makePolicy('resilience-v2-timeout', {
        timeoutMs: 5,
        maxAttempts: 1,
      }),
      operation: async (signal) =>
        await new Promise<string>((_resolve, reject) => {
          if (!signal) {
            reject(new Error('expected signal'));
            return;
          }

          signal.addEventListener(
            'abort',
            () => {
              abortSpy();
              reject(new Error('aborted by timeout'));
            },
            { once: true },
          );
        }),
      isRetryableError: () => false,
    });

    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe('timeout');
    expect(result.failureClassification).toBe('timeout');
    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(getRuntimeMetricsSnapshot().totals).toMatchObject({
      executions: 1,
      timeouts: 1,
      retries: 0,
    });
  });

  it('returns the fallback value in fail-open mode', async () => {
    resetRuntimeMetrics();

    const result = await executeWithResilience({
      policy: makePolicy('resilience-v2-fail-open', {
        failureMode: 'fail-open',
      }),
      operation: async () => {
        throw new Error('temporary dependency failure');
      },
      fallbackValue: 'fallback',
    });

    expect(result).toMatchObject({
      ok: true,
      degraded: true,
      value: 'fallback',
      failureClassification: 'permanent-failure',
    });
    expect(getRuntimeMetricsSnapshot().totals).toMatchObject({
      executions: 1,
      degraded: 1,
      retries: 1,
      permanentFailures: 1,
    });
  });

  it('fails closed on non-retryable errors', async () => {
    resetRuntimeMetrics();

    const result = await executeWithResilience({
      policy: makePolicy('resilience-v2-final-failure', {
        maxAttempts: 3,
      }),
      operation: async () => {
        throw new Error('permanent failure');
      },
      isRetryableError: () => false,
    });

    expect(result).toMatchObject({
      ok: false,
      degraded: false,
      failureKind: 'permanent',
      failureClassification: 'permanent-failure',
      attempts: 1,
    });
    expect(getRuntimeMetricsSnapshot().totals).toMatchObject({
      executions: 1,
      retries: 0,
      permanentFailures: 1,
    });
  });

  it('opens the circuit breaker after configured failures and fails fast on the next call', async () => {
    resetRuntimeMetrics();
    const policy = makePolicy('resilience-v2-circuit-breaker', {
      maxAttempts: 1,
      circuitBreaker: {
        failureThreshold: 1,
        halfOpenAfterMs: 50,
      },
    });
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('temporary dependency failure'))
      .mockResolvedValueOnce('should not execute');

    const first = await executeWithResilience({
      policy,
      operation,
      isRetryableError: () => false,
    });
    const second = await executeWithResilience({
      policy,
      operation,
      isRetryableError: () => false,
    });

    expect(first.ok).toBe(false);
    expect(second).toMatchObject({
      ok: false,
      degraded: false,
      failureKind: 'permanent',
      failureClassification: 'permanent-failure',
    });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(getRuntimeMetricsSnapshot().totals).toMatchObject({
      executions: 2,
      permanentFailures: 2,
    });
  });
});
