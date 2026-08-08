/**
 * Async helpers: promise timeout protection.
 */

/**
 * Race a promise against a timeout.
 *
 * Unified semantics (adopted from the service-knowledge-read graph-LLM
 * extraction resilience wrapper, the only call site that had a standalone
 * race-with-timeout implementation):
 *
 * - When the promise settles first, its result or rejection is propagated and
 *   the timer is cleared (no dangling timer keeps the event loop alive).
 * - When the timeout elapses first, the returned promise rejects with an
 *   `Error` whose message defaults to `` `Timeout after ${ms}ms` ``.
 *
 * Deliberately NOT unified (documented differences, kept at their call sites):
 *
 * - `host-distributed` gateway `internal-client.ts` uses an
 *   `AbortController`-based timeout because the underlying `fetch` must be
 *   aborted to release the in-flight network request; a promise-race timeout
 *   cannot cancel the fetch.
 * - `service-candidate-ingestion` `processing-task-queue.ts` uses a
 *   poll-interval wait (`setTimeout` + resolve); that is a delay primitive
 *   (wait until next poll), not a timeout guard.
 */
export function timeout<T>(
  promise: Promise<T>,
  ms: number,
  message = `Timeout after ${ms}ms`,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
