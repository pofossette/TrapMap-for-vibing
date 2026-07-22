import {
  InvocationError,
  type JobRuntimePort,
  type TaskEnqueueOptions,
} from '@trapmap/backend-core';
import type { InternalServiceClients } from '@trapmap/host-distributed/gateway/internal-client.js';
import { toInvocationError } from './invocation-error.js';

export function createRemoteJobRuntimeClient(
  clients: Pick<InternalServiceClients, 'jobRuntime'>,
): Pick<JobRuntimePort, 'schedule'> {
  return {
    async schedule(type: string, payload: unknown, options?: TaskEnqueueOptions): Promise<string> {
      const runtimeOptions = Object.fromEntries(
        Object.entries({
          delayMs: options?.delayMs,
          priority: options?.priority,
          maxAttempts: options?.maxAttempts,
          dedupeKey: options?.dedupeKey,
        }).filter(([, value]) => value !== undefined),
      );
      const response = await clients.jobRuntime.schedule({
        type,
        payload,
        ...runtimeOptions,
      });
      if (response.status < 200 || response.status >= 300) {
        throw toInvocationError(response.body, `job-runtime scheduling failed for task: ${type}`);
      }
      const jobId =
        response.body && typeof response.body === 'object'
          ? (response.body as Record<string, unknown>).jobId
          : undefined;
      if (typeof jobId !== 'string' || jobId.length === 0) {
        throw InvocationError.internal(
          `job-runtime returned no jobId for task: ${type}`,
          response.body,
        );
      }
      return jobId;
    },
  };
}
