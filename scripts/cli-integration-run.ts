// scripts/cli-integration-run.ts
// Phase 1-3 CLI matrix runner: executes CLI command families against a live gateway, records timings and docker snapshots
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectOnce } from './cli-integration-collect.js';

export interface RunOptions {
  artifact: 'A-light' | 'B-heavy' | 'C-go';
  runId: string; // e.g. run-01
  gatewayUrl?: string;
  outRoot?: string;
}

const CLI = 'pnpm --filter @trapmap/cli dev --';

function runCli(
  cmd: string,
  gatewayUrl: string,
): { stdout: string; stderr: string; exitCode: number; ms: number } {
  const full = `${CLI} ${cmd} 2>&1`;
  const env = {
    ...process.env,
    TRAPMAP_GATEWAY_URL: gatewayUrl,
    TRAPMAP_CLI_GATEWAY_URL: gatewayUrl,
  };
  const start = Date.now();
  try {
    const out = execSync(full, {
      encoding: 'utf8',
      env,
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout: out, stderr: '', exitCode: 0, ms: Date.now() - start };
  } catch (e: any) {
    const stdout = e.stdout?.toString?.() ?? '';
    const stderr = e.stderr?.toString?.() ?? e.message ?? '';
    const combined = stdout + stderr;
    // execSync throws but combined may contain output
    return { stdout: combined, stderr, exitCode: e.status ?? 1, ms: Date.now() - start };
  }
}

function ensureDir(d: string) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

const MATRIX: Array<{ name: string; cmd: string }> = [
  { name: 'about', cmd: 'about' },
  { name: 'api-list', cmd: 'api:list' },
  { name: 'search', cmd: 'search test-trap' },
  { name: 'skill-find', cmd: 'skill find --json' },
  { name: 'skill-search-by-content', cmd: 'skill search-by-content trap-content' },
  { name: 'skill-find-nojson', cmd: 'skill find' },
];

export function runMatrix(opts: RunOptions): void {
  const gatewayUrl = opts.gatewayUrl ?? 'http://127.0.0.1:4000';
  const outRoot = opts.outRoot ?? 'benchmarks/results/cli-integration';
  const outDir = join(outRoot, opts.artifact, opts.runId);
  ensureDir(outDir);
  console.log(`[run] ${opts.artifact} ${opts.runId} -> ${outDir} gateway=${gatewayUrl}`);

  // pre-collect
  collectOnce({ outDir: join(outDir, 'collect-pre') });

  const timings: any[] = [];
  const results: any[] = [];
  for (const item of MATRIX) {
    const res = runCli(item.cmd, gatewayUrl);
    timings.push({ cmd: item.cmd, name: item.name, ms: res.ms, exitCode: res.exitCode });
    results.push({ name: item.name, cmd: item.cmd, ...res });
    // write per-command log
    writeFileSync(join(outDir, `cli-${item.name}.json`), JSON.stringify(res, null, 2));
    console.log(
      `  ${item.name}: exit=${res.exitCode} ms=${res.ms} ${res.stdout.slice(0, 120).replace(/\n/g, ' ')}`,
    );
    // also try to parse json if --json
    if (item.cmd.includes('--json') && res.exitCode === 0) {
      try {
        JSON.parse(res.stdout);
      } catch {
        console.warn(`    warn: ${item.name} output not JSON`);
      }
    }
  }

  // retrieval loop x10 for p95
  const loopTimes: number[] = [];
  for (let i = 0; i < 10; i++) {
    const r = runCli('search loop-trap', gatewayUrl);
    loopTimes.push(r.ms);
  }
  const sorted = [...loopTimes].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;

  writeFileSync(
    join(outDir, 'cli-timings.jsonl'),
    `${timings.map((t) => JSON.stringify(t)).join('\n')}\n`,
  );
  writeFileSync(
    join(outDir, 'loop-timings.json'),
    JSON.stringify({ loopTimes, p50, p95 }, null, 2),
  );
  writeFileSync(join(outDir, 'matrix-results.json'), JSON.stringify(results, null, 2));

  // post-collect
  collectOnce({ outDir: join(outDir, 'collect-post') });
  // also copy latest collect into top-level for report compatibility
  // create flat stats.jsonl/df etc for report's expectation (report looks for stats.jsonl at run root)
  // we have collect-pre and collect-post; merge for convenience
  try {
    const preStats = readFileSync(join(outDir, 'collect-pre', 'stats.jsonl'), 'utf8');
    const postStats = readFileSync(join(outDir, 'collect-post', 'stats.jsonl'), 'utf8');
    writeFileSync(join(outDir, 'stats.jsonl'), preStats + postStats);
    writeFileSync(
      join(outDir, 'health.json'),
      readFileSync(join(outDir, 'collect-post', 'health.json'), 'utf8'),
    );
    writeFileSync(
      join(outDir, 'metrics.txt'),
      readFileSync(join(outDir, 'collect-post', 'metrics.txt'), 'utf8'),
    );
    writeFileSync(
      join(outDir, 'df.txt'),
      readFileSync(join(outDir, 'collect-post', 'df.txt'), 'utf8'),
    );
    writeFileSync(
      join(outDir, 'df.json'),
      readFileSync(join(outDir, 'collect-post', 'df.json'), 'utf8'),
    );
  } catch {}

  console.log(`[run] done p50=${p50} p95=${p95} loop=${loopTimes.join(',')}`);
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('cli-integration-run.ts');
if (isMain) {
  const args = process.argv.slice(2);
  const get = (k: string, d: string) => {
    const idx = args.indexOf(k);
    return idx >= 0 && args[idx + 1] ? args[idx + 1]! : d;
  };
  const artifact = get('--artifact', 'A-light') as any;
  const runId = get('--run', 'run-01');
  const gateway = get('--gateway', 'http://127.0.0.1:4000');
  const root = get('--root', 'benchmarks/results/cli-integration');
  runMatrix({ artifact, runId, gatewayUrl: gateway, outRoot: root });
}
