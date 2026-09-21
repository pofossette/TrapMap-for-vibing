/**
 * Retrieval latency report from RAG logs.
 *
 * Reads the JSON Lines written by `logRagRetrieval` (`logs/rag/*.log` by
 * default, or `--dir`) and aggregates them into the same slice shape as
 * `scripts/retrieval-latency-bench.ts`.
 *
 * Two things this script deliberately does *not* do:
 * - It never infers an endpoint from the query text. Entries written before
 *   `latencyEndpoint` existed are reported under `unknown`.
 * - It never turns a missing dimension into a zero. Empty cells stay empty.
 *
 * Usage:
 *   pnpm exec tsx --tsconfig tsconfig.base.json scripts/retrieval-latency-report.ts \
 *     --dir logs/rag --out benchmarks/retrieval-latency-report.json
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  channelDimension,
  DEAD_RETRIEVAL_LATENCY_ENDPOINTS,
  DEAD_RETRIEVAL_RECALL_CHANNELS,
  RETRIEVAL_PIPELINE_STAGES,
  RETRIEVAL_RECALL_CHANNELS,
  type RetrievalLatencyEndpoint,
  type RetrievalLatencyReport,
  type RetrievalLatencySlice,
  retrievalLatencyEndpointSchema,
  summarizeLatency,
} from '@trapmap/contracts';

interface RagLogLine {
  totalLatencyMs?: number;
  pipelineSteps?: Array<{ name: string; latencyMs: number }>;
  channelSteps?: Array<{ channel?: string; durationMs: number; stage?: string }>;
  metadata?: { latencyEndpoint?: string };
}

function parseString(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1]?.trim();
  if (!value) throw new Error(`${name} expects a non-empty value`);
  return value;
}

function endpointOf(entry: RagLogLine): RetrievalLatencyEndpoint {
  const parsed = retrievalLatencyEndpointSchema.safeParse(entry.metadata?.latencyEndpoint);
  return parsed.success ? parsed.data : 'unknown';
}

async function readLogFiles(dir: string): Promise<RagLogLine[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const entries: RagLogLine[] = [];
  for (const name of names) {
    if (!name.endsWith('.log')) continue;
    const raw = await readFile(path.join(dir, name), 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed) as RagLogLine);
      } catch {
        // Skip partial lines left by a concurrent writer — a rotated log is
        // not a reason to fail the whole report.
      }
    }
  }
  return entries;
}

function buildSlices(entries: RagLogLine[]): RetrievalLatencySlice[] {
  const byEndpoint = new Map<RetrievalLatencyEndpoint, RagLogLine[]>();
  for (const entry of entries) {
    const endpoint = endpointOf(entry);
    const bucket = byEndpoint.get(endpoint);
    if (bucket) bucket.push(entry);
    else byEndpoint.set(endpoint, [entry]);
  }

  const slices: RetrievalLatencySlice[] = [];
  const endpoints = [...byEndpoint.keys()].sort();

  for (const endpoint of endpoints) {
    const bucket = byEndpoint.get(endpoint) ?? [];
    const push = (dimension: string, values: number[], dead: boolean): void => {
      slices.push({
        endpoint,
        dimension,
        summary: summarizeLatency(values),
        dead,
      });
    };

    push(
      'total',
      bucket.map((entry) => entry.totalLatencyMs ?? 0),
      DEAD_RETRIEVAL_LATENCY_ENDPOINTS.includes(endpoint),
    );

    for (const stage of RETRIEVAL_PIPELINE_STAGES) {
      if (stage === 'total' || stage === 'recall-channel') continue;
      const values = bucket
        .flatMap((entry) => entry.pipelineSteps ?? [])
        .filter((step) => step.name === stage)
        .map((step) => step.latencyMs);
      push(stage, values, false);
    }

    for (const channel of RETRIEVAL_RECALL_CHANNELS) {
      const values = bucket
        .flatMap((entry) => entry.channelSteps ?? [])
        .filter((step) => step.channel === channel)
        .map((step) => step.durationMs);
      push(channelDimension(channel), values, DEAD_RETRIEVAL_RECALL_CHANNELS.includes(channel));
    }
  }

  return slices;
}

function formatTable(report: RetrievalLatencyReport): string {
  const header = ['endpoint', 'dimension', 'n', 'p50', 'p95', 'p99', 'max', 'avg', 'dead'];
  const lines = [
    `source: ${report.source}`,
    '',
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
  ];
  for (const slice of report.slices) {
    if (slice.summary.count === 0) continue;
    const s = slice.summary;
    lines.push(
      `| ${slice.endpoint} | ${slice.dimension} | ${s.count} | ${s.p50Ms} | ${s.p95Ms} | ${s.p99Ms} | ${s.maxMs} | ${s.avgMs} | ${slice.dead ? 'yes' : ''} |`,
    );
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const dir = parseString(process.argv.slice(2), '--dir', 'logs/rag');
  const out = parseString(
    process.argv.slice(2),
    '--out',
    'benchmarks/retrieval-latency-report.json',
  );

  const entries = await readLogFiles(dir);
  const report: RetrievalLatencyReport = {
    generatedAt: new Date().toISOString(),
    source: `rag-log(${dir})`,
    sampleCount: entries.length,
    slices: buildSlices(entries),
  };

  console.log(formatTable(report));
  console.log('');
  console.log(`entries read: ${entries.length}`);
  if (entries.length === 0) {
    console.log(
      `no RAG log entries under ${dir} — enable LOG_RAG_ENABLED=true or run scripts/retrieval-latency-bench.ts --log-dir ${dir}`,
    );
    return;
  }
  if (out) {
    await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
    console.log(`report written to ${out}`);
  }
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === new URL(`file://${process.argv[1]}`).href
  : false;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'retrieval latency report failed');
    process.exitCode = 1;
  });
}

export { buildSlices, formatTable, readLogFiles };
