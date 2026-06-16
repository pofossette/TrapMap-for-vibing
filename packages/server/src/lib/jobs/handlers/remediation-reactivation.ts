import {
  createCacheInvalidationEvent,
  emitCacheInvalidation,
} from '@trapmap/server/lib/cache/invalidation.js';
import type { SkillShareerServices } from '@trapmap/server/lib/context.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import type { GraphQueryBackend } from '@trapmap/server/lib/graph-query/backend.js';
import { runKnowledgeIndexEvent } from '@trapmap/server/lib/indexing/events.js';
import type { AdapterRegistry } from '@trapmap/server/lib/indexing/registry.js';
import { runSkillIndexEvent } from '@trapmap/server/lib/indexing/skill-events.js';
import {
  REMEDIATION_REACTIVATION_TASK_TYPE,
  getSharedJobContract,
  type RemediationReactivationPayload,
  type SharedJobHandler,
} from '@trapmap/server/lib/jobs/types.js';
import { createWorkflowRepository } from '@trapmap/server/lib/workflows/repository.js';
import type { Pool } from 'pg';

export function createRemediationReactivationHandler(args: {
  services: Pick<
    SkillShareerServices,
    'store' | 'repos' | 'adapterRegistry' | 'ai' | 'graphQueryBackend'
  >;
  pool: Pool;
}): SharedJobHandler<RemediationReactivationPayload> {
  const contract = getSharedJobContract(REMEDIATION_REACTIVATION_TASK_TYPE);
  return {
    type: REMEDIATION_REACTIVATION_TASK_TYPE,
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
        stepName: 'reactivation',
        attempt: task.attempts,
        startedAt: now,
        completedAt: null,
        lastError: null,
        stats: {
          taskType: REMEDIATION_REACTIVATION_TASK_TYPE,
          feedbackCount: task.payload.feedbackIds.length,
        },
        createdAt: now,
        updatedAt: now,
      });

      if (task.payload.entryType === 'trap') {
        const entry = await args.services.repos.knowledge.getById(task.payload.entryId);
        if (!entry) {
          throw new AppError(404, 'not_found', 'Knowledge entry not found');
        }

        await runKnowledgeIndexEvent({
          services: {
            store: args.services.store,
            data: await args.services.store.snapshot(),
            ai: { chat: args.services.ai.chat },
            ...(args.services.graphQueryBackend
              ? { graphQueryBackend: args.services.graphQueryBackend as GraphQueryBackend }
              : {}),
          },
          entryId: task.payload.entryId,
          previousState: entry.lifecycleState,
          nextState: entry.lifecycleState,
          reason: 'updated',
          registry: args.services.adapterRegistry as AdapterRegistry,
        });
      } else {
        const artifact = await args.services.repos.artifact.getById(task.payload.entryId);
        if (!artifact) {
          throw new AppError(404, 'not_found', 'Skill artifact not found');
        }

        await runSkillIndexEvent({
          services: {
            store: args.services.store,
            data: await args.services.store.snapshot(),
            ai: { chat: args.services.ai.chat },
            ...(args.services.graphQueryBackend
              ? { graphQueryBackend: args.services.graphQueryBackend }
              : {}),
          },
          artifactId: task.payload.entryId,
          previousState: artifact.lifecycleState,
          nextState: artifact.lifecycleState,
          reason: 'updated',
        });
      }

      emitCacheInvalidation(
        createCacheInvalidationEvent({
          sourceType: task.payload.entryType,
          sourceId: task.payload.entryId,
          reason: 'remediation-reactivated',
          owner: 'feedback-remediation-projection',
          trigger: 'shared-job',
        }),
      );

      await workflowRepo.updateRun(runId, {
        status: 'completed',
        stepName: 'completed',
        completedAt: new Date().toISOString(),
        stats: {
          taskType: REMEDIATION_REACTIVATION_TASK_TYPE,
          entryType: task.payload.entryType,
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
          taskType: REMEDIATION_REACTIVATION_TASK_TYPE,
        },
        createdAt: task.createdAt.toISOString(),
        updatedAt: new Date().toISOString(),
      });
    },
  };
}
