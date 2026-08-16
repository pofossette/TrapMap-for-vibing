/** State machine for an assembly shutdown sequence. */
export type ShutdownState = 'idle' | 'shutting-down' | 'done';

export interface ShutdownControllerOptions {
  /** How long to wait for `dispose` before proceeding regardless (default 5000ms). */
  timeoutMs?: number;
  /** An external abort signal that triggers shutdown. */
  signal?: AbortSignal;
  /** Called with any error thrown by `dispose`. */
  onError?: (err: unknown) => void;
}

/**
 * Bounded, idempotent shutdown coordinator.
 *
 * - Concurrent `shutdown()` calls share a single completion promise.
 * - If `dispose` does not settle within `timeoutMs`, shutdown proceeds
 *   anyway and logs a warning, so a stuck teardown cannot hang the process
 *   (DSH bounded-shutdown discipline).
 * - `onShutdown` callbacks run once, after the sequence completes.
 * - An `AbortSignal` wired in options triggers `shutdown()`.
 */
export interface ShutdownController {
  /** Initiate shutdown (idempotent; resolves even on dispose timeout/error). */
  shutdown(): Promise<void>;
  /** Register a callback invoked once after shutdown completes. */
  onShutdown(callback: () => void): void;
  readonly state: ShutdownState;
  /** True once the shutdown sequence has run to completion. */
  readonly done: boolean;
}

type DisposeOutcome = 'settled';

export function createShutdownController(
  dispose: () => unknown,
  options: ShutdownControllerOptions = {},
): ShutdownController {
  const timeoutMs = options.timeoutMs ?? 5000;
  const onError = options.onError;

  let state: ShutdownState = 'idle';
  let completion: Promise<void> | null = null;
  let abortHandler: (() => void) | null = null;
  const callbacks: (() => void)[] = [];

  const runCompletion = (): void => {
    state = 'done';
    const pending = callbacks.splice(0);
    for (const callback of pending) {
      try {
        callback();
      } catch {
        // Callbacks are best-effort; never let them break shutdown.
      }
    }
  };

  const shutdown = (): Promise<void> => {
    if (completion !== null) return completion;
    if (state === 'done') return Promise.resolve();
    state = 'shutting-down';

    completion = (async () => {
      if (abortHandler !== null) {
        options.signal?.removeEventListener('abort', abortHandler as EventListener);
        abortHandler = null;
      }

      const disposePromise = Promise.resolve()
        .then(() => dispose())
        .then(
          (): DisposeOutcome => 'settled',
          (err: unknown): DisposeOutcome => {
            if (onError !== undefined) onError(err);
            return 'settled';
          },
        );

      if (timeoutMs > 0) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<DisposeOutcome>((resolve) => {
          timer = setTimeout(() => {
            console.warn(
              `Assembly shutdown: dispose() did not settle within ${timeoutMs}ms; continuing shutdown regardless`,
            );
            resolve('settled');
          }, timeoutMs);
          if (typeof timer.unref === 'function') timer.unref();
        });
        await Promise.race([disposePromise, timeoutPromise]);
        if (timer !== undefined) clearTimeout(timer);
      } else {
        await disposePromise;
      }

      runCompletion();
    })();
    return completion;
  };

  if (options.signal !== undefined) {
    if (options.signal.aborted) {
      void shutdown();
    } else {
      abortHandler = () => {
        void shutdown();
      };
      options.signal.addEventListener('abort', abortHandler as EventListener);
    }
  }

  return {
    shutdown,
    onShutdown: (callback: () => void): void => {
      if (state === 'done') {
        queueMicrotask(() => {
          try {
            callback();
          } catch {
            // best-effort
          }
        });
        return;
      }
      callbacks.push(callback);
    },
    get state() {
      return state;
    },
    get done() {
      return state === 'done';
    },
  };
}
