import {
  type GovernanceAsyncCommandPort,
  type GovernanceConflictWorkflowPort,
  InvocationError,
  type TaskHandler,
} from '@trapmap/backend-core';
import type { InternalServiceClients } from '@trapmap/host-distributed/gateway/internal-client.js';
import {
  createGovernanceBadcaseExportDraftTaskHandler,
  createGovernanceConflictTaskHandler,
  createGovernanceRemediationTaskHandler,
} from '@trapmap/service-job-runtime';
import { recordAsyncLifecycleEvent } from '../gateway/internal-observability.js';
import { toInvocationError } from '../shared/invocation-error.js';

function createRemoteGovernanceConflictWorkflowClient(
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

function createRemoteGovernanceAsyncCommandClient(
  clients: Pick<InternalServiceClients, 'governanceReview'>,
): GovernanceAsyncCommandPort {
  return {
    async reactivateRemediation(payload) {
      const response = await clients.governanceReview.reactivateRemediation(payload);
      if (response.status < 200 || response.status >= 300) {
        throw toInvocationError(response.body, 'governance remediation reactivation failed');
      }
    },
    async exportBadcaseDraft(payload) {
      const response = await clients.governanceReview.exportBadcaseDraft(payload);
      if (response.status < 200 || response.status >= 300) {
        throw toInvocationError(response.body, 'governance badcase export draft failed');
      }
    },
  };
}

/**
 * Wraps a TaskHandler with async lifecycle event recording.
 *
 * Records 'execute' when the handler starts, and 'dead-letter' when the
 * task reaches terminal failure (onDead callback).
 */
function withLifecycleRecording(handler: TaskHandler<unknown>): TaskHandler<unknown> {
  return {
    type: handler.type,
    async handle(task, signal) {
      recordAsyncLifecycleEvent({
        eventName: 'execute',
        taskType: handler.type,
        ownerSurface: 'runtime-seam',
      });
      return handler.handle(task, signal);
    },
    onDead: handler.onDead
      ? async (task) => {
          recordAsyncLifecycleEvent({
            eventName: 'dead-letter',
            taskType: handler.type,
            ownerSurface: 'runtime-seam',
            failureClassification: 'permanent-failure',
          });
          await handler.onDead!(task);
        }
      : async (_task) => {
          recordAsyncLifecycleEvent({
            eventName: 'dead-letter',
            taskType: handler.type,
            ownerSurface: 'runtime-seam',
            failureClassification: 'permanent-failure',
          });
        },
  };
}

export function createJobRuntimeTaskHandlers(
  clients: Pick<InternalServiceClients, 'governanceReview'>,
): TaskHandler<unknown>[] {
  const governanceAsyncCommands = createRemoteGovernanceAsyncCommandClient(clients);
  return [
    createGovernanceConflictTaskHandler(createRemoteGovernanceConflictWorkflowClient(clients)),
    createGovernanceRemediationTaskHandler(governanceAsyncCommands),
    createGovernanceBadcaseExportDraftTaskHandler(governanceAsyncCommands),
  ].map(withLifecycleRecording);
}
