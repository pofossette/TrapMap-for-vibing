#!/usr/bin/env node

import { performance } from 'node:perf_hooks';

import { buildPostgresComposedServer } from '../../../scripts/testing/postgres-server-composition.js';

interface ScenarioResult {
  name: string;
  samplesMs: number[];
  averageMs: number;
  minMs: number;
  maxMs: number;
  error?: string;
}

type EnvOverrides = Record<string, string | undefined>;

const DEFAULT_ITERATIONS = Number.parseInt(process.env.TRAPMAP_GRAPH_BENCH_ITERATIONS ?? '5', 10);

async function main(): Promise<void> {
  const databaseUrl = process.env.TRAPMAP_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'graph benchmark requires TRAPMAP_DATABASE_URL and PostgreSQL host composition',
    );
  }
  await runBenchmark(databaseUrl, benchmarkIterations(), createScenarios());
}

function benchmarkIterations(): number {
  return Number.isFinite(DEFAULT_ITERATIONS) && DEFAULT_ITERATIONS > 0 ? DEFAULT_ITERATIONS : 5;
}

function createScenarios(): Array<{ name: string; env: EnvOverrides }> {
  const scenarios: Array<{ name: string; env: EnvOverrides }> = [
    {
      name: 'disabled-memory',
      env: {
        TRAPMAP_GRAPH_DB_ENABLED: 'false',
        TRAPMAP_GRAPH_DB_PROVIDER: undefined,
        TRAPMAP_GRAPH_DB_URI: undefined,
        TRAPMAP_GRAPH_DB_USERNAME: undefined,
        TRAPMAP_GRAPH_DB_PASSWORD: undefined,
        TRAPMAP_GRAPH_DB_DATABASE: undefined,
        TRAPMAP_GRAPH_DB_FAIL_OPEN: undefined,
        TRAPMAP_GRAPH_DB_SYNC_ON_WRITE: undefined,
      },
    },
  ];

  if (hasNeo4jCredentials()) {
    scenarios.push({
      name: 'enabled-current-env',
      env: {
        TRAPMAP_GRAPH_DB_ENABLED: 'true',
      },
    });
    scenarios.push({
      name: 'enabled-fallback-control',
      env: {
        TRAPMAP_GRAPH_DB_ENABLED: 'true',
        TRAPMAP_GRAPH_DB_URI: 'bolt://127.0.0.1:65535',
        TRAPMAP_GRAPH_DB_USERNAME: process.env.TRAPMAP_GRAPH_DB_USERNAME,
        TRAPMAP_GRAPH_DB_PASSWORD: process.env.TRAPMAP_GRAPH_DB_PASSWORD,
        TRAPMAP_GRAPH_DB_DATABASE: process.env.TRAPMAP_GRAPH_DB_DATABASE ?? 'neo4j',
        TRAPMAP_GRAPH_DB_FAIL_OPEN: 'true',
      },
    });
  }

  return scenarios;
}

function hasNeo4jCredentials(): boolean {
  return Boolean(
    process.env.TRAPMAP_GRAPH_DB_URI &&
      process.env.TRAPMAP_GRAPH_DB_USERNAME &&
      process.env.TRAPMAP_GRAPH_DB_PASSWORD,
  );
}

async function runBenchmark(
  databaseUrl: string,
  iterations: number,
  scenarios: Array<{ name: string; env: EnvOverrides }>,
): Promise<void> {
  console.log('TrapMap graph backend startup benchmark');
  console.log(`Iterations per scenario: ${iterations}`);
  console.log('');

  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario.name, scenario.env, iterations, databaseUrl));
  }

  results.forEach(reportScenario);
}

function reportScenario(result: ScenarioResult): void {
  if (result.error) {
    console.log(`${result.name}: ERROR`);
    console.log(`  ${result.error}`);
    return;
  }

  console.log(`${result.name}:`);
  console.log(`  avg: ${result.averageMs.toFixed(2)}ms`);
  console.log(`  min: ${result.minMs.toFixed(2)}ms`);
  console.log(`  max: ${result.maxMs.toFixed(2)}ms`);
  console.log(`  samples: ${result.samplesMs.map((value) => value.toFixed(2)).join(', ')}`);
}

async function runScenario(
  name: string,
  env: EnvOverrides,
  iterations: number,
  databaseUrl: string,
): Promise<ScenarioResult> {
  const samplesMs: number[] = [];

  try {
    for (let index = 0; index < iterations; index += 1) {
      const durationMs = await withEnv(env, async () => {
        const start = performance.now();
        const composed = buildPostgresComposedServer(databaseUrl);
        const app = composed.app;

        try {
          await app.ready();
        } finally {
          await composed.close();
        }

        return performance.now() - start;
      });

      samplesMs.push(durationMs);
    }

    return {
      name,
      samplesMs,
      averageMs: average(samplesMs),
      minMs: Math.min(...samplesMs),
      maxMs: Math.max(...samplesMs),
    };
  } catch (error) {
    return {
      name,
      samplesMs,
      averageMs: Number.NaN,
      minMs: Number.NaN,
      maxMs: Number.NaN,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function withEnv<T>(overrides: EnvOverrides, fn: () => Promise<T>): Promise<T> {
  const snapshot = snapshotEnvironment(overrides);
  applyEnvironment(overrides);

  try {
    return await fn();
  } finally {
    applyEnvironment(Object.fromEntries(snapshot));
  }
}

function snapshotEnvironment(overrides: EnvOverrides): Map<string, string | undefined> {
  return new Map(Object.keys(overrides).map((key) => [key, process.env[key]]));
}

function applyEnvironment(overrides: EnvOverrides): void {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

main().catch((error) => {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(detail);
  process.exit(1);
});
