# Stress — go-accelerator HTTP 并发压测（Go 实现为主，k6/autocannon 保留 legacy）

> **仅基建不自动跑**；按需手工执行，输出写入 `benchmarks/results/stress-*.json`（git ignored）。**Go 实现为当前主入口**，与 `distributed` 加速面同栈、同阈值、同输出契约；`k6`/`autocannon` 保留为 `legacy` 仅备选。

## 工具选型（Go 为主）

- **Go 原生**（`services/go-accelerator/cmd/stress`，零外部依赖，仅 `net/http` + `sync.WaitGroup`）为主：`go run ./services/go-accelerator/cmd/stress -scenario batch-cosine`
- **k6**（`legacy`，Docker `grafana/k6`）：`k6 run benchmarks/stress/k6/batch-cosine.js`（阈值与 Go 一致，见下方）
- **autocannon**（`legacy`，Node）：`npx autocannon -c 50 -d 10 http://localhost:4100/v1/vector/batch-cosine`（仅 batch-cosine）

三者均仅测 Go 侧 HTTP（chi），不经过 DB；fallback 正确性由 `bench:compare` 覆盖。

## 场景（Go 与 k6 1:1）

| 场景 | 路径 | 负载 | 阈值 | Go 命令 | k6 命令（legacy） |
|------|------|------|------|---------|-------------------|
| `batch-cosine` | `POST /v1/vector/batch-cosine` 1k×384 | 50VU 10s | p95 <15ms p99 <30ms 0% 5xx | `pnpm --filter @trapmap/benchmarks stress:go:batch-cosine` | `k6 run k6/batch-cosine.js` |
| `ranking-batch` | `POST /v1/retrieval/ranking-batch` 1k entries | 30VU 10s | p95 <20ms | `pnpm --filter @trapmap/benchmarks stress:go:ranking` | `k6 run k6/ranking-batch.js` |
| `dedup-flood` | `POST /v1/dedup/fingerprint` | 100VU 10s | p95 <10ms | `pnpm --filter @trapmap/benchmarks stress:go:dedup` | `k6 run k6/dedup-flood.js` |
| `gene-derive` | `POST /v1/gene/derive-batch` 200 traps | 10VU 10s | p95 <50ms | `pnpm --filter @trapmap/benchmarks stress:go:gene-derive` | `k6 run k6/gene-derive.js` |

Payload 1:1：Go 侧 `cmd/stress` 内 `rand.Seed(42)` 确定性生成，与 `k6` 的 `vec()` / `entry()` / `traps` 一致；输出 `benchmarks/results/stress-go-*.json`（聚合 `stress-go-all.json`）。

## 运行（按需，Go 推荐）

```bash
# 需先起 Go 服务：TRAPMAP_GO_ACCELERATOR_ENABLED=true pnpm --filter none dev:go || (cd services/go-accelerator && go run ./cmd/server)
# Go（推荐，零 Docker）
go run ./services/go-accelerator/cmd/stress -list
go run ./services/go-accelerator/cmd/stress -scenario batch-cosine -vus 50 -duration 10s
go run ./services/go-accelerator/cmd/stress -scenario all                 # 串行四场景
go run ./services/go-accelerator/cmd/stress -scenario batch-cosine -vus 5 -duration 2s -url http://localhost:4100 -out benchmarks/results/stress-go-batch-cosine.json
go run ./services/go-accelerator/cmd/stress -scenario batch-cosine -check # 阈值失败 exit 1

# pnpm 快捷（封装 Go）
pnpm --filter @trapmap/benchmarks stress:batch-cosine      # Go
pnpm --filter @trapmap/benchmarks stress:go:all
pnpm --filter @trapmap/benchmarks stress:go -- -scenario dedup-flood -vus 100 -duration 10s

# legacy（手工）
pnpm --filter @trapmap/benchmarks stress:batch-cosine:legacy   # autocannon
k6 run benchmarks/stress/k6/batch-cosine.js
```

## 输出

- `benchmarks/results/stress-go-<scenario>.json`（`stress-go-all.json` 聚合，`git ignored`）：`{scenario,vus,durationMs,totalReqs,successReqs,failReqs,failRate,rps,p50Ms,p95Ms,p99Ms,minMs,maxMs,avgMs,thresholdPass}`
- 终端打印 `p50/p95/p99 + RPS + 成功率` 与阈值判定，与 `k6` 输出对齐
- 自动 `curl /metrics` 片段用于 Grafana 核对（`trapmap_go_requests_total/fallback_total/duration_ms`）

## 限流与隔离

- Go `chi` 已有 `middleware.Timeout(10s)` + `Recoverer` + `RequestID`/`RealIP`
- 新增 `middleware.RateLimit(100 rps)` 为 P1 建议（见性能审视），压测时通过 `RATE_LIMIT=200` 覆盖
- Node 侧对 Go 批请求做 `p-limit(5)` 并发上限（见审视），**Go 压测直连 Go**，不走 Node，仅测加速面
- Vitest 隔离：`benchmarks/stress/*.bench.ts` 不入 `pnpm test`，仅 `pnpm --filter @trapmap/benchmarks stress:*`（现 Go）
