import {
  InvocationError,
  type GovernanceConflictWorkflowPort,
  type InvocationErrorKind,
  type TaskHandler,
} from '@trapmap/backend-core';
import type { InternalServiceClients } from '@trapmap/host-distributed/gateway/internal-client.js';
import { createGovernanceConflictTaskHandler } from '@trapmap/service-job-runtime';

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

export function createRemoteGovernanceConflictWorkflowClient(
  clients: Pick<InternalServiceClients, 'governanceReview'>,
): GovernanceConflictWorkflowPort {
  return {
    async detectConflicts({ entryId }) {
      const response = await clients.governanceReview.detectConflicts({ entryId });
      if (response.status < 200 || response.status >= 300) {
        throw toInvocationError(response.body, 'governance conflict detection failed');
      }
      const detectedCount =
        response.body && typeof response.body === 'object'
          ? (response.body as Record<string, unknown>).detectedCount
          : undefined;
      if (typeof detectedCount !== 'number' || !Number.isInteger(detectedCount)) {
        throw InvocationError.internal(
          'governance-review returned an invalid conflict detection result',
          response.body,
        );
      }
      return { detectedCount };
    },
  };
}

export function createJobRuntimeTaskHandlers(
  clients: Pick<InternalServiceClients, 'governanceReview'>,
): TaskHandler<unknown>[] {
  return [
    createGovernanceConflictTaskHandler(createRemoteGovernanceConflictWorkflowClient(clients)),
  ];
}
