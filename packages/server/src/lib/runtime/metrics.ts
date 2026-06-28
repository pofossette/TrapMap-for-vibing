export type RuntimeFailureKind = 'timeout' | 'retryable' | 'permanent';

export interface RuntimeMetricsCounter {
  executions: number;
  degraded: number;
  reclaims: number;
  timeouts: number;
  retryableFailures: number;
  permanentFailures: number;
  retries: number;
  totalLatencyMs: number;
  queueBacklogSamples: number;
  queueBacklogTotal: number;
  outboxBacklogSamples: number;
  outboxBacklogTotal: number;
  staleWorkerSamples: number;
  staleWorkerTotal: number;
}

export interface RuntimeMetricsSnapshot {
  totals: RuntimeMetricsCounter;
  dependencies: Record<string, RuntimeMetricsCounter>;
}

function makeCounter(): RuntimeMetricsCounter {
  return {
    executions: 0,
    degraded: 0,
    reclaims: 0,
    timeouts: 0,
    retryableFailures: 0,
    permanentFailures: 0,
    retries: 0,
    totalLatencyMs: 0,
    queueBacklogSamples: 0,
    queueBacklogTotal: 0,
    outboxBacklogSamples: 0,
    outboxBacklogTotal: 0,
    staleWorkerSamples: 0,
    staleWorkerTotal: 0,
  };
}

const totals = makeCounter();
const dependencyCounters = new Map<string, RuntimeMetricsCounter>();

function getDependencyCounter(dependencyName: string): RuntimeMetricsCounter {
  const existing = dependencyCounters.get(dependencyName);
  if (existing) {
    return existing;
  }

  const next = makeCounter();
  dependencyCounters.set(dependencyName, next);
  return next;
}

function applyFailureKind(counter: RuntimeMetricsCounter, failureKind: RuntimeFailureKind) {
  if (failureKind === 'timeout') {
    counter.timeouts += 1;
    return;
  }
  if (failureKind === 'retryable') {
    counter.retryableFailures += 1;
    return;
  }

  counter.permanentFailures += 1;
}

export function recordRuntimeExecution(params: {
  dependencyName: string;
  degraded?: boolean;
  failureKind?: RuntimeFailureKind;
  latencyMs?: number;
}) {
  const dependency = getDependencyCounter(params.dependencyName);
  totals.executions += 1;
  dependency.executions += 1;
  totals.totalLatencyMs += params.latencyMs ?? 0;
  dependency.totalLatencyMs += params.latencyMs ?? 0;

  if (params.degraded) {
    totals.degraded += 1;
    dependency.degraded += 1;
  }

  if (params.failureKind) {
    applyFailureKind(totals, params.failureKind);
    applyFailureKind(dependency, params.failureKind);
  }
}

export function recordRuntimeRetry(dependencyName: string) {
  const dependency = getDependencyCounter(dependencyName);
  totals.retries += 1;
  dependency.retries += 1;
}

export function recordRuntimeReclaim(dependencyName: string, count = 1) {
  const dependency = getDependencyCounter(dependencyName);
  totals.reclaims += count;
  dependency.reclaims += count;
}

export function recordRuntimeBacklog(params: {
  dependencyName: string;
  queueBacklog?: number;
  outboxBacklog?: number;
  staleWorkers?: number;
}) {
  const dependency = getDependencyCounter(params.dependencyName);

  if (typeof params.queueBacklog === 'number') {
    totals.queueBacklogSamples += 1;
    totals.queueBacklogTotal += params.queueBacklog;
    dependency.queueBacklogSamples += 1;
    dependency.queueBacklogTotal += params.queueBacklog;
  }

  if (typeof params.outboxBacklog === 'number') {
    totals.outboxBacklogSamples += 1;
    totals.outboxBacklogTotal += params.outboxBacklog;
    dependency.outboxBacklogSamples += 1;
    dependency.outboxBacklogTotal += params.outboxBacklog;
  }

  if (typeof params.staleWorkers === 'number') {
    totals.staleWorkerSamples += 1;
    totals.staleWorkerTotal += params.staleWorkers;
    dependency.staleWorkerSamples += 1;
    dependency.staleWorkerTotal += params.staleWorkers;
  }
}

export function getRuntimeMetricsSnapshot(): RuntimeMetricsSnapshot {
  const dependencies = Object.fromEntries(
    [...dependencyCounters.entries()].map(([name, counter]) => [name, { ...counter }]),
  );

  return {
    totals: { ...totals },
    dependencies,
  };
}

export function getAverageLatencyMs(counter: RuntimeMetricsCounter): number {
  return counter.executions > 0 ? counter.totalLatencyMs / counter.executions : 0;
}

export function getAverageQueueBacklog(counter: RuntimeMetricsCounter): number {
  return counter.queueBacklogSamples > 0
    ? counter.queueBacklogTotal / counter.queueBacklogSamples
    : 0;
}

export function getAverageOutboxBacklog(counter: RuntimeMetricsCounter): number {
  return counter.outboxBacklogSamples > 0
    ? counter.outboxBacklogTotal / counter.outboxBacklogSamples
    : 0;
}

export function getAverageStaleWorkers(counter: RuntimeMetricsCounter): number {
  return counter.staleWorkerSamples > 0 ? counter.staleWorkerTotal / counter.staleWorkerSamples : 0;
}

export function resetRuntimeMetrics() {
  const next = makeCounter();
  Object.assign(totals, next);
  dependencyCounters.clear();
}
