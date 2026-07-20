import type {
  GovernanceAsyncCommandPort,
  GovernanceConflictChat,
  GovernanceConflictProjection,
} from '@trapmap/service-governance-review';
import {
  createGovernanceConflictReadPort,
  createGovernanceConflictWorkflow,
} from '@trapmap/service-governance-review';
import type { KnowledgeOwnerPort } from '@trapmap/contracts';
import type { GovernanceConflictWorkflowPort, TaskHandler } from '@trapmap/backend-core';
import {
  createGovernanceBadcaseExportDraftTaskHandler,
  createGovernanceConflictTaskHandler,
  createGovernanceRemediationTaskHandler,
} from '@trapmap/service-job-runtime';

export interface HostLocalGovernanceConflictComposition {
  knowledgeOwner: Pick<KnowledgeOwnerPort, 'getById' | 'listByFilter'>;
  conflictProjection: GovernanceConflictProjection;
  chat?: GovernanceConflictChat;
  createId?: () => string;
  now?: () => string;
}

export function createHostLocalGovernanceConflictWorkflow(
  composition: HostLocalGovernanceConflictComposition,
): GovernanceConflictWorkflowPort {
  return createGovernanceConflictWorkflow({
    read: createGovernanceConflictReadPort(composition.knowledgeOwner),
    projection: composition.conflictProjection,
    ...(composition.chat ? { chat: composition.chat } : {}),
    ...(composition.createId ? { createId: composition.createId } : {}),
    ...(composition.now ? { now: composition.now } : {}),
  });
}

export function createHostLocalGovernanceConflictTaskHandlers(
  workflow: GovernanceConflictWorkflowPort,
): TaskHandler<unknown>[] {
  return [createGovernanceConflictTaskHandler(workflow) as TaskHandler<unknown>];
}

export function createHostLocalGovernanceTaskHandlers(
  workflow: GovernanceConflictWorkflowPort,
  asyncCommands: GovernanceAsyncCommandPort,
): TaskHandler<unknown>[] {
  return [
    createGovernanceConflictTaskHandler(workflow) as TaskHandler<unknown>,
    createGovernanceRemediationTaskHandler(asyncCommands),
    createGovernanceBadcaseExportDraftTaskHandler(asyncCommands),
  ];
}
