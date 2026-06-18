/**
 * Optional in-process task worker.
 *
 * Provides task queue consumption for host-local deployments.
 * Only enabled when the deployment profile requires async ownership
 * and the runtime mode includes task-worker.
 *
 * This module is a thin lifecycle wrapper -- all task handling logic
 * lives in backend-core modules (candidate-ingestion, job-runtime).
 *
 * @stub This is an intentionally empty lifecycle stub. The worker handle
 * tracks running state and supports stop(), but does no actual polling
 * or task processing. Real implementation is deferred to Task 04/05.
 *
 * TODO(Task 04): Wire in real task queue polling loop with claim/process/complete
 * TODO(Task 05): Add graceful drain, metrics, and retry logic
 */

import type { RuntimeWorkerHandle, TaskQueuePort } from '@trapmap/backend-core';

// ---------------------------------------------------------------------------
// Worker configuration
// ---------------------------------------------------------------------------

export interface WorkerConfig {
  enabled: boolean;
  ownsWork: boolean;
  pollIntervalMs: number;
  concurrency: number;
}

export const DEFAULT_WORKER_CONFIG: WorkerConfig = {
  enabled: true,
  ownsWork: true,
  pollIntervalMs: 1000,
  concurrency: 1,
};

// ---------------------------------------------------------------------------
// In-process task worker (lifecycle stub)
// ---------------------------------------------------------------------------

/**
 * Create an in-process task worker that consumes from the task queue port.
 *
 * For local-agent deployments, this is a no-op (returns null) because
 * local-agent does not own async task work.
 *
 * For team-monolith deployments, this creates a lifecycle stub that
 * tracks running state but does no actual work.
 *
 * @stub Lifecycle stub only -- no polling, no task processing.
 */
export function createInProcessTaskWorker(
  _taskQueue: TaskQueuePort | null,
  config: Partial<WorkerConfig> = {},
): RuntimeWorkerHandle | null {
  const merged = { ...DEFAULT_WORKER_CONFIG, ...config };

  if (!merged.enabled) {
    return null;
  }

  // Stub: mark as running on creation to reflect the lifecycle state
  // even though no real work is performed.
  let running = true;

  return {
    isRunning(): boolean {
      return running;
    },

    ownsWork(): boolean {
      return merged.ownsWork;
    },

    stop(): void {
      running = false;
    },
  };
}
