import {
  InvocationError,
  type InvocationErrorKind,
  type JobRuntimePort,
  type TaskEnqueueOptions,
} from '@trapmap/backend-core';
import type { InternalServiceClients } from '@trapmap/host-distributed/gateway/internal-client.js';

function toInvocationError(body: unknown, fallback: string): InvocationError {
  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const message = typeof payload.error === 'string' ? payload.error : fallback;

  const factoryByKind: Record<InvocationErrorKind, typeof InvocationError.internal> = {
    validation: InvocationError.validation,
    unauthorized: InvocationError.unauthorized,
    'not-found': InvocationError.notFound,
    conflict: InvocationError.conflict,
    forbidden: InvocationError.forbidden,
    timeout: InvocationError.timeout,
    unavailable: InvocationError.unavailable,
    internal: InvocationError.internal,
  };
  const factory = factoryByKind[payload.kind as InvocationErrorKind] ?? InvocationError.internal;
  return factory(message, body);
}

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
