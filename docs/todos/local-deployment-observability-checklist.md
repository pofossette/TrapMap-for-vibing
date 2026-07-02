# 本地部署与验证 Checklist（服务发现与可观测性收口）

> 用途：把当前主线 [`service-discovery-and-observability-plan.md`](./service-discovery-and-observability-plan.md) 中与本地部署、服务发现、追踪、日志、可观察性验证相关的 closeout 路径压成可执行 checklist。
>
> 边界：本清单是收口辅助文档，不替代当前活跃主线细则，也不把目标环境 Consul 验收误写成“本地已自动关闭”。

## 0. 执行约束

- [ ] 仅把本清单当作当前主线的辅助执行面；权威状态仍以根 [`plan.md`](../../plan.md) 和 [`service-discovery-and-observability-plan.md`](./service-discovery-and-observability-plan.md) 为准
- [ ] shell 命令统一使用 `rtk` 前缀
- [ ] `@trapmap/host-local` 的 closeout 主链路按 `build -> start -> observability-benchmark` 执行，不用 `dev` 代替
- [ ] 记录每条命令的通过/失败结果，以及必要的人工证据（响应头、Grafana、Tempo、Loki、Consul）

## 1. 前置准备

- [ ] 安装依赖：`rtk pnpm install`
- [ ] 准备环境文件：`cp .env.example .env`
- [ ] 确认 `.env` 至少具备本地启动所需关键项（例如 `OPENAI_API_KEY`、`TRAPMAP_SYSTEM_ADMIN_KEY`）
- [ ] 如需本地完整可观测性联调，准备以下环境变量：
  - `TRAPMAP_LOKI_ENABLED=true`
  - `TRAPMAP_LOKI_URL=http://127.0.0.1:3100/loki/api/v1/push`
  - `CONSUL_ENABLED=true`
  - `CONSUL_HOST=127.0.0.1`
  - `CONSUL_PORT=8500`

## 2. 文档与静态守卫

- [ ] 阅读 [`docs/operations/OBSERVABILITY-VERIFICATION.md`](../operations/OBSERVABILITY-VERIFICATION.md)
- [ ] 阅读 [`docs/operations/REGRESSION-COMMANDS.md`](../operations/REGRESSION-COMMANDS.md)
- [ ] 阅读 [`docs/architecture/OBSERVABILITY.md`](../architecture/OBSERVABILITY.md)
- [ ] 阅读 [`docs/architecture/SERVICE-DISCOVERY.md`](../architecture/SERVICE-DISCOVERY.md)
- [ ] 运行类型检查：`rtk pnpm typecheck`
- [ ] 运行文档漂移检查：`rtk pnpm check:docs-drift`
- [ ] 运行结构守卫：`rtk pnpm check:structure`

## 3. 本地最小启动链路

- [ ] 构建 light host：`rtk pnpm --filter @trapmap/host-local build`
- [ ] 启动 light host：`rtk pnpm --filter @trapmap/host-local start`
- [ ] 验证 liveness：`curl -s http://127.0.0.1:4000/live`
- [ ] 验证 readiness：`curl -s http://127.0.0.1:4000/ready`
- [ ] 验证 health：`curl -s http://127.0.0.1:4000/health`
- [ ] 验证 metrics surface：`curl -s http://127.0.0.1:4000/metrics | head -20`
- [ ] 确认 `/ready` 不再是固定假阳性，而是基于真实依赖状态返回
- [ ] 确认 `/health` 输出包含结构化依赖状态

## 4. 本地 observability 栈联调

- [ ] 拉起本地基础设施：`rtk docker compose -f docker-compose.observability.yml up -d`
- [ ] 确认 `consul` 健康
- [ ] 确认 `tempo` 健康
- [ ] 确认 `prometheus` 健康
- [ ] 确认 `loki` 健康
- [ ] 确认 `grafana` 健康
- [ ] 在 observability 栈启动后重新启动 `@trapmap/host-local`

## 5. 四条关联信号验证

### 5.1 Metrics

- [ ] 执行：`curl -s http://127.0.0.1:4000/metrics | grep trapmap_http_requests_total`
- [ ] 执行：`curl -s http://127.0.0.1:4000/metrics | grep trapmap_http_request_duration_seconds`
- [ ] 执行：`curl -s http://127.0.0.1:4000/metrics | grep trapmap_active_connections`
- [ ] 确认至少存在一条 `trapmap_http_requests_total`
- [ ] 确认至少存在一组 `trapmap_http_request_duration_seconds_*`
- [ ] 确认存在 `trapmap_active_connections`

### 5.2 Request ID / Trace Header

- [ ] 执行以下请求并保存响应头：

```bash
curl -s -D - \
  -H "x-request-id: test-req-001" \
  -H "traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" \
  http://127.0.0.1:4000/health
```

- [ ] 确认响应头回显 `x-request-id: test-req-001`
- [ ] 确认响应头回显同一条 `traceparent`

### 5.3 Structured Logging

- [ ] 执行：`curl -s http://127.0.0.1:4000/health > /dev/null`
- [ ] 在 server stdout 中定位到对应结构化日志
- [ ] 确认日志包含 `requestId`
- [ ] 确认日志包含 `traceId`
- [ ] 确认日志包含 method / url / status 等基本请求字段

### 5.4 Full Chain

- [ ] 执行完整链路验证：

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

- [ ] 确认响应头回显 `x-request-id` 与 `traceparent`
- [ ] 确认 `trapmap_http_requests_total` 发生增量
- [ ] 确认 stdout 日志可用 `chain-test-001` 或 trace id 片段定位

## 6. Grafana / Loki / Tempo 人工验证

- [ ] 打开 Grafana：`http://127.0.0.1:3000`
- [ ] 确认至少一个 TrapMap 相关 dashboard 可用
- [ ] 在 Tempo datasource 中按 trace id `4bf92f3577b34da6a3ce929d0e0e4736` 查询
- [ ] 确认至少一条请求链路可在 Tempo 中检索到
- [ ] 在 Loki 中按以下语句查日志：

```text
{service="trapmap"} | json | traceId="4bf92f3577b34da6a3ce929d0e0e4736"
```

- [ ] 在 Loki 中按以下语句查日志：

```text
{service="trapmap"} | json | requestId="test-req-001"
```

- [ ] 确认 Loki 可查到对应结构化日志

## 7. 自动化 closeout 命令

- [ ] 运行 observability closeout：`rtk pnpm test:observability-closeout`
- [ ] 运行性能基线入口：`rtk pnpm test:observability-benchmark -- --base-url http://127.0.0.1:4000`
- [ ] 运行 discovery closeout：`rtk pnpm test:discovery-closeout`
- [ ] 运行 distributed closeout：`rtk pnpm test:distributed-closeout`
- [ ] 运行 deployment smoke：`rtk pnpm test:deployment-smoke`
- [ ] 运行 runtime foundations：`rtk pnpm test:runtime-foundations`

## 8. Consul 本地与目标环境验收

### 8.1 本地 Consul 观察

- [ ] 执行：`curl -s http://127.0.0.1:8500/v1/catalog/services | jq .`
- [ ] 执行：`curl -s http://127.0.0.1:8500/v1/catalog/service/trapmap | jq .`
- [ ] 执行：`curl -s http://127.0.0.1:8500/v1/health/checks/trapmap | jq .`
- [ ] 确认 `catalog/services` 中存在 `trapmap`
- [ ] 确认 `catalog/service/trapmap` 返回至少一个实例
- [ ] 确认健康检查状态为 `passing`

### 8.2 目标环境 blocker

- [ ] 明确记录：目标环境 Consul 验收仍是当前主线未关闭 blocker，不能用本地单测替代
- [ ] 在目标环境重复执行 catalog / service / health 查询
- [ ] 停止目标实例后，确认 catalog/health 能观察到注销或失效
- [ ] 将目标环境 Consul 证据单独归档到本轮 closeout 记录中

## 9. 性能基线记录

- [ ] 至少执行 1 轮：`rtk pnpm test:observability-benchmark -- --base-url http://127.0.0.1:4000`
- [ ] 建议同环境执行 3 轮并记录结果
- [ ] 记录 `/health` 的 `avg / p50 / p95 / min / max`
- [ ] 记录 `/metrics` 的 `avg / p50 / p95 / min / max`
- [ ] 记录 `process_resident_memory_bytes`
- [ ] 记录 `nodejs_heap_size_used_bytes`
- [ ] 记录 `nodejs_heap_size_total_bytes`
- [ ] 明确说明本轮只冻结“固定命令 + 固定输出格式”，不预设硬阈值

## 10. 最终收口记录

- [ ] 形成一份命令执行结果摘要，注明通过/失败/跳过原因
- [ ] 形成一份人工证据摘要，至少包含 Grafana、Tempo、Loki、Consul
- [ ] 明确区分“本地已关闭项”与“仍待目标环境关闭项”
- [ ] 如执行中发现新问题，优先回写到 [`open-debt-and-compromises.md`](./open-debt-and-compromises.md) 或当前主线细则的问题池

