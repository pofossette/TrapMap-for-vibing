import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BreakerRegistry,
  CircuitBreaker,
  CircuitOpenError,
  resolveBreakerCooldownMs,
  resolveBreakerThreshold,
  resolveRetryPolicy,
  withResilience,
} from '../../src/gateway/resilience.js';

describe('resolveRetryPolicy', () => {
  it('defaults to a single attempt (retry disabled)', () => {
    expect(resolveRetryPolicy({})).toEqual({ maxAttempts: 1, baseDelayMs: 100, maxDelayMs: 2000 });
  });

  it('parses valid TRAPMAP_INTERNAL_RETRY_MAX_ATTEMPTS', () => {
    expect(resolveRetryPolicy({ TRAPMAP_INTERNAL_RETRY_MAX_ATTEMPTS: '3' }).maxAttempts).toBe(3);
  });

  it('falls back to 1 for invalid values', () => {
    expect(resolveRetryPolicy({ TRAPMAP_INTERNAL_RETRY_MAX_ATTEMPTS: '0' }).maxAttempts).toBe(1);
    expect(resolveRetryPolicy({ TRAPMAP_INTERNAL_RETRY_MAX_ATTEMPTS: 'abc' }).maxAttempts).toBe(1);
    expect(resolveRetryPolicy({ TRAPMAP_INTERNAL_RETRY_MAX_ATTEMPTS: '-2' }).maxAttempts).toBe(1);
  });
});

describe('resolveBreakerThreshold / resolveBreakerCooldownMs', () => {
  it('defaults threshold=5 cooldown=30000', () => {
    expect(resolveBreakerThreshold({})).toBe(5);
    expect(resolveBreakerCooldownMs({})).toBe(30_000);
  });

  it('parses overrides and rejects invalid ones', () => {
    expect(resolveBreakerThreshold({ TRAPMAP_INTERNAL_BREAKER_THRESHOLD: '2' })).toBe(2);
    expect(resolveBreakerThreshold({ TRAPMAP_INTERNAL_BREAKER_THRESHOLD: 'x' })).toBe(5);
    expect(resolveBreakerCooldownMs({ TRAPMAP_INTERNAL_BREAKER_COOLDOWN_MS: '1000' })).toBe(1000);
    expect(resolveBreakerCooldownMs({ TRAPMAP_INTERNAL_BREAKER_COOLDOWN_MS: '-5' })).toBe(30_000);
  });
});

describe('CircuitBreaker', () => {
  it('opens after threshold consecutive failures', () => {
    let t = 0;
    const breaker = new CircuitBreaker({ threshold: 3, cooldownMs: 1000, now: () => t });
    expect(breaker.state).toBe('closed');
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.state).toBe('closed');
    breaker.recordFailure();
    expect(breaker.state).toBe('open');
    expect(breaker.canAttempt()).toBe(false);
  });

  it('transitions open → half-open after cooldown, success closes', () => {
    let t = 0;
    const breaker = new CircuitBreaker({ threshold: 1, cooldownMs: 500, now: () => t });
    breaker.recordFailure();
    expect(breaker.state).toBe('open');
    t = 499;
    expect(breaker.state).toBe('open');
    t = 500;
    expect(breaker.state).toBe('half-open');
    expect(breaker.canAttempt()).toBe(true);
    breaker.recordSuccess();
    expect(breaker.state).toBe('closed');
    expect(breaker.canAttempt()).toBe(true);
  });

  it('half-open failure re-opens the circuit', () => {
    let t = 0;
    const breaker = new CircuitBreaker({ threshold: 1, cooldownMs: 100, now: () => t });
    breaker.recordFailure();
    t = 100;
    expect(breaker.state).toBe('half-open');
    breaker.recordFailure();
    expect(breaker.state).toBe('open');
    // A fresh failure while open (before cooldown) keeps it open
    t = 150;
    breaker.recordFailure();
    expect(breaker.state).toBe('open');
  });

  it('success resets the consecutive-failure counter', () => {
    const breaker = new CircuitBreaker({ threshold: 3, cooldownMs: 10, now: () => 0 });
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.state).toBe('closed');
    breaker.recordFailure();
    expect(breaker.state).toBe('open');
  });
});

describe('BreakerRegistry', () => {
  it('returns the same breaker per key', () => {
    const registry = new BreakerRegistry({ threshold: 2, cooldownMs: 10 });
    const a1 = registry.for('http://a');
    const a2 = registry.for('http://a');
    const b = registry.for('http://b');
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });

  it('records failures independently per key', () => {
    const registry = new BreakerRegistry({ threshold: 1, cooldownMs: 10, now: () => 0 });
    registry.for('http://a').recordFailure();
    expect(registry.for('http://a').canAttempt()).toBe(false);
    expect(registry.for('http://b').canAttempt()).toBe(true);
  });
});

describe('withResilience', () => {
  function makeSleep() {
    const delays: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      delays.push(ms);
    });
    return { sleep, delays };
  }

  it('returns immediately when maxAttempts=1 even for retryable errors', async () => {
    const breaker = new CircuitBreaker({ threshold: 5, cooldownMs: 10, now: () => 0 });
    const { sleep } = makeSleep();
    let calls = 0;
    await expect(
      withResilience(
        { retry: resolveRetryPolicy({}), breaker, retryable: () => true, sleep },
        async () => {
          calls += 1;
          throw new Error('boom');
        },
      ),
    ).rejects.toThrow('boom');
    expect(calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(breaker.state).toBe('closed'); // 1 < threshold 5
  });

  it('retries transient failures up to maxAttempts then succeeds', async () => {
    const breaker = new CircuitBreaker({ threshold: 5, cooldownMs: 10, now: () => 0 });
    const { sleep, delays } = makeSleep();
    let calls = 0;
    const result = await withResilience(
      {
        retry: { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 2000 },
        breaker,
        retryable: () => true,
        sleep,
      },
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('transient');
        return 'ok';
      },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
    expect(delays.length).toBe(2);
    // full jitter: 0 <= delay <= min(base * 2^attempt, max)
    expect(delays[0]).toBeGreaterThanOrEqual(0);
    expect(delays[0]).toBeLessThanOrEqual(100);
    expect(delays[1]).toBeGreaterThanOrEqual(0);
    expect(delays[1]).toBeLessThanOrEqual(200);
  });

  it('stops early on non-retryable errors', async () => {
    const breaker = new CircuitBreaker({ threshold: 5, cooldownMs: 10, now: () => 0 });
    const { sleep } = makeSleep();
    let calls = 0;
    await expect(
      withResilience(
        {
          retry: { maxAttempts: 4, baseDelayMs: 10, maxDelayMs: 20 },
          breaker,
          retryable: () => false,
          sleep,
        },
        async () => {
          calls += 1;
          throw new Error('permanent');
        },
      ),
    ).rejects.toThrow('permanent');
    expect(calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('short-circuits with CircuitOpenError without invoking fn when breaker is open', async () => {
    const breaker = new CircuitBreaker({ threshold: 1, cooldownMs: 10_000, now: () => 0 });
    breaker.recordFailure(); // opens
    const { sleep } = makeSleep();
    let calls = 0;
    await expect(
      withResilience(
        {
          retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
          breaker,
          retryable: () => true,
          sleep,
        },
        async () => {
          calls += 1;
          return 'nope';
        },
      ),
    ).rejects.toBeInstanceOf(CircuitOpenError);
    expect(calls).toBe(0);
  });

  it('jitter cap respects maxDelayMs', async () => {
    const breaker = new CircuitBreaker({ threshold: 100, cooldownMs: 1, now: () => 0 });
    const { sleep, delays } = makeSleep();
    let calls = 0;
    await withResilience(
      {
        retry: { maxAttempts: 4, baseDelayMs: 800, maxDelayMs: 900 },
        breaker,
        retryable: () => true,
        sleep,
      },
      async () => {
        calls += 1;
        if (calls < 4) throw new Error('t');
        return 1;
      },
    );
    expect(delays.length).toBe(3);
    expect(delays.every((d) => d >= 0 && d <= 900)).toBe(true);
  });
});
