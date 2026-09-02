// scripts/cli-integration-collect.ts
// Phase 0.4: docker + gateway resource snapshot collector for CLI integration mainline
// Collects docker stats / system df / gateway health / go metrics into outDir
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CollectOptions {
  outDir: string;
}

function safeExec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 8000 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return JSON.stringify({ error: msg, cmd });
  }
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function collectOnce(options: CollectOptions): void {
  const { outDir } = options;
  ensureDir(outDir);

  // 1. docker stats (json per container, --no-stream)
  const statsRaw = safeExec(
    'docker stats --no-stream --format "{{json .}}" 2>&1 || echo \'{"error":"docker stats failed"}\'',
  );
  // Normalize: each line is a JSON object; keep as jsonl
  writeFileSync(join(outDir, 'stats.jsonl'), `${statsRaw.trimEnd()}\n`, 'utf8');

  // 2. docker system df -v
  const dfRaw = safeExec('docker system df -v 2>&1');
  // try to keep JSON if possible, else raw
  writeFileSync(join(outDir, 'df.json'), dfRaw, 'utf8');
  writeFileSync(join(outDir, 'df.txt'), dfRaw, 'utf8');

  // 3. host df -h
  const hostDf = safeExec('df -h 2>&1; echo "---"; du -sh .data 2>&1; du -sh logs 2>&1');
  writeFileSync(join(outDir, 'host-df.txt'), hostDf, 'utf8');

  // 4. gateway health
  const health = safeExec(
    'curl -s http://127.0.0.1:4000/health 2>&1 || echo \'{"error":"health unreachable"}\'',
  );
  writeFileSync(join(outDir, 'health.json'), health, 'utf8');
  const ready = safeExec(
    'curl -s http://127.0.0.1:4000/ready 2>&1 || echo \'{"error":"ready unreachable"}\'',
  );
  writeFileSync(join(outDir, 'ready.json'), ready, 'utf8');

  // 5. go metrics (optional)
  const metrics = safeExec(
    'curl -s http://127.0.0.1:4101/metrics 2>&1 || curl -s http://127.0.0.1:4100/metrics 2>&1 || echo "# no go metrics"',
  );
  writeFileSync(join(outDir, 'metrics.txt'), metrics, 'utf8');

  // 6. postgres size (best-effort via docker exec)
  const pgSize = safeExec(
    'docker exec trapmap-postgres psql -U trapmap -d trapmap -c "SELECT pg_database_size(\'trapmap\')" 2>&1 || echo "pg_size unavailable"',
  );
  writeFileSync(join(outDir, 'pg-size.txt'), pgSize, 'utf8');

  // 7. timestamp
  writeFileSync(join(outDir, 'collected-at.txt'), `${new Date().toISOString()}\n`, 'utf8');
}

function parseArgs(argv: string[]): CollectOptions {
  const outIdx = argv.indexOf('--out');
  const outDir =
    outIdx >= 0 && argv[outIdx + 1]
      ? argv[outIdx + 1]!
      : 'benchmarks/results/cli-integration/_manual';
  return { outDir };
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('cli-integration-collect.ts');
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  collectOnce(opts);
  console.log(`[collect] wrote to ${opts.outDir}`);
}
