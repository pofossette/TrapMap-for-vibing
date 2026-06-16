import {
  asyncOperationsStatusResponseSchema,
  asyncTaskRequeueResponseSchema,
  compatibilityStatusRequestSchema,
  compatibilityStatusResponseSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { getRetrievalCacheStats } from '@trapmap/server/lib/cache/metrics.js';
import { createDomainEventOutbox } from '@trapmap/server/lib/lifecycle/outbox.js';
import { buildCompatibilityStatusProjection } from '@trapmap/server/lib/operations/read-model.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { createTaskQueue } from '@trapmap/server/lib/queue/task-queue.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAsyncWorkerState } from '@trapmap/server/lib/runtime/runtime-metadata.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { createWorkflowRepository } from '@trapmap/server/lib/workflows/repository.js';

export const statusRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/operations/status/async', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    const store = app.skillShareer.store;
    if (!(store instanceof PostgresStore)) {
      return asyncOperationsStatusResponseSchema.parse({
        asyncRuntimeEnabled: false,
        queue: {
          pending: 0,
          running: 0,
          dead: 0,
          staleRunning: 0,
          backlogOldestAgeSeconds: null,
          runningOldestAgeSeconds: null,
          deadOldestAgeSeconds: null,
          reclaimCount: 0,
          workerState: 'not-configured',
          recentDeadLetters: [],
        },
        outbox: {
          pending: 0,
          processing: 0,
          failed: 0,
          staleProcessing: 0,
          backlogOldestAgeSeconds: null,
          processingOldestAgeSeconds: null,
          failedOldestAgeSeconds: null,
          reclaimCount: 0,
          workerState: 'not-configured',
          recentFailures: [],
        },
        cache: getRetrievalCacheStats(),
        workflows: [],
        reportedAt: nowIso(),
      });
    }

    const pool = store.getPool();
    const queue = createTaskQueue({ pool });
    const outbox = createDomainEventOutbox({ pool });
    const workflowRepo = createWorkflowRepository(pool);
    const [queueSnapshot, outboxSnapshot, workflows] = await Promise.all([
      queue.getStatusSnapshot(),
      outbox.getStatusSnapshot(),
      workflowRepo.listRecent(25),
    ]);

    const queueWorker = (app as any).taskWorker;
    const outboxWorker = (app as any).outboxWorker;
    const runtimeMode = app.skillShareer.runtimeMode;

    return asyncOperationsStatusResponseSchema.parse({
      asyncRuntimeEnabled: true,
      queue: {
        ...queueSnapshot,
        workerState: resolveAsyncWorkerState({
          database: 'postgres',
          runtimeMode,
          workerKind: 'queue',
          owner: queueWorker?.ownsWork?.(),
          running: queueWorker?.isRunning?.() ?? false,
        }),
      },
      outbox: {
        ...outboxSnapshot,
        workerState: resolveAsyncWorkerState({
          database: 'postgres',
          runtimeMode,
          workerKind: 'outbox',
          owner: outboxWorker?.ownsWork?.(),
          running: outboxWorker?.isRunning?.() ?? false,
        }),
      },
      cache: getRetrievalCacheStats(),
      workflows,
      reportedAt: nowIso(),
    });
  });

  app.post('/v1/operations/status/async/tasks/:taskId/requeue', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    const store = app.skillShareer.store;
    if (!(store instanceof PostgresStore)) {
      return asyncTaskRequeueResponseSchema.parse({
        taskId: (request.params as { taskId: string }).taskId,
        requeued: false,
        reportedAt: nowIso(),
      });
    }

    const taskId = (request.params as { taskId: string }).taskId;
    const queue = createTaskQueue({ pool: store.getPool() });
    const before = await queue.getStatusSnapshot();
    await queue.requeue(taskId);
    const after = await queue.getStatusSnapshot();

    return asyncTaskRequeueResponseSchema.parse({
      taskId,
      requeued: after.dead < before.dead || after.pending > before.pending,
      reportedAt: nowIso(),
    });
  });

  // Compatibility status route (Phase 16-01: COMP-03)
  app.get('/v1/operations/status', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    const query = compatibilityStatusRequestSchema.parse(
      (request.query as Record<string, unknown>) ?? {},
    );

    const projection = await buildCompatibilityStatusProjection(
      app.skillShareer.repos,
      query.teamId !== undefined ? { teamId: query.teamId } : {},
    );

    return compatibilityStatusResponseSchema.parse({
      ...projection,
      reportedAt: nowIso(),
    });
  });
};
