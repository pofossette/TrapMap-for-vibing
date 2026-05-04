---
phase: 79
name: perf-observability-enhancement
status: complete
tasks: 5
commit_count: 4
---

# Phase 79: Performance Observability Enhancement

**Goal:** 增强现有 RAG 日志和流水线计时，使每次检索请求自动记录数据吞吐量、Embedding 耗时和内存状态，为零成本性能分析提供数据基础。

## Summary

Successfully enhanced observability across the RAG pipeline with zero external dependencies:

1. **PipelineStep size tracking** - Added `inputSize`/`outputSize` fields to record data throughput at each pipeline stage
2. **Embedding timing isolation** - Created `generateEmbeddingWithMeta()` to track embedding API latency separately from recall
3. **Health endpoint metrics** - Extended `/health` with memory stats and uptime
4. **Analysis tooling** - Provided scripts for RAG log analysis and store benchmarking

## Tasks Completed

| Task | Description | Status |
|------|-------------|--------|
| 79-01 | PipelineStep 增加 inputSize/outputSize 字段 | ✓ |
| 79-02 | Embedding 调用独立计时 | ✓ |
| 79-03 | /health 端点增加运行时指标 | ✓ |
| 79-04 | RAG 日志分析脚本 | ✓ |
| 79-05 | Store 对比基准脚本 | ✓ |

## Key Changes

### packages/server/src/lib/rag-log.ts
- Extended `PipelineStep` interface with optional `inputSize` and `outputSize` fields for throughput analysis

### packages/server/src/lib/retrieval/orchestrator.ts
- Updated `timedStep()` to accept options for size tracking
- Applied size tracking to v1 pipeline: snapshot, eligibility, boundary-filter, recall, assembly
- Applied size tracking to v2 pipeline: snapshot, recall

### packages/server/src/lib/embeddings.ts
- Added `EmbeddingResult` interface with `vector`, `latencyMs`, `provider`, `cached` fields
- Created `generateEmbeddingWithMeta()` for timing-aware embedding generation
- Maintained backward compatibility with existing `generateEmbedding()` callers

### packages/server/src/lib/retrieval/recall/semantic.ts
- Added `getQueryEmbeddingWithMeta()` to record embedding step with timing metadata

### packages/server/src/app.ts
- Extended `/health` endpoint with `memory.rssMb`, `memory.heapUsedMb`, `memory.heapTotalMb`, `uptimeSeconds`

### scripts/rag-analyze.ts (new)
- RAG log performance analysis tool with P50/P95/P99 latency statistics
- Mode grouping, step latency ranking, slow query identification
- Data throughput analysis when inputSize/outputSize available

### scripts/bench-store.ts (new)
- JsonStore benchmark for snapshot/transact operations
- Optional PostgresStore comparison with `--pg` flag
- Configurable entry count and iterations

## Verification

```bash
# Build passes
pnpm build

# Tests pass
pnpm test -- --run packages/server/src/lib/retrieval/orchestrator.test.ts

# Health endpoint now returns memory metrics
curl -s http://localhost:4000/health | jq .

# RAG log analysis
pnpm tsx scripts/rag-analyze.ts

# Store benchmark
pnpm tsx scripts/bench-store.ts --entries 500 --iterations 50
```

## Requirements Met

- **PERF-01**: ✓ PipelineStep records inputSize/outputSize for throughput analysis
- **PERF-02**: ✓ Embedding calls independently timed via generateEmbeddingWithMeta
- **PERF-03**: ✓ /health endpoint exposes memory and uptime metrics
- **PERF-04**: ✓ Zero-external-dependency analysis scripts provided
