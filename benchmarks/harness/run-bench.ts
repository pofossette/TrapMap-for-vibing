#!/usr/bin/env tsx
/**
 * Run bench harness without auto-executing in CI.
 * Usage: pnpm bench:compute | pnpm bench:compare
 * Writes benchmarks/results/*.json ; does NOT fail on threshold unless --check
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

const mode = process.argv[2] ?? '--compute';
mkdirSync('benchmarks/results', { recursive: true });

if (mode === '--compute' || mode === '--all') {
  const r = spawnSync(
    'pnpm',
    ['exec', 'vitest', 'bench', '--config', 'benchmarks/harness/vitest.bench.config.ts', '--run'],
    {
      stdio: 'inherit',
    },
  );
  if (r.status !== 0 && process.argv.includes('--check')) process.exit(r.status ?? 1);
}
if (mode === '--compare') {
  // jsVsGo 仅校验 fallback 一致性，不压测
  const r = spawnSync(
    'pnpm',
    ['exec', 'vitest', 'run', '--project', 'infra', 'test/go-accelerator.test.ts'],
    { stdio: 'inherit' },
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
}
console.log('[bench harness] done — results in benchmarks/results/ (ignored by git)');
