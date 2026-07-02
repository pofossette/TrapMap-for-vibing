# Observability Chain Verification

本文档提供 TrapMap 当前服务发现与可观测性 closeout 的最小执行路径。所有示例都以当前默认 gateway `http://127.0.0.1:4000` 为准。

---

## 1. 前置条件

### 本地最小路径

```bash
rtk pnpm --filter @trapmap/host-local build
rtk pnpm --filter @trapmap/host-local start
```

先执行 `rtk pnpm --filter @trapmap/host-local build`，再执行 `rtk pnpm --filter @trapmap/host-local start`。本轮 `host-local` closeout 只认 `build -> start -> observability-benchmark` 这条主链路，`dev` 不作为完成判据。

### 本地完整可观测性路径

```bash
rtk docker compose -f docker-compose.observability.yml up -d
rtk pnpm --filter @trapmap/host-local start
```

启用 Loki / Consul 时，当前有效配置名为：

- `TRAPMAP_LOKI_ENABLED=true`
- `TRAPMAP_LOKI_URL=http://127.0.0.1:3100/loki/api/v1/push`
- `CONSUL_ENABLED=true`
- `CONSUL_HOST=127.0.0.1`
- `CONSUL_PORT=8500`

---

## 2. 四条关联信号

单次 HTTP 请求当前至少应留下四条可关联信号：

| Signal | Key Fields | Surface |
|--------|------------|---------|
| Request ID | `x-request-id` | 响应头、结构化日志 |
| Trace ID | `traceparent` / `traceId` | 响应头、结构化日志、Tempo |
| Metrics | `trapmap_http_requests_total` / `trapmap_http_request_duration_seconds` | `/metrics` |
| Structured Logs | method / url / status / requestId / traceId | stdout，启用 Loki 时同步可查 |

---

## 3. 本地 closeout 演示链路

当前 closeout 主链路固定为 `build -> start -> observability-benchmark`。

### Metrics

```bash
curl -s http://127.0.0.1:4000/metrics | grep trapmap_http_requests_total
curl -s http://127.0.0.1:4000/metrics | grep trapmap_http_request_duration_seconds
curl -s http://127.0.0.1:4000/metrics | grep trapmap_active_connections
```

预期：

- 至少存在一条 `trapmap_http_requests_total`
- 至少存在一组 `trapmap_http_request_duration_seconds_*`
- 存在 `trapmap_active_connections`

### Tracing / Request Correlation

```bash
curl -s -D - \
  -H "x-request-id: test-req-001" \
  -H "traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" \
  http://127.0.0.1:4000/health
```

预期响应头包含：

- `x-request-id: test-req-001`
- `traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`

### Structured Logging

```bash
curl -s http://127.0.0.1:4000/health > /dev/null
```

预期 server stdout 出现一条结构化日志，对应本次请求，并包含 `requestId` 与 `traceId`。

### Full Chain

```bash
curl -s http://127.0.0.1:4000/metrics | grep trapmap_http_requests_total > /tmp/metrics-before.txt

curl -s -D /tmp/headers.txt \
  -H "x-request-id: chain-test-001" \
  -H "traceparent: 00-abcdef1234567890abcdef1234567890-1234567890abcdef-01" \
  http://127.0.0.1:4000/health > /tmp/body.json

cat /tmp/headers.txt | grep -i 'x-request-id\|traceparent'
curl -s http://127.0.0.1:4000/metrics | grep trapmap_http_requests_total > /tmp/metrics-after.txt
diff /tmp/metrics-before.txt /tmp/metrics-after.txt
```

预期：

1. 响应头回显 `x-request-id` 与 `traceparent`
2. `trapmap_http_requests_total` 发生增量
3. stdout 日志能用 `chain-test-001` / trace id 片段定位

---

## 4. Loki / Tempo 查询

### Loki

按 trace id 查询：

```text
{service="trapmap"} | json | traceId="4bf92f3577b34da6a3ce929d0e0e4736"
```

按 request id 查询：

```text
{service="trapmap"} | json | requestId="test-req-001"
```

### Tempo

在 Grafana Explore 中选择 Tempo datasource，直接查询 trace id：

```text
4bf92f3577b34da6a3ce929d0e0e4736
```

---

## 5. Consul 目标环境验收

本项仍是 active plan 未关闭 blocker。当前 runbook 只冻结最小验收步骤，不把 KV、Federation、多集群纳入本轮。

前置条件：

- `CONSUL_ENABLED=true`
- `CONSUL_HOST=<host>`
- `CONSUL_PORT=<port>`
- 目标环境中的 TrapMap 实例已启动并启用服务注册

执行步骤：

```bash
curl -s http://127.0.0.1:8500/v1/catalog/services | jq .
curl -s http://127.0.0.1:8500/v1/catalog/service/trapmap | jq .
curl -s http://127.0.0.1:8500/v1/health/checks/trapmap | jq .
```

通过判据：

1. `catalog/services` 中存在 `trapmap`
2. `catalog/service/trapmap` 返回至少一个实例
3. 健康检查状态为 passing
4. 停止实例后，catalog/health 能观察到注销或失效

---

## 6. 性能基线

本轮 Phase 4 只冻结最小 closeout 基线：`GET /health`、`GET /metrics` 延迟，以及 `/metrics` 中的进程内存指标。

执行命令：

```bash
rtk pnpm test:observability-benchmark -- --base-url http://127.0.0.1:4000
```

默认行为：

- warmup 5 次
- 正式采样 15 次
- 输出 `/health` 与 `/metrics` 的 `avg / p50 / p95 / min / max`
- 读取 `process_resident_memory_bytes`、`nodejs_heap_size_used_bytes`、`nodejs_heap_size_total_bytes`

建议收口方式：

- 同一环境至少执行 3 轮，记录 p50 / p95
- 若要对比 `dev-observability` 与目标环境，保持相同 `--iterations`
- 本轮只要求“有固定命令与固定输出”，不要求预设硬阈值

---

## 7. 自动化入口

当前 closeout 自动化入口：

- `rtk pnpm test:observability-closeout`
- `rtk pnpm test:observability-benchmark`
- `rtk pnpm test:discovery-closeout`
- `rtk pnpm test:distributed-closeout`
- `rtk pnpm test:runtime-foundations`
- `rtk pnpm test:deployment-smoke`

其中：

- `test:observability-closeout` 负责探针、header、metrics、日志关联链路
- `test:observability-benchmark` 负责性能基线记录入口
- 目标环境 Consul 验收仍需人工或半人工执行证据，不能用本地单测替代
