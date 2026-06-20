import type { CacheMetricsSnapshot } from '@trapmap/server/lib/cache/metrics.js';
import {
  getAverageLatencyMs,
  getRuntimeMetricsSnapshot,
} from '@trapmap/server/lib/runtime/metrics.js';
import type { createWorkflowRepository } from '@trapmap/server/lib/workflows/repository.js';

type WorkflowSnapshots = Awaited<
  ReturnType<ReturnType<typeof createWorkflowRepository>['listRecent']>
>;

function readWorkflowStringStat(
  stats: Record<string, string | number | boolean | null>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = stats[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function readWorkflowNumberStat(
  stats: Record<string, string | number | boolean | null>,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const value = stats[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

export function buildWorkflowOperatorSummary(workflows: WorkflowSnapshots) {
  return workflows.map((workflow) => {
    const checkpoint = readWorkflowStringStat(workflow.stats, [
      'checkpoint',
      'resumeFromOffset',
      'resumeToken',
      'cursor',
      'offset',
    ]);
    const completed = readWorkflowNumberStat(workflow.stats, [
      'completed',
      'completedCount',
      'itemsCompleted',
      'processedCount',
    ]);
    const total = readWorkflowNumberStat(workflow.stats, [
      'total',
      'totalCount',
      'itemsTotal',
      'expectedCount',
    ]);
    const percent =
      completed !== null && total !== null && total > 0
        ? Math.min(100, (completed / total) * 100)
        : null;
    const resumeAllowed =
      workflow.status !== 'completed' &&
      (workflow.stats.resumeAllowed === true || checkpoint !== null || workflow.attempt > 0);

    return {
      runId: workflow.runId,
      workflowType: workflow.workflowType,
      status: workflow.status,
      stepName: workflow.stepName,
      lastError: workflow.lastError,
      checkpoint,
      resumeAllowed,
      progress: {
        completed,
        total,
        percent,
      },
      failureSample:
        workflow.lastError ?? readWorkflowStringStat(workflow.stats, ['failureSample']),
    };
  });
}

export function buildCapacityModel(args: {
  queuePending: number;
  outboxPending: number;
  workflowsInFlight: number;
  cacheMetrics: Record<string, CacheMetricsSnapshot>;
  databaseUrlConfigured: boolean;
}) {
  const runtime = getRuntimeMetricsSnapshot();
  const cacheValues = Object.values(args.cacheMetrics);
  return {
    databasePool: {
      configured: args.databaseUrlConfigured,
      maxConnections: null,
    },
    handlerLatency: {
      averageMs: getAverageLatencyMs(runtime.totals),
      investigateAboveMs: 5000,
    },
    backlogPressure: {
      queuePending: args.queuePending,
      outboxPending: args.outboxPending,
      workflowsInFlight: args.workflowsInFlight,
    },
    cachePressure: {
      namespacesWithPendingInvalidation: cacheValues.filter(
        (snapshot) => snapshot.pendingInvalidation,
      ).length,
      staleRecoveryCount: cacheValues.reduce((sum, snapshot) => sum + snapshot.staleRecoveries, 0),
    },
  } as const;
}

export function buildOperatorHome(args: {
  asyncRuntimeEnabled: boolean;
  queuePending: number;
  outboxPending: number;
  workflowsInFlight: number;
  staleWorkers: number;
  cacheMetrics: Record<string, CacheMetricsSnapshot>;
  configConflictWarnings: string[];
  bulkOperations: ReturnType<typeof buildWorkflowOperatorSummary>;
}) {
  const pendingInvalidations = Object.values(args.cacheMetrics).filter(
    (snapshot) => snapshot.pendingInvalidation,
  ).length;
  return {
    health: {
      headline: args.asyncRuntimeEnabled
        ? 'Async substrate configured'
        : 'Async substrate disabled',
      status: args.asyncRuntimeEnabled ? 'healthy' : 'investigate',
      summary: args.asyncRuntimeEnabled
        ? `Queue backlog=${args.queuePending}, outbox backlog=${args.outboxPending}, stale workers=${args.staleWorkers}.`
        : 'JSON-store / no-async mode only exposes cache and compatibility views.',
    },
    status: {
      headline: 'Runtime ownership and config posture',
      status: args.configConflictWarnings.length > 0 ? 'investigate' : 'healthy',
      summary:
        args.configConflictWarnings[0] ??
        'Resolved deployment profile, runtime mode, task transport, and route surface are mutually consistent.',
    },
    freshness: {
      headline: 'Projection and cache freshness',
      status:
        args.queuePending > 0 || args.outboxPending > 0 || pendingInvalidations > 0
          ? 'degraded'
          : 'healthy',
      summary: `Pending queue=${args.queuePending}, outbox=${args.outboxPending}, workflows=${args.workflowsInFlight}, cache namespaces awaiting invalidation=${pendingInvalidations}.`,
    },
    capacity: {
      headline: 'Capacity pressure',
      status:
        args.queuePending > 100 || args.outboxPending > 100 || args.workflowsInFlight > 25
          ? 'investigate'
          : 'healthy',
      summary:
        'Backlog pressure is measured from queue/outbox/workflow surfaces; sustained queue>100 or outbox>100 should trigger capacity review.',
    },
    jobControl: {
      headline: 'Bulk and follow-up jobs',
      status: args.bulkOperations.some((workflow) => workflow.status === 'failed')
        ? 'investigate'
        : args.bulkOperations.some((workflow) => workflow.status === 'running')
          ? 'degraded'
          : 'healthy',
      summary: `Visible workflow runs=${args.bulkOperations.length}; failed=${args.bulkOperations.filter((workflow) => workflow.status === 'failed').length}; resumable=${args.bulkOperations.filter((workflow) => workflow.resumeAllowed).length}.`,
    },
  } as const;
}
