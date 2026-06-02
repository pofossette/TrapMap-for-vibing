#!/usr/bin/env node

import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { buildServer } from '../src/app.ts';

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
  const iterations = Number.isFinite(DEFAULT_ITERATIONS) && DEFAULT_ITERATIONS > 0
    ? DEFAULT_ITERATIONS
    : 5;
  const currentNeo4jReady =
    !!process.env.TRAPMAP_GRAPH_DB_URI &&
    !!process.env.TRAPMAP_GRAPH_DB_USERNAME &&
    !!process.env.TRAPMAP_GRAPH_DB_PASSWORD;

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

  if (currentNeo4jReady) {
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

  console.log('TrapMap graph backend startup benchmark');
  console.log(`Iterations per scenario: ${iterations}`);
  console.log('');

  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario.name, scenario.env, iterations));
  }

  for (const result of results) {
    if (result.error) {
      console.log(`${result.name}: ERROR`);
      console.log(`  ${result.error}`);
      continue;
    }

    console.log(`${result.name}:`);
    console.log(`  avg: ${result.averageMs.toFixed(2)}ms`);
    console.log(`  min: ${result.minMs.toFixed(2)}ms`);
    console.log(`  max: ${result.maxMs.toFixed(2)}ms`);
    console.log(`  samples: ${result.samplesMs.map((value) => value.toFixed(2)).join(', ')}`);
  }
}

async function runScenario(
  name: string,
  env: EnvOverrides,
  iterations: number,
): Promise<ScenarioResult> {
  const samplesMs: number[] = [];

  try {
    for (let index = 0; index < iterations; index += 1) {
      const durationMs = await withEnv(env, async () => {
        const start = performance.now();
        const app = buildServer({
          config: {
            dataFile: path.resolve(
              process.cwd(),
              '.tmp',
              'graph-benchmark',
              `${name}-${index}-${randomUUID()}.json`,
            ),
          },
        });

        try {
          await app.ready();
        } finally {
          await app.close();
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
  const snapshot = new Map<string, string | undefined>();

  for (const key of Object.keys(overrides)) {
    snapshot.set(key, process.env[key]);
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of snapshot) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
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
