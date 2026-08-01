# 可观测性运维指南

> 本文档定义 TrapMap 可观测性基础设施的运维参数：采样策略、数据保留、资源限制、健康检查语义和 SLO/SLI 目标。
> 本文档面向运维人员和平台工程师，关注"如何运维"而非"如何构建"。

---

## 采样策略

### Tracing（链路追踪）

| 参数 | 默认值 | 配置方式 | 说明 |
|------|--------|---------|------|
| `OTEL_SAMPLE_RATE` | 运行时默认值因宿主而异 | 环境变量 | 0.0 ~ 1.0，控制 head-based 采样率；不要把 profile 推荐值写成统一运行时默认值 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | 环境变量 | OTLP exporter 端点；未接 collector 时可回退本地 console 调试 |

采样率按 deployment profile 的推荐值如下，但当前代码并不存在一套统一的自动 profile 默认值：

- `local-agent`：1.0（全量采集，开发调试用）
- `team-monolith`：按实际需求配置，建议 0.5
- `distributed`：0.1（10% 采样，降低 Collector 和 Tempo 负载）

调整建议：

- 高流量场景可将 `OTEL_SAMPLE_RATE` 降至 0.05（5%），但不应低于 0.01，否则故障排查时可用 trace 不足
- 对关键链路（如 `candidate.submit`、`knowledge.review`）可通过 Collector 的 tail-based 采样策略保留异常 trace，不受 head-based 采样率限制
- `local-agent` 开发环境使用 `console` exporter 时无需关注采样率，输出仅供本地查看

### Metrics（指标）

| 参数 | 说明 |
|------|------|
| `TRAPMAP_METRICS_ENABLED` | `true` / `false`，默认 `true` |
| `TRAPMAP_METRICS_PATH` | Prometheus scrape 路径，默认 `/metrics` |

Metrics 不需要采样——指标在进程内聚合为计数器、gauge 和直方图，Prometheus 按 scrape interval 拉取。数据量由标签基数决定（参见 `docs/architecture/OBSERVABILITY.md` 标签基数章节），当前设计已确认无高基数风险。

### Logging（日志）

| 参数 | 默认值 | 配置方式 | 说明 |
|------|--------|---------|------|
| `LOKI_HOST` | — | 环境变量 | Loki push API 地址；为空时仅保留 stdout / NestJS logger |
| `LOG_RAG_ENABLED` | — | 环境变量 | 控制 RAG 领域日志采集范围 |
| `LOG_USER_OPS_ENABLED` | — | 环境变量 | 控制用户操作日志采集范围 |

日志不做进程内采样——所有结构化日志条目均输出；当前仓库内只有 `LOKI_HOST` 这一侧写入口事实。若未配置 Loki，日志仍会输出到 stdout / NestJS logger。

---

## 数据保留策略

| 组件 | 默认保留期 | 配置位置 | 说明 |
|------|-----------|---------|------|
| Prometheus | 当前仓库未冻结保留期 | 外部部署/compose 自行配置 | 当前文档只冻结接入边界，不冻结 retention 默认值 |
| Tempo | 当前仓库未冻结保留期 | 外部部署/compose 自行配置 | 当前文档只冻结接入边界，不冻结 retention 默认值 |
| Loki | 当前仓库未冻结保留期 | 外部部署/compose 自行配置 | 当前文档只冻结接入边界，不冻结 retention 默认值 |

保留期调整建议：

- `dev-observability` 环境建议缩短至 Prometheus 3 天、Tempo/Loki 1 天，节省磁盘空间
- `prod-like` 环境建议 Prometheus 15~30 天、Tempo 7~14 天、Loki 14~30 天，视合规和排查需求而定
- Grafana 自身仅存储仪表盘配置，不持有可观测数据，无保留期概念

---

## 资源限制

以下为 docker-compose `dev-observability` profile 各组件的推荐资源限制：

| 组件 | 内存限制 | CPU 限制 | 说明 |
|------|---------|---------|------|
| Prometheus | 512 MiB | 0.5 核 | 单实例 scrape 时内存充裕 |
| Grafana | 256 MiB | 0.25 核 | 仪表盘渲染为主，CPU 需求低 |
| Tempo | 512 MiB | 0.5 核 | 取决于 trace 写入量 |
| Loki | 512 MiB | 0.5 核 | 取决于日志写入量和查询频率 |
| OTel Collector | 256 MiB | 0.25 核 | 批处理缓冲和导出 |

`prod-like` 环境应根据实际流量调整，建议起步值：

| 组件 | 内存建议 | CPU 建议 | 备注 |
|------|---------|---------|------|
| Prometheus | 1~2 GiB | 1 标签基数和保留期增长后按需扩容 |
| Grafana | 512 MiB | 0.5 标签仪表盘数量增多后可适当增加 |
| Tempo | 1~2 GiB | 1 标签高采样率或长保留期时需更多内存 |
| Loki | 1~2 GiB | 1 标签日志量大时需更多内存和磁盘 |
| OTel Collector | 512 MiB | 0.5 标签高吞吐时按需扩容 |

---

## 健康检查语义

### Shared PG 与 async operator diagnostics

distributed operator surface 报告 pool 的 `total`、`idle`、`waiting`、`max` 和由 `total / max` 导出的 `saturation`；只使用 `pg.Pool` 的三个原始计数。任一原始计数缺失时，对应值及 saturation 固定为 `unknown`。连接、statement timeout 或 DB health failure 应与 service owner、queue/outbox snapshot、lease/reclaim、retry/dead-letter 和 projection lag 一并诊断，而不是把缺失计数当作零。

`knowledge-write`、`governance-review` 与 `job-runtime` 的 `/internal/operator-status` 是 owner-level 入口。业务 owner 可查看 async snapshot，但只有 `job-runtime` 操作运行时队列；先确认 owner 和 `InvocationError` 分类，再决定重启、reclaim 或 replay。

TrapMap 提供三个探针端点，遵循 Kubernetes 探针语义，适用于容器编排和负载均衡决策。

### `/live` — Liveness Probe

- **语义**：进程是否存活、主事件循环是否正常
- **响应**：始终返回 HTTP 200
- **响应体**：`{ "status": "alive", "timestamp": "..." }`
- **用途**：Kubernetes liveness probe；如果此端点失败，说明进程卡死，应重启容器
- **不检查**：不检查任何外部依赖（数据库、Consul、OTel 等）
- **实现**：
  - Fastify: `packages/server（Wave-10 已删除）/src/lib/runtime/http-surface.ts` 第 149-152 行
  - NestJS: `packages/host-local/src/nest/health/health.controller.ts` 第 105-110 行

### `/ready` — Readiness Probe

- **语义**：实例是否准备好接受流量
- **响应**：准备好时返回 HTTP 200，未准备好时返回 HTTP 503
- **判定逻辑**：
  - Fastify: 基于 `RuntimeStatusSnapshot.readiness` 字段；`not-ready` 时返回 503，`degraded` 和 `ready` 时返回 200
  - NestJS: `not-ready` 和 `unhealthy` 返回 `503`；`degraded` 和 `ready` 返回 `200`
- **用途**：Kubernetes readiness probe / 负载均衡器健康检查；未就绪时从服务发现中摘除
- **检查范围**：关键依赖（数据库连接、核心服务初始化完成度），不检查非关键依赖

### `/health` — Comprehensive Health Status

- **语义**：完整的运行状态快照，包含所有依赖的细粒度状态
- **响应**：始终返回 HTTP 200
- **用途**：运维诊断、Grafana 仪表盘数据源、自动化运维脚本
- **响应结构**：遵循 `HealthStatus` contract（定义于 `packages/contracts/src/domain/health.ts`）

```typescript
interface HealthStatus {
  status: 'ok' | 'degraded' | 'unhealthy';  // 整体状态
  timestamp: string;                          // 响应时间
  startedAt: string;                          // 实例启动时间
  uptime: number;                             // 运行秒数
  readiness: 'ready' | 'not-ready' | 'degraded';
  liveness: 'alive' | 'dead';
  dependencies: DependencyStatus[];           // 各依赖状态
  deployment?: { profile: string; preset?: string };
}
```

**依赖状态聚合逻辑**：

1. 每个已注册的 `HealthCheck` 探针独立执行，返回 `HealthCheckResult`（`healthy` / `degraded` / `unhealthy` / `unknown`）
2. `HealthController`（NestJS）或 `toHealthStatus`（Fastify）将所有结果聚合为顶层 `status`：
   - 任一依赖 `unhealthy` → 整体 `unhealthy`
   - 无 `unhealthy` 但有 `degraded` → 整体 `degraded`
   - 全部 `healthy` 或 `unknown` → 整体 `ok`

**Fastify 额外字段**：`/health` 响应中嵌套 `snapshot` 字段，包含 `product`、`packages`、`requestContext`、`graphQuery`、`serviceUnit`、`topology`、`memory`、`uptimeSeconds`、`async` 等向后兼容的运行时数据。

**NestJS 依赖来源**：`LifecycleManagerService.runHealthChecks()` 遍历所有通过 `registerHealthCheck()` 注册的探针，探针注册发生在 lifecycle `init` 阶段。

### `/metrics` — Prometheus Scrape Endpoint

- **语义**：Prometheus 格式的进程指标
- **Content-Type**：`text/plain; version=0.0.4; charset=utf-8`
- **响应体**：标准 Prometheus exposition format，包含 `trapmap_http_requests_total`、`trapmap_http_request_duration_seconds`、`trapmap_active_connections` 等指标
- **用途**：Prometheus scrape target

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

---

## SLO / SLI 定义

以下为 TrapMap 核心服务的初版 SLO 目标。后续可在 Grafana 中配置对应的 SLI 查询和告警规则。

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

告警规则可在 Grafana 中以 Alert Rule 形式配置，初期建议：

| 告警名称 | 触发条件 | 严重级别 | 动作 |
|---------|---------|---------|------|
| `ReadinessDegraded` | `/ready` SLO 连续 2 个窗口低于 99.5% | warning | 通知 on-call |
| `HighErrorRate` | 5xx 错误率连续 2 个窗口超过 1% | critical | 通知 on-call + 触发降级预案 |
| `HighLatency` | P95 延迟连续 3 个窗口超过 500ms | warning | 通知 on-call |
| `DependencyUnhealthy` | 任一依赖 `status=unhealthy` 持续 2 分钟 | critical | 通知 on-call |
| `InstanceNotReady` | 实例 `readiness=not-ready` 持续 1 分钟 | critical | 通知 on-call + 检查是否需要重启 |

Grafana alert rules 的具体 JSON/YAML 定义可在后续迭代中补充到 `infra/grafana/alerts/` 目录。

---

## 故障排查快速参考

| 现象 | 检查路径 | 常见原因 |
|------|---------|---------|
| `/live` 返回非 200 | 进程日志 | 事件循环阻塞、内存 OOM |
| `/ready` 返回 503 | `/health` 的 `dependencies` 数组 | 数据库不可用、关键服务未初始化 |
| `/health` 显示 `unhealthy` | 检查 `dependencies` 中 `status=unhealthy` 的条目 | 对应依赖故障 |
| `/health` 显示 `degraded` | 检查 `dependencies` 中 `status=degraded` 的条目 | 非关键依赖降级（如 graph-query fallback） |
| `/metrics` 无数据 | 检查 `TRAPMAP_METRICS_ENABLED` 配置 | 指标功能未启用 |
| Trace 数据缺失 | 检查 `OTEL_DISABLED`、`OTEL_SAMPLE_RATE` 和 `OTEL_EXPORTER_OTLP_ENDPOINT` | OTel 被禁用、采样率过低或 OTLP 端点不可达 |
| Loki 无日志 | 检查 `LOKI_HOST` | Loki 未配置或 Loki 不可达 |

### Closeout 命令

当前主线收口固定使用以下入口：

- `pnpm test:observability-closeout`：host-local 健康探针、request/trace/metrics/structured log 关联链路
- `pnpm test:discovery-closeout`：Consul adapter、resolver、缓存与 round-robin fallback
- `pnpm test:distributed-closeout`：distributed acceptance + runtime closeout 聚合入口
