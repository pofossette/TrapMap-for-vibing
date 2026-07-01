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

interface CounterMetricSample {
  value: number;
  labels: Record<string, string>;
}

interface GaugeMetricSample {
  value: number;
  labels: Record<string, string>;
}

interface HistogramMetricSample {
  sum: number;
  count: number;
  labels: Record<string, string>;
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
const counters = new Map<string, Map<string, CounterMetricSample>>();
const gauges = new Map<string, Map<string, GaugeMetricSample>>();
const histograms = new Map<string, Map<string, HistogramMetricSample>>();

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

function normalizeLabels(labels?: Record<string, string>): Record<string, string> {
  if (!labels) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(labels)
      .filter(([, value]) => typeof value === 'string' && value.length > 0)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function labelKey(labels?: Record<string, string>): string {
  return JSON.stringify(normalizeLabels(labels));
}

function getMetricSample<T>(
  store: Map<string, Map<string, T>>,
  metricName: string,
  labels: Record<string, string>,
  create: () => T,
): T {
  let metricSamples = store.get(metricName);
  if (!metricSamples) {
    metricSamples = new Map<string, T>();
    store.set(metricName, metricSamples);
  }

  const key = labelKey(labels);
  const existing = metricSamples.get(key);
  if (existing) {
    return existing;
  }

  const next = create();
  metricSamples.set(key, next);
  return next;
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function serializeLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) {
    return '';
  }

  return `{${entries.map(([key, value]) => `${key}="${escapeLabelValue(value)}"`).join(',')}}`;
}

function incrementMetric(name: string, labels: Record<string, string>, count = 1) {
  const sample = getMetricSample(counters, name, labels, () => ({ value: 0, labels }));
  sample.value += count;
}

function setGaugeMetric(name: string, labels: Record<string, string>, value: number) {
  const sample = getMetricSample(gauges, name, labels, () => ({ value, labels }));
  sample.value = value;
}

function observeHistogramMetric(name: string, labels: Record<string, string>, value: number) {
  const sample = getMetricSample(histograms, name, labels, () => ({ sum: 0, count: 0, labels }));
  sample.sum += value;
  sample.count += 1;
}

function mapFailureClassification(failureKind?: RuntimeFailureKind): string {
  if (failureKind === 'timeout') {
    return 'timeout';
  }
  if (failureKind === 'retryable') {
    return 'retryable-async-failure';
  }
  if (failureKind === 'permanent') {
    return 'permanent-failure';
  }
  return 'success';
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

  const labels = {
    dependency_name: params.dependencyName,
    failure_classification: mapFailureClassification(params.failureKind),
    service_name: 'gateway',
    owner_surface: 'runtime-seam',
    route_family: 'runtime',
  };
  incrementMetric('trapmap_runtime_executions_total', labels);
  if (typeof params.latencyMs === 'number') {
    observeHistogramMetric('trapmap_runtime_request_duration_ms', labels, params.latencyMs);
  }
}

export function recordRuntimeRetry(dependencyName: string) {
  const dependency = getDependencyCounter(dependencyName);
  totals.retries += 1;
  dependency.retries += 1;
  incrementMetric('trapmap_runtime_retries_total', {
    dependency_name: dependencyName,
    service_name: 'gateway',
    owner_surface: 'runtime-seam',
  });
}

export function recordRuntimeReclaim(dependencyName: string, count = 1) {
  const dependency = getDependencyCounter(dependencyName);
  totals.reclaims += count;
  dependency.reclaims += count;
  incrementMetric(
    'trapmap_async_reclaims_total',
    {
      dependency_name: dependencyName,
      service_name: 'gateway',
      owner_surface: 'runtime-seam',
    },
    count,
  );
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
    setGaugeMetric(
      'trapmap_async_queue_backlog',
      {
        dependency_name: params.dependencyName,
        service_name: 'gateway',
      },
      params.queueBacklog,
    );
  }

  if (typeof params.outboxBacklog === 'number') {
    totals.outboxBacklogSamples += 1;
    totals.outboxBacklogTotal += params.outboxBacklog;
    dependency.outboxBacklogSamples += 1;
    dependency.outboxBacklogTotal += params.outboxBacklog;
    setGaugeMetric(
      'trapmap_async_outbox_backlog',
      {
        dependency_name: params.dependencyName,
        service_name: 'gateway',
      },
      params.outboxBacklog,
    );
  }

  if (typeof params.staleWorkers === 'number') {
    totals.staleWorkerSamples += 1;
    totals.staleWorkerTotal += params.staleWorkers;
    dependency.staleWorkerSamples += 1;
    dependency.staleWorkerTotal += params.staleWorkers;
    setGaugeMetric(
      'trapmap_async_stale_workers',
      {
        dependency_name: params.dependencyName,
        service_name: 'gateway',
      },
      params.staleWorkers,
    );
  }
}

export function recordHttpRequestMetric(params: {
  routeFamily: string;
  serviceName: string;
  latencyMs: number;
  statusCode: number;
  method: string;
}) {
  const labels = {
    route_family: params.routeFamily,
    service_name: params.serviceName,
    method: params.method.toUpperCase(),
    status_class: `${Math.floor(params.statusCode / 100)}xx`,
    owner_surface: 'runtime-seam',
  };
  incrementMetric('trapmap_runtime_http_requests_total', labels);
  observeHistogramMetric('trapmap_runtime_request_duration_ms', labels, params.latencyMs);
}

function recordInternalHopMetric(params: {
  serviceName: string;
  targetService: string;
  transport: 'http' | 'rpc';
  latencyMs: number;
  statusCode: number;
}) {
  const labels = {
    service_name: params.serviceName,
    target_service: params.targetService,
    transport: params.transport,
    status_class: `${Math.floor(params.statusCode / 100)}xx`,
    owner_surface: 'runtime-seam',
  };
  incrementMetric('trapmap_runtime_internal_hops_total', labels);
  observeHistogramMetric('trapmap_runtime_internal_hop_duration_ms', labels, params.latencyMs);
}

export function recordDatabaseMetric(params: {
  serviceName: string;
  operation: string;
  latencyMs: number;
  success: boolean;
}) {
  const labels = {
    service_name: params.serviceName,
    operation: params.operation,
    outcome: params.success ? 'success' : 'failure',
    owner_surface: 'runtime-seam',
  };
  incrementMetric('trapmap_runtime_db_operations_total', labels);
  observeHistogramMetric('trapmap_runtime_db_operation_duration_ms', labels, params.latencyMs);
}

export function recordQueueMetric(params: {
  serviceName: string;
  queueKind: 'task' | 'outbox';
  operation: 'enqueue' | 'claim' | 'complete' | 'fail';
  latencyMs: number;
  success: boolean;
}) {
  const labels = {
    service_name: params.serviceName,
    queue_kind: params.queueKind,
    operation: params.operation,
    outcome: params.success ? 'success' : 'failure',
    owner_surface: 'runtime-seam',
  };
  incrementMetric('trapmap_async_queue_operations_total', labels);
  observeHistogramMetric('trapmap_async_queue_operation_duration_ms', labels, params.latencyMs);
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

export function renderPrometheusMetrics(): string {
  const lines: string[] = [];

  const appendCounter = (metricName: string, samples: Map<string, CounterMetricSample>) => {
    lines.push(`# TYPE ${metricName} counter`);
    for (const sample of samples.values()) {
      lines.push(`${metricName}${serializeLabels(sample.labels)} ${sample.value}`);
    }
  };

  const appendGauge = (metricName: string, samples: Map<string, GaugeMetricSample>) => {
    lines.push(`# TYPE ${metricName} gauge`);
    for (const sample of samples.values()) {
      lines.push(`${metricName}${serializeLabels(sample.labels)} ${sample.value}`);
    }
  };

  const appendHistogram = (metricName: string, samples: Map<string, HistogramMetricSample>) => {
    lines.push(`# TYPE ${metricName} histogram`);
    for (const sample of samples.values()) {
      const baseLabels = sample.labels;
      lines.push(`${metricName}_count${serializeLabels(baseLabels)} ${sample.count}`);
      lines.push(`${metricName}_sum${serializeLabels(baseLabels)} ${sample.sum}`);
    }
  };

  for (const [metricName, samples] of counters.entries()) {
    appendCounter(metricName, samples);
  }
  for (const [metricName, samples] of gauges.entries()) {
    appendGauge(metricName, samples);
  }
  for (const [metricName, samples] of histograms.entries()) {
    appendHistogram(metricName, samples);
  }

  return `${lines.join('\n')}\n`;
}

export function resetRuntimeMetrics() {
  const next = makeCounter();
  Object.assign(totals, next);
  dependencyCounters.clear();
  counters.clear();
  gauges.clear();
  histograms.clear();
}
