import {
  createCacheInvalidationEvent,
  emitCacheInvalidation,
} from '@trapmap/server/lib/cache/invalidation.js';
import type { SkillShareerServices } from '@trapmap/server/lib/context.js';
import { runSkillIndexEvent } from '@trapmap/server/lib/indexing/skill-events.js';
import {
  SKILL_INDEX_FOLLOW_UP_TASK_TYPE,
  type SharedJobHandler,
  type SkillIndexFollowUpPayload,
  getSharedJobContract,
} from '@trapmap/server/lib/jobs/types.js';
import { createWorkflowRepository } from '@trapmap/server/lib/workflows/repository.js';
import type { Pool } from 'pg';

export function createSkillIndexFollowUpHandler(args: {
  services: Pick<SkillShareerServices, 'store' | 'ai' | 'graphQueryBackend'>;
  pool: Pool;
}): SharedJobHandler<SkillIndexFollowUpPayload> {
  const contract = getSharedJobContract(SKILL_INDEX_FOLLOW_UP_TASK_TYPE);
  return {
    type: SKILL_INDEX_FOLLOW_UP_TASK_TYPE,
    workflowType: contract.workflow.workflowType,
    handle: async (task) => {
      const workflowRepo = createWorkflowRepository(args.pool);
      const runId = contract.workflow.runId(task.payload);
      const now = new Date().toISOString();

      await workflowRepo.upsertRun({
        runId,
        workflowType: contract.workflow.workflowType,
        subjectId: contract.workflow.subjectId(task.payload),
        status: 'running',
        stepName: 'projection-refresh',
        attempt: task.attempts,
        startedAt: now,
        completedAt: null,
        lastError: null,
        stats: {
          taskType: SKILL_INDEX_FOLLOW_UP_TASK_TYPE,
          reason: task.payload.reason,
        },
        createdAt: now,
        updatedAt: now,
      });

      await runSkillIndexEvent({
        services: {
          store: args.services.store,
          data: await args.services.store.snapshot(),
          ai: { chat: args.services.ai.chat },
          graphQueryBackend: args.services.graphQueryBackend,
        },
        artifactId: task.payload.artifactId,
        previousState: task.payload.previousState,
        nextState: task.payload.nextState,
        reason: task.payload.reason,
      });

      emitCacheInvalidation(
        createCacheInvalidationEvent({
          sourceType: 'skill',
          sourceId: task.payload.artifactId,
          reason: task.payload.nextState === 'deactivated' ? 'deactivated' : 'approved',
          owner: 'skill-lifecycle-projection',
          trigger: 'shared-job',
        }),
      );

      await workflowRepo.updateRun(runId, {
        status: 'completed',
        stepName: 'completed',
        completedAt: new Date().toISOString(),
        stats: {
          taskType: SKILL_INDEX_FOLLOW_UP_TASK_TYPE,
          nextState: task.payload.nextState,
        },
      });
    },
    onDead: async (task) => {
      const workflowRepo = createWorkflowRepository(args.pool);
      await workflowRepo.upsertRun({
        runId: contract.workflow.runId(task.payload),
        workflowType: contract.workflow.workflowType,
        subjectId: contract.workflow.subjectId(task.payload),
        status: 'failed',
        stepName: contract.deadLetter.stepName,
        attempt: task.attempts,
        startedAt: task.startedAt?.toISOString() ?? new Date().toISOString(),
        completedAt: new Date().toISOString(),
        lastError: task.lastError ?? 'Unknown error',
        stats: {
          taskType: SKILL_INDEX_FOLLOW_UP_TASK_TYPE,
        },
        createdAt: task.createdAt.toISOString(),
        updatedAt: new Date().toISOString(),
      });
    },
  };
}
