import type { GovernanceConflictWorkflowPort, TaskHandler } from '@trapmap/backend-core';
import {
  type GovernanceConflictDetectionPayload,
  governanceConflictDetectionPayloadSchema,
} from '@trapmap/contracts';

export function createGovernanceConflictTaskHandler(
  workflow: GovernanceConflictWorkflowPort,
): TaskHandler<GovernanceConflictDetectionPayload> {
  return {
    type: 'governance.conflict-detection',
    async handle(task) {
      const payload = governanceConflictDetectionPayloadSchema.parse(task.payload);
      await workflow.detectConflicts({ entryId: payload.entryId });
    },
  };
}
