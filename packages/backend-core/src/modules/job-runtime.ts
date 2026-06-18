/**
 * Job Runtime bounded-context module.
 *
 * Owns: task queue operations, workflow execution, job scheduling.
 * This module handles all async job and workflow operations.
 */

import type { AuditLogPort } from '../ports/audit-ports.js';
import type { JobRuntimePort } from '../ports/internal-ports.js';
import type { QueuePorts } from '../ports/queue-ports.js';

// ---------------------------------------------------------------------------
// Module dependencies (injected by host assembly)
// ---------------------------------------------------------------------------

export interface JobRuntimeDeps {
  queuePorts: QueuePorts;
  auditLog: AuditLogPort;
}

// ---------------------------------------------------------------------------
// Module descriptor
// ---------------------------------------------------------------------------

export const JOB_RUNTIME_MODULE = {
  name: 'job-runtime' as const,
  owns: ['task-queue', 'workflow-execution', 'job-scheduling'] as const,
  dependsOn: [] as const,
} as const;

/**
 * Create a JobRuntimePort backed by the given dependencies.
 */
export function createJobRuntimeModule(deps: JobRuntimeDeps): JobRuntimePort {
  return {
    async schedule(type, payload, options) {
      const result = await deps.queuePorts.task.enqueue(type, payload, {
        ...(options?.delayMs !== undefined ? { delayMs: options.delayMs } : {}),
        ...(options?.priority !== undefined ? { priority: options.priority } : {}),
        ...(options?.maxAttempts !== undefined ? { maxAttempts: options.maxAttempts } : {}),
      });
      // The enqueue result is opaque; return it as a string ID
      return String(result ?? `job_${Date.now()}`);
    },

    async getStatus(_jobId) {
      // Individual job status requires a concrete implementation.
      // Host assemblies override this with a real query.
      return { status: 'pending' as const };
    },

    async getQueueStatus() {
      const snapshot = await deps.queuePorts.task.getStatusSnapshot();
      return {
        pending: snapshot.pending,
        running: snapshot.running,
        dead: snapshot.dead,
      };
    },
  };
}
