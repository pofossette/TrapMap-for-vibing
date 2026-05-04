/**
 * RAG 日志性能分析工具
 *
 * 用法:
 *   pnpm tsx scripts/rag-analyze.ts                    # 分析 logs/rag/ 目录
 *   pnpm tsx scripts/rag-analyze.ts --dir ./my-logs    # 指定目录
 *   pnpm tsx scripts/rag-analyze.ts --mode semantic    # 按 mode 过滤
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// 解析参数
const args = process.argv.slice(2);
let logDir = 'logs/rag';
let filterMode: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir' && args[i + 1]) {
    logDir = args[++i];
  }
  if (args[i] === '--mode' && args[i + 1]) {
    filterMode = args[++i];
  }
}

// 读取所有日志文件
interface LogEntry {
  queryId: string;
  seed: string;
  mode: string;
  totalLatencyMs: number;
  resultCount: number;
  pipelineSteps: Array<{
    name: string;
    latencyMs: number;
    inputSize?: number;
    outputSize?: number;
  }>;
  timestamp: string;
}

const entries: LogEntry[] = [];

if (!existsSync(logDir)) {
  console.log(`Log directory not found: ${logDir}`);
  console.log('Run with LOG_RAG_ENABLED=true to generate logs.');
  process.exit(0);
}

const files = readdirSync(logDir).filter((f) => f.endsWith('.log'));

for (const file of files) {
  const content = readFileSync(path.join(logDir, file), 'utf-8');
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as LogEntry;
      if (!filterMode || entry.mode === filterMode) {
        entries.push(entry);
      }
    } catch {
      /* skip malformed lines */
    }
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
const latencies = entries.map((e) => e.totalLatencyMs).sort((a, b) => a - b);
console.log('\n=== Overall Latency ===');
console.log(`  count: ${latencies.length}`);
console.log(`  avg:   ${Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)}ms`);
console.log(`  p50:   ${percentile(latencies, 0.5)}ms`);
console.log(`  p95:   ${percentile(latencies, 0.95)}ms`);
console.log(`  p99:   ${percentile(latencies, 0.99)}ms`);
console.log(`  max:   ${latencies[latencies.length - 1]}ms`);

// 2. 按 mode 分组
const modes = [...new Set(entries.map((e) => e.mode))];
console.log('\n=== Latency by Mode ===');
for (const mode of modes) {
  const modeEntries = entries.filter((e) => e.mode === mode);
  const modeLat = modeEntries.map((e) => e.totalLatencyMs).sort((a, b) => a - b);
  console.log(
    `  ${mode.padEnd(20)} n=${String(modeLat.length).padStart(4)}  p50=${String(percentile(modeLat, 0.5)).padStart(5)}ms  p95=${String(percentile(modeLat, 0.95)).padStart(5)}ms  p99=${String(percentile(modeLat, 0.99)).padStart(5)}ms`,
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
    return {
      name,
      count: times.length,
      avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      p95: percentile(sorted, 0.95),
    };
  })
  .sort((a, b) => b.avg - a.avg);
for (const s of stepStats) {
  console.log(
    `  ${s.name.padEnd(20)} n=${String(s.count).padStart(4)}  avg=${String(s.avg).padStart(5)}ms  p95=${String(s.p95).padStart(5)}ms`,
  );
}

// 4. 慢请求 Top 10
console.log('\n=== Top 10 Slowest Queries ===');
const sorted = [...entries].sort((a, b) => b.totalLatencyMs - a.totalLatencyMs);
for (const e of sorted.slice(0, 10)) {
  const topStep = [...(e.pipelineSteps ?? [])].sort((a, b) => b.latencyMs - a.latencyMs)[0];
  console.log(
    `  ${e.totalLatencyMs}ms  ${e.mode.padEnd(18)} seed="${e.seed.slice(0, 40)}" bottleneck=${topStep?.name ?? 'n/a'}`,
  );
}

// 5. 数据吞吐量（如果有 inputSize/outputSize）
const stepsWithSize = entries.flatMap((e) =>
  (e.pipelineSteps ?? []).filter((s) => s.inputSize !== undefined || s.outputSize !== undefined),
);
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
    const avgIn = inputSizes.length
      ? Math.round(inputSizes.reduce((a, b) => a + b, 0) / inputSizes.length)
      : '-';
    const avgOut = outputSizes.length
      ? Math.round(outputSizes.reduce((a, b) => a + b, 0) / outputSizes.length)
      : '-';
    console.log(
      `  ${name.padEnd(20)} avg_in=${String(avgIn).padStart(6)}  avg_out=${String(avgOut).padStart(6)}`,
    );
  }
}

console.log('');
