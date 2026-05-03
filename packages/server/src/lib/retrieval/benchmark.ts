import type { KnowledgeRecord } from '../store.js';
import type { PipelineStep } from '../rag-log.js';

/**
 * Benchmark result for a retrieval pipeline execution.
 * Captures latency breakdown per step and memory usage.
 */
export interface RetrievalBenchmarkResult {
  timestamp: string;
  scenario: string;
  entryCount: number;
  totalLatencyMs: number;
  steps: {
    parse: number;
    snapshot: number;
    eligibility: number;
    routing: number;
    recall: number;
    assembly: number;
  };
  memoryUsage: {
    heapUsedMB: number;
    heapTotalMB: number;
  };
}

/**
 * Comparison result between two benchmark runs.
 */
export interface BenchmarkComparison {
  improvement: number;
  stepImprovements: Record<string, number>;
}

/**
 * Benchmark scenario configuration.
 */
export interface BenchmarkScenario {
  name: string;
  query: string;
  mode: 'semantic' | 'hybrid' | 'graph-assisted';
}

/**
 * Predefined benchmark scenarios for common query patterns.
 */
export const BENCHMARK_SCENARIOS: BenchmarkScenario[] = [
  {
    name: 'semantic-small',
    query: 'How to handle errors?',
    mode: 'semantic',
  },
  {
    name: 'semantic-medium',
    query: 'Database connection pooling best practices',
    mode: 'semantic',
  },
  {
    name: 'hybrid-keyword',
    query: 'Redis cache invalidation',
    mode: 'hybrid',
  },
  {
    name: 'graph-assisted',
    query: 'Microservice communication patterns',
    mode: 'graph-assisted',
  },
];

/**
 * Measure latency of a single async operation.
 *
 * @param name - Name of the step being measured
 * @param fn - Async function to execute
 * @returns Tuple of [result, latencyMs]
 */
export async function measurePipelineStep<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<[T, number]> {
  const start = Date.now();
  const result = await fn();
  const latencyMs = Date.now() - start;
  return [result, latencyMs];
}

/**
 * Run a retrieval benchmark with mock data.
 * Measures latency for each pipeline step without requiring a live database.
 *
 * @param entries - Knowledge entries to benchmark against
 * @param query - Search query to test
 * @param mode - Retrieval mode to benchmark
 * @returns Benchmark result with latency breakdown
 */
export async function runRetrievalBenchmark(
  entries: KnowledgeRecord[],
  query: string,
  mode: 'semantic' | 'hybrid' | 'graph-assisted',
): Promise<RetrievalBenchmarkResult> {
  const timestamp = new Date().toISOString();
  const entryCount = entries.length;

  // Measure parse step
  const [, parseMs] = await measurePipelineStep('parse', async () => {
    // Simulate query parsing and validation
    return { query, mode };
  });

  // Measure snapshot step
  const [, snapshotMs] = await measurePipelineStep('snapshot', async () => {
    // Simulate data snapshot retrieval
    return entries;
  });

  // Measure eligibility filtering
  const [, eligibilityMs] = await measurePipelineStep('eligibility', async () => {
    // Simulate filtering eligible entries
    return entries.filter((e) => e.requiredLevel === 'user');
  });

  // Measure routing decision
  const [, routingMs] = await measurePipelineStep('routing', async () => {
    // Simulate routing strategy selection
    return { mode, channels: [mode === 'hybrid' ? 'keyword' : 'semantic'] };
  });

  // Measure recall (search) - most expensive step
  const [, recallMs] = await measurePipelineStep('recall', async () => {
    // Simulate embedding computation and similarity search
    // This is where most of the time would be spent in real usage
    return entries.slice(0, Math.min(10, entries.length));
  });

  // Measure response assembly
  const [, assemblyMs] = await measurePipelineStep('assembly', async () => {
    // Simulate response assembly
    return { results: [] };
  });

  // Capture memory usage
  const memUsage = process.memoryUsage();

  return {
    timestamp,
    scenario: `${mode}-benchmark`,
    entryCount,
    totalLatencyMs: parseMs + snapshotMs + eligibilityMs + routingMs + recallMs + assemblyMs,
    steps: {
      parse: parseMs,
      snapshot: snapshotMs,
      eligibility: eligibilityMs,
      routing: routingMs,
      recall: recallMs,
      assembly: assemblyMs,
    },
    memoryUsage: {
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
    },
  };
}

/**
 * Compare two benchmark results and calculate improvement percentages.
 *
 * @param before - Baseline benchmark result
 * @param after - Optimized benchmark result
 * @returns Comparison with overall improvement and per-step improvements
 */
export function compareBenchmarkResults(
  before: RetrievalBenchmarkResult,
  after: RetrievalBenchmarkResult,
): BenchmarkComparison {
  // Calculate overall improvement percentage
  const totalImprovement = before.totalLatencyMs > 0
    ? ((before.totalLatencyMs - after.totalLatencyMs) / before.totalLatencyMs) * 100
    : 0;

  // Calculate per-step improvements
  const stepImprovements: Record<string, number> = {};
  const stepNames = ['parse', 'snapshot', 'eligibility', 'routing', 'recall', 'assembly'] as const;

  for (const step of stepNames) {
    const beforeMs = before.steps[step];
    const afterMs = after.steps[step];
    stepImprovements[step] = beforeMs > 0
      ? ((beforeMs - afterMs) / beforeMs) * 100
      : 0;
  }

  return {
    improvement: Math.round(totalImprovement * 100) / 100,
    stepImprovements,
  };
}

/**
 * Format benchmark result as a human-readable report.
 *
 * @param result - Benchmark result to format
 * @returns Formatted string report
 */
export function formatBenchmarkReport(result: RetrievalBenchmarkResult): string {
  const lines = [
    `Benchmark: ${result.scenario}`,
    `Timestamp: ${result.timestamp}`,
    `Entry Count: ${result.entryCount}`,
    `Total Latency: ${result.totalLatencyMs}ms`,
    '',
    'Step Breakdown:',
    `  parse:        ${result.steps.parse}ms`,
    `  snapshot:     ${result.steps.snapshot}ms`,
    `  eligibility:  ${result.steps.eligibility}ms`,
    `  routing:      ${result.steps.routing}ms`,
    `  recall:       ${result.steps.recall}ms`,
    `  assembly:     ${result.steps.assembly}ms`,
    '',
    'Memory Usage:',
    `  Heap Used:    ${result.memoryUsage.heapUsedMB}MB`,
    `  Heap Total:   ${result.memoryUsage.heapTotalMB}MB`,
  ];

  return lines.join('\n');
}
