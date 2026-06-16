export * from './scheduler.js';
export * from './types.js';
export * from './handlers/knowledge-index-follow-up.js';
export * from './handlers/skill-index-follow-up.js';
export * from './handlers/remediation-reactivation.js';
export * from './handlers/badcase-export-draft.js';

import type { TaskHandler } from '@trapmap/server/lib/queue/task-queue.js';

import { createBadcaseExportDraftHandler } from './handlers/badcase-export-draft.js';
import { createKnowledgeIndexFollowUpHandler } from './handlers/knowledge-index-follow-up.js';
import { createSkillIndexFollowUpHandler } from './handlers/skill-index-follow-up.js';
import { createRemediationReactivationHandler } from './handlers/remediation-reactivation.js';
import {
  BADCASE_EXPORT_DRAFT_TASK_TYPE,
  KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE,
  REMEDIATION_REACTIVATION_TASK_TYPE,
  SKILL_INDEX_FOLLOW_UP_TASK_TYPE,
  getSharedJobContract,
} from './types.js';

export function createSharedJobHandlers(args: {
  knowledgeIndexFollowUp: Parameters<typeof createKnowledgeIndexFollowUpHandler>[0];
  skillIndexFollowUp: Parameters<typeof createSkillIndexFollowUpHandler>[0];
  remediationReactivation: Parameters<typeof createRemediationReactivationHandler>[0];
  badcaseExportDraft: Parameters<typeof createBadcaseExportDraftHandler>[0];
}): TaskHandler<unknown>[] {
  const knowledgeHandler = createKnowledgeIndexFollowUpHandler(args.knowledgeIndexFollowUp);
  const skillHandler = createSkillIndexFollowUpHandler(args.skillIndexFollowUp);
  const remediationHandler = createRemediationReactivationHandler(args.remediationReactivation);
  const badcaseHandler = createBadcaseExportDraftHandler(args.badcaseExportDraft);

  const handlers = [knowledgeHandler, skillHandler, remediationHandler, badcaseHandler] as const;

  for (const handler of handlers) {
    const contract = getSharedJobContract(
      handler.type as
        | typeof KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE
        | typeof SKILL_INDEX_FOLLOW_UP_TASK_TYPE
        | typeof REMEDIATION_REACTIVATION_TASK_TYPE
        | typeof BADCASE_EXPORT_DRAFT_TASK_TYPE,
    );
    if (handler.workflowType !== contract.workflow.workflowType) {
      throw new Error(
        `Shared job handler "${handler.type}" must declare workflow type "${contract.workflow.workflowType}"`,
      );
    }
  }

  return handlers as TaskHandler<unknown>[];
}
