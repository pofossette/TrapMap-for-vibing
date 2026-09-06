import type { GovernanceAsyncCommandPort, TaskHandler } from '@trapmap/backend-core';
import {
  type BadcaseExportDraftPayload,
  badcaseExportDraftPayloadSchema,
  type RemediationReactivationPayload,
  remediationReactivationPayloadSchema,
} from '@trapmap/contracts';

export function createGovernanceRemediationTaskHandler(
  commands: Pick<GovernanceAsyncCommandPort, 'reactivateRemediation'>,
): TaskHandler<RemediationReactivationPayload> {
  return {
    type: 'feedback.remediation-reactivation',
    async handle(task) {
      const payload = remediationReactivationPayloadSchema.parse(task.payload);
      await commands.reactivateRemediation(payload);
    },
  };
}

export function createGovernanceBadcaseExportDraftTaskHandler(
  commands: Pick<GovernanceAsyncCommandPort, 'exportBadcaseDraft'>,
): TaskHandler<BadcaseExportDraftPayload> {
  return {
    type: 'feedback.badcase-export-draft',
    async handle(task) {
      const payload = badcaseExportDraftPayloadSchema.parse(task.payload);
      await commands.exportBadcaseDraft(payload);
    },
  };
}
