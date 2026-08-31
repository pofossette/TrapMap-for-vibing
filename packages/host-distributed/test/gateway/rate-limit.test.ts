import { afterEach, describe, expect, it, vi } from 'vitest';

import { TokenBucketRateLimiter, resolveRateLimitConfig } from '../../src/gateway/rate-limit.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveRateLimitConfig', () => {
  it('is disabled by default in test runs (env unset + NODE_ENV=test)', () => {
    expect(resolveRateLimitConfig({ NODE_ENV: 'test' })).toEqual({ rps: 0, burst: 0 });
  });

  it('applies production defaults when env is set or NODE_ENV is not test', () => {
    expect(resolveRateLimitConfig({ NODE_ENV: 'production' })).toEqual({ rps: 50, burst: 100 });
    expect(
      resolveRateLimitConfig({ NODE_ENV: 'test', TRAPMAP_GATEWAY_RATE_LIMIT_RPS: '10' }),
    ).toEqual({
      rps: 10,
      burst: 100,
    });
  });

  it('parses overrides and disables on rps=0', () => {
    expect(
      resolveRateLimitConfig({
        TRAPMAP_GATEWAY_RATE_LIMIT_RPS: '20',
        TRAPMAP_GATEWAY_RATE_LIMIT_BURST: '5',
      }),
    ).toEqual({ rps: 20, burst: 5 });
    expect(resolveRateLimitConfig({ TRAPMAP_GATEWAY_RATE_LIMIT_RPS: '0' })).toEqual({
      rps: 0,
      burst: 0,
    });
    expect(resolveRateLimitConfig({ TRAPMAP_GATEWAY_RATE_LIMIT_RPS: 'abc' })).toEqual({
      rps: 50,
      burst: 100,
    });
  });
});

describe('TokenBucketRateLimiter', () => {
  it('allows bursts up to capacity then rejects with retry-after', () => {
    const t = 0;
    const limiter = new TokenBucketRateLimiter({ rps: 1, burst: 3 }, () => t);
    expect(limiter.tryConsume('a').allowed).toBe(true);
    expect(limiter.tryConsume('a').allowed).toBe(true);
    expect(limiter.tryConsume('a').allowed).toBe(true);
    const denied = limiter.tryConsume('a');
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(denied.retryAfterMs).toBeLessThanOrEqual(1000);
  });

  it('refills continuously over time', () => {
    let t = 0;
    const limiter = new TokenBucketRateLimiter({ rps: 2, burst: 1 }, () => t);
    expect(limiter.tryConsume('k').allowed).toBe(true);
    expect(limiter.tryConsume('k').allowed).toBe(false);
    t = 500; // half a second at 2rps → exactly 1 token back
    expect(limiter.tryConsume('k').allowed).toBe(true);
    expect(limiter.tryConsume('k').allowed).toBe(false);
  });

  it('isolates keys and never exceeds burst capacity while idle', () => {
    let t = 0;
    const limiter = new TokenBucketRateLimiter({ rps: 100, burst: 2 }, () => t);
    t = 60_000; // long idle — tokens capped at burst
    expect(limiter.tryConsume('x').allowed).toBe(true);
    expect(limiter.tryConsume('x').allowed).toBe(true);
    expect(limiter.tryConsume('x').allowed).toBe(false);
    expect(limiter.tryConsume('y').allowed).toBe(true); // independent bucket
  });

  it('passes everything through when disabled', () => {
    const t = 0;
    const limiter = new TokenBucketRateLimiter({ rps: 0, burst: 0 }, () => t);
    for (let i = 0; i < 10; i += 1) {
      expect(limiter.tryConsume(`k${i}`).allowed).toBe(true);
    }
  });
});
