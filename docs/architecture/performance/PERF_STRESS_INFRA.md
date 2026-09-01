# 性能与压测基建（不运行，仅设施）

> 构建起设施与足量可观测，不自动运行。SSR/CI 均不触发压测；按需手工执行，输出落 `benchmarks/results/`（git ignored）。

## 1. Bench Harness（微基准，覆盖核心链路）

- **位置**：`benchmarks/harness/{compute.bench.ts, vitest.bench.config.ts, run-bench.ts, README.md}`
- **覆盖**：
  - `vector`：`cosineSimilarity 1k×384` / `createDeterministicFallbackVector 384`
  - `ranking`：`mergeCandidates 500+500` / `rerankCandidates 1k` / `mergeCandidatesWithGraph 50+20`
  - `tokenization`：`scoreKeywordEntry 3/2/1` / `canonicalJsonStringify + sha256CanonicalJson`
  - `dedup`：`versionMatchMultiplier` / `Fingerprint`（Go 侧 `internal/service/dedup`）
  - `gene-derive`：Go `genederive.DeriveBatch 200 traps`（10 regex + 2×hash, 32-shard）
- **Go 对侧**：`(cd services/go-accelerator && go test -bench . -benchmem ./internal/service/vector ./internal/service/ranking ./internal/service/dedup ./internal/service/gene-derive -run=^$)`
- **命令**：`pnpm bench:compute` / `pnpm bench:compare`（jsVsGo 一致性）/ `pnpm bench`（alias）
- **输出**：`benchmarks/results/bench-*.json`（`p50/p95/qps`）+ `benchmarks/GO_ACCELERATOR_BENCH.md` 阈值门（`1k BatchCosine <3ms` / `50k >10ms才切proto`）

## 2. Stress（HTTP 并发压测，隔离）

- **位置**：`services/go-accelerator/cmd/stress`（Go 主）+ `benchmarks/stress/{README.md, autocannon-batch-cosine.js, k6/{...}}`（legacy 保留）
- **工具**：`Go 原生` 主（`cmd/stress`，`net/http` + `sync.WaitGroup`，零依赖）+ `k6`/`autocannon` legacy 备选
- **场景阈值**：

| 端点 | 负载 | 阈值 |
|------|------|------|
| `batch-cosine` 1k×384 | 50VU 10s | p95 <15ms, p99 <30ms, 0% 5xx |
| `ranking-batch` 1k | 30VU 10s | p95 <20ms |
| `dedup/fingerprint` | 100VU 10s | p95 <10ms |
| `gene/derive-batch` 200 | 10VU 10s | p95 <50ms |

- **命令（按需，Go 主）**：`go run ./services/go-accelerator/cmd/stress -scenario all` / `pnpm stress:batch-cosine`（Go）/ `stress:go:batch-cosine`；legacy `k6 run benchmarks/stress/k6/*.js` / `stress:*:legacy`
- **隔离**：`benchmarks/stress/*` 不入 `pnpm test`；Go 侧 `middleware.Timeout(10s)` + 建议 `RateLimit 100rps`（`RATE_LIMIT` 覆盖）；Node 侧 `p-limit(5)` 批请求上限

## 3. 可观测（足量设施）

- **Go 侧**：`internal/middleware/metrics.go`（`Metrics`：`IncRequest`/`ObserveDuration`）+ `internal/observability/metrics.go`（`GET /metrics` Prometheus text, `fallback_total`, `duration_ms`）+ `internal/cache/lru.go Len()` 供 `GET /ready`；`pprof` 按需 `PPROF_ENABLED=true` 挂载 `r.Mount("/debug", http.DefaultServeMux)`
- **Node 侧**：已在 `docs/architecture/OBSERVABILITY.md`（OTEL/LGTM、Prometheus、Loki、Sentry、Langfuse）；`bench harness` 结果落 `benchmarks/results/` 供 Prom scrape 或手工对比
- **统一文档**：`docs/architecture/performance/OBSERVABILITY_PERF.md`（启用示例与 Grafana 面板 PromQL）

## 4. 审视与总体优化

- 见 `docs/architecture/performance/ARCHITECTURE_PERFORMANCE_REVIEW.md`（现状根因、P0守恒、P1追加 Singleflight/LRU对齐/限流、P2 proto/WASM gated，总览 mermaid）

## 5. 启用（均不自动）

```bash
# Bench（Node）
pnpm bench:compute

# Bench（Go）
(cd services/go-accelerator && go test -bench . -benchmem ./internal/service/vector ./internal/service/ranking ./internal/service/dedup ./internal/service/gene-derive -run=^$)

# Stress（需先起 Go）
TRAPMAP_GO_ACCELERATOR_ENABLED=true PORT=4100 go run ./services/go-accelerator/cmd/server & 
pnpm stress:batch-cosine
k6 run benchmarks/stress/k6/batch-cosine.js

# Observability
curl http://localhost:4100/metrics | grep trapmap_go
curl http://localhost:4100/ready
PPROF_ENABLED=true go run ./services/go-accelerator/cmd/server; curl http://localhost:4100/debug/pprof/
```
