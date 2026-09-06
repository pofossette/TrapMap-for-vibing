# Bench Harness — 核心计算链路（不运行，仅基建）

> 覆盖 `vector(BatchCosine 64-shard)` / `ranking(merge/rerank/graph+boundaryDelta)` / `dedup(Fingerprint/Jaccard)` / `gene-derive(10 regex+2×hash 32-shard)` / `hash(canonical)` 五条 Go 化链路，与 Node fallback 做 `jsVsGo` 一致性门禁。

## 运行（按需，本地不自动跑）

```bash
# Go 单测+bench（统计口径与 GO_ACCELERATOR_BENCH.md 一致）
(cd services/go-accelerator && go test ./... -count=1)
(cd services/go-accelerator && go test -bench . -benchmem ./internal/service/vector ./internal/service/ranking ./internal/service/dedup ./internal/service/gene-derive -run=^$)

# Node bench（vitest bench 隔离，不入默认 test: 仅 bench:）
pnpm --filter @trapmap/benchmarks bench:compute          # 等同 benchmarks/harness/run-bench.ts --compute
pnpm --filter @trapmap/benchmarks bench:compare          # Node fallback vs Go 回退一致性（score |diff|<1e-9，order identical，hash byte-identical）
```

## 输出

- `benchmarks/results/*.json`（`run-bench.ts` 写 `bench-*.json`，含 `p50/p95/qps`，无历史基线时仅记录）
- `benchmarks/GO_ACCELERATOR_BENCH.md` 阈值门：`1k BatchCosine <3ms` / `50k >10ms才切 proto`

## 与 CI 的关系

- 默认 `pnpm test` 不跑 bench（`vitest bench` 分离）；`bench:` 脚本由 `benchmarks/harness/vitest.bench.config.ts` 隔离
- Go `bench` 仅手工/夜间跑，不入 PR 门禁（PR 门禁仍为 `go test ./...` + `check:go-contract` + `fallow`）
