interface BenchmarkOptions {
  baseUrl: string;
  iterations: number;
  warmup: number;
}

interface SampleSummary {
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
}

function parseNumberFlag(args: string[], name: string, fallback: number): number {
  const index = args.indexOf(name);
  if (index === -1) {
    return fallback;
  }

  const raw = args[index + 1];
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} expects a positive number`);
  }

  return Math.floor(parsed);
}

function parseStringFlag(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  if (index === -1) {
    return fallback;
  }

  const value = args[index + 1]?.trim();
  if (!value) {
    throw new Error(`${name} expects a non-empty value`);
  }

  return value;
}

function parseArgs(args: string[]): BenchmarkOptions {
  return {
    baseUrl: parseStringFlag(args, '--base-url', 'http://127.0.0.1:4000').replace(/\/$/, ''),
    iterations: parseNumberFlag(args, '--iterations', 15),
    warmup: parseNumberFlag(args, '--warmup', 5),
  };
}

async function timeRequest(url: string): Promise<number> {
  const started = performance.now();
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request to ${url} failed with ${response.status}`);
  }
  await response.text();
  return performance.now() - started;
}

async function collectSamples(url: string, count: number): Promise<number[]> {
  const samples: number[] = [];
  for (let index = 0; index < count; index += 1) {
    samples.push(await timeRequest(url));
  }
  return samples;
}

function percentile(sortedSamples: number[], ratio: number): number {
  const index = Math.min(
    sortedSamples.length - 1,
    Math.max(0, Math.ceil(sortedSamples.length * ratio) - 1),
  );
  return sortedSamples[index];
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

export function summarizeSamples(samples: number[]): SampleSummary {
  if (samples.length === 0) {
    throw new Error('Cannot summarize an empty sample set');
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const total = sorted.reduce((sum, sample) => sum + sample, 0);

  return {
    avgMs: roundMs(total / sorted.length),
    minMs: roundMs(sorted[0]),
    maxMs: roundMs(sorted[sorted.length - 1]),
    p50Ms: roundMs(percentile(sorted, 0.5)),
    p95Ms: roundMs(percentile(sorted, 0.95)),
  };
}

export function parseMetricValue(metricsText: string, metricName: string): number | null {
  const pattern = new RegExp(`^${metricName}(?:\\{[^}]*\\})?\\s+([0-9.eE+-]+)$`, 'm');
  const match = metricsText.match(pattern);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function bytesToMb(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  return Math.round((value / 1024 / 1024) * 100) / 100;
}

function findMetricValue(metricsText: string, metricNames: string[]): number | null {
  for (const metricName of metricNames) {
    const value = parseMetricValue(metricsText, metricName);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const healthUrl = `${options.baseUrl}/health`;
  const metricsUrl = `${options.baseUrl}/metrics`;

  await collectSamples(healthUrl, options.warmup);
  await collectSamples(metricsUrl, options.warmup);

  const healthSummary = summarizeSamples(await collectSamples(healthUrl, options.iterations));
  const metricsSummary = summarizeSamples(await collectSamples(metricsUrl, options.iterations));

  const metricsResponse = await fetch(metricsUrl);
  if (!metricsResponse.ok) {
    throw new Error(`Request to ${metricsUrl} failed with ${metricsResponse.status}`);
  }
  const metricsText = await metricsResponse.text();
  const rssMb = bytesToMb(
    findMetricValue(metricsText, [
      'trapmap_process_resident_memory_bytes',
      'process_resident_memory_bytes',
    ]),
  );
  const heapUsedMb = bytesToMb(
    findMetricValue(metricsText, [
      'trapmap_nodejs_heap_size_used_bytes',
      'nodejs_heap_size_used_bytes',
    ]),
  );
  const heapTotalMb = bytesToMb(
    findMetricValue(metricsText, [
      'trapmap_nodejs_heap_size_total_bytes',
      'nodejs_heap_size_total_bytes',
    ]),
  );

  console.log('TrapMap observability benchmark baseline');
  console.log(`baseUrl=${options.baseUrl}`);
  console.log(`warmup=${options.warmup} iterations=${options.iterations}`);
  console.log('');
  console.log(
    `GET /health  avg=${healthSummary.avgMs}ms p50=${healthSummary.p50Ms}ms p95=${healthSummary.p95Ms}ms min=${healthSummary.minMs}ms max=${healthSummary.maxMs}ms`,
  );
  console.log(
    `GET /metrics avg=${metricsSummary.avgMs}ms p50=${metricsSummary.p50Ms}ms p95=${metricsSummary.p95Ms}ms min=${metricsSummary.minMs}ms max=${metricsSummary.maxMs}ms`,
  );
  console.log('');
  console.log(
    `process_resident_memory_bytes=${rssMb ?? 'missing'}MB nodejs_heap_size_used_bytes=${heapUsedMb ?? 'missing'}MB nodejs_heap_size_total_bytes=${heapTotalMb ?? 'missing'}MB`,
  );
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === new URL(`file://${process.argv[1]}`).href
  : false;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'observability benchmark failed');
    process.exitCode = 1;
  });
}
