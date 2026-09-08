# 可观测性运维指南

> 状态：Active。本页定可观测性基础设施的运维参数，面向运维人员与平台工程师，只讲怎么运维，不讲怎么构建。

`packages/server/` 兼容壳已于 2026-07-31 删除，旧实现路径只做概念参考，细节见 `docs/archived/archived-plans/compatibility-shell-retirement-runtime-infra-ownership.md（已归档，路径冻结）`。

## 采样策略

### Tracing（链路追踪）

| 参数 | 默认值 | 配置方式 | 说明 |
|------|--------|---------|------|
| `OTEL_SAMPLE_RATE` | 运行时默认值因宿主而异 | 环境变量 | 0.0 到 1.0 的 head-based 采样率，不把 profile 推荐值写成统一默认值 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | 环境变量 | OTLP exporter 端点，未接 collector 时回退本地 console 调试 |

profile 推荐值（只是推荐，代码里没有统一自动默认值）：`local-agent` 用 1.0 全量采集，`team-monolith` 按需配置（建议 0.5），`distributed` 用 0.1 降 Collector 与 Tempo 负载。

调整建议：高流量可降到 0.05，不低于 0.01，否则故障排查缺 trace；关键链路（如 `candidate.submit`、`knowledge.review`）用 Collector 的 tail-based 采样保留异常 trace，不受 head 采样率限制；`local-agent` 用 console exporter 时不用管采样率。

### Metrics（指标）

| 参数 | 说明 |
|------|------|
| `TRAPMAP_METRICS_ENABLED` | `true` 或 `false`，默认 `true` |
| `TRAPMAP_METRICS_PATH` | Prometheus scrape 路径，默认 `/metrics` |

指标在进程内聚合成计数器、gauge、直方图，Prometheus 按 scrape interval 拉取，不采样。数据量由标签基数决定（见 `docs/architecture/OBSERVABILITY.md` 标签基数章节），当前设计无高基数风险。

### Logging（日志）

| 参数 | 默认值 | 配置方式 | 说明 |
|------|--------|---------|------|
| `LOKI_HOST` | 无 | 环境变量 | Loki push API 地址，为空时只留 stdout 与 NestJS logger |
| `LOG_RAG_ENABLED` | 未知/待确认（2026-09-08） | 环境变量 | RAG 领域日志采集范围 |
| `LOG_USER_OPS_ENABLED` | 未知/待确认（2026-09-08） | 环境变量 | 用户操作日志采集范围 |

日志不做进程内采样，结构化条目全部输出。仓库内侧写入口事实只有 `LOKI_HOST`，没配 Loki 时日志照常走 stdout。

## 数据保留策略

| 组件 | 默认保留期 | 配置位置 | 说明 |
|------|-----------|---------|------|
| Prometheus | 仓库未冻结保留期 | 外部部署或 compose 自行配置 | 本文档只冻结接入边界 |
| Tempo | 仓库未冻结保留期 | 外部部署或 compose 自行配置 | 本文档只冻结接入边界 |
| Loki | 仓库未冻结保留期 | 外部部署或 compose 自行配置 | 本文档只冻结接入边界 |

保留期建议（只是建议）：`dev-observability` 环境 Prometheus 3 天、Tempo 与 Loki 1 天；`prod-like` 环境 Prometheus 15 到 30 天、Tempo 7 到 14 天、Loki 14 到 30 天。Grafana 只存仪表盘配置，无保留期概念。

## 资源限制

`dev-observability` profile 推荐限制：

| 组件 | 内存限制 | CPU 限制 | 说明 |
|------|---------|---------|------|
| Prometheus | 512 MiB | 0.5 核 | 单实例 scrape 内存充裕 |
| Grafana | 256 MiB | 0.25 核 | 仪表盘渲染为主 |
| Tempo | 512 MiB | 0.5 核 | 取决于 trace 写入量 |
| Loki | 512 MiB | 0.5 核 | 取决于日志量与查询频率 |
| OTel Collector | 256 MiB | 0.25 核 | 批处理缓冲与导出 |

`prod-like` 起步建议：Prometheus 1 到 2 GiB，Grafana 512 MiB，Tempo 1 到 2 GiB，Loki 1 到 2 GiB，Collector 512 MiB，CPU 各 0.5 到 1 核，按实际流量调。

## 健康检查语义

### Shared PG 与 async operator diagnostics

distributed operator surface 报 pool 的 `total`、`idle`、`waiting`、`max` 与 `total / max` 导出的 `saturation`，只用 `pg.Pool` 三个原始计数。任一原始计数缺失时对应值与 saturation 固定为 `unknown`。连接、statement timeout、DB health failure 与 service owner、queue 与 outbox 快照、lease 与 reclaim、retry 与 dead-letter、projection lag 一并诊断，不把缺失计数当零看。

`knowledge-write`、`governance-review`、`job-runtime` 的 `/internal/operator-status` 是 owner 级入口。业务 owner 可看 async 快照，只有 `job-runtime` 操作运行时队列，你先确认 owner 与 `InvocationError` 分类再决定重启、reclaim、replay。

TrapMap 提供三个探针端点，遵循 Kubernetes 探针语义。

### `/live`：Liveness Probe

- **语义**：进程是否存活，主事件循环是否正常
- **响应**：返回 HTTP 200，响应体 `{ "status": "alive", "timestamp": "..." }`
- **用途**：Kubernetes liveness probe，失败说明进程卡死，重建容器
- **不检查**：不检查任何外部依赖（数据库、Consul、OTel 等）
- **实现**：`packages/host-local/src/nest/health/health.controller.ts` 第 102 到 105 行（`@Get('live')`）

### `/ready`：Readiness Probe

- **语义**：实例是否准备好接受流量
- **响应**：就绪返回 HTTP 200，未就绪返回 HTTP 503
- **判定逻辑**：NestJS: `not-ready` 和 `unhealthy` 返回 `503`；`degraded` 和 `ready` 返回 `200`
- **用途**：Kubernetes readiness probe 与负载均衡健康检查，未就绪时从服务发现摘除
- **检查范围**：关键依赖（数据库连接、核心服务初始化完成度），不检查非关键依赖

### `/health`：Comprehensive Health Status

- **语义**：完整运行状态快照，含全部依赖的细粒度状态
- **响应**：返回 HTTP 200
- **用途**：运维诊断、Grafana 数据源、自动化运维脚本
- **响应结构**：遵循 `HealthStatus` contract（`packages/contracts/src/domain/health.ts`）

```typescript
interface HealthStatus {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  startedAt: string;
  uptime: number;
  readiness: 'ready' | 'not-ready' | 'degraded';
  liveness: 'alive' | 'dead';
  dependencies: DependencyStatus[];
  deployment?: { profile: string; preset?: string };
}
```

**依赖聚合逻辑**：任一依赖 `unhealthy` 则整体 `unhealthy`，无 `unhealthy` 但有 `degraded` 则整体 `degraded`，其余整体 `ok`。NestJS 侧 `LifecycleManagerService.runHealthChecks()` 遍历 `init` 阶段注册的探针。

### `/metrics`：Prometheus Scrape Endpoint

- **语义**：Prometheus 格式进程指标
- **Content-Type**：`text/plain; version=0.0.4; charset=utf-8`
- **用途**：Prometheus scrape target

#### Experience Gene metric families

| Metric family | Labels | 用途 |
|---|---|---|
| `trapmap_experience_gene_requests_total` | `mode`, `source_kind` | 派生请求量 |
| `trapmap_experience_gene_candidates_total` | `mode`, `generator` | 规则与 LLM 候选产量 |
| `trapmap_experience_gene_validation_rejections_total` | `mode`, `gate` | 确定性门拒绝 |
| `trapmap_experience_gene_solidified_total` | `mode`, `source_kind` | 固化成功 |
| `trapmap_experience_gene_derivation_retries_total` | `mode`, `outcome` | 派生重试 |
| `trapmap_experience_gene_stale_total` | `mode`, `reason_class` | 真相源失效 |
| `trapmap_experience_gene_derivation_duration_ms` | `mode`, `outcome` | 派生延迟与重试分析 |
| `trapmap_experience_gene_search_duration_ms` | `mode`, `outcome` | Gene 搜索延迟 |
| `trapmap_experience_gene_primary_selected_total` | `mode` | Primary Gene 选择量 |
| `trapmap_experience_gene_empty_results_total` | `mode` | 空 canonical 搜索响应 |

label 只取低基数枚举（mode、source、generator、outcome、reason-class），raw seed、source id、tenant id、prompt 文本禁止进 label。host-local 经 Prometheus 输出，distributed knowledge-write 与 knowledge-read 经共享 OTel registry 在 `/metrics` 输出同名序列。

### 探针配置参考

Kubernetes Deployment 建议配置：

```yaml
livenessProbe:
  httpGet:
    path: /live
    port: http
  initialDelaySeconds: 5
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /ready
    port: http
  initialDelaySeconds: 10
  periodSeconds: 5
```

## SLO 与 SLI 定义

以下 SLO 目标是初版运维决策，不是代码实测结论。后续在 Grafana 里配 SLI 查询与告警规则。

### 可用性（Availability）

| SLI | SLO 目标 | 度量窗口 | 度量方式 |
|-----|---------|---------|---------|
| `/ready` 返回 HTTP 200 的比例 | > 99.5% | 5 分钟滚动窗口 | Prometheus: `sum(rate(http_requests_total{route="/ready",status="200"}[5m])) / sum(rate(http_requests_total{route="/ready"}[5m]))` |

### 延迟（Latency）

| SLI | SLO 目标 | 度量窗口 | 度量方式 |
|-----|---------|---------|---------|
| 网关路由 P95 请求延迟 | < 500ms | 5 分钟滚动窗口 | Prometheus: `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{route_family="gateway"}[5m])) by (le))` |

### 错误率（Error Rate）

| SLI | SLO 目标 | 度量窗口 | 度量方式 |
|-----|---------|---------|---------|
| 5xx 响应占总请求比例 | < 1% | 5 分钟滚动窗口 | Prometheus: `sum(rate(http_requests_total{status_class="5xx"}[5m])) / sum(rate(http_requests_total[5m]))` |

### 告警规则

初期建议配这五条 Grafana alert rule：`ReadinessDegraded`（`/ready` SLO 连 2 窗口低于 99.5%，warning）、`HighErrorRate`（5xx 连 2 窗口超 1%，critical）、`HighLatency`（P95 连 3 窗口超 500ms，warning）、`DependencyUnhealthy`（任一依赖 `unhealthy` 持续 2 分钟，critical）、`InstanceNotReady`（`not-ready` 持续 1 分钟，critical）。具体 JSON 与 YAML 定义后续迭代补到 `infra/grafana/alerts/` 目录。

## 故障排查快速参考

| 现象 | 检查路径 | 常见原因 |
|------|---------|---------|
| `/live` 返回非 200 | 进程日志 | 事件循环阻塞、内存 OOM |
| `/ready` 返回 503 | `/health` 的 `dependencies` 数组 | 数据库不可用、关键服务未初始化 |
| `/health` 显示 `unhealthy` | `status=unhealthy` 的依赖条目 | 对应依赖故障 |
| `/health` 显示 `degraded` | `status=degraded` 的依赖条目 | 非关键依赖降级（如 graph-query fallback） |
| `/metrics` 无数据 | `TRAPMAP_METRICS_ENABLED` 配置 | 指标功能未启用 |
| Trace 数据缺失 | `OTEL_DISABLED`、`OTEL_SAMPLE_RATE`、`OTEL_EXPORTER_OTLP_ENDPOINT` | OTel 禁用、采样率过低、端点不可达 |
| Loki 无日志 | `LOKI_HOST` | Loki 未配或不可达 |

### L3 probes 与 closeout 验证 plumbing

`k8s/base/*.yaml` 的 Deployments 已声明 `readinessProbe: { path: /ready }` 与 `livenessProbe: { path: /live }`（见 `k8s/base/gateway.deploy.yaml` 等 manifests）。离线 plumbing 校验不需要 live 集群：

```bash
pnpm exec tsx scripts/verify-l3-platform.ts --check k8s-probes
kubectl apply --dry-run=client --validate=true -f k8s/base/
pnpm exec tsx scripts/verify-l3-platform.ts --check compose-replicas
```

`kubectl` 行需要你本机装好 kubectl，不需要集群。Live kind 另需建集群、等 Pod Ready、port-forward 打 `/ready`，步骤见 `docs/architecture/DEPLOYMENT.md`。未拿 live 证据前成熟度保持 Level 2 加 pending。

### Closeout 命令

主线收口固定用这组入口：

- `pnpm test:observability-closeout`：host-local 健康探针、request 与 trace 与 metrics 与 structured log 关联链路
- `pnpm test:discovery-closeout`：Consul adapter、resolver、缓存、round-robin fallback
- `pnpm test:distributed-closeout`：distributed acceptance 加 runtime closeout 聚合入口
- `pnpm exec tsx scripts/verify-l3-platform.ts --check all`：L3 离线 plumbing，live gates 标 `CI_REQUIRED` 而不是本地失败

## 常见用法

下面命令的探针语义见上文健康检查一节，指标标签约束见 `docs/architecture/OBSERVABILITY.md`。

### 网关跑起来后先看四个探针

```bash
curl http://127.0.0.1:4000/live
curl http://127.0.0.1:4000/ready
curl http://127.0.0.1:4000/health
curl http://127.0.0.1:4000/metrics | head -20
```

`/ready` 返回 `503` 说明实例未就绪，你查 `/health` 的 `dependencies` 数组定位。四个都不需要认证。

### 带 trace 上下文打一次健康检查

```bash
curl -s -D /tmp/trapmap-trace-headers.txt \
  -H "traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" \
  http://localhost:4000/health -o /dev/null
grep -i traceparent /tmp/trapmap-trace-headers.txt
```

对外只传 `traceparent`，不要写 `X-Trace-Id`。

### 跑性能基线（要运行中的网关）

```bash
pnpm test:observability-benchmark -- --base-url http://127.0.0.1:4000
```

这条不离线跑，你改了网关路由或采样配置后用它确认延迟面无退化。
