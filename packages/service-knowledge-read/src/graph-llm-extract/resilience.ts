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

/**
 * Execute an async function with timeout protection.
 * Retries once on timeout or transient failure.
 */
export async function executeWithResilience<T>(
  _name: string,
  fn: () => Promise<T>,
  options: ResilienceOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxAttempts = options.maxAttempts ?? 2;

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs),
        ),
      ]);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1) {
        // Brief backoff before retry
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}
