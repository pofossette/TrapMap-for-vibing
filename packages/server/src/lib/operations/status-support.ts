import type { getCacheMetricsSnapshot } from '@trapmap/server/lib/cache/metrics.js';
import type { summarizeFailureClassifications } from '@trapmap/server/lib/operations/read-model.js';
import { observabilityFailureTaxonomyItems } from '@trapmap/contracts';

export const FAILURE_TAXONOMY = observabilityFailureTaxonomyItems;

export function buildRuntimeContract() {
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

export function buildIdempotencyContract() {
  return {
    syncCommandKey: 'teamId + commandName + clientRequestId',
    asyncTaskKey: 'ownerType + aggregateId + taskKind + revision-or-transition-reason',
    bulkJobKey: 'jobId + batchId + idempotencyKey + resumeFromOffset',
    dedupeWindow:
      'Sync commands dedupe at the request boundary; async tasks dedupe while queue work is pending/running; bulk jobs must provide explicit idempotency keys per batch and resume position.',
  } as const;
}

export function buildRetryResumeContract() {
  return {
    queueRetryPolicy:
      'task_queue retries with bounded attempts, exponential backoff for PostgreSQL transport, and dead-letter on exhaustion; RabbitMQ transport preserves operator surface but does not support task-id requeue.',
    outboxRetryPolicy:
      'domain_event_outbox retries with bounded attempts and backoff before moving failed events into manual replay territory.',
    runtimeMetricsSemantics:
      'executions/degraded/timeouts/retryableFailures/permanentFailures count one terminal outcome per logical operation; retries counts only extra attempts beyond the first.',
    canonicalErrorSemantics:
      'route, worker, and internal client hops must normalize transport failures to the shared canonical kinds (timeout, unavailable, forbidden, conflict, not-found, validation, internal) before operator surfaces interpret them.',
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

export function buildDiagnostics(args: {
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
