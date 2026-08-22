/**
 * Distributed internal observability module.
 *
 * Replaces the previous process-local Map-based counters with a registered
 * OTel MeterProvider backed by an InMemoryMetricExporter.  The snapshot API
 * reads from the same registry (forceFlush -> InMemoryMetricExporter).
 *
 * Also provides async lifecycle metrics for enqueue, execute, retry,
 * terminal failure, dead letter, outbox publish, and outbox consume.
 */

import type { Counter, Histogram } from '@opentelemetry/api';
import {
  AggregationTemporality,
  DataPointType,
  InMemoryMetricExporter,
  MeterProvider,
  type MetricData,
  MetricReader,
} from '@opentelemetry/sdk-metrics';

import type { AsyncLifecycleEventName } from '@trapmap/contracts';

// ---------------------------------------------------------------------------
// On-demand metric reader (exports only when forceFlush is called)
// ---------------------------------------------------------------------------

class OnDemandMetricReader extends MetricReader {
  private _exporter: InMemoryMetricExporter;

  constructor(exporter: InMemoryMetricExporter) {
    super();
    this._exporter = exporter;
  }

  protected async onForceFlush(): Promise<void> {
    const result = await this.collect();
    return new Promise<void>((resolve) => {
      this._exporter.export(result.resourceMetrics, () => resolve());
    });
  }

  protected async onShutdown(): Promise<void> {
    await this._exporter.shutdown();
  }
}

// ---------------------------------------------------------------------------
// Registry (mutable module-level state, recreatable for test isolation)
// ---------------------------------------------------------------------------

interface ObservabilityRegistry {
  provider: MeterProvider;
  exporter: InMemoryMetricExporter;
  hopCounter: Counter;
  hopDuration: Histogram;
  asyncLifecycleCounter: Counter;
  rateLimitedCounter: Counter;
}

function createRegistry(): ObservabilityRegistry {
  const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  const reader = new OnDemandMetricReader(exporter);
  const provider = new MeterProvider({ readers: [reader] });
  const meter = provider.getMeter('trapmap-distributed');

  return {
    provider,
    exporter,
    hopCounter: meter.createCounter('trapmap_runtime_internal_hops_total', {
      description: 'Total distributed internal service hops',
    }),
    hopDuration: meter.createHistogram('trapmap_runtime_internal_hop_duration_ms', {
      description: 'Latency of distributed internal service hops in milliseconds',
    }),
    asyncLifecycleCounter: meter.createCounter('trapmap_async_lifecycle_events_total', {
      description: 'Total async lifecycle events by type',
    }),
    rateLimitedCounter: meter.createCounter('trapmap_gateway_rate_limited_total', {
      description: 'Gateway requests rejected by the per-actor rate limiter',
    }),
  };
}

let registry = createRegistry();

// ---------------------------------------------------------------------------
// Recording functions (synchronous)
// ---------------------------------------------------------------------------

export function recordDistributedInternalHopMetric(params: {
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
  registry.hopCounter.add(1, labels);
  registry.hopDuration.record(params.latencyMs, labels);
}

export function recordGatewayRateLimited(actorKind: 'session' | 'ip'): void {
  registry.rateLimitedCounter.add(1, { actor_kind: actorKind });
}

export function recordAsyncLifecycleEvent(params: {
  eventName: AsyncLifecycleEventName;
  taskType: string;
  ownerSurface: string;
  failureClassification?: string;
}) {
  registry.asyncLifecycleCounter.add(1, {
    event_name: params.eventName,
    task_type: params.taskType,
    owner_surface: params.ownerSurface,
    failure_classification: params.failureClassification ?? 'none',
  });
}

// ---------------------------------------------------------------------------
// Snapshot (async — reads from the same OTel registry)
// ---------------------------------------------------------------------------

interface CounterSnapshotEntry {
  value: number;
  labels: Record<string, string>;
}

interface HistogramSnapshotEntry {
  sum: number;
  count: number;
  labels: Record<string, string>;
}

export interface DistributedObservabilitySnapshot {
  counters: Record<string, CounterSnapshotEntry[]>;
  histograms: Record<string, HistogramSnapshotEntry[]>;
}

/**
 * Collect all registered OTel metrics and return a test-friendly snapshot.
 *
 * This reads from the SAME registry that the recording functions write to
 * (MeterProvider -> OnDemandMetricReader -> InMemoryMetricExporter).
 */
export async function getDistributedInternalObservabilitySnapshot(): Promise<DistributedObservabilitySnapshot> {
  // Reset the exporter so we get a clean snapshot of the current state
  registry.exporter.reset();
  await registry.provider.forceFlush();
  const resourceMetrics = registry.exporter.getMetrics();

  const counters: Record<string, CounterSnapshotEntry[]> = {};
  const histograms: Record<string, HistogramSnapshotEntry[]> = {};

  for (const rm of resourceMetrics) {
    for (const sm of rm.scopeMetrics) {
      for (const metric of sm.metrics) {
        extractMetricData(metric, counters, histograms);
      }
    }
  }

  return { counters, histograms };
}

function extractMetricData(
  metric: MetricData,
  counters: Record<string, CounterSnapshotEntry[]>,
  histograms: Record<string, HistogramSnapshotEntry[]>,
): void {
  const name = metric.descriptor.name;

  if (metric.dataPointType === DataPointType.SUM) {
    if (!counters[name]) counters[name] = [];
    for (const dp of metric.dataPoints) {
      counters[name].push({
        value: dp.value,
        labels: dp.attributes as Record<string, string>,
      });
    }
  } else if (metric.dataPointType === DataPointType.HISTOGRAM) {
    if (!histograms[name]) histograms[name] = [];
    for (const dp of metric.dataPoints) {
      histograms[name].push({
        sum: dp.value.sum ?? 0,
        count: dp.value.count,
        labels: dp.attributes as Record<string, string>,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Prometheus text rendering (async — reads from the same OTel registry)
// ---------------------------------------------------------------------------

/**
 * Render all registered OTel metrics in Prometheus text exposition format.
 * Used by the /metrics endpoint alongside process-level metrics.
 */
export async function renderOtelMetricsAsPrometheus(): Promise<string> {
  registry.exporter.reset();
  await registry.provider.forceFlush();
  const resourceMetrics = registry.exporter.getMetrics();

  const lines: string[] = [];

  for (const rm of resourceMetrics) {
    for (const sm of rm.scopeMetrics) {
      for (const metric of sm.metrics) {
        renderMetricAsPrometheus(metric, lines);
      }
    }
  }

  return lines.join('\n');
}

function renderMetricAsPrometheus(metric: MetricData, lines: string[]): void {
  const name = metric.descriptor.name;

  if (metric.dataPointType === DataPointType.SUM) {
    pushMetricHeader(lines, name, metric.descriptor.description, 'counter');
    for (const dp of metric.dataPoints) {
      const labelStr = formatPrometheusLabels(dp.attributes as Record<string, string>);
      lines.push(`${name}{${labelStr}} ${dp.value}`);
    }
  } else if (metric.dataPointType === DataPointType.HISTOGRAM) {
    pushMetricHeader(lines, name, metric.descriptor.description, 'histogram');
    for (const dp of metric.dataPoints) {
      const labelStr = formatPrometheusLabels(dp.attributes as Record<string, string>);
      lines.push(`${name}_sum{${labelStr}} ${dp.value.sum ?? 0}`);
      lines.push(`${name}_count{${labelStr}} ${dp.value.count}`);
    }
  }
}

function pushMetricHeader(
  lines: string[],
  name: string,
  description: string | undefined,
  type: string,
): void {
  lines.push(`# TYPE ${name} ${type}`);
  if (description) {
    lines.push(`# HELP ${name} ${description}`);
  }
}

function formatPrometheusLabels(labels: Record<string, string>): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
}

// ---------------------------------------------------------------------------
// Reset (for test isolation)
// ---------------------------------------------------------------------------

/**
 * Reset the observability registry.  Creates a fresh MeterProvider and
 * instruments.  The old provider is shut down asynchronously (fire-and-forget).
 */
export function resetDistributedInternalObservability() {
  registry.provider.shutdown().catch(() => {});
  registry = createRegistry();
}
