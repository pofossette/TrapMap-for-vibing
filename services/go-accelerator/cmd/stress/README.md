# Go Stress — go-accelerator 压测基建（Go 实现）

> **仅基建不自动运行**。替代 `benchmarks/stress/k6/*.js` 与 `autocannon` 的 Node 实现，统一为 Go 原生并发压测，与 `distributed` 加速面同栈、同阈值、同输出契约。

## 为什么用 Go

- **同栈同阈值**：与 `services/go-accelerator` 同 `go.mod`，阈值与 `benchmarks/stress/README.md` 四场景一致（p95 15/20/10/50ms，0% 5xx）
- **零外部依赖**：仅 `net/http` + `sync.WaitGroup`，无需 `k6` Docker / `autocannon` Node，`host-local` 仍零依赖
- **可观测直通**：压测后自动 `curl /metrics` 采样 `trapmap_go_requests_total / fallback_total / duration_ms`，与 `internal/observability/metrics.go` 对齐

## 场景（与 k6 对齐）

| 场景 | 路径 | 负载 | 阈值 |
|------|------|------|------|
| `batch-cosine` | `POST /v1/vector/batch-cosine` 1k×384 | 50VU 10s | p95 <15ms p99 <30ms |
| `ranking-batch` | `POST /v1/retrieval/ranking-batch` 1k entries | 30VU 10s | p95 <20ms |
| `dedup-flood` | `POST /v1/dedup/fingerprint` | 100VU 10s | p95 <10ms |
| `gene-derive` | `POST /v1/gene/derive-batch` 200 traps | 10VU 10s | p95 <50ms |

Payload 与 k6 1:1：`batch-cosine 1k×384` 随机向量、`ranking-batch 1k`、`dedup  parts ["hello","world","trap"]`、`gene-derive 200`，生成器种子 `42` 确定性复现。

## 运行（均不自动）

```bash
# 先起 Go 服务（distributed 模式）
PORT=4100 go run ./services/go-accelerator/cmd/server &
# 或 Docker
docker compose --profile distributed up go-accelerator

# Go 压测（推荐）
go run ./services/go-accelerator/cmd/stress -scenario batch-cosine -vus 50 -duration 10s
go run ./services/go-accelerator/cmd/stress -scenario all
go run ./services/go-accelerator/cmd/stress -scenario batch-cosine -vus 5 -duration 2s -url http://localhost:4100 -out benchmarks/results/stress-go-batch-cosine.json

# 预编译二进制
go build -o /tmp/stress-go ./services/go-accelerator/cmd/stress
/tmp/stress-go -list
/tmp/stress-go -scenario ranking-batch -duration 10s -check   # 阈值失败则 exit 1

# pnpm 快捷（封装 Go）
pnpm --filter @trapmap/benchmarks stress:go:batch-cosine
pnpm --filter @trapmap/benchmarks stress:go:all
pnpm --filter @trapmap/benchmarks stress:go -- -scenario dedup-flood -vus 100 -duration 10s
```

## 输出

- `benchmarks/results/stress-go-<scenario>.json`（`git ignored`）：`{scenario,vus,durationMs,totalReqs,successReqs,failReqs,failRate,rps,p50Ms,p95Ms,p99Ms,minMs,maxMs,avgMs,thresholdPass}`
- `benchmarks/results/stress-go-all.json` 聚合
- 终端打印 `p50/p95/p99 + RPS + 成功率` 与阈值判定，与 `benchmarks/stress/k6` 输出对齐
- 自动 `curl /metrics` 片段用于 `Grafana` 核对

## 与旧基建关系

- `benchmarks/stress/k6/*.js` 与 `autocannon-batch-cosine.js` 保留为 `legacy`，标记 deprecated，`package.json` 的 `stress:*` 旧脚本仍可手工调用 `k6`，默认 `stress:go:*` 为主
- `pnpm --filter @trapmap/benchmarks stress:all` 仍串行四场景，但内部已改为调用 Go 二进制（见 `package.json`）

## 与 Bench 的关系

- `bench`（`benchmarks/harness` + `go test -bench`）测单次计算耗时，`stress` 测 HTTP 并发 p95；两者阈值联动：`1k BatchCosine <3ms`（bench）才允许 `50VU p95<15ms`（stress）阈值，否则切 `proto` 二进制路径
- 均不入 `pnpm test` / CI 门禁，仅 `go test ./...` + `fallow` 为门禁

## 实现要点

- `net/http` + `MaxIdleConnsPerHost=VUs*2`，`sync.WaitGroup` 按 VU 并发，`atomic` 计数，`sort.Float64s` 求分位
- 预生成 payload 单次 `json.Marshal`，`bytes.Reader` 复用，`io.Copy(io.Discard)` 泄洪
- 兼容 `benchmarks/results` 目录自动创建与 `--out` 覆盖
