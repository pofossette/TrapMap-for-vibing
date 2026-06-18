import {
  asyncOperationsStatusResponseSchema,
  asyncTaskRequeueResponseSchema,
  compatibilityStatusRequestSchema,
  compatibilityStatusResponseSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { getRetrievalCacheStats } from '@trapmap/server/lib/cache/metrics.js';
import { buildCompatibilityStatusProjection } from '@trapmap/server/lib/operations/read-model.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAsyncWorkerState } from '@trapmap/server/lib/runtime/runtime-metadata.js';
import { getServiceUnitProfile } from '@trapmap/server/lib/runtime/service-unit.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { createWorkflowRepository } from '@trapmap/server/lib/workflows/repository.js';

export const statusRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/operations/status/async', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    const store = app.skillShareer.store;
    const runtimeMode = app.skillShareer.runtimeMode;
    const serviceUnit = app.skillShareer.serviceUnit;
    const serviceUnitProfile = getServiceUnitProfile(serviceUnit, runtimeMode);
    const adoptionGuidanceForProviders = (
      taskTransportProvider: 'postgres' | 'rabbitmq' | 'not-configured',
    ): string =>
      taskTransportProvider === 'rabbitmq'
        ? 'RabbitMQ mode enabled: PostgreSQL outbox remains authoritative for domain events.'
        : 'Default mode: keep postgres task queue unless sustained backlog thresholds justify RabbitMQ.';

    if (!(store instanceof PostgresStore)) {
      return asyncOperationsStatusResponseSchema.parse({
        asyncRuntimeEnabled: false,
        runtimeMode,
        serviceUnit,
        taskTransportProvider: 'not-configured',
        eventTransportProvider: 'not-configured',
        adoptionGuidance: adoptionGuidanceForProviders('not-configured'),
        queue: {
          provider: 'not-configured',
          pending: 0,
          running: 0,
          dead: 0,
          staleRunning: 0,
          backlogOldestAgeSeconds: null,
          runningOldestAgeSeconds: null,
          deadOldestAgeSeconds: null,
          reclaimCount: 0,
          workerState: 'not-configured',
          serviceUnit,
          ownership: {
            ownsAny: false,
            ownsCandidateTaskWork: false,
            ownsSharedJobTaskWork: false,
          },
          recentDeadLetters: [],
        },
        outbox: {
          provider: 'not-configured',
          pending: 0,
          processing: 0,
          failed: 0,
          staleProcessing: 0,
          backlogOldestAgeSeconds: null,
          processingOldestAgeSeconds: null,
          failedOldestAgeSeconds: null,
          reclaimCount: 0,
          workerState: 'not-configured',
          serviceUnit,
          ownership: {
            ownsAny: false,
            ownsOutboxWork: false,
          },
          recentFailures: [],
        },
        cache: getRetrievalCacheStats(),
        workflows: [],
        reportedAt: nowIso(),
      });
    }

    const transport = app.skillShareer.asyncTransport;
    if (!transport) {
      throw new Error('Postgres runtime requires skillShareer.asyncTransport for async status');
    }
    const workflowRepo = createWorkflowRepository(store.getPool());
    const [queueSnapshot, outboxSnapshot, workflows] = await Promise.all([
      transport.task.getStatusSnapshot(),
      transport.events.getStatusSnapshot(),
      workflowRepo.listRecent(25),
    ]);

    const queueWorker = (app as any).taskWorker;
    const outboxWorker = (app as any).outboxWorker;

    return asyncOperationsStatusResponseSchema.parse({
      asyncRuntimeEnabled: true,
      runtimeMode,
      serviceUnit,
      taskTransportProvider: queueSnapshot.provider,
      eventTransportProvider: outboxSnapshot.provider,
      adoptionGuidance: adoptionGuidanceForProviders(queueSnapshot.provider),
      queue: {
        ...queueSnapshot,
        workerState: resolveAsyncWorkerState({
          database: 'postgres',
          runtimeMode,
          workerKind: 'queue',
          owner: queueWorker?.ownsWork?.(),
          running: queueWorker?.isRunning?.() ?? false,
        }),
        serviceUnit,
        ownership: {
          ownsAny:
            serviceUnitProfile.ownsCandidateTaskWork || serviceUnitProfile.ownsSharedJobTaskWork,
          ownsCandidateTaskWork: serviceUnitProfile.ownsCandidateTaskWork,
          ownsSharedJobTaskWork: serviceUnitProfile.ownsSharedJobTaskWork,
        },
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
        serviceUnit,
        ownership: {
          ownsAny: serviceUnitProfile.ownsOutboxWork,
          ownsOutboxWork: serviceUnitProfile.ownsOutboxWork,
        },
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
    const transport = app.skillShareer.asyncTransport;
    if (!transport) {
      throw new Error('Postgres runtime requires skillShareer.asyncTransport for task requeue');
    }
    const before = await transport.task.getStatusSnapshot();
    await transport.task.requeue(taskId);
    const after = await transport.task.getStatusSnapshot();

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
