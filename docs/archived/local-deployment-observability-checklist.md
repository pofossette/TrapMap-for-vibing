# 本地部署与验证 Checklist（服务发现与可观测性收口）

> 用途：把当前主线 [`service-discovery-and-observability-plan.md`](./service-discovery-and-observability-plan.md) 中与本地部署、服务发现、追踪、日志、可观察性验证相关的 closeout 路径压成可执行 checklist。
>
> 边界：本清单是收口辅助文档，不替代当前活跃主线细则，也不把目标环境 Consul 验收误写成“本地已自动关闭”。

## 0.1 2026-07-02 本轮执行快照

### 已验证通过

- `pnpm typecheck`
- `pnpm check:docs-drift`
- `pnpm check:structure`
- `docker compose -f docker-compose.observability.yml up -d`
- `pnpm test:discovery-closeout`
- `pnpm test:distributed-closeout`
- `pnpm test:observability-closeout`
- `pnpm test:deployment-smoke`
- `pnpm test:runtime-foundations`
- 通过挂载本地工作区的 `node:22-alpine` 容器成功拉起 distributed 拓扑：`gateway`、`identity-access`、`knowledge-read`、`knowledge-write`、`candidate-worker`、`governance-worker`、`outbox-worker`
- gateway 到 `identity-access`、`knowledge-read`、`knowledge-write`、`candidate-worker`、`governance-worker`、`outbox-worker` 的内部健康探针可达

### 已确认失败

- `docker compose --profile distributed up -d --build`
  - `packages/host-distributed/Dockerfile` 未复制 `packages/runtime-infra`，导致 `tsc -b` 构建失败
- `pnpm test:observability-benchmark -- --base-url http://127.0.0.1:4000`
  - distributed gateway 的 `GET /metrics` 返回 `401`
- `curl -s http://127.0.0.1:8500/v1/agent/services`
  - Consul agent 可达，但应用侧自动注册未在 agent/catalog 中留下实例

### 当前未关闭项

- distributed 正式 compose 仍不能一条命令完成构建和启动
- distributed gateway 当前没有满足 checklist 预期的 `/metrics` / request-id / `traceparent` 回显链路
- Prometheus 当前 targets 与 distributed 实际端口不一致，无法形成有效抓取
- 本地 Consul 自动注册未形成可验收证据；目标环境 Consul 仍是 blocker
- Grafana / Loki / Tempo 仅证明基础设施可启动，未证明 TrapMap 请求链路可检索

## 0.2 2026-07-03 本轮执行快照

### 已验证通过

- `pnpm exec vitest run --project host-distributed packages/host-distributed/src/dockerfile.test.ts`
- `pnpm test:file -- packages/host-distributed/src/gateway/routes.test.ts`
- `pnpm test:file -- packages/host-distributed/src/gateway/server.test.ts`
- `pnpm exec tsc -p packages/host-distributed/tsconfig.json --noEmit`
- `pnpm exec vitest run scripts/__tests__/distributed-compose-assets.test.ts`
- `docker compose -f docker-compose.observability.yml up -d`
- `docker compose --profile distributed up -d --build`
- `curl -s http://127.0.0.1:4000/health`
  - distributed gateway 返回 `200`
- `curl -s http://127.0.0.1:4000/live`
  - distributed gateway 返回 `200`
- `curl -s http://127.0.0.1:4000/ready`
  - distributed gateway 返回 `200`
- `curl -s http://127.0.0.1:4000/metrics`
  - distributed gateway 返回 `200`，并暴露 `trapmap_runtime_http_requests_total` / `trapmap_runtime_request_duration_ms_*`
- request correlation / full-chain 现已形成最小证据：
  - `GET /health` 会回显 `x-request-id` 与 `traceparent`
  - `trapmap_runtime_http_requests_total` 在 `chain-test-001` 请求前后从 `4` 增至 `6`
  - gateway stdout 可看到 `request.completed` 结构化日志，包含 `requestId` / `traceId`
- `pnpm test:observability-benchmark -- --base-url http://127.0.0.1:4000`
  - benchmark 当前可执行并输出 `/health`、`/metrics` 延迟基线
- checked-in distributed compose 现已覆盖七进程拓扑：
  - `gateway`、`identity-access`、`knowledge-read`、`knowledge-write`、`candidate-worker`、`governance-worker`、`outbox-worker`
- checked-in Prometheus targets 已对齐当前 distributed service name / port：
  - `gateway:4000`、`identity-access:4001`、`knowledge-read:4002`、`knowledge-write:4003`、`candidate-worker:4004`、`governance-worker:4005`、`outbox-worker:4006`
- checked-in observability compose 已把 `prometheus` 同时接入 `trapmap-observability` 与 `trapmap-distributed`
- 2026-07-03 补充通过证据：
  - `docker compose -f docker-compose.observability.yml up -d`
    - `consul` 改为单挂 `trapmap-distributed` 后成功启动，Prometheus `consul:8500` target 转为 `up`
  - `pnpm test:observability-benchmark -- --base-url http://127.0.0.1:4000`
    - 当前输出 `process_resident_memory_bytes=76.93MB nodejs_heap_size_used_bytes=12.86MB nodejs_heap_size_total_bytes=14.5MB`
  - `curl -s http://127.0.0.1:9090/api/v1/targets`
    - `trapmap-gateway`、`trapmap-identity-access`、`trapmap-knowledge-read`、`trapmap-knowledge-write`、`trapmap-candidate-ingestion`、`trapmap-governance-review`、`trapmap-job-runtime` 全部 `up`
    - `consul`、`loki`、`prometheus`、`tempo` 也全部 `up`
  - `docker exec trapmap-consul wget -qO- http://127.0.0.1:8500/v1/agent/services`
    - 返回 `trapmap-gateway-1`
  - `docker exec trapmap-consul wget -qO- http://127.0.0.1:8500/v1/catalog/services`
    - 返回 `{"consul":[],"gateway":[]}`
  - `docker exec trapmap-consul wget -qO- http://127.0.0.1:8500/v1/health/checks/gateway`
    - `service:trapmap-gateway-1` 当前为 `passing`
  - `curl -s -D - -H 'x-request-id: tempo-check-001' -H 'traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' http://127.0.0.1:4000/health`
    - distributed gateway 返回 `200`，并回显固定 `traceparent`
  - `curl -s http://127.0.0.1:3200/api/traces/4bf92f3577b34da6a3ce929d0e0e4736`
    - Tempo 现可返回 `trapmap-gateway` span，attributes 包含 `trapmap.request_id=tempo-check-001`、`http.route=/health`
  - `curl -s 'http://127.0.0.1:3200/api/search?tags=service.name=trapmap-gateway'`
    - Tempo 搜索当前返回 `traceID=4bf92f3577b34da6a3ce929d0e0e4736`
  - `docker logs --tail 60 trapmap-promtail`
    - `promtail` 现已开始 tail `/var/lib/docker/containers/*/*-json.log`，并稳定推送到 Loki
  - `curl -s -D - -H 'x-request-id: loki-check-002' -H 'traceparent: 00-cccccccccccccccccccccccccccccccc-dddddddddddddddd-01' http://127.0.0.1:4000/health`
    - distributed gateway 返回 `200`，并回显固定 `traceparent`
  - `curl -s 'http://127.0.0.1:3100/loki/api/v1/label/service/values'`
    - Loki labels 当前返回 `["trapmap"]`
  - `curl -G -s 'http://127.0.0.1:3100/loki/api/v1/query_range' --data-urlencode 'query={service="trapmap"} | json | requestId="loki-check-002"'`
    - 当前返回 gateway `request.completed` 结构化日志，字段包含 `requestId=loki-check-002`、`traceId=cccc...`、`serviceName=gateway`、`route=/health`
  - `curl -G -s 'http://127.0.0.1:3100/loki/api/v1/query_range' --data-urlencode 'query={service="trapmap"} | json | traceId="cccccccccccccccccccccccccccccccc"'`
    - 当前返回同一条 gateway `/health` 请求日志，说明 Loki 已形成按 `traceId` 检索闭环
  - `curl -s -o /dev/null -w '%{http_code} %{remote_ip}:%{remote_port}\n' http://127.0.0.1:8500/v1/catalog/services`
    - 当前 shell 中 `curl` 实际命中了 `127.0.0.1:7890`，说明宿主 `000` 现象来自代理链路而不是 Docker port mapping
  - `curl --noproxy '*' -s -o /dev/null -w '%{http_code} %{remote_ip}:%{remote_port}\n' http://127.0.0.1:8500/v1/catalog/services`
    - 直连 Consul 时返回 `200 127.0.0.1:8500`
  - `curl --noproxy '*' -s http://127.0.0.1:8500/v1/catalog/services`
    - 宿主直连当前返回 `{"consul":[],"gateway":[]}`
  - `curl -s -u admin:admin http://127.0.0.1:3000/api/datasources`
    - Grafana 当前已 provision `Prometheus`、`Tempo`、`Loki` 三个 datasource
  - `curl -s -u admin:admin http://127.0.0.1:3000/api/datasources/uid/PBFA97CFB590B2093/health`
    - Grafana 当前返回 `status=OK`，Prometheus datasource healthy
  - `curl -s -u admin:admin http://127.0.0.1:3000/api/datasources/uid/P8E80F9AEF21F6940/health`
    - Grafana 当前返回 `status=OK`，Loki datasource healthy
  - `curl -s -u admin:admin http://127.0.0.1:3000/api/datasources/uid/P214B5B846CF3925F/health`
    - 当前返回 `plugin.notImplemented`；Grafana Tempo datasource 未实现 health API，但 `Tempo /ready` 与 trace query 已通过

### 已确认失败

- Grafana UI 人工点击验收
  - 本轮只补到了 API 口径：datasource provisioning、Prometheus/Loki datasource health、Tempo trace query
  - 仍未做人肉 Explore / dashboard 点击验收

### 当前未关闭项

- distributed compose 已能 clean build + startup，并已补到七进程 full topology
- distributed gateway 的 `/live` / `/ready` / `/health` / `/metrics`、request-id / `traceparent` 回显与 stdout 结构化日志已补齐
- Prometheus / Tempo / Loki API 面现已全部闭环；remaining gap 已收缩到 Grafana UI 人工点击验收
- Consul 自动注册与宿主直连当前都已形成证据；此前 `127.0.0.1:8500 -> 000` 的现象已定位为当前 shell 代理链路命中 `127.0.0.1:7890`
- Tempo 已通过固定 trace id 验证 TrapMap 请求链路可检索；Loki 现也已通过固定 `requestId` / `traceId` 形成结构化日志可检索证据

## 0. 执行约束

- [ ] 仅把本清单当作当前主线的辅助执行面；权威状态仍以根 [`plan.md`](../../plan.md) 和 [`service-discovery-and-observability-plan.md`](./service-discovery-and-observability-plan.md) 为准
- [ ] shell 命令统一直接使用 `pnpm`
- [ ] `@trapmap/host-local` 的 closeout 主链路按 `build -> start -> observability-benchmark` 执行，不用 `dev` 代替
- [ ] 记录每条命令的通过/失败结果，以及必要的人工证据（响应头、Grafana、Tempo、Loki、Consul）

## 1. 前置准备

- [ ] 安装依赖：`pnpm install`
- [ ] 准备环境文件：`cp .env.example .env`
- [ ] 确认 `.env` 至少具备本地启动所需关键项（例如 `OPENAI_API_KEY`、`TRAPMAP_SYSTEM_ADMIN_KEY`）
- [ ] 如需本地完整可观测性联调，准备以下环境变量：
  - `TRAPMAP_LOKI_ENABLED=true`
  - `TRAPMAP_LOKI_URL=http://127.0.0.1:3100/loki/api/v1/push`
  - `CONSUL_ENABLED=true`
  - `CONSUL_HOST=127.0.0.1`
  - `CONSUL_PORT=8500`

## 2. 文档与静态守卫

- [x] 阅读 [`docs/operations/OBSERVABILITY-VERIFICATION.md`](../operations/OBSERVABILITY-VERIFICATION.md)
- [x] 阅读 [`docs/operations/REGRESSION-COMMANDS.md`](../operations/REGRESSION-COMMANDS.md)
- [x] 阅读 [`docs/architecture/OBSERVABILITY.md`](../architecture/OBSERVABILITY.md)
- [x] 阅读 [`docs/architecture/SERVICE-DISCOVERY.md`](../architecture/SERVICE-DISCOVERY.md)
- [x] 运行类型检查：`pnpm typecheck`
- [x] 运行文档漂移检查：`pnpm check:docs-drift`
- [x] 运行结构守卫：`pnpm check:structure`

## 3. 本地最小启动链路

- [ ] 构建 light host：`pnpm --filter @trapmap/host-local build`
- [ ] 启动 light host：`pnpm --filter @trapmap/host-local start`
- [ ] 验证 liveness：`curl -s http://127.0.0.1:4000/live`
- [ ] 验证 readiness：`curl -s http://127.0.0.1:4000/ready`
- [ ] 验证 health：`curl -s http://127.0.0.1:4000/health`
- [ ] 验证 metrics surface：`curl -s http://127.0.0.1:4000/metrics | head -20`
- [ ] 确认 `/ready` 不再是固定假阳性，而是基于真实依赖状态返回
- [ ] 确认 `/health` 输出包含结构化依赖状态

## 4. 本地 observability 栈联调

- [x] 拉起本地基础设施：`docker compose -f docker-compose.observability.yml up -d`
- [x] 确认 `consul` 健康
- [x] 确认 `tempo` 健康
- [x] 确认 `prometheus` 健康
- [x] 确认 `loki` 健康
- [x] 确认 `grafana` 健康
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

> 2026-07-03 实测结果：distributed gateway 的 `GET /health` 已返回 `200`，并回显 `X-Request-Id: test-req-001` 与原始 `Traceparent`。

### 5.3 Structured Logging

- [ ] 执行：`curl -s http://127.0.0.1:4000/health > /dev/null`
- [ ] 在 server stdout 中定位到对应结构化日志
- [ ] 确认日志包含 `requestId`
- [ ] 确认日志包含 `traceId`
- [ ] 确认日志包含 method / url / status 等基本请求字段

> 2026-07-03 实测结果：gateway stdout 已出现 `request.completed` 结构化日志，包含 `requestId`、`traceId`、`routeFamily`、`method`、`route`、`statusCode`、`latencyMs`。

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

> 2026-07-03 实测结果：full-chain 已形成最小闭环，`X-Request-Id` / `Traceparent` 可回显，`trapmap_runtime_http_requests_total` 在请求前后从 `4` 增至 `6`。但当前指标名仍是 `trapmap_runtime_*`，尚未对齐本节原始 `trapmap_http_*` 口径。

## 6. Grafana / Loki / Tempo 人工验证

- [ ] 打开 Grafana：`http://127.0.0.1:3000`
- [ ] 确认至少一个 TrapMap 相关 dashboard 可用
- [ ] 在 Tempo datasource 中按 trace id `4bf92f3577b34da6a3ce929d0e0e4736` 查询
- [ ] 确认至少一条请求链路可在 Tempo 中检索到
- [x] 在 Loki 中按以下语句查日志：

```text
{service="trapmap"} | json | traceId="4bf92f3577b34da6a3ce929d0e0e4736"
```

- [x] 在 Loki 中按以下语句查日志：

```text
{service="trapmap"} | json | requestId="test-req-001"
```

- [x] 确认 Loki 可查到对应结构化日志

> 2026-07-02 实测结果：Grafana、Loki、Tempo、Prometheus 容器已健康启动；但由于 TrapMap distributed 请求链路未形成有效 metrics/trace/log 导出证据，本节只完成“基础设施启动”，未完成“TrapMap 链路可检索”。
>
> 2026-07-03 补充结果：Tempo 已通过 `traceparent=00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01` 的 gateway `/health` 请求形成可检索证据；`/api/traces/4bf92f3577b34da6a3ce929d0e0e4736` 已返回 `trapmap-gateway` span。本轮新增 `promtail` 后，Loki 也已通过固定 `requestId=loki-check-002` 与 `traceId=cccc...` 查询到 gateway `request.completed` 结构化日志。Grafana datasource provisioning 现已可通过 API 看到 `Prometheus` / `Tempo` / `Loki`；其中 Prometheus/Loki datasource health 返回 `OK`，Tempo datasource health API 返回 `plugin.notImplemented`，但 Tempo `/ready` 与 trace query 已通过。

## 7. 自动化 closeout 命令

- [x] 运行 observability closeout：`pnpm test:observability-closeout`
- [x] 运行性能基线入口：`pnpm test:observability-benchmark -- --base-url http://127.0.0.1:4000`
- [x] 运行 discovery closeout：`pnpm test:discovery-closeout`
- [x] 运行 distributed closeout：`pnpm test:distributed-closeout`
- [x] 运行 deployment smoke：`pnpm test:deployment-smoke`
- [x] 运行 runtime foundations：`pnpm test:runtime-foundations`

> 2026-07-03 实测结果：`observability-benchmark` 现已可执行并输出 `/health`、`/metrics` 延迟基线；但进程内存相关指标仍显示 `missingMB`。

## 8. Consul 本地与目标环境验收

### 8.1 本地 Consul 观察

- [x] 执行：`curl --noproxy '*' -s http://127.0.0.1:8500/v1/catalog/services | jq .`
- [ ] 执行：`curl -s http://127.0.0.1:8500/v1/catalog/service/trapmap | jq .`
- [ ] 执行：`curl -s http://127.0.0.1:8500/v1/health/checks/trapmap | jq .`
- [x] 确认 `catalog/services` 中存在 `gateway`
- [ ] 确认 `catalog/service/trapmap` 返回至少一个实例
- [ ] 确认健康检查状态为 `passing`

> 2026-07-02 实测结果：Consul 容器健康，手工 `PUT /v1/agent/service/register` 可成功写入 probe service；但应用自动注册后 `v1/agent/services`、`v1/catalog/services` 仍未出现 TrapMap 实例，因此本地 Consul 验收未通过。
>
> 2026-07-03 补充结论：checked-in distributed compose 已把 Consul env seam 接入各进程，但自动注册仍未形成 catalog 证据；当前更像是双网络场景下实例地址/advertise address 选择问题，而不是单纯“没开 Consul”。
>
> 2026-07-03 追加代码修复：gateway 现已使用 `advertiseHost` 而非 bind host 向 Consul 注册；distributed 模式默认 advertise host 为 Docker DNS 名（例如 `gateway`），也可通过 `TRAPMAP_SERVICE_ADVERTISE_HOST` 覆盖。本轮因当前 shell 无可用 Docker daemon（`/var/run/docker.sock` 缺失）未能完成修复后的 full-docker 重验。
>
> 2026-07-03 最新实测：在恢复 Docker daemon 后，Consul root cause 被收敛为 observability compose 里的双网卡启动失败。将 `consul` 收缩为单挂 `trapmap-distributed` 后，容器内 `v1/agent/services` / `v1/catalog/services` / `v1/health/checks/gateway` 已形成 `gateway` 注册与 `passing` 证据。宿主 shell 侧的 `000` 现象现已定位为代理链路问题：当前 shell 的 `curl` 会命中 `127.0.0.1:7890`，而 `curl --noproxy '*' http://127.0.0.1:8500/v1/catalog/services` 可稳定返回 `200` 与 `{"consul":[],"gateway":[]}`。

### 8.2 目标环境 blocker

- [ ] 明确记录：目标环境 Consul 验收仍是当前主线未关闭 blocker，不能用本地单测替代
- [ ] 在目标环境重复执行 catalog / service / health 查询
- [ ] 停止目标实例后，确认 catalog/health 能观察到注销或失效
- [ ] 将目标环境 Consul 证据单独归档到本轮 closeout 记录中

## 9. 性能基线记录

- [ ] 至少执行 1 轮：`pnpm test:observability-benchmark -- --base-url http://127.0.0.1:4000`
- [ ] 建议同环境执行 3 轮并记录结果
- [ ] 记录 `/health` 的 `avg / p50 / p95 / min / max`
- [ ] 记录 `/metrics` 的 `avg / p50 / p95 / min / max`
- [ ] 记录 `process_resident_memory_bytes`
- [ ] 记录 `nodejs_heap_size_used_bytes`
- [ ] 记录 `nodejs_heap_size_total_bytes`
- [ ] 明确说明本轮只冻结“固定命令 + 固定输出格式”，不预设硬阈值

> 2026-07-03 最新实测：benchmark 当前输出为 `GET /health avg=0.68ms p50=0.72ms p95=1.19ms`、`GET /metrics avg=0.42ms p50=0.44ms p95=0.69ms`；并已返回 `process_resident_memory_bytes=76.93MB nodejs_heap_size_used_bytes=12.86MB nodejs_heap_size_total_bytes=14.5MB`。

## 10. 最终收口记录

- [x] 形成一份命令执行结果摘要，注明通过/失败/跳过原因
- [x] 形成一份人工证据摘要，至少包含 Grafana、Tempo、Loki、Consul
- [ ] 明确区分“本地已关闭项”与“仍待目标环境关闭项”
- [x] 如执行中发现新问题，优先回写到 [`open-debt-and-compromises.md`](./open-debt-and-compromises.md) 或当前主线细则的问题池

### 10.1 2026-07-02 收口摘要

- 本地已关闭：observability 基础设施容器健康；distributed 七进程拓扑可通过手工 `docker run` 方式启动；gateway 到内部服务的 HTTP hop 可达；仓库侧 closeout/tests 大部分通过。
- 本地未关闭：`docker compose --profile distributed up -d --build` 失败；gateway `/metrics` 返回 `401`；request-id / `traceparent` 未回显；stdout 未形成 `requestId` / `traceId` 结构化日志证据；Consul 自动注册未通过；Prometheus targets 未与 distributed 实际端口对齐。
- 仍待目标环境关闭：目标环境 Consul catalog / service / health 证据；停实例后的注销或失效证据；目标环境 Grafana / Tempo / Loki 人工查询证据；固定环境下的 benchmark 基线记录。

### 10.2 2026-07-03 收口摘要

- 本地已关闭：`packages/host-distributed/Dockerfile` 已补齐 `runtime-infra` / `server` project reference 链与 workspace package `node_modules` 布局；`docker compose --profile distributed up -d --build` 现可 clean build 并拉起 checked-in 七进程 distributed 拓扑；gateway `/live` / `/ready` / `/health` / `/metrics`、request-id / `traceparent` 回显与 stdout 结构化日志证据已补齐；`observability-benchmark` 现可执行；gateway Consul 注册现已改为使用 advertise host，而不是 `0.0.0.0` bind host；Tempo 已可按固定 trace id 检索；Loki 已可按固定 `requestId` / `traceId` 检索结构化日志；宿主直连 Consul 在 `--noproxy '*'` 下已返回 `200` 与 `catalog/services`。
- 本地未关闭：Grafana UI 仍未做人肉 Explore / dashboard 点击验收；Tempo datasource 的 Grafana health API 仍返回 `plugin.notImplemented`，只能依赖 `Tempo /ready` 与 trace query 作为后端可用证据。
- 仍待目标环境关闭：目标环境 Consul catalog / service / health 证据；停实例后的注销或失效证据；目标环境 Grafana / Tempo / Loki 人工查询证据；固定环境下的 benchmark 基线与 memory 指标记录。
