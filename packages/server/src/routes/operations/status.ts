import {
  asyncOperationsStatusResponseSchema,
  asyncTaskRequeueResponseSchema,
  compatibilityStatusRequestSchema,
  compatibilityStatusResponseSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { buildConfigGovernanceSummary } from '@trapmap/server/config.js';
import { getCacheMetricsSnapshot } from '@trapmap/server/lib/cache/metrics.js';
import {
  buildCompatibilityStatusProjection,
  summarizeFailureClassifications,
} from '@trapmap/server/lib/operations/read-model.js';
import {
  FAILURE_TAXONOMY,
  buildDiagnostics,
  buildIdempotencyContract,
  buildRetryResumeContract,
  buildRuntimeContract,
} from '@trapmap/server/lib/operations/status-support.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import {
  recordRuntimeBacklog,
  resolveAsyncWorkerState,
  getServiceUnitProfile,
} from '@trapmap/server/lib/runtime/index.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { createWorkflowRepository } from '@trapmap/server/lib/workflows/repository.js';
import {
  buildCapacityModel,
  buildFreshnessContract,
  buildOperatorHome,
  buildRuntimeMetricsSummary,
  buildWorkflowOperatorSummary,
} from './status-phase3.js';

export const statusRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/operations/status/async', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    const store = app.skillShareer.store;
    const runtimeMode = app.skillShareer.runtimeMode;
    const serviceUnit = app.skillShareer.serviceUnit;
    const runtimeDeployment = app.skillShareer.runtimeDeployment;
    const serviceUnitProfile = getServiceUnitProfile(serviceUnit, runtimeMode);
    const configGovernance = buildConfigGovernanceSummary(app.skillShareer.config);
    const adoptionGuidanceForProviders = (
      taskTransportProvider: 'postgres' | 'rabbitmq' | 'not-configured',
    ): string =>
      taskTransportProvider === 'rabbitmq'
        ? 'RabbitMQ mode enabled: PostgreSQL outbox remains authoritative for domain events.'
        : 'Default mode: keep postgres task queue unless sustained backlog thresholds justify RabbitMQ.';

    const cacheMetrics = getCacheMetricsSnapshot();

    if (!(store instanceof PostgresStore)) {
      const bulkOperations: ReturnType<typeof buildWorkflowOperatorSummary> = [];
      const capacityModel = buildCapacityModel({
        queuePending: 0,
        outboxPending: 0,
        workflowsInFlight: 0,
        cacheMetrics,
        databaseUrlConfigured: app.skillShareer.config.databaseUrl !== null,
      });
      return asyncOperationsStatusResponseSchema.parse({
        asyncRuntimeEnabled: false,
        deploymentProfile: runtimeDeployment.deploymentProfile,
        runtimeMode,
        serviceUnit,
        routeSurface: runtimeDeployment.capabilities.routeSurface,
        asyncOwnershipExpectation: runtimeDeployment.capabilities.asyncOwnershipExpectation,
        storagePosture: runtimeDeployment.capabilities.storagePosture,
        authTeamExpectation: runtimeDeployment.capabilities.authTeamExpectation,
        taskTransportProvider: 'not-configured',
        eventTransportProvider: 'not-configured',
        adoptionGuidance: adoptionGuidanceForProviders('not-configured'),
        runtimeContract: buildRuntimeContract(),
        idempotencyContract: buildIdempotencyContract(),
        retryResumeContract: buildRetryResumeContract(),
        freshnessContract: buildFreshnessContract({
          queuePending: 0,
          outboxPending: 0,
          staleWorkers: 0,
          workflowsInFlight: 0,
          cacheMetrics,
        }),
        failureTaxonomy: FAILURE_TAXONOMY,
        operatorHome: buildOperatorHome({
          asyncRuntimeEnabled: false,
          queuePending: 0,
          outboxPending: 0,
          workflowsInFlight: 0,
          staleWorkers: 0,
          cacheMetrics,
          configConflictWarnings: configGovernance.conflictWarnings,
          bulkOperations,
        }),
        configGovernance,
        capacityModel,
        runtimeMetrics: buildRuntimeMetricsSummary(),
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
        diagnostics: buildDiagnostics({
          queuePending: 0,
          queueDead: 0,
          queueStaleRunning: 0,
          outboxPending: 0,
          outboxFailed: 0,
          outboxStaleProcessing: 0,
          workflows: [],
          cacheMetrics,
          badcaseSummary: summarizeFailureClassifications([]),
        }),
        cache: cacheMetrics,
        workflows: [],
        bulkOperations,
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
    const badcaseRows = await store.getPool().query<{ failure_classification: string | null }>(
      `SELECT failure_classification
       FROM retrieval_badcase_traces
       ORDER BY created_at DESC
       LIMIT 100`,
    );
    const queueWorker = (app as any).taskWorker;
    const outboxWorker = (app as any).outboxWorker;
    const queueWorkerState = resolveAsyncWorkerState({
      database: 'postgres',
      runtimeMode,
      workerKind: 'queue',
      owner: queueWorker?.ownsWork?.(),
      running: queueWorker?.isRunning?.() ?? false,
    });
    const outboxWorkerState = resolveAsyncWorkerState({
      database: 'postgres',
      runtimeMode,
      workerKind: 'outbox',
      owner: outboxWorker?.ownsWork?.(),
      running: outboxWorker?.isRunning?.() ?? false,
    });
    const workflowsInFlight = workflows.filter(
      (workflow) => workflow.status !== 'completed',
    ).length;
    const staleWorkers = queueSnapshot.staleRunning + outboxSnapshot.staleProcessing;
    recordRuntimeBacklog({
      dependencyName: 'async-operator-status',
      queueBacklog: queueSnapshot.pending,
      outboxBacklog: outboxSnapshot.pending,
      staleWorkers,
    });
    const bulkOperations = buildWorkflowOperatorSummary(workflows);
    const capacityModel = buildCapacityModel({
      queuePending: queueSnapshot.pending,
      outboxPending: outboxSnapshot.pending,
      workflowsInFlight,
      cacheMetrics,
      databaseUrlConfigured: app.skillShareer.config.databaseUrl !== null,
    });
    const diagnostics = buildDiagnostics({
      queuePending: queueSnapshot.pending,
      queueDead: queueSnapshot.dead,
      queueStaleRunning: queueSnapshot.staleRunning,
      outboxPending: outboxSnapshot.pending,
      outboxFailed: outboxSnapshot.failed,
      outboxStaleProcessing: outboxSnapshot.staleProcessing,
      workflows,
      cacheMetrics,
      badcaseSummary: summarizeFailureClassifications(
        badcaseRows.rows.map((row) => ({
          failureClassification: row.failure_classification,
        })),
      ),
    });

    return asyncOperationsStatusResponseSchema.parse({
      asyncRuntimeEnabled: true,
      deploymentProfile: runtimeDeployment.deploymentProfile,
      runtimeMode,
      serviceUnit,
      routeSurface: runtimeDeployment.capabilities.routeSurface,
      asyncOwnershipExpectation: runtimeDeployment.capabilities.asyncOwnershipExpectation,
      storagePosture: runtimeDeployment.capabilities.storagePosture,
      authTeamExpectation: runtimeDeployment.capabilities.authTeamExpectation,
      taskTransportProvider: queueSnapshot.provider,
      eventTransportProvider: outboxSnapshot.provider,
      adoptionGuidance: adoptionGuidanceForProviders(queueSnapshot.provider),
      runtimeContract: buildRuntimeContract(),
      idempotencyContract: buildIdempotencyContract(),
      retryResumeContract: buildRetryResumeContract(),
      freshnessContract: buildFreshnessContract({
        queuePending: queueSnapshot.pending,
        outboxPending: outboxSnapshot.pending,
        staleWorkers,
        workflowsInFlight,
        cacheMetrics,
      }),
      failureTaxonomy: FAILURE_TAXONOMY,
      operatorHome: buildOperatorHome({
        asyncRuntimeEnabled: true,
        queuePending: queueSnapshot.pending,
        outboxPending: outboxSnapshot.pending,
        workflowsInFlight,
        staleWorkers,
        cacheMetrics,
        configConflictWarnings: configGovernance.conflictWarnings,
        bulkOperations,
      }),
      configGovernance,
      capacityModel,
      runtimeMetrics: buildRuntimeMetricsSummary(),
      queue: {
        ...queueSnapshot,
        workerState: queueWorkerState,
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
        workerState: outboxWorkerState,
        serviceUnit,
        ownership: {
          ownsAny: serviceUnitProfile.ownsOutboxWork,
          ownsOutboxWork: serviceUnitProfile.ownsOutboxWork,
        },
      },
      diagnostics,
      cache: cacheMetrics,
      workflows,
      bulkOperations,
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
