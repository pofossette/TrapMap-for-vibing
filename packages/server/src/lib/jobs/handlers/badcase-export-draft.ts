import type { SkillShareerServices } from '@trapmap/server/lib/context.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { recordRuntimeExecution } from '@trapmap/server/lib/runtime/metrics.js';
import { createWorkflowRepository } from '@trapmap/server/lib/workflows/repository.js';
import type { Pool } from 'pg';

import {
  BADCASE_EXPORT_DRAFT_TASK_TYPE,
  getSharedJobContract,
  type BadcaseExportDraftPayload,
  type SharedJobHandler,
} from '@trapmap/server/lib/jobs/types.js';

export function createBadcaseExportDraftHandler(args: {
  services: Pick<SkillShareerServices, 'store'>;
  pool: Pool;
}): SharedJobHandler<BadcaseExportDraftPayload> {
  const contract = getSharedJobContract(BADCASE_EXPORT_DRAFT_TASK_TYPE);
  return {
    type: BADCASE_EXPORT_DRAFT_TASK_TYPE,
    workflowType: contract.workflow.workflowType,
    handle: async (task) => {
      const startedAt = Date.now();
      const workflowRepo = createWorkflowRepository(args.pool);
      const runId = contract.workflow.runId(task.payload);
      const now = new Date().toISOString();

      await workflowRepo.upsertRun({
        runId,
        workflowType: contract.workflow.workflowType,
        subjectId: contract.workflow.subjectId(task.payload),
        status: 'running',
        stepName: 'draft-export',
        attempt: task.attempts,
        startedAt: now,
        completedAt: null,
        lastError: null,
        stats: {
          taskType: BADCASE_EXPORT_DRAFT_TASK_TYPE,
          entryId: task.payload.entryId,
          entryType: task.payload.entryType,
          queryId: task.payload.queryId,
        },
        createdAt: now,
        updatedAt: now,
      });

      if (args.services.store instanceof PostgresStore) {
        await args.services.store.getPool().query(
          `UPDATE retrieval_badcase_traces
           SET updated_at = NOW()
           WHERE feedback_id = $1`,
          [task.payload.feedbackId],
        );
      }

      await workflowRepo.updateRun(runId, {
        status: 'completed',
        stepName: 'completed',
        completedAt: new Date().toISOString(),
        stats: {
          taskType: BADCASE_EXPORT_DRAFT_TASK_TYPE,
          exportDraftReady: true,
        },
      });
      recordRuntimeExecution({
        dependencyName: 'badcase-export',
        latencyMs: Date.now() - startedAt,
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
          taskType: BADCASE_EXPORT_DRAFT_TASK_TYPE,
        },
        createdAt: task.createdAt.toISOString(),
        updatedAt: new Date().toISOString(),
      });
    },
  };
}
