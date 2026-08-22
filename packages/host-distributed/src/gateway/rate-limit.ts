/**
 * Gateway rate limiting (Task C4, platformization mainline).
 *
 * Per-actor token bucket applied at the gateway before request forwarding.
 * Key = session actorId (set by the auth hook) with client-IP fallback.
 *
 * Zero-behavior-change guarantee: the limiter is DISABLED unless explicitly
 * configured via env — and additionally auto-disabled in test runs where env
 * is unset (`NODE_ENV=test`).
 */

export interface RateLimitConfig {
  /** Sustained refill rate in requests per second. 0 disables the limiter. */
  rps: number;
  /** Maximum burst size (bucket capacity). */
  burst: number;
}

const DEFAULT_RPS = 50;
const DEFAULT_BURST = 100;

export function resolveRateLimitConfig(env: Record<string, string | undefined>): RateLimitConfig {
  const rawRps = env.TRAPMAP_GATEWAY_RATE_LIMIT_RPS;
  const rawBurst = env.TRAPMAP_GATEWAY_RATE_LIMIT_BURST;
  if (rawRps === undefined && rawBurst === undefined && env.NODE_ENV === 'test') {
    return { rps: 0, burst: 0 };
  }
  const parse = (raw: string | undefined, fallback: number): number => {
    if (raw === undefined) return fallback;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  const rps = parse(rawRps, DEFAULT_RPS);
  const burst = Math.max(parse(rawBurst, DEFAULT_BURST), rps > 0 ? 1 : 0);
  if (rps === 0) return { rps: 0, burst: 0 };
  return { rps, burst };
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterMs: number;
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

export class TokenBucketRateLimiter {
  private readonly cfg: RateLimitConfig;
  private readonly now: () => number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(cfg: RateLimitConfig, now?: () => number) {
    this.cfg = cfg;
    this.now = now ?? Date.now;
  }

  get enabled(): boolean {
    return this.cfg.rps > 0 && this.cfg.burst > 0;
  }

  tryConsume(key: string): RateLimitDecision {
    if (!this.enabled) return { allowed: true, retryAfterMs: 0 };

    const t = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.cfg.burst, lastRefillMs: t };
      this.buckets.set(key, bucket);
    }

    // Refill continuously based on elapsed time.
    const elapsedSeconds = (t - bucket.lastRefillMs) / 1000;
    if (elapsedSeconds > 0) {
      bucket.tokens = Math.min(this.cfg.burst, bucket.tokens + elapsedSeconds * this.cfg.rps);
      bucket.lastRefillMs = t;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, retryAfterMs: 0 };
    }

    const missingTokens = 1 - bucket.tokens;
    return {
      allowed: false,
      retryAfterMs: Math.ceil((missingTokens / this.cfg.rps) * 1000),
    };
  }
}
