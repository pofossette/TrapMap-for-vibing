# 性能与压测基建主线（不运行，仅设施）

> **角色**：并行主线，负责为核心计算链路（vector/ranking/dedup/gene-derive/hash）提供 bench、stress 与可观测设施（仅构建不自动运行），与 Go 化/类型对齐形成闭环。
> **状态**：设施已建（2026-08-31 22:10），待随 Go 化批次演进化阈值。
> **Owner**：infra + observability + bench

## 背景与不做

- 仅基建不运行：`pnpm test` / CI 不触发 `bench`/`stress`；按需手工执行，输出落 `benchmarks/results/`（`git ignored`）
- 可观测足量：Go `internal/observability/metrics.go` `/metrics` + `internal/middleware/metrics.go` + `internal/cache/lru.go Len()` + `pprof` 按需 `PPROF_ENABLED`，与 `docs/architecture/OBSERVABILITY.md` 的 OTEL/LGTM 接缝对齐
- 阈值门：`1k BatchCosine <3ms` / `50k >10ms才切 proto`（`benchmarks/GO_ACCELERATOR_BENCH.md`）

## 总体审视入口

- 审视文档：`docs/architecture/performance/ARCHITECTURE_PERFORMANCE_REVIEW.md`（现状根因、P0守恒、P1 Singleflight/LRU/限流、P2 proto/WASM，马蹄图）
- 设施总览：`docs/architecture/performance/PERF_STRESS_INFRA.md`（bench/stress/可观测三件套）
- 可观测细节：`docs/architecture/performance/OBSERVABILITY_PERF.md`（Go metrics/pprof/RequestID，Node OTEL，Grafana PromQL）

## 已交付

| 域 | 路径 | 说明 |
|----|------|------|
| bench | `benchmarks/harness/{compute.bench.ts,vitest.bench.config.ts,run-bench.ts,README.md}` | 覆盖 5 链路（vector 1k×384 / ranking merge/rerank/graph / tokenization 3/2/1 / dedup / gene-derive），`pnpm bench:compute` / `bench:compare` |
| Go bench | `services/go-accelerator/internal/service/{vector,ranking,dedup,gene-derive}/` `*_test.go` + `bench` | `go test -bench` 对侧，统计口径与 `GO_ACCELERATOR_BENCH.md` 一致 |
| stress | `benchmarks/stress/{README.md,autocannon-batch-cosine.js,k6/{batch-cosine,ranking-batch,dedup-flood,gene-derive}.js}` | 4 场景（50/30/100/10 VU 10s，p95 15/20/10/50ms，0% 5xx），`pnpm stress:*` / `k6 run` |
| bench 结果 | `benchmarks/GO_ACCELERATOR_BENCH.md` + `benchmarks/results/`（ignored） | BatchCosine 2.5×、Ranking 2.3×、Dedup 0.04ms、GeneDerive 200 ~3.2ms |
| Go 可观测 | `services/go-accelerator/internal/{observability/metrics.go,middleware/metrics.go,cache/lru.go}` + `cmd/server/main.go` `/metrics`+`Metrics` 中间件 | `trapmap_go_requests_total/fallback_total/duration_ms`，`CacheSize`，`pprof` 按需 |
| Node 可观测 | 复用 `docs/architecture/OBSERVABILITY.md` OTEL | `OtelService`/`PrometheusService`/`LokiService` 已有 |

## 命令（均不自动）

```bash
pnpm bench:compute          # vitest bench 1k×384 等
pnpm bench:compare          # jsVsGo 一致性
(cd services/go-accelerator && go test -bench . -benchmem ./internal/service/vector ./internal/service/ranking ./internal/service/dedup ./internal/service/gene-derive -run=^$)
pnpm stress:batch-cosine    # autocannon
k6 run benchmarks/stress/k6/batch-cosine.js
curl http://localhost:4100/metrics | grep trapmap_go
```

## 检查清单

- [x] 审视文档 `ARCHITECTURE_PERFORMANCE_REVIEW.md`（5 链路根因、P0/P1/P2 路径、mermaid）
- [x] bench harness 4 文件 + `package.json bench:*` 3 脚本 + `GO_ACCELERATOR_BENCH.md` 阈值
- [x] stress 4 k6 + 1 autocannon + README 阈值 + `package.json stress:*` 5 脚本 + `.gitignore benchmarks/results/`
- [x] Go 可观测 `observability/metrics.go` + `middleware/metrics.go` + `cache/lru.go` + `cmd/server` `/metrics`+`Metrics` + `OBSERVABILITY_PERF.md`
- [x] 验证：`pnpm typecheck` 0 + `go test ./...` 8包 ok + `pnpm generate:*:check` ok + `vitest` 46 files 987 tests
- [ ] Closeout 归档至 `docs/archived/archived-plans/`（与 Go 化批次同批）

## 问题池

- k6 阈值是否需按实例规格分档（1c vs 4c）？
- bench 结果是否入 `benchmarks/results/` 的历史基线对比（`--baseline`）？
- `RateLimit 100rps` 是否作为 P1 追加中间件落地（当前仅审视建议）？
