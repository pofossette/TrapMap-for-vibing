import type {
  GovernanceAsyncCommandPort,
  GovernanceConflictWorkflowPort,
  TaskHandler,
} from '@trapmap/backend-core';
import type { KnowledgeOwnerPort } from '@trapmap/contracts';
import type {
  GovernanceConflictChat,
  GovernanceConflictProjection,
} from '@trapmap/service-governance-review';
import {
  createGovernanceConflictReadPort,
  createRuleConflictTrigger,
} from '@trapmap/service-governance-review';
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
  // D8 conflict-trigger call-site migration: the governance composition
  // consumes the judgment port (rule default = createGovernanceConflictWorkflow
  // with the same read/projection/chat/id/time deps, behavior-preserving) and
  // adapts the triggered decision back to the workflow surface the task
  // handlers consume.
  const trigger = createRuleConflictTrigger({
    read: createGovernanceConflictReadPort(composition.knowledgeOwner),
    projection: composition.conflictProjection,
    ...(composition.chat ? { chat: composition.chat } : {}),
    ...(composition.createId ? { createId: composition.createId } : {}),
    ...(composition.now ? { now: composition.now } : {}),
  });
  return {
    async detectConflicts({ entryId }) {
      const result = await trigger.detectConflicts({ entryId });
      return { detectedCount: result.detectedCount };
    },
  };
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
