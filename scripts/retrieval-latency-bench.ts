/**
 * Offline retrieval latency bench.
 *
 * Runs the real retrieval pipeline (`searchKnowledge`) against an in-memory
 * corpus and emits the same latency samples production does, through the same
 * `RetrievalMetricsPort`. Everything is local: the default retrieval infra uses
 * a deterministic hash embedding, so no PostgreSQL and no network are needed.
 *
 * What the numbers mean — read this before quoting them:
 * - They measure **pipeline CPU work** on this machine: parse, snapshot,
 *   eligibility, boundary filter, routing, recall (per channel), assembly.
 * - They exclude HTTP, auth, PostgreSQL and pgvector round trips, because the
 *   DB-backed branches are inactive without a pool. Real production latency is
 *   therefore *higher*; treat these numbers as a floor and a regression
 *   baseline, not as a service SLO.
 *
 * Usage:
 *   pnpm exec tsx --tsconfig tsconfig.base.json scripts/retrieval-latency-bench.ts \
 *     --entries 400 --queries 40 --warmup 5 --out benchmarks/retrieval-latency.json
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { RetrievalMetricsPort } from '@trapmap/backend-core';
import {
  channelDimension,
  type LatencySummary,
  type RetrievalLatencyEndpoint,
  type RetrievalLatencyRecord,
  type RetrievalLatencyReport,
  type RetrievalLatencySlice,
  retrievalLatencyEndpointSchema,
  summarizeLatency,
  DEAD_RETRIEVAL_LATENCY_ENDPOINTS,
  DEAD_RETRIEVAL_RECALL_CHANNELS,
  RETRIEVAL_PIPELINE_STAGES,
  RETRIEVAL_RECALL_CHANNELS,
} from '@trapmap/contracts';
import {
  createKnowledgeReadChannelRegistry,
  createKnowledgeReadStrategyRegistry,
  createKnowledgeReadRetrievalInfra,
  loadRagLogConfig,
  resetRetrievalReadModelCacheForTests,
  searchKnowledge,
} from '@trapmap/service-knowledge-read';
import type { SkillShareerServices } from '@trapmap/service-knowledge-read';
import { createRetrievalKnowledgeFixture } from '@trapmap/contracts';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseNumber(args: string[], name: string, fallback: number): number {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const parsed = Number(args[index + 1]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} expects a positive number`);
  }
  return Math.floor(parsed);
}

function parseString(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1]?.trim();
  if (!value) throw new Error(`${name} expects a non-empty value`);
  return value;
}

function parseSweep(argv: string[]): number[] {
  const index = argv.indexOf('--sweep');
  if (index === -1) return [];
  const raw = argv[index + 1] ?? '';
  const sizes = raw
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (sizes.length === 0) throw new Error('--sweep expects comma-separated positive sizes');
  return sizes;
}

interface BenchOptions {
  entries: number;
  queries: number;
  warmup: number;
  out: string;
  logDir: string;
  /** Comma-separated corpus sizes for a scaling sweep (`--sweep 100,500,2000`). */
  sweep: number[];
}

function parseArgs(argv: string[]): BenchOptions {
  return {
    entries: parseNumber(argv, '--entries', 400),
    queries: parseNumber(argv, '--queries', 40),
    warmup: parseNumber(argv, '--warmup', 5),
    out: parseString(argv, '--out', 'benchmarks/retrieval-latency.json'),
    logDir: parseString(argv, '--log-dir', 'logs/rag-bench'),
    sweep: parseSweep(argv),
  };
}

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------

const TOPICS = [
  'postgres connection pool exhaustion under burst load',
  'react hydration mismatch after server render',
  'kubernetes readiness probe flapping on slow start',
  'typescript strict null checks migration strategy',
  'redis cache stampede during cold start',
  'docker image layer caching in ci pipelines',
  'graceful shutdown draining in-flight requests',
  'vector index recall drift after bulk upsert',
  'graphql n+1 query fan-out on nested resolvers',
  'flaky end-to-end tests from shared fixtures',
];

const LABELS = ['backend', 'frontend', 'infra', 'testing', 'database', 'ci', 'observability'];

function buildCorpus(count: number) {
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const topic = TOPICS[index % TOPICS.length] ?? 'general';
    const label = LABELS[index % LABELS.length] ?? 'general';
    entries.push(
      createRetrievalKnowledgeFixture(`entry_${index}`, {
        shortcut: `${topic} — variant ${index}`,
        detail:
          `${topic}. Observed when ${label} workload spikes; mitigate by bounding concurrency, ` +
          `adding backpressure and verifying with a load test. Recorded as knowledge entry ${index} ` +
          `so the recall channels have lexical and semantic signal to work with.`,
        labels: [label],
        scope: index % 3 === 0 ? 'project' : 'global',
        teamId: index % 3 === 0 ? 'team_bench' : null,
      }),
    );
  }
  return entries;
}

function buildQueries(count: number): string[] {
  const queries: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const topic = TOPICS[index % TOPICS.length] ?? 'general';
    queries.push(`${topic} variant ${index}`);
  }
  return queries;
}

// ---------------------------------------------------------------------------
// Recording metrics port — the bench's own sink
// ---------------------------------------------------------------------------

interface CollectedSamples {
  searches: Array<{ endpoint: string; mode: string; outcome: string; durationMs: number }>;
  stages: Array<{ endpoint: string; stage: string; durationMs: number }>;
  channels: Array<{ endpoint: string; channel: string; durationMs: number }>;
  degraded: Array<{ endpoint: string; reason: string }>;
}

function createCollectingMetrics(sink: CollectedSamples): RetrievalMetricsPort {
  return {
    recordSearch(params) {
      sink.searches.push({
        endpoint: params.endpoint,
        mode: params.mode,
        outcome: params.outcome,
        durationMs: params.durationMs,
      });
    },
    recordStage(params) {
      sink.stages.push({
        endpoint: params.endpoint,
        stage: params.stage,
        durationMs: params.durationMs,
      });
    },
    recordChannel(params) {
      sink.channels.push({
        endpoint: params.endpoint,
        channel: params.channel,
        durationMs: params.durationMs,
      });
    },
    recordDegraded(params) {
      sink.degraded.push({ endpoint: params.endpoint, reason: params.reason });
    },
  };
}

// ---------------------------------------------------------------------------
// Report assembly
// ---------------------------------------------------------------------------

function slicesFrom(
  endpoint: RetrievalLatencyEndpoint,
  samples: Array<{ endpoint: string } & { durationMs: number }>,
  pick: (sample: { endpoint: string } & { durationMs: number }) => string | null,
  knownDimensions: readonly string[],
  deadDimensions: readonly string[],
  prefix = '',
): RetrievalLatencySlice[] {
  const rows: RetrievalLatencySlice[] = [];
  for (const dimension of knownDimensions) {
    const values = samples
      .filter((sample) => sample.endpoint === endpoint && pick(sample) === dimension)
      .map((sample) => sample.durationMs);
    rows.push({
      endpoint,
      dimension: prefix ? `${prefix}${dimension}` : dimension,
      summary: summarizeLatency(values),
      dead: deadDimensions.includes(dimension as never),
    });
  }
  return rows;
}

function buildReport(
  options: BenchOptions,
  sink: CollectedSamples,
  endpoints: RetrievalLatencyEndpoint[],
): RetrievalLatencyReport {
  const slices: RetrievalLatencySlice[] = [];

  for (const endpoint of endpoints) {
    const totals = sink.searches
      .filter((sample) => sample.endpoint === endpoint)
      .map((sample) => sample.durationMs);
    slices.push({
      endpoint,
      dimension: 'total',
      summary: summarizeLatency(totals),
      dead: DEAD_RETRIEVAL_LATENCY_ENDPOINTS.includes(endpoint),
    });

    slices.push(
      ...slicesFrom(
        endpoint,
        sink.stages,
        (sample) => (sample as { stage?: string }).stage ?? null,
        RETRIEVAL_PIPELINE_STAGES.filter(
          (stage) => stage !== 'recall-channel' && stage !== 'total',
        ),
        [],
      ),
    );

    slices.push(
      ...slicesFrom(
        endpoint,
        sink.channels,
        (sample) => (sample as { channel?: string }).channel ?? null,
        RETRIEVAL_RECALL_CHANNELS,
        DEAD_RETRIEVAL_RECALL_CHANNELS,
        'channel:',
      ),
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    source: `offline-bench(entries=${options.entries},queries=${options.queries},warmup=${options.warmup})`,
    sampleCount: sink.searches.length,
    slices,
  };
}

function formatTable(report: RetrievalLatencyReport): string {
  const header = ['endpoint', 'dimension', 'n', 'p50', 'p95', 'p99', 'max', 'avg'];
  const lines: string[] = [];
  lines.push(`source: ${report.source}`);
  lines.push('');
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${header.map(() => '---').join(' | ')} |`);
  for (const slice of report.slices) {
    if (slice.summary.count === 0) continue;
    const s: LatencySummary = slice.summary;
    lines.push(
      `| ${slice.endpoint} | ${slice.dimension} | ${s.count} | ${s.p50Ms} | ${s.p95Ms} | ${s.p99Ms} | ${s.maxMs} | ${s.avgMs} |`,
    );
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runBench(options: BenchOptions, corpusSize: number) {
  // Endpoints with a live route today; `v2-capsule` is reserved but no host
  // registers it, so the bench never fabricates numbers for it.
  const endpoints: RetrievalLatencyEndpoint[] = ['v1-search', 'v1-skills', 'v3-graph-plan'];
  // The read model is cached globally for 60s in production. Reset once per
  // corpus size so a sweep cannot silently reuse the previous size's snapshot;
  // within a size the cache stays warm, which is what production sees.
  resetRetrievalReadModelCacheForTests();
  const corpus = buildCorpus(corpusSize);
  const queries = buildQueries(options.queries);
  const sink: CollectedSamples = { searches: [], stages: [], channels: [], degraded: [] };

  const services: SkillShareerServices = {
    config: {
      ragLog: { ...loadRagLogConfig(), enabled: true, logDir: options.logDir },
    },
    repos: {
      knowledge: { listByFilter: async () => corpus },
      artifact: { listByFilter: async () => [], listForRetrieval: async () => [] },
      governanceRetrievalProjection: {
        listFeedback: async () => [],
        listConflicts: async () => [],
      },
      usageAnalytics: null,
      graphIndex: null,
    } as unknown as SkillShareerServices['repos'],
    strategyRegistry: createKnowledgeReadStrategyRegistry(),
    channelRegistry: createKnowledgeReadChannelRegistry(),
    ai: { chat: { isConfigured: false, invoke: async () => '' } },
    store: { getPool: () => null },
    graphQuery: { backendKind: 'memory', failOpen: true, mode: 'disabled' },
    retrievalInfra: createKnowledgeReadRetrievalInfra(),
    retrievalMetrics: createCollectingMetrics(sink),
  };

  const auth = {
    subjectType: 'system-admin' as const,
    actorId: 'bench',
    handle: 'bench',
    activeTeamId: 'team_bench',
    securityLevel: 10,
    effectivePermissions: [],
    user: null,
    membership: null,
    team: null,
  };

  const modes = ['hybrid', 'semantic', 'graph-assisted'];

  const runOne = async (endpoint: RetrievalLatencyEndpoint, query: string, mode: string) =>
    searchKnowledge(services, auth, {
      seed: query,
      filters: { labels: [], scopes: ['global', 'project'] },
      includeRefinement: false,
      includeSummary: false,
      mode: mode as 'hybrid' | 'semantic' | 'graph-assisted',
      maxResults: 10,
      latencyEndpoint: endpoint,
    });

  // Warmup: JIT + module-level caches must not land in the percentiles.
  for (let index = 0; index < options.warmup; index += 1) {
    await runOne('v1-search', queries[index % queries.length] ?? 'warmup', 'hybrid');
  }
  const warmupCount = sink.searches.length;
  sink.searches.length = 0;
  sink.stages.length = 0;
  sink.channels.length = 0;

  for (const endpoint of endpoints) {
    for (let index = 0; index < options.queries; index += 1) {
      const query = queries[index % queries.length] ?? 'query';
      const mode = modes[index % modes.length] ?? 'hybrid';
      await runOne(endpoint, query, mode);
    }
  }

  // `logRagRetrieval` is fire-and-forget inside the pipeline. Give the event
  // loop a chance to flush before the report is written or the next corpus
  // size starts, otherwise the log files never appear.
  await new Promise((resolve) => setTimeout(resolve, 200));

  const report = buildReport(options, sink, endpoints);
  return { report, warmupCount, corpusSize };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const endpoints: RetrievalLatencyEndpoint[] = ['v1-search', 'v1-skills', 'v3-graph-plan'];

  if (options.sweep.length > 0) {
    const rows: string[] = [
      '| corpus | endpoint | total p50 | total p95 | recall p50 | semantic p50 |',
    ];
    rows.push('| --- | --- | --- | --- | --- | --- |');
    let last: Awaited<ReturnType<typeof runBench>> | undefined;
    for (const size of options.sweep) {
      const run = await runBench(options, size);
      last = run;
      for (const endpoint of endpoints) {
        const find = (dimension: string) =>
          run.report.slices.find(
            (slice) => slice.endpoint === endpoint && slice.dimension === dimension,
          );
        const total = find('total');
        const recall = find('recall');
        const semantic = find(channelDimension('semantic'));
        rows.push(
          `| ${size} | ${endpoint} | ${total?.summary.p50Ms ?? '-'} | ${total?.summary.p95Ms ?? '-'} | ${recall?.summary.p50Ms ?? '-'} | ${semantic?.summary.p50Ms ?? '-'} |`,
        );
      }
    }
    console.log('corpus scaling sweep (values in ms)');
    console.log('');
    console.log(rows.join('\n'));
    console.log('');
    if (last) {
      await mkdir(path.dirname(options.out), { recursive: true });
      await writeFile(options.out, `${JSON.stringify(last.report, null, 2)}\n`, 'utf-8');
      console.log(`full report for the largest corpus written to ${options.out}`);
    }
    console.log(
      'Note: DB-backed recall branches are inactive without PostgreSQL — these numbers are a CPU floor, not a service SLO.',
    );
    return;
  }

  const { report, warmupCount } = await runBench(options, options.entries);
  await mkdir(path.dirname(options.out), { recursive: true });
  await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

  console.log(formatTable(report));
  console.log('');
  console.log(`warmup requests discarded: ${warmupCount}`);
  console.log(`report written to ${options.out}`);
  console.log(`raw RAG log entries: ${options.logDir}/<date>.log`);
  console.log('');
  console.log(
    'Note: DB-backed recall branches are inactive without PostgreSQL — these numbers are a CPU floor, not a service SLO.',
  );
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === new URL(`file://${process.argv[1]}`).href
  : false;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'retrieval latency bench failed');
    process.exitCode = 1;
  });
}

export { buildCorpus, buildQueries, buildReport, formatTable, parseArgs };
export type { BenchOptions };
