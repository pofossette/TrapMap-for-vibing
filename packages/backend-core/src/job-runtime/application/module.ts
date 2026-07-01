/**
 * Job-runtime bounded context — application layer.
 *
 * Owns task queue operations, workflow execution and job scheduling.
 * This context is pure runtime substrate: handler-registry and
 * business-decision logic are owned by the bounded contexts that
 * contribute handlers, not by job-runtime.
 */

import type { AuditLogPort } from '@trapmap/backend-core/ports/audit-ports.js';
import type { JobRuntimePort } from '@trapmap/backend-core/ports/internal-ports.js';
import type { QueuePorts } from '@trapmap/backend-core/ports/queue-ports.js';

import { JOB_RUNTIME_OWNED_CAPABILITIES } from '@trapmap/backend-core/job-runtime/domain/index.js';

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
  owns: JOB_RUNTIME_OWNED_CAPABILITIES,
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
      return String(result ?? `job_${Date.now()}`);
    },

    async getStatus(_jobId) {
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
