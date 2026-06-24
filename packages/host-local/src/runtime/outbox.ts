/**
 * Optional outbox event dispatcher.
 *
 * Provides domain event outbox consumption for host-local deployments.
 * Only enabled when the deployment profile requires async ownership
 * and the runtime mode includes outbox-worker.
 *
 * This module is a thin lifecycle wrapper -- all event handling logic
 * lives in backend-core modules (lifecycle subscribers).
 *
 * @stub This is an intentionally empty lifecycle stub. The dispatcher handle
 * tracks running state and supports stop(), but does no actual polling
 * or event processing. Real implementation is deferred to Task 04/05.
 *
 * TODO(Task 04): Wire in real outbox polling loop with claim/dispatch/complete
 * TODO(Task 05): Add graceful drain, metrics, and dead-letter handling
 */

import type { OutboxEvent, OutboxPort, RuntimeWorkerHandle } from '@trapmap/backend-core';

// ---------------------------------------------------------------------------
// Outbox configuration
// ---------------------------------------------------------------------------

export interface OutboxConfig {
  enabled: boolean;
  ownsWork: boolean;
  pollIntervalMs: number;
  batchSize: number;
  dispatch: (event: OutboxEvent) => Promise<void>;
}

export const DEFAULT_OUTBOX_CONFIG: OutboxConfig = {
  enabled: true,
  ownsWork: true,
  pollIntervalMs: 2000,
  batchSize: 10,
  dispatch: async () => {},
};

// ---------------------------------------------------------------------------
// In-process outbox dispatcher (lifecycle stub)
// ---------------------------------------------------------------------------

/**
 * Create an in-process outbox event dispatcher.
 *
 * For local-agent deployments, this is a no-op (returns null) because
 * local-agent does not own outbox work.
 *
 * For team-monolith deployments, this creates a lifecycle stub that
 * tracks running state but does no actual work.
 *
 * @stub Lifecycle stub only -- no polling, no event dispatching.
 */
export function createInProcessOutboxDispatcher(
  outbox: OutboxPort | null,
  config: Partial<OutboxConfig> = {},
): RuntimeWorkerHandle | null {
  const merged = { ...DEFAULT_OUTBOX_CONFIG, ...config };

  if (!merged.enabled || !outbox) {
    return null;
  }

  let running = true;
  let activeRun: Promise<void> | null = null;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const run = async () => {
    while (running) {
      const events = (await outbox.claimBatch(merged.batchSize)) ?? [];
      if (events.length === 0) {
        await sleep(merged.pollIntervalMs);
        continue;
      }

      for (const event of events) {
        try {
          await merged.dispatch(event);
          await outbox.complete(event.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await outbox.fail(event.id, message);
        }
      }
    }
  };

  activeRun = run();

  return {
    isRunning(): boolean {
      return running;
    },

    ownsWork(): boolean {
      return merged.ownsWork;
    },

    stop(): void {
      running = false;
      void activeRun;
    },
  };
}
