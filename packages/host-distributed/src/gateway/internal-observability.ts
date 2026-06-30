interface CounterSample {
  value: number;
  labels: Record<string, string>;
}

interface HistogramSample {
  sum: number;
  count: number;
  labels: Record<string, string>;
}

const counters = new Map<string, Map<string, CounterSample>>();
const histograms = new Map<string, Map<string, HistogramSample>>();

function normalizeLabels(labels: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)));
}

function labelKey(labels: Record<string, string>): string {
  return JSON.stringify(normalizeLabels(labels));
}

function getCounter(name: string, labels: Record<string, string>): CounterSample {
  let samples = counters.get(name);
  if (!samples) {
    samples = new Map();
    counters.set(name, samples);
  }
  const key = labelKey(labels);
  const existing = samples.get(key);
  if (existing) {
    return existing;
  }
  const next = { value: 0, labels };
  samples.set(key, next);
  return next;
}

function getHistogram(name: string, labels: Record<string, string>): HistogramSample {
  let samples = histograms.get(name);
  if (!samples) {
    samples = new Map();
    histograms.set(name, samples);
  }
  const key = labelKey(labels);
  const existing = samples.get(key);
  if (existing) {
    return existing;
  }
  const next = { sum: 0, count: 0, labels };
  samples.set(key, next);
  return next;
}

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
  getCounter('trapmap_runtime_internal_hops_total', labels).value += 1;
  const histogram = getHistogram('trapmap_runtime_internal_hop_duration_ms', labels);
  histogram.count += 1;
  histogram.sum += params.latencyMs;
}

export function getDistributedInternalObservabilitySnapshot() {
  return {
    counters: Object.fromEntries(
      [...counters.entries()].map(([name, samples]) => [
        name,
        [...samples.values()].map((sample) => ({ ...sample })),
      ]),
    ),
    histograms: Object.fromEntries(
      [...histograms.entries()].map(([name, samples]) => [
        name,
        [...samples.values()].map((sample) => ({ ...sample })),
      ]),
    ),
  };
}

export function resetDistributedInternalObservability() {
  counters.clear();
  histograms.clear();
}
