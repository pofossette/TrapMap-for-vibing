/**
 * Store 操作基准对比工具
 *
 * 对比 JsonStore vs PostgresStore 在 snapshot/transact 上的延迟差异。
 * 仅对比 JsonStore（无需 PostgreSQL 连接）。
 *
 * 用法:
 *   pnpm tsx scripts/bench-store.ts
 *   pnpm tsx scripts/bench-store.ts --entries 1000 --iterations 100
 *   pnpm tsx scripts/bench-store.ts --pg    # 同时对比 PostgreSQL（需要连接）
 */

import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

// 参数解析
const args = process.argv.slice(2);
let entryCount = 500;
let iterations = 50;
let includePg = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--entries') entryCount = parseInt(args[++i]);
  if (args[i] === '--iterations') iterations = parseInt(args[++i]);
  if (args[i] === '--pg') includePg = true;
}

// Dynamic imports for ESM modules
const { JsonStore, createEmptyStoreData, nowIso } = await import('../packages/server/src/lib/store.js');
type SkillShareerStore = import('../packages/server/src/lib/store.js').SkillShareerStore;
type StoreData = import('../packages/server/src/lib/store.js').StoreData;

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(Math.floor(sorted.length * p), sorted.length - 1)];
}

// 构建测试数据
function buildTestData(count: number): StoreData {
  const data = createEmptyStoreData();
  for (let i = 0; i < count; i++) {
    data.knowledgeEntries.push({
      id: `bench_entry_${i}`,
      teamId: 'team_bench',
      scope: 'project',
      labels: ['benchmark', 'test'],
      shortcut: `Benchmark Entry ${i}`,
      detail: `This is benchmark test entry number ${i} with some content about docker deployment and compose configuration.`,
      requiredLevel: 3,
      lifecycleState: 'approved',
      history: [],
      latestRevision: {
        revision: 0,
        submittedAt: new Date().toISOString(),
        submittedByUserId: 'bench_user',
        shortcut: `Benchmark Entry ${i}`,
        detail: `This is benchmark test entry number ${i} with some content about docker deployment and compose configuration.`,
        labels: ['benchmark', 'test'],
        lifecycleState: 'approved',
        resubmissionOf: null,
        agentReview: null,
        reviewerDecision: null,
        reviewNotes: [],
      },
      metadata: {
        scopeLabel: 'project-knowledge',
        submissionCount: 1,
        resubmissionCount: 0,
        revisionCount: 0,
        latestSubmissionId: null,
        latestSubmittedAt: null,
        latestReviewedAt: null,
        latestDecision: null,
      },
      embeddingCache: null,
      indexState: null,
      boundary: null,
      decayMeta: null,
      evidenceMeta: null,
      maintenanceMeta: null,
      ownerUserId: 'bench_user',
      latestSubmissionId: null,
      submissionHistory: [],
      agentReview: null,
      reviewHistory: [],
      reviewNotes: [],
      lifecycleHistory: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }
  return data;
}

async function benchStore(name: string, store: SkillShareerStore, data: StoreData): Promise<void> {
  // 先写入初始数据
  await store.transact(async (d) => {
    Object.assign(d, data);
  });

  console.log(`\n=== ${name} (entries=${data.knowledgeEntries.length}) ===`);

  // Benchmark: snapshot
  const snapTimes: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await store.snapshot();
    snapTimes.push(performance.now() - t0);
  }
  snapTimes.sort((a, b) => a - b);
  console.log(`  snapshot: n=${iterations} avg=${(snapTimes.reduce((a, b) => a + b, 0) / iterations).toFixed(1)}ms p50=${percentile(snapTimes, 0.5).toFixed(1)}ms p95=${percentile(snapTimes, 0.95).toFixed(1)}ms`);

  // Benchmark: transact (read-only)
  const txTimes: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await store.transact(async (d) => d.knowledgeEntries.length);
    txTimes.push(performance.now() - t0);
  }
  txTimes.sort((a, b) => a - b);
  console.log(`  transact: n=${iterations} avg=${(txTimes.reduce((a, b) => a + b, 0) / iterations).toFixed(1)}ms p50=${percentile(txTimes, 0.5).toFixed(1)}ms p95=${percentile(txTimes, 0.95).toFixed(1)}ms`);
}

async function main(): Promise<void> {
  console.log(`\nStore Benchmark: entries=${entryCount}, iterations=${iterations}`);
  const data = buildTestData(entryCount);

  // JsonStore benchmark
  const tmpDir = mkdtempSync(join(tmpdir(), 'trapmap-bench-'));
  try {
    const jsonStore = new JsonStore(join(tmpDir, 'bench.json'));
    await benchStore('JsonStore', jsonStore, data);
  } finally {
    // Cleanup
    rmSync(tmpDir, { recursive: true, force: true });
  }

  // PostgresStore benchmark (optional)
  if (includePg) {
    try {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const { PostgresStore } = await import('../packages/server/src/lib/persistence/postgres-store.js');
      const pgStore = new PostgresStore(pool);
      await benchStore('PostgresStore', pgStore, data);
      await pool.end();
    } catch (err) {
      console.log('\n  PostgresStore: SKIPPED (no DATABASE_URL or pg not available)');
    }
  }

  console.log('');
}

main().catch(console.error);
