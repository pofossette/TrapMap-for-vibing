# 性能可观测基建（不运行，仅设施）

> 与 `docs/architecture/OBSERVABILITY.md` 的 OTEL/LGTM 接缝对齐，补充 Go 计算中枢侧的可观测设施（仅基建不自动采集）。

## Go 侧

- `services/go-accelerator/internal/middleware/logging.go` 已有 `RequestID`/`RealIP`/`Recoverer`/`Timeout(10s)` + `Logging`（method/path/duration）
- 新增 `internal/middleware/metrics.go`：`Metrics` 中间件（`IncRequest(route,status)` + `ObserveDuration`），经 `internal/observability/metrics.go` 暴露 `GET /metrics`（Prometheus text format，无外部依赖，含 `trapmap_go_requests_total` / `trapmap_go_fallback_total` / `trapmap_go_duration_ms`）
- 新增 `internal/observability/metrics.go`：内存 `reqTotal` + `fallbackTotal` + 1000 样本 `durations`，`Handler()` 供 `GET /metrics`
- 新增 `internal/cache/lru.go`：`Len()` 供 `GET /ready` 的 `cache_size` 观测（`config.CacheSize`）
- 建议 `pprof`：`import _ "net/http/pprof"` 后 `r.Mount("/debug", pprof.Handler())`（默认关闭，仅 `PPROF_ENABLED=true` 时挂载，`host-local` 零依赖不变）

```go
// cmd/server/main.go 按需挂载（示例，不自动启用）
if os.Getenv("PPROF_ENABLED")=="true" {
  r.Mount("/debug", http.DefaultServeMux)
}
r.Handle("/metrics", observability.Handler())
r.Use(middleware.Metrics)
```

## Node 侧（已在 OBSERVABILITY.md）

- `benchmarks/harness` 的 `compute.bench.ts` 结果写入 `benchmarks/results/bench-*.json`（`p50/p95/qps`），`run-bench.ts` 已 `git ignore` 结果但保留阈值门 `GO_ACCELERATOR_BENCH.md`
- `benchmarks/stress` 的 `autocannon/k6` 压测输出 `benchmarks/results/stress-*.json`，阈值 `p95<15ms/p99<30ms` 已在 `k6` options 中

## 统一仪表（建议 Grafana）

- 数据源：Go `/metrics`（Prometheus scrape `go-accelerator:4100/metrics`）+ Loki（已有 `LokiService`）+ Tempo（已有 `OtelService`）
- 面板：`BatchCosine p95` / `Ranking p95` / `Fallback rate` / `LRU hit` / `HTTP 5xx`（PromQL：`rate(trapmap_go_requests_total[5m])`）
- 告警：`fallback_total` 突增、p95 >阈值、`/ready` degraded

## 启用

```bash
# Go 侧（distributed only）
TRAPMAP_GO_ACCELERATOR_ENABLED=true PORT=4100 PPROF_ENABLED=true go run ./services/go-accelerator/cmd/server
curl http://localhost:4100/metrics | grep trapmap_go
curl http://localhost:4100/ready
curl http://localhost:4100/debug/pprof/  # 仅 PPROF_ENABLED
```
