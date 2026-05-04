---
wave: 1
depends_on: []
files_modified:
  - packages/server/src/lib/rag-log.ts
  - packages/server/src/lib/retrieval/orchestrator.ts
  - packages/server/src/lib/retrieval/recall/semantic.ts
  - packages/server/src/lib/embeddings.ts
  - packages/server/src/app.ts
autonomous: true
requirements: [PERF-01, PERF-02, PERF-03, PERF-04]
---

# Phase 79: Performance Observability Enhancement

**Goal:** 增强现有 RAG 日志和流水线计时，使每次检索请求自动记录数据吞吐量、Embedding 耗时和内存状态，为零成本性能分析提供数据基础。

## Context

当前 `timedStep()` 只记录 `{name, latencyMs}`，缺少数据规模信息。Embedding 调用（69处）和 LLM 调用（3处）的耗时被淹没在 `recall`/`refinement` 步骤里，无法区分 IO 等待和计算开销。`/health` 端点不暴露内存和运行时间。

本 phase 在不引入任何新依赖的前提下，通过扩展已有数据结构来填补可观测性缺口。

---

## Task 79-01: PipelineStep 增加 inputSize/outputSize 字段

**Purpose:** 让每个流水线步骤记录输入输出数据量，用于分析吞吐瓶颈。

<read_first>
- packages/server/src/lib/rag-log.ts (PipelineStep 接口定义)
- packages/server/src/lib/retrieval/orchestrator.ts (timedStep 函数及所有调用点)
</read_first>

<action>
1. 修改 `packages/server/src/lib/rag-log.ts` 的 `PipelineStep` 接口：

```typescript
export interface PipelineStep {
  name: string;
  latencyMs: number;
  /** 输入数据量（如 entries 数量） */
  inputSize?: number;
  /** 输出数据量（如匹配结果数量） */
  outputSize?: number;
  metadata?: Record<string, unknown>;
}
```

2. 修改 `packages/server/src/lib/retrieval/orchestrator.ts` 的 `timedStep` 函数，增加可选的 size 回调：

```typescript
interface TimedStepOptions {
  inputSize?: number;
  outputSize?: (result: unknown) => number;
}

async function timedStep<T>(
  name: string,
  fn: () => Promise<T>,
  steps: PipelineStep[],
  options?: TimedStepOptions,
): Promise<T> {
  const start = Date.now();
  const result = await fn();
  const latencyMs = Date.now() - start;
  const step: PipelineStep = { name, latencyMs };
  if (options?.inputSize !== undefined) {
    step.inputSize = options.inputSize;
  }
  if (options?.outputSize) {
    step.outputSize = options.outputSize(result);
  }
  steps.push(step);
  return result;
}
```

3. 在 `searchKnowledge` (v1) 的所有 timedStep 调用点补上 size：

```typescript
// snapshot
const data = await timedStep('snapshot', () => services.store.snapshot(), steps, {
  outputSize: (d: StoreData) => d.knowledgeEntries.length,
});

// eligibility
const eligibleEntries = await timedStep(
  'eligibility',
  () => Promise.resolve(filterEligibleEntries(data.knowledgeEntries, auth, parsed.filters)),
  steps,
  { inputSize: data.knowledgeEntries.length, outputSize: (r: KnowledgeRecord[]) => r.length },
);

// boundary-filter
const boundaryFiltered = await timedStep(
  'boundary-filter',
  () => Promise.resolve(filterByBoundaryContext(eligibleEntries, parsed.boundaryContext)),
  steps,
  { inputSize: eligibleEntries.length, outputSize: (r: KnowledgeRecord[]) => r.length },
);

// recall
const { scoredEntries, mergedCandidates } = await timedStep(
  'recall',
  () => dispatchByMode(parsed.mode, parsed.seed, boundaryFiltered, parsed, services, auth),
  steps,
  { inputSize: boundaryFiltered.length, outputSize: (r: { scoredEntries: ScoredEntry[] }) => r.scoredEntries.length },
);

// assembly
const { globalConstraints, projectKnowledge } = await timedStep(
  'assembly',
  () => Promise.resolve(assembleResponseBuckets(scoredEntries, parsed.filters, citations, conflictHints)),
  steps,
  { inputSize: scoredEntries.length, outputSize: (r: { globalConstraints: unknown[]; projectKnowledge: unknown[] }) => r.globalConstraints.length + r.projectKnowledge.length },
);
```

4. 在 `searchKnowledgeV2` (v2) 做相同处理：

```typescript
// snapshot
const data = await timedStep('snapshot', () => services.store.snapshot(), steps, {
  outputSize: (d: StoreData) => (d.skillArtifacts ?? []).length,
});

// recall
const rankedCandidates = await timedStep(
  'recall',
  () => Promise.resolve(rankCapsules(artifacts, intent, governanceFilters, parsed.maxResults)),
  steps,
  { inputSize: artifacts.length, outputSize: (r: unknown[]) => r.length },
);
```

5. v3 pipeline (`graph-plan-search.ts`) 同样处理（如果其中使用了 timedStep）。
</action>

<acceptance_criteria>
- [ ] PipelineStep 接口新增 inputSize/outputSize 可选字段
- [ ] timedStep 函数支持 options 参数，保持向后兼容（无 options 时行为不变）
- [ ] v1 pipeline (searchKnowledge) 的 snapshot/eligibility/boundary-filter/recall/assembly 步骤记录 size
- [ ] v2 pipeline (searchKnowledgeV2) 的 snapshot/recall 步骤记录 size
- [ ] 现有测试全部通过（options 参数可选，不破坏已有调用）
</acceptance_criteria>

---

## Task 79-02: Embedding 调用独立计时

**Purpose:** 将 Embedding API 调用耗时从 recall 步骤中分离出来，独立记录到 PipelineStep。

<read_first>
- packages/server/src/lib/embeddings.ts (generateEmbedding 函数)
- packages/server/src/lib/retrieval/recall/semantic.ts (getQueryEmbedding, getEntryEmbedding)
- packages/server/src/lib/retrieval/orchestrator.ts (semanticRecall 函数，约 line 496)
</read_first>

<action>
1. 修改 `packages/server/src/lib/embeddings.ts`，在 `generateEmbedding` 中增加耗时返回：

```typescript
/** Embedding 结果，附带计时信息 */
export interface EmbeddingResult {
  vector: number[];
  latencyMs: number;
  provider: string;
  cached: boolean;
}

/**
 * Generate an embedding vector with timing metadata.
 * Returns both the vector and performance info.
 */
export async function generateEmbeddingWithMeta(text: string): Promise<EmbeddingResult> {
  const t0 = performance.now();

  if (globalProvider) {
    try {
      const vector = await globalProvider.embed(text);
      return {
        vector,
        latencyMs: performance.now() - t0,
        provider: globalProvider.provider ?? 'global',
        cached: false,
      };
    } catch {
      // fall through
    }
  }

  const adapter = await getEmbeddingsAdapter();
  const vector = await adapter.embed(text);
  return {
    vector,
    latencyMs: performance.now() - t0,
    provider: adapter.provider,
    cached: false,
  };
}

// 原有 generateEmbedding 保持不变（向后兼容）
export async function generateEmbedding(text: string): Promise<number[]> {
  const result = await generateEmbeddingWithMeta(text);
  return result.vector;
}
```

2. 修改 `packages/server/src/lib/retrieval/recall/semantic.ts`，在语义检索中收集 embedding 计时：

在 `semanticRecall` 函数中，将 embedding 调用从 recall 内部提升出来，记录为独立步骤：

```typescript
import { generateEmbeddingWithMeta } from '../../embeddings.js';

// 在 semanticRecall 函数中：
async function semanticRecall(
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
  services?: SkillShareerServices,
  auth?: ResolvedAuthContext,
  steps?: PipelineStep[],  // 新增参数，用于记录子步骤
): Promise<{ scoredEntries: ScoredEntry[]; mergedCandidates?: MergedCandidate[] }> {
  const dbConfig = services ? getDbSearchConfig(services) : { enabled: false, pool: null };

  // 将 embedding 生成独立计时
  const embResult = await generateEmbeddingWithMeta(seed);
  const queryVector = embResult.vector;

  if (steps) {
    steps.push({
      name: 'embedding',
      latencyMs: embResult.latencyMs,
      inputSize: seed.length,
      metadata: { provider: embResult.provider, type: 'query' },
    });
  }

  // ... 后续逻辑不变
}
```

3. 修改 `dispatchByMode` 签名，透传 `steps`：

```typescript
async function dispatchByMode(
  mode: string,
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
  services?: SkillShareerServices,
  auth?: ResolvedAuthContext,
  steps?: PipelineStep[],  // 新增
): Promise<{ scoredEntries: ScoredEntry[]; mergedCandidates?: MergedCandidate[] }> {
  switch (mode) {
    case 'semantic':
      return await semanticRecall(seed, eligibleEntries, parsed, services, auth, steps);
    case 'hybrid':
      return await hybridRecall(seed, eligibleEntries, parsed, services, auth, steps);
    case 'graph-assisted':
      return await graphAssistedRecall(seed, eligibleEntries, parsed);
    default:
      throw new AppError(400, 'invalid_mode', `Invalid query mode: ${mode}`);
  }
}
```

4. 修改 v1 pipeline 调用 dispatchByMode 的地方，传入 steps：

```typescript
const { scoredEntries, mergedCandidates } = await timedStep(
  'recall',
  () => dispatchByMode(parsed.mode, parsed.seed, boundaryFiltered, parsed, services, auth, steps),
  steps,
  { inputSize: boundaryFiltered.length, outputSize: (r) => r.scoredEntries.length },
);
```

注意：embedding 子步骤会同时出现在 `steps` 数组中（作为 'embedding' 条目），recall 步骤的总耗时自然包含 embedding 调用。这样既可以看到 recall 总耗时，也能看到其中 embedding 占了多少。
</action>

<acceptance_criteria>
- [ ] `generateEmbeddingWithMeta` 返回 vector + latencyMs + provider + cached
- [ ] 原有 `generateEmbedding` 保持不变，所有现有调用者无需修改
- [ ] v1 semantic recall 中 embedding 调用以独立 PipelineStep 记录
- [ ] RAG 日志中可以区分 embedding 耗时和 recall 总耗时
- [ ] 现有测试通过（generateEmbedding 行为不变）
</acceptance_criteria>

---

## Task 79-03: /health 端点增加运行时指标

**Purpose:** 暴露进程内存和运行时间，用于监控和容量规划。

<read_first>
- packages/server/src/app.ts (/health 端点，约 line 133)
</read_first>

<action>
修改 `packages/server/src/app.ts` 的 `/health` 端点：

```typescript
app.get('/health', async () => {
  const mem = process.memoryUsage();
  return {
    status: 'ok',
    product: 'trapmap',
    packages: ['cli', 'server', 'contracts'],
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    },
    uptimeSeconds: Math.round(process.uptime()),
  };
});
```

</action>

<acceptance_criteria>
- [ ] `/health` 返回 memory.rssMb, memory.heapUsedMb, memory.heapTotalMb
- [ ] `/health` 返回 uptimeSeconds
- [ ] 现有依赖 `/health` 的逻辑不受影响（status/product/packages 字段不变）
- [ ] Docker HEALTHCHECK 仍然正常工作
</acceptance_criteria>

---

## Task 79-04: RAG 日志分析脚本

**Purpose:** 提供开箱即用的命令行工具，分析 RAG 日志中的 P50/P95/P99 延迟分布。

<read_first>
- packages/server/src/lib/rag-log.ts (日志格式和文件命名规则)
- scripts/ 目录下已有的脚本作为参考
</read_first>

<action>
创建 `scripts/rag-analyze.ts`：

```typescript
/**
 * RAG 日志性能分析工具
 *
 * 用法:
 *   pnpm tsx scripts/rag-analyze.ts                    # 分析 logs/rag/ 目录
 *   pnpm tsx scripts/rag-analyze.ts --dir ./my-logs    # 指定目录
 *   pnpm tsx scripts/rag-analyze.ts --mode semantic    # 按 mode 过滤
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// 解析参数
const args = process.argv.slice(2);
let logDir = 'logs/rag';
let filterMode: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir' && args[i + 1]) { logDir = args[++i]; }
  if (args[i] === '--mode' && args[i + 1]) { filterMode = args[++i]; }
}

// 读取所有日志文件
interface LogEntry {
  queryId: string;
  seed: string;
  mode: string;
  totalLatencyMs: number;
  resultCount: number;
  pipelineSteps: Array<{ name: string; latencyMs: number; inputSize?: number; outputSize?: number }>;
  timestamp: string;
}

const entries: LogEntry[] = [];
const files = readdirSync(logDir).filter(f => f.endsWith('.log'));

for (const file of files) {
  const content = readFileSync(path.join(logDir, file), 'utf-8');
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as LogEntry;
      if (!filterMode || entry.mode === filterMode) {
        entries.push(entry);
      }
    } catch { /* skip malformed lines */ }
  }
}

if (entries.length === 0) {
  console.log('No log entries found.');
  process.exit(0);
}

// 工具函数：计算百分位
function percentile(sorted: number[], p: number): number {
  const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
  return sorted[idx];
}

// 1. 总延迟分布
const latencies = entries.map(e => e.totalLatencyMs).sort((a, b) => a - b);
console.log('\n=== Overall Latency ===');
console.log(`  count: ${latencies.length}`);
console.log(`  avg:   ${Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)}ms`);
console.log(`  p50:   ${percentile(latencies, 0.50)}ms`);
console.log(`  p95:   ${percentile(latencies, 0.95)}ms`);
console.log(`  p99:   ${percentile(latencies, 0.99)}ms`);
console.log(`  max:   ${latencies[latencies.length - 1]}ms`);

// 2. 按 mode 分组
const modes = [...new Set(entries.map(e => e.mode))];
console.log('\n=== Latency by Mode ===');
for (const mode of modes) {
  const modeEntries = entries.filter(e => e.mode === mode);
  const modeLat = modeEntries.map(e => e.totalLatencyMs).sort((a, b) => a - b);
  console.log(
    `  ${mode.padEnd(20)} n=${String(modeLat.length).padStart(4)}  p50=${String(percentile(modeLat, 0.50)).padStart(5)}ms  p95=${String(percentile(modeLat, 0.95)).padStart(5)}ms  p99=${String(percentile(modeLat, 0.99)).padStart(5)}ms`,
  );
}

// 3. 各步骤平均耗时
const stepMap = new Map<string, number[]>();
for (const entry of entries) {
  for (const step of entry.pipelineSteps ?? []) {
    if (!stepMap.has(step.name)) stepMap.set(step.name, []);
    stepMap.get(step.name)!.push(step.latencyMs);
  }
}
console.log('\n=== Avg Step Latency ===');
const stepStats = [...stepMap.entries()]
  .map(([name, times]) => {
    const sorted = times.sort((a, b) => a - b);
    return { name, count: times.length, avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length), p95: percentile(sorted, 0.95) };
  })
  .sort((a, b) => b.avg - a.avg);
for (const s of stepStats) {
  console.log(`  ${s.name.padEnd(20)} n=${String(s.count).padStart(4)}  avg=${String(s.avg).padStart(5)}ms  p95=${String(s.p95).padStart(5)}ms`);
}

// 4. 慢请求 Top 10
console.log('\n=== Top 10 Slowest Queries ===');
const sorted = [...entries].sort((a, b) => b.totalLatencyMs - a.totalLatencyMs);
for (const e of sorted.slice(0, 10)) {
  const topStep = [...(e.pipelineSteps ?? [])].sort((a, b) => b.latencyMs - a.latencyMs)[0];
  console.log(`  ${e.totalLatencyMs}ms  ${e.mode.padEnd(18)} seed="${e.seed.slice(0, 40)}" bottleneck=${topStep?.name ?? 'n/a'}`);
}

// 5. 数据吞吐量（如果有 inputSize/outputSize）
const stepsWithSize = entries.flatMap(e => (e.pipelineSteps ?? []).filter(s => s.inputSize !== undefined || s.outputSize !== undefined));
if (stepsWithSize.length > 0) {
  console.log('\n=== Data Throughput ===');
  const throughputMap = new Map<string, { inputSizes: number[]; outputSizes: number[] }>();
  for (const s of stepsWithSize) {
    if (!throughputMap.has(s.name)) throughputMap.set(s.name, { inputSizes: [], outputSizes: [] });
    const t = throughputMap.get(s.name)!;
    if (s.inputSize !== undefined) t.inputSizes.push(s.inputSize);
    if (s.outputSize !== undefined) t.outputSizes.push(s.outputSize);
  }
  for (const [name, { inputSizes, outputSizes }] of throughputMap) {
    const avgIn = inputSizes.length ? Math.round(inputSizes.reduce((a, b) => a + b, 0) / inputSizes.length) : '-';
    const avgOut = outputSizes.length ? Math.round(outputSizes.reduce((a, b) => a + b, 0) / outputSizes.length) : '-';
    console.log(`  ${name.padEnd(20)} avg_in=${String(avgIn).padStart(6)}  avg_out=${String(avgOut).padStart(6)}`);
  }
}

console.log('');
```

</action>

<acceptance_criteria>
- [ ] 脚本可运行：`pnpm tsx scripts/rag-analyze.ts`
- [ ] 输出总体延迟 P50/P95/P99
- [ ] 按 mode 分组统计
- [ ] 各步骤平均耗时排名
- [ ] 慢请求 Top 10 及其瓶颈步骤
- [ ] 数据吞吐量分析（inputSize/outputSize 可用时）
- [ ] 支持 `--dir` 和 `--mode` 过滤参数
</acceptance_criteria>

---

## Task 79-05: Store 对比基准脚本

**Purpose:** 对比 JsonStore 和 PostgresStore 在相同数据集下的操作延迟。

<read_first>
- packages/server/src/lib/store.ts (JsonStore 实现)
- packages/server/src/lib/persistence/postgres-store.ts (PostgresStore 实现)
- packages/server/src/lib/store.ts (StoreData 接口, createEmptyStoreData)
</read_first>

<action>
创建 `scripts/bench-store.ts`：

```typescript
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
import { mkdtempSync } from 'node:fs';

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

import { JsonStore } from '../packages/server/src/lib/store.js';
import type { SkillShareerStore, StoreData } from '../packages/server/src/lib/store.js';
import { createEmptyStoreData } from '../packages/server/src/lib/store.js';

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
      embeddingCache: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
  const jsonStore = new JsonStore(join(tmpDir, 'bench.json'));
  await benchStore('JsonStore', jsonStore, data);

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
```

</action>

<acceptance_criteria>
- [ ] 脚本可运行：`pnpm tsx scripts/bench-store.ts`
- [ ] JsonStore snapshot/transact 延迟数据
- [ ] 支持 `--entries` 和 `--iterations` 参数
- [ ] 支持 `--pg` 可选对比 PostgreSQL
- [ ] 输出 P50/P95 百分位数据
</acceptance_criteria>

---

## Verification

```bash
# 1. 构建项目
pnpm build

# 2. 运行现有测试确认无破坏
pnpm test -- --run packages/server/src/lib/retrieval/orchestrator.test.ts
pnpm test -- --run packages/server/src/lib/embeddings.test.ts

# 3. 启动服务，开启 RAG 日志
LOG_RAG_ENABLED=true pnpm dev

# 4. 发送检索请求
curl -s -X POST http://localhost:4000/v1/retrieval/search \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer eval-local-admin-key-do-not-use-in-production' \
  -d '{"seed":"docker deployment"}'

# 5. 检查 /health 内存指标
curl -s http://localhost:4000/health | jq .

# 6. 分析 RAG 日志
pnpm tsx scripts/rag-analyze.ts

# 7. Store 对比基准
pnpm tsx scripts/bench-store.ts --entries 500 --iterations 50
```

---

## must_haves

1. **PERF-01**: PipelineStep 记录 inputSize/outputSize，RAG 日志可分析数据吞吐
2. **PERF-02**: Embedding 调用独立计时，可区分 IO 等待和计算开销
3. **PERF-03**: /health 端点暴露内存和运行时间
4. **PERF-04**: 提供日志分析和 Store 对比脚本，零外部依赖
