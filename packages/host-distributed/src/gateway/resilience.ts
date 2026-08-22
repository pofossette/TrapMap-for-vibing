/**
 * Internal-hop resilience primitives for the distributed gateway.
 *
 * Task C2 (platformization mainline): idempotent retry, per-service circuit
 * breaking, and per-service timeout budgets. Pure增量能力 — with the default
 * env (`TRAPMAP_INTERNAL_RETRY_MAX_ATTEMPTS` unset → 1 attempt) and no breaker
 * openings, the request path is byte-for-byte equivalent to the pre-C2 client.
 *
 * Semantics:
 * - Retry only idempotent methods (GET) against transient outcomes:
 *   network-level failures and HTTP 502/503/504.
 * - Backoff is exponential with full jitter: `random * min(base * 2^attempt, max)`.
 * - Circuit breaker per service key: N consecutive failures open the circuit,
 *   after `cooldownMs` one probe request is allowed (half-open); success closes,
 *   failure re-opens.
 */

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export function resolveRetryPolicy(env: Record<string, string | undefined>): RetryPolicy {
  const raw = env.TRAPMAP_INTERNAL_RETRY_MAX_ATTEMPTS;
  let maxAttempts = 1;
  if (raw !== undefined) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      maxAttempts = parsed;
    }
  }
  return { maxAttempts, baseDelayMs: 100, maxDelayMs: 2000 };
}

export type BreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  threshold: number;
  cooldownMs: number;
  now?: () => number;
}

export class CircuitBreaker {
  private readonly threshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private failures = 0;
  private openedAtMs: number | null = null;
  private currentState: BreakerState = 'closed';

  constructor(opts: CircuitBreakerOptions) {
    this.threshold = Math.max(1, opts.threshold);
    this.cooldownMs = opts.cooldownMs;
    this.now = opts.now ?? Date.now;
  }

  get state(): BreakerState {
    if (this.currentState === 'open' && this.openedAtMs !== null) {
      if (this.now() - this.openedAtMs >= this.cooldownMs) {
        this.currentState = 'half-open';
      }
    }
    return this.currentState;
  }

  canAttempt(): boolean {
    return this.state !== 'open';
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAtMs = null;
    this.currentState = 'closed';
  }

  recordFailure(): void {
    if (this.currentState === 'half-open') {
      this.trip();
      return;
    }
    this.failures += 1;
    if (this.failures >= this.threshold) {
      this.trip();
    }
  }

  private trip(): void {
    this.currentState = 'open';
    this.openedAtMs = this.now();
    this.failures = 0;
  }
}

export class BreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly opts: Omit<CircuitBreakerOptions, 'now'> & { now?: () => number };

  constructor(opts?: { threshold?: number; cooldownMs?: number; now?: () => number }) {
    this.opts = {
      threshold: opts?.threshold ?? resolveBreakerThreshold(process.env),
      cooldownMs: opts?.cooldownMs ?? resolveBreakerCooldownMs(process.env),
      ...(opts?.now !== undefined ? { now: opts.now } : {}),
    };
  }

  for(key: string): CircuitBreaker {
    const existing = this.breakers.get(key);
    if (existing) return existing;
    const breaker = new CircuitBreaker(this.opts);
    this.breakers.set(key, breaker);
    return breaker;
  }
}

export function resolveBreakerThreshold(env: Record<string, string | undefined>): number {
  const raw = env.TRAPMAP_INTERNAL_BREAKER_THRESHOLD;
  if (raw !== undefined) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }
  return 5;
}

export function resolveBreakerCooldownMs(env: Record<string, string | undefined>): number {
  const raw = env.TRAPMAP_INTERNAL_BREAKER_COOLDOWN_MS;
  if (raw !== undefined) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 30_000;
}

export interface ResilienceOptions {
  retry: RetryPolicy;
  breaker: CircuitBreaker;
  retryable: (err: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Run `fn` under retry + circuit-breaker semantics.
 *
 * The caller decides what counts as retryable; transient classification lives
 * at call sites. When the breaker is open, `fn` is not invoked — the caller's
 * short-circuit path should handle that via `breaker.canAttempt()` before
 * calling, or by inspecting the thrown {@link CircuitOpenError}.
 */
export class CircuitOpenError extends Error {
  constructor(message = 'circuit open') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

function fullJitterDelay(retry: RetryPolicy, attemptIndex: number): number {
  const cap = Math.min(retry.baseDelayMs * 2 ** attemptIndex, retry.maxDelayMs);
  return Math.floor(Math.random() * cap);
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function withResilience<T>(opts: ResilienceOptions, fn: () => Promise<T>): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 0; attempt < opts.retry.maxAttempts; attempt += 1) {
    if (!opts.breaker.canAttempt()) {
      throw new CircuitOpenError();
    }
    try {
      const result = await fn();
      opts.breaker.recordSuccess();
      return result;
    } catch (err) {
      lastError = err;
      const isLast = attempt + 1 >= opts.retry.maxAttempts;
      if (isLast || !opts.retryable(err)) {
        opts.breaker.recordFailure();
        throw err;
      }
      // Transient failure on a non-final attempt: count it but keep the loop.
      opts.breaker.recordFailure();
      await sleep(fullJitterDelay(opts.retry, attempt));
    }
  }

  throw lastError;
}
