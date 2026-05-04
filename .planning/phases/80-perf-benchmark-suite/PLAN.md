---
wave: 2
depends_on: [79]
files_modified:
  - evals/perf/bench-retrieval.ts
  - evals/perf/bench-embedding.ts
  - evals/perf/bench-store.ts
  - evals/perf/lib/runner.ts
  - evals/perf/lib/report.ts
  - evals/perf/baseline.json
autonomous: true
requirements: [PERF-05, PERF-06]
---

# Phase 80: Performance Benchmark Suite & CI Regression Gate

**Goal:** 建立可重复的性能基准测试套件，为检索端点建立 P95 基准线，并在 CI 中自动检测性能回归（超过 20% 回归阈值则失败）。

## Context

Phase 79 增强了 PipelineStep 的可观测性，现在每个检索请求自动记录数据吞吐和 Embedding 耗时。本 phase 在此基础上：

1. 建立端到端检索基准测试（复用 evals/retrieval 的基础设施）
2. 建立 Embedding 调用基准（对比 fallback vs Ollama vs OpenAI）
3. 将基准线持久化为 `baseline.json`
4. CI 中运行基准对比，超过阈值自动失败

本 phase 不引入任何外部压测工具（如 autocannon/k6），全部使用项目内 TypeScript 实现，保持零额外依赖。

---

## Task 80-01: 创建性能基准测试框架

**Purpose:** 提供共享的基准测试运行器和报告格式。

<read_first>
- evals/retrieval/lib/adapters.ts (createExecutionContext, executeThroughRoute 模式)
- evals/retrieval/lib/types.ts (CaseResult 结构参考)
</read_first>

<action>
创建 `evals/perf/lib/runner.ts`：

```typescript
/**
 * 共享基准测试运行器。
 * 运行指定的 async 函数 N 次，收集延迟数据。
 */
import { performance } from 'node:perf_hooks';

export interface BenchResult {
  name: string;
  iterations: number;
  latenciesMs: number[];
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
}

export function percentile(sorted: number[], p: number): number {
  const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
  return sorted[idx];
}

/**
 * 运行基准测试。
 * @param name - 测试名称
 * @param fn - 要测量的异步函数
 * @param iterations - 运行次数（默认 50）
 * @param warmup - 预热次数（默认 3）
 */
export async function runBench(
  name: string,
  fn: () => Promise<void>,
  iterations = 50,
  warmup = 3,
): Promise<BenchResult> {
  // Warmup
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  // 实际测量
  const latencies: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await fn();
    latencies.push(performance.now() - t0);
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    name,
    iterations,
    latenciesMs: sorted,
    avgMs: Math.round(sum / sorted.length),
    p50Ms: Math.round(percentile(sorted, 0.5)),
    p95Ms: Math.round(percentile(sorted, 0.95)),
    p99Ms: Math.round(percentile(sorted, 0.99)),
    minMs: Math.round(sorted[0]),
    maxMs: Math.round(sorted[sorted.length - 1]),
  };
}
```

创建 `evals/perf/lib/report.ts`：

```typescript
/**
 * 基准测试报告：终端输出 + JSON 持久化 + 回归检测。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { BenchResult } from './runner.js';

export interface BaselineEntry {
  name: string;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  timestamp: string;
}

export interface RegressionResult {
  name: string;
  metric: string;
  baseline: number;
  current: number;
  changePercent: number;
  threshold: number;
  regressed: boolean;
}

/**
 * 打印基准结果到终端。
 */
export function printBenchResult(result: BenchResult): void {
  console.log(
    `  ${result.name.padEnd(40)} n=${String(result.iterations).padStart(3)}  p50=${String(result.p50Ms).padStart(5)}ms  p95=${String(result.p95Ms).padStart(5)}ms  p99=${String(result.p99Ms).padStart(5)}ms  avg=${String(result.avgMs).padStart(5)}ms`,
  );
}

/**
 * 加载 baseline.json。
 */
export function loadBaseline(filePath: string): BaselineEntry[] {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return [];
  }
}

/**
 * 保存 baseline.json。
 */
export function saveBaseline(filePath: string, entries: BaselineEntry[]): void {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(entries, null, 2));
}

/**
 * 检测性能回归。
 */
export function checkRegression(
  results: BenchResult[],
  baseline: BaselineEntry[],
  threshold = 0.20,  // 20% 回归阈值
): RegressionResult[] {
  const regressions: RegressionResult[] = [];

  for (const result of results) {
    const base = baseline.find(b => b.name === result.name);
    if (!base) continue;

    for (const [metric, current, baselineVal] of [
      ['p50', result.p50Ms, base.p50Ms],
      ['p95', result.p95Ms, base.p95Ms],
      ['p99', result.p99Ms, base.p99Ms],
    ] as const) {
      if (baselineVal > 0) {
        const change = (current - baselineVal) / baselineVal;
        regressions.push({
          name: result.name,
          metric,
          baseline: baselineVal,
          current,
          changePercent: Math.round(change * 100),
          threshold: Math.round(threshold * 100),
          regressed: change > threshold,
        });
      }
    }
  }

  return regressions;
}

/**
 * 打印回归检测结果。
 */
export function printRegressions(regressions: RegressionResult[]): boolean {
  const failed = regressions.filter(r => r.regressed);
  if (failed.length === 0) {
    console.log('\n  No regressions detected.');
    return false;
  }

  console.log(`\n  REGRESSIONS DETECTED (${failed.length}):`);
  for (const r of failed) {
    console.log(
      `    ${r.name} ${r.metric}: ${r.current}ms vs baseline ${r.baseline}ms (+${r.changePercent}% > ${r.threshold}% threshold)`,
    );
  }
  return true;
}
```

</action>

<acceptance_criteria>
- [ ] `runBench` 函数支持预热 + N 次迭代 + 百分位计算
- [ ] `loadBaseline` / `saveBaseline` 处理文件读写
- [ ] `checkRegression` 支持可配置阈值（默认 20%）
- [ ] 终端输出格式清晰可读
</acceptance_criteria>

---

## Task 80-02: 检索端点基准测试

**Purpose:** 对 v1/v2/v3 三个检索端点建立端到端延迟基准。

<read_first>
- evals/retrieval/lib/adapters.ts (createExecutionContext, seedScenarioFixtures, executeThroughRoute, closeExecutionContext)
- evals/retrieval/scenarios/smoke/retrieval-smoke-scenarios.ts (可用场景)
- evals/perf/lib/runner.ts (runBench)
</read_first>

<action>
创建 `evals/perf/bench-retrieval.ts`：

```typescript
/**
 * 检索端点性能基准测试。
 *
 * 用法:
 *   pnpm tsx evals/perf/bench-retrieval.ts
 *   pnpm tsx evals/perf/bench-retrieval.ts --iterations 100
 *   pnpm tsx evals/perf/bench-retrieval.ts --update-baseline
 */

import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';

import { runBench } from './lib/runner.js';
import { checkRegression, loadBaseline, printBenchResult, printRegressions, saveBaseline } from './lib/report.js';

import {
  closeExecutionContext,
  createExecutionContext,
  executeThroughRoute,
  seedScenarioFixtures,
} from '../retrieval/lib/adapters.js';

import { smokePositiveVisibleScenario } from '../retrieval/scenarios/smoke/retrieval-smoke-scenarios.js';

// 参数
const { values } = parseArgs({
  options: {
    iterations: { type: 'string', default: '30' },
    'update-baseline': { type: 'boolean', default: false },
    'baseline-path': { type: 'string', default: 'evals/perf/baseline.json' },
  },
  strict: true,
});

const iterations = parseInt(values.iterations as string);
const updateBaseline = values['update-baseline'] as boolean;
const baselinePath = values['baseline-path'] as string;

const scenario = smokePositiveVisibleScenario;

interface BenchCase {
  name: string;
  endpoint: '/v1/retrieval/search' | '/v2/retrieval/search' | '/v3/retrieval/search';
  seed: string;
}

const cases: BenchCase[] = [
  { name: 'v1-semantic-docker', endpoint: '/v1/retrieval/search', seed: 'docker deployment compose' },
  { name: 'v1-hybrid-docker', endpoint: '/v1/retrieval/search', seed: 'docker deployment compose' },
  { name: 'v2-capsule-docker', endpoint: '/v2/retrieval/search', seed: 'docker compose deployment' },
];

async function main(): Promise<void> {
  console.log('\n=== Retrieval Performance Benchmark ===');
  console.log(`Iterations: ${iterations}\n`);

  const results = [];

  for (const benchCase of cases) {
    const result = await runBench(
      benchCase.name,
      async () => {
        const ctx = await createExecutionContext();
        try {
          await seedScenarioFixtures(ctx, {
            scenarioId: scenario.scenarioId,
            endpoint: benchCase.endpoint,
            request: { seed: benchCase.seed },
          } as any, scenario);

          await executeThroughRoute(ctx, {
            endpoint: benchCase.endpoint,
            request: { seed: benchCase.seed },
          } as any);
        } finally {
          await closeExecutionContext(ctx);
        }
      },
      iterations,
      3, // warmup
    );

    printBenchResult(result);
    results.push(result);
  }

  // Baseline comparison
  const baseline = loadBaseline(baselinePath);

  if (updateBaseline) {
    const newBaseline = results.map(r => ({
      name: r.name,
      p50Ms: r.p50Ms,
      p95Ms: r.p95Ms,
      p99Ms: r.p99Ms,
      timestamp: new Date().toISOString(),
    }));
    saveBaseline(baselinePath, newBaseline);
    console.log(`\n  Baseline updated: ${baselinePath}`);
  }

  if (baseline.length > 0) {
    console.log('\n=== Regression Check ===');
    const regressions = checkRegression(results, baseline);
    const hasRegression = printRegressions(regressions);

    if (hasRegression) {
      console.log('\n  Use --update-baseline to accept new baseline if intentional.');
      process.exit(1);
    }
  } else {
    console.log('\n  No baseline found. Run with --update-baseline to create one.');
  }

  console.log('');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
```

</action>

<acceptance_criteria>
- [ ] 对 v1/v2 端点运行端到端基准测试
- [ ] 每个端点预热 3 次后测量 30 次迭代
- [ ] 输出 P50/P95/P99 延迟
- [ ] 支持 `--update-baseline` 保存基准线
- [ ] 支持 `--baseline-path` 指定基准文件
- [ ] 使用 fallback embeddings（CI 无需 API key）
</acceptance_criteria>

---

## Task 80-03: Embedding 调用基准测试

**Purpose:** 对比不同 embedding provider 的延迟。

<read_first>
- packages/server/src/lib/embeddings.ts (generateEmbedding, generateEmbeddingWithMeta)
- packages/server/src/lib/ai/providers.ts (createAiProviders)
- packages/server/src/lib/ai/provider-config.ts (loadAiProviderConfig)
</read_first>

<action>
创建 `evals/perf/bench-embedding.ts`：

```typescript
/**
 * Embedding 调用性能基准测试。
 *
 * 对比 fallback（确定性哈希）vs 配置的 provider 的延迟。
 *
 * 用法:
 *   pnpm tsx evals/perf/bench-embedding.ts
 *   pnpm tsx evals/perf/bench-embedding.ts --iterations 100
 */

import { parseArgs } from 'node:util';
import { runBench } from './lib/runner.js';
import { printBenchResult } from './lib/report.js';
import { generateEmbedding } from '../../packages/server/src/lib/embeddings.js';

const { values } = parseArgs({
  options: {
    iterations: { type: 'string', default: '50' },
  },
  strict: true,
});

const iterations = parseInt(values.iterations as string);

const testTexts = [
  'docker compose deployment guardrail',
  'rollback safety production deployment',
  'api rate limiting token bucket algorithm',
  'unit testing mocking external dependencies',
  'credential management secure storage',
];

async function main(): Promise<void> {
  console.log('\n=== Embedding Performance Benchmark ===');
  console.log(`Iterations: ${iterations}\n`);

  // Fallback embeddings（始终可用）
  const fallbackResult = await runBench(
    'embedding-fallback',
    async () => {
      await generateEmbedding(testTexts[Math.floor(Math.random() * testTexts.length)]);
    },
    iterations,
  );
  printBenchResult(fallbackResult);

  // 配置的 provider（如果可用）
  // 使用 loadAiProviderConfig 检测
  try {
    const { loadAiProviderConfig, createAiProviders } = await import('../../packages/server/src/lib/ai/index.js');
    const config = loadAiProviderConfig();

    if (config.isConfigured || config.embeddingProvider?.isConfigured) {
      const providers = createAiProviders(config);
      if (providers.embeddings.isConfigured) {
        const providerResult = await runBench(
          `embedding-${config.embeddingProvider?.provider ?? config.provider}`,
          async () => {
            const text = testTexts[Math.floor(Math.random() * testTexts.length)];
            await providers.embeddings.embed(text);
          },
          iterations,
          3,
        );
        printBenchResult(providerResult);
      }
    } else {
      console.log('  (configured provider not available, skipping)');
    }
  } catch {
    console.log('  (provider import failed, skipping)');
  }

  console.log('');
}

main().catch(console.error);
```

</action>

<acceptance_criteria>
- [ ] Fallback embedding 延迟基准
- [ ] 配置的 provider（如 Ollama/OpenAI）延迟基准（可选）
- [ ] 支持 `--iterations` 参数
- [ ] 随机文本输入避免缓存干扰
</acceptance_criteria>

---

## Task 80-04: 创建初始 baseline.json 和 CI 配置

**Purpose:** 持久化基准线，提供 CI 集成说明。

<read_first>
- evals/perf/lib/report.ts (BaselineEntry 格式)
</read_first>

<action>
1. 创建 `evals/perf/baseline.json`（初始空数组，首次运行 `--update-baseline` 填充）：

```json
[]
```

2. 在 `package.json` 中添加 scripts：

```json
{
  "scripts": {
    "bench:retrieval": "tsx evals/perf/bench-retrieval.ts",
    "bench:embedding": "tsx evals/perf/bench-embedding.ts",
    "bench:baseline": "tsx evals/perf/bench-retrieval.ts --update-baseline"
  }
}
```

3. 在 PLAN.md 的 Verification 中记录 CI 集成命令（不需要实际修改 CI 文件，因为项目可能没有 CI pipeline）：

CI 集成命令（供参考）：
```yaml
# GitHub Actions
- name: Performance Benchmark
  run: pnpm bench:retrieval
  env:
    AI_PROVIDER: fallback  # CI 用 fallback，避免外部依赖
```

</action>

<acceptance_criteria>
- [ ] `baseline.json` 文件存在
- [ ] `pnpm bench:retrieval` 可运行
- [ ] `pnpm bench:embedding` 可运行
- [ ] `pnpm bench:baseline` 更新基准线
- [ ] CI 集成命令已文档化
</acceptance_criteria>

---

## Verification

```bash
# 1. 构建
pnpm build

# 2. 运行 embedding 基准
pnpm bench:embedding

# 3. 首次运行检索基准，建立 baseline
pnpm bench:baseline

# 4. 确认 baseline 已保存
cat evals/perf/baseline.json | jq .

# 5. 再次运行，检查回归检测
pnpm bench:retrieval

# 6. 运行 store 对比（Phase 79 创建的脚本）
pnpm tsx scripts/bench-store.ts --entries 500 --iterations 50
```

预期输出示例：
```
=== Retrieval Performance Benchmark ===
Iterations: 30

  v1-semantic-docker                           n= 30  p50=   45ms  p95=   82ms  p99=  110ms  avg=   48ms
  v2-capsule-docker                            n= 30  p50=   38ms  p95=   71ms  p99=   95ms  avg=   41ms

=== Regression Check ===
  No regressions detected.
```

---

## must_haves

1. **PERF-05**: 检索端点端到端基准测试套件，覆盖 v1/v2，输出 P50/P95/P99
2. **PERF-06**: CI 回归检测，超过 20% 阈值自动失败，支持 `--update-baseline` 更新基准
