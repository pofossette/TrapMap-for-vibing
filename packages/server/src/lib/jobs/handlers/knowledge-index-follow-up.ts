import { emitCacheInvalidation } from '@trapmap/server/lib/cache/invalidation.js';
import type { GraphQueryBackend } from '@trapmap/server/lib/graph-query/backend.js';
import { runKnowledgeIndexEvent } from '@trapmap/server/lib/indexing/events.js';
import type { AdapterRegistry } from '@trapmap/server/lib/indexing/registry.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import { createWorkflowRepository } from '@trapmap/server/lib/workflows/repository.js';
import type { Pool } from 'pg';

import type { SharedJobHandler } from '../types.js';
import {
  KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE,
  type KnowledgeIndexFollowUpPayload,
} from '../types.js';

function workflowRunIdForEntry(entryId: string): string {
  return `wf_knowledge_index_${entryId}`;
}

export function createKnowledgeIndexFollowUpHandler(args: {
  store: SkillShareerStore;
  registry: AdapterRegistry;
  pool: Pool;
  graphQueryBackend?: GraphQueryBackend;
}): SharedJobHandler<KnowledgeIndexFollowUpPayload> {
  return {
    type: KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE,
    workflowType: 'knowledge-index-follow-up',
    handle: async (task) => {
      const workflowRepo = createWorkflowRepository(args.pool);
      const runId = workflowRunIdForEntry(task.payload.entryId);
      const now = new Date().toISOString();

      await workflowRepo.upsertRun({
        runId,
        workflowType: 'knowledge-index-follow-up',
        subjectId: task.payload.entryId,
        status: 'running',
        stepName: 'indexing',
        attempt: task.attempts,
        startedAt: now,
        completedAt: null,
        lastError: null,
        stats: {
          taskType: KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE,
          reason: task.payload.reason,
        },
        createdAt: now,
        updatedAt: now,
      });

      await runKnowledgeIndexEvent({
        services: {
          store: args.store,
          data: await args.store.snapshot(),
          graphQueryBackend: args.graphQueryBackend,
        },
        entryId: task.payload.entryId,
        previousState: task.payload.previousState,
        nextState: task.payload.nextState,
        reason: task.payload.reason,
        registry: args.registry,
      });

      emitCacheInvalidation({
        sourceType: 'trap',
        sourceId: task.payload.entryId,
        reason: task.payload.nextState === 'deactivated' ? 'deactivated' : 'approved',
      });

      await workflowRepo.updateRun(runId, {
        status: 'completed',
        stepName: 'completed',
        completedAt: new Date().toISOString(),
        stats: {
          taskType: KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE,
          nextState: task.payload.nextState,
        },
      });
    },
    onDead: async (task) => {
      const workflowRepo = createWorkflowRepository(args.pool);
      await workflowRepo.upsertRun({
        runId: workflowRunIdForEntry(task.payload.entryId),
        workflowType: 'knowledge-index-follow-up',
        subjectId: task.payload.entryId,
        status: 'failed',
        stepName: 'dead-letter',
        attempt: task.attempts,
        startedAt: task.startedAt?.toISOString() ?? new Date().toISOString(),
        completedAt: new Date().toISOString(),
        lastError: task.lastError ?? 'Unknown error',
        stats: {
          taskType: KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE,
        },
        createdAt: task.createdAt.toISOString(),
        updatedAt: new Date().toISOString(),
      });
    },
  };
}
