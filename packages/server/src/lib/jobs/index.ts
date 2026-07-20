export * from './scheduler.js';
export * from './types.js';
export * from './handlers/knowledge-index-follow-up.js';
export * from './handlers/skill-index-follow-up.js';

import type { TaskHandler } from '@trapmap/server/lib/queue/task-queue.js';

import { createKnowledgeIndexFollowUpHandler } from './handlers/knowledge-index-follow-up.js';
import { createSkillIndexFollowUpHandler } from './handlers/skill-index-follow-up.js';
import {
  type KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE,
  type SKILL_INDEX_FOLLOW_UP_TASK_TYPE,
  getSharedJobContract,
} from './types.js';

export interface SharedJobHandlerDependencies {
  knowledgeIndexFollowUp: Parameters<typeof createKnowledgeIndexFollowUpHandler>[0];
  skillIndexFollowUp: Parameters<typeof createSkillIndexFollowUpHandler>[0];
}

export interface SharedJobHandlersContract {
  readonly knowledgeIndexFollowUp: TaskHandler<unknown>;
  readonly skillIndexFollowUp: TaskHandler<unknown>;
}

export function buildSharedJobHandlersContract(
  args: SharedJobHandlerDependencies,
): SharedJobHandlersContract {
  const knowledgeHandler = createKnowledgeIndexFollowUpHandler(args.knowledgeIndexFollowUp);
  const skillHandler = createSkillIndexFollowUpHandler(args.skillIndexFollowUp);

  const handlers = [knowledgeHandler, skillHandler] as const;

  for (const handler of handlers) {
    const contract = getSharedJobContract(
      handler.type as
        | typeof KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE
        | typeof SKILL_INDEX_FOLLOW_UP_TASK_TYPE,
    );
    if (handler.workflowType !== contract.workflow.workflowType) {
      throw new Error(
        `Shared job handler "${handler.type}" must declare workflow type "${contract.workflow.workflowType}"`,
      );
    }
  }

  return {
    knowledgeIndexFollowUp: knowledgeHandler as TaskHandler<unknown>,
    skillIndexFollowUp: skillHandler as TaskHandler<unknown>,
  };
}

export function createSharedJobHandlers(
  args: SharedJobHandlerDependencies,
): TaskHandler<unknown>[] {
  const contract = buildSharedJobHandlersContract(args);
  return [contract.knowledgeIndexFollowUp, contract.skillIndexFollowUp];
}
