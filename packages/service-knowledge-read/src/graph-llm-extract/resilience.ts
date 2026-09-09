import { timeout } from '@trapmap/lib';

/**
 * Simplified resilience wrapper for LLM calls.
 *
 * Provides timeout protection without the full cockatiel circuit-breaker
 * stack that was in the retired server package. Sufficient for eval and
 * production graph extraction calls.
 */

export interface ResilienceOptions {
  timeoutMs?: number;
  maxAttempts?: number;
}

/** Linear retry delay step (ms) — centralized name, value unchanged. */
const RESILIENCE_RETRY_DELAY_STEP_MS = 1000;

/**
 * Execute an async function with timeout protection.
 * Retries once on timeout or transient failure.
 */
export async function executeWithResilience<T>(
  _name: string,
  fn: () => Promise<T>,
  options: ResilienceOptions = {},
): Promise<T> {
  const timeoutMs =
    options.timeoutMs ?? Number(process.env.TRAPMAP_GRAPH_EXTRACT_TIMEOUT_MS ?? 30_000);
  const maxAttempts =
    options.maxAttempts ?? Number(process.env.TRAPMAP_GRAPH_EXTRACT_MAX_ATTEMPTS ?? 2);

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await timeout(fn(), timeoutMs, `Timeout after ${timeoutMs}ms`);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1) {
        // Brief backoff before retry
        await new Promise((resolve) =>
          setTimeout(resolve, RESILIENCE_RETRY_DELAY_STEP_MS * (attempt + 1)),
        );
      }
    }
  }
  throw lastError;
}
