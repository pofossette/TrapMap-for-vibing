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
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAsyncWorkerState } from '@trapmap/server/lib/runtime/runtime-metadata.js';
import { getServiceUnitProfile } from '@trapmap/server/lib/runtime/service-unit.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { createWorkflowRepository } from '@trapmap/server/lib/workflows/repository.js';
import {
  buildCapacityModel,
  buildFreshnessContract,
  buildOperatorHome,
  buildWorkflowOperatorSummary,
} from './status-phase3.js';

const FAILURE_TAXONOMY = [
  {
    category: 'user-error',
    meaning:
      'The request or operator input is invalid and retrying without correction will not succeed.',
    operatorAction: 'Fix the request payload, command parameters, or target state before retrying.',
  },
  {
    category: 'auth-policy-error',
    meaning: 'Authorization, membership, or policy checks rejected the action.',
    operatorAction:
      'Adjust actor permissions, team context, or policy state before replaying the action.',
  },
  {
    category: 'dependency-error',
    meaning:
      'A required dependency such as PostgreSQL, graph/indexing, or storage integration is unavailable or unhealthy.',
    operatorAction: 'Restore the dependency, then replay or requeue the blocked work item.',
  },
  {
    category: 'timeout',
    meaning: 'The action exceeded its runtime budget and may require retry or decomposition.',
    operatorAction:
      'Check handler latency, reduce batch size if relevant, and retry after the timeout source is addressed.',
  },
  {
    category: 'stale-projection',
    meaning:
      'Authoritative writes committed, but read-side projections or caches have not converged yet.',
    operatorAction:
      'Inspect queue/outbox backlog, workflow runs, and cache invalidation status; replay refresh work only after the updater is healthy.',
  },
  {
    category: 'retryable-async-failure',
    meaning:
      'The async substrate captured a transient failure and will retry automatically until limits are exhausted.',
    operatorAction:
      'Monitor retry progress; intervene only if backlog, stale leases, or repeated failures indicate the worker cannot self-recover.',
  },
  {
    category: 'permanent-failure',
    meaning:
      'Retry limits were exhausted and the work item is now dead-lettered or failed for manual intervention.',
    operatorAction:
      'Inspect the failed task or outbox record, repair the underlying cause, then requeue or replay the item if it is still canonical.',
  },
] as const;

function buildRuntimeContract() {
  return {
    workerModes: {
      api: 'API-only runtime may report remote worker ownership in PostgreSQL deployments and remains healthy when it is not expected to own async work locally.',
      'task-worker':
        'Task-worker runtime is responsible only for task_queue consumption and is degraded when queue work is locally owned but not running.',
      'outbox-worker':
        'Outbox-worker runtime is responsible only for domain_event_outbox consumption and is degraded when outbox work is locally owned but not running.',
      combined:
        'Combined runtime may own both queues and is not-ready when any locally owned async dependency is degraded.',
    },
    degradedSemantics:
      'Degraded means the runtime is alive but one dependency is in fallback or one locally owned async worker is not meeting its ownership contract; not-ready is reserved for failed graph dependency or degraded locally owned worker state.',
  } as const;
}

function buildIdempotencyContract() {
  return {
    syncCommandKey: 'teamId + commandName + clientRequestId',
    asyncTaskKey: 'ownerType + aggregateId + taskKind + revision-or-transition-reason',
    bulkJobKey: 'jobId + batchId + idempotencyKey + resumeFromOffset',
    dedupeWindow:
      'Sync commands dedupe at the request boundary; async tasks dedupe while queue work is pending/running; bulk jobs must provide explicit idempotency keys per batch and resume position.',
  } as const;
}

function buildRetryResumeContract() {
  return {
    queueRetryPolicy:
      'task_queue retries with bounded attempts, exponential backoff for PostgreSQL transport, and dead-letter on exhaustion; RabbitMQ transport preserves operator surface but does not support task-id requeue.',
    outboxRetryPolicy:
      'domain_event_outbox retries with bounded attempts and backoff before moving failed events into manual replay territory.',
    deadLetterPolicy:
      'Dead queue tasks and failed outbox events are operator-visible and require manual repair plus requeue/replay when the write is still canonical.',
    reclaimPolicy:
      'Lease-based workers reclaim stale running or processing work by resetting it to pending and incrementing reclaim counters.',
    workflowCheckpointSource:
      'workflow_runs.stats is the checkpoint/resume snapshot surface for long-running follow-up work; handlers must persist progress there instead of hiding it in process memory.',
    bulkResumePolicy:
      'Bulk paths must carry jobId, batchId, idempotencyKey, and resumeFromOffset/checkpoint semantics; they resume from the last durable checkpoint instead of re-running one giant transaction.',
  } as const;
}

function buildDiagnostics(args: {
  queuePending: number;
  queueDead: number;
  queueStaleRunning: number;
  outboxPending: number;
  outboxFailed: number;
  outboxStaleProcessing: number;
  workflows: Array<{ status: string; lastError: string | null }>;
  cacheMetrics: ReturnType<typeof getCacheMetricsSnapshot>;
  badcaseSummary: ReturnType<typeof summarizeFailureClassifications>;
}) {
  const evidence: string[] = [];
  let dominantFailureCategory:
    | 'stale-projection'
    | 'permanent-failure'
    | 'retryable-async-failure'
    | 'dependency-error'
    | null = null;
  let owningSubsystem: 'queue' | 'outbox' | 'workflow' | 'cache' | 'badcase' | 'none' = 'none';
  let nextInspection = 'No urgent async fault detected; continue routine status checks.';

  const failedWorkflows = args.workflows.filter((workflow) => workflow.status === 'failed').length;
  const staleCaches = Object.entries(args.cacheMetrics).filter(
    ([, value]) => value.pendingInvalidation,
  ).length;

  if (args.queueDead > 0 || args.outboxFailed > 0 || failedWorkflows > 0) {
    dominantFailureCategory = 'permanent-failure';
    if (args.queueDead >= args.outboxFailed && args.queueDead >= failedWorkflows) {
      owningSubsystem = 'queue';
      nextInspection =
        'Inspect queue dead letters and the corresponding workflow run before requeue.';
      evidence.push(`${args.queueDead} dead queue task(s) awaiting manual repair`);
    } else if (args.outboxFailed >= failedWorkflows) {
      owningSubsystem = 'outbox';
      nextInspection = 'Inspect failed outbox events and subscriber errors before replay.';
      evidence.push(`${args.outboxFailed} failed outbox event(s) blocked`);
    } else {
      owningSubsystem = 'workflow';
      nextInspection = 'Inspect failed workflow runs and their checkpoint stats before replay.';
      evidence.push(`${failedWorkflows} failed workflow run(s) detected`);
    }
  } else if (
    args.queuePending > 0 ||
    args.outboxPending > 0 ||
    args.queueStaleRunning > 0 ||
    args.outboxStaleProcessing > 0 ||
    staleCaches > 0
  ) {
    dominantFailureCategory = 'stale-projection';
    if (args.queuePending >= args.outboxPending && args.queuePending > 0) {
      owningSubsystem = 'queue';
      nextInspection = 'Inspect queue backlog, worker ownership, and stale leases.';
      evidence.push(`${args.queuePending} pending queue task(s) delaying convergence`);
    } else if (args.outboxPending > 0 || args.outboxStaleProcessing > 0) {
      owningSubsystem = 'outbox';
      nextInspection = 'Inspect outbox backlog, failed subscribers, and stale processing leases.';
      evidence.push(`${args.outboxPending} pending outbox event(s) delaying projection refresh`);
    } else if (staleCaches > 0) {
      owningSubsystem = 'cache';
      nextInspection = 'Inspect cache invalidation backlog before replaying manual refreshes.';
      evidence.push(`${staleCaches} cache namespace(s) still pending invalidation`);
    }
  }

  if (args.badcaseSummary.totalClassified > 0) {
    evidence.push(
      `badcase dominant classification: ${args.badcaseSummary.dominantClassification ?? 'none'}`,
    );
    if (owningSubsystem === 'none') {
      owningSubsystem = 'badcase';
      nextInspection =
        'Inspect badcase classifications to determine whether recall, ranking, or summary remediation is needed.';
    }
  }

  if (args.queueStaleRunning > 0 || args.outboxStaleProcessing > 0) {
    evidence.push(
      `${args.queueStaleRunning + args.outboxStaleProcessing} stale lease(s) indicate worker reclaim pressure`,
    );
  }

  return {
    dominantFailureCategory,
    owningSubsystem,
    nextInspection,
    evidence: evidence.slice(0, 10),
    badcaseClassificationSummary: args.badcaseSummary,
  } as const;
}

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
