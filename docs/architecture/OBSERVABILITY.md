# 可观测性架构

> 本文档定义 TrapMap 可观测性的目标架构，覆盖指标（metrics）、日志（logs）和链路追踪（traces）三大支柱。当前阶段为架构冻结，尚未全量实现；后续落地以本文档为权威参考。

## 概述

TrapMap 采用 LGTM 栈（Loki、Grafana、Tempo、Prometheus）+ OpenTelemetry 作为可观测性基础设施。应用侧通过 OpenTelemetry SDK 统一采集三大信号，经 exporter 推送至后端存储，最终由 Grafana 提供统一查询与告警面板。

设计原则：

- **统一采集**：所有信号通过 OpenTelemetry SDK 采集，不维护多套 agent
- **渐进落地**：先 trace、再 metrics、最后 logs，每一步都可独立验证
- **profile 感知**：`local-agent` 可降级为 console/noop，`distributed` 走全量管线
- **零侵入业务**：采集逻辑只在 host 层与 infrastructure 层装配，不进入 `backend-core` domain/application

## 架构总览

```mermaid
flowchart TB
    subgraph 应用进程["应用进程"]
        subgraph host-local zone
            APP_LOCAL["local-agent / team-monolith<br/>NestJS 宿主"]
        end
        subgraph host-distributed zone
            APP_GW["gateway"]
            APP_CI["candidate-ingestion"]
            APP_GR["governance-review"]
            APP_OR["outbox-runtime"]
        end

        SDK["@opentelemetry/sdk-node<br/>TracerProvider + MeterProvider<br/>+ LoggerProvider"]
    end

    subgraph OTel Collector["OpenTelemetry Collector"]
        COL_RECEIVER["OTLP Receiver<br/>:4317 (gRPC) / :4318 (HTTP)"]
        COL_PROCESSOR["Processors<br/>batch / attributes / sampling"]
        COL_EXPORTER["Exporters"]
    end

    subgraph 后端存储["后端存储"]
        TEMPO["Tempo<br/>分布式追踪"]
        PROM["Prometheus<br/>指标存储"]
        LOKI["Loki<br/>日志聚合"]
    end

    subgraph 展示层["展示层"]
        GRAFANA["Grafana<br/>统一仪表盘与告警"]
    end

    APP_LOCAL --> SDK
    APP_GW --> SDK
    APP_CI --> SDK
    APP_GR --> SDK
    APP_OR --> SDK
    SDK -->|OTLP| COL_RECEIVER
    COL_RECEIVER --> COL_PROCESSOR
    COL_PROCESSOR --> COL_EXPORTER
    COL_EXPORTER -->|traces| TEMPO
    COL_EXPORTER -->|metrics| PROM
    COL_EXPORTER -->|logs| LOKI
    TEMPO --> GRAFANA
    PROM --> GRAFANA
    LOKI --> GRAFANA
```

## 组件职责

### OpenTelemetry SDK（应用侧）

| 信号 | SDK 组件 | 采集内容 |
|------|---------|---------|
| Traces | `@opentelemetry/sdk-trace-node` | HTTP 请求 span、数据库查询 span、队列消费 span、AI 调用 span |
| Metrics | `@opentelemetry/sdk-metrics` | 请求延迟直方图、错误率计数器、队列深度 gauge、连接池使用率 |
| Logs | `@opentelemetry/sdk-logs` | 结构化应用日志，自动关联 traceId/spanId |

自动注入的 instrumentation：

- `@opentelemetry/instrumentation-http`：HTTP 请求/响应
- `@opentelemetry/instrumentation-fastify`：Fastify 路由层
- `@opentelemetry/instrumentation-pg`：PostgreSQL 查询
- `@opentelemetry/instrumentation-amqp`：RabbitMQ 操作（仅 `distributed` 使用 RabbitMQ task transport 时）

自定义 span 和指标：

- `knowledge.submit`、`knowledge.review`、`candidate.process` 等业务操作 span
- `retrieval.query.duration`、`retrieval.cache.hit_rate`、`queue.task.processing_time` 等业务指标
- 通过 `backend-core` 的 port 接口注入 span context，不侵入 domain 逻辑

### OpenTelemetry Collector

Collector 作为可选的中间聚合层，承担：

- **协议转换**：统一接收 OTLP，按目标后端需要的协议导出
- **批处理**：减少后端写入压力
- **属性注入**：添加 `service.name`、`deployment.environment`、`service.version` 等标准资源属性
- **采样**：对高吞吐 trace 执行尾部采样，降低存储开销

在 `local-agent` 和 `team-monolith` profile 中，Collector 是可选的；SDK 可直接向后端 exporter 输出。在 `distributed` profile 中，Collector 是标准基础设施组件。

### Tempo（链路追踪）

| 项目 | 说明 |
|------|------|
| 职责 | 存储和查询分布式 trace |
| 协议 | 接收 OTLP，暴露 Grafana 数据源接口 |
| 关联 | 通过 `traceId` 关联跨服务请求；与 Loki 和 Prometheus 通过 exemplar 桥接 |
| 保留 | 默认 7 天，可通过配置调整 |

典型查询场景：

- 追踪一次 `candidate.submit` 从 gateway 到 candidate-ingestion worker 的全链路
- 定位某次 `retrieval.search` 的慢查询瓶颈（向量召回 vs 关键词召回 vs 图扩展）
- 查看跨 context 调用的依赖图

### Prometheus（指标）

| 项目 | 说明 |
|------|------|
| 职责 | 时序指标存储与告警规则评估 |
| 协议 | 拉取模式（scrape）或远程写入（remote write） |
| 指标来源 | OpenTelemetry Collector 导出，或应用直接暴露 `/metrics` 端点 |
| 关联 | 通过 exemplar 与 Tempo trace 关联 |

核心指标分组：

| 分组 | 指标示例 |
|------|---------|
| HTTP | `http_request_duration_seconds`, `http_requests_total` |
| 数据库 | `db_query_duration_seconds`, `db_pool_active_connections` |
| 队列 | `queue_depth`, `queue_task_duration_seconds`, `queue_dead_letter_total` |
| 业务 | `knowledge_entries_total`, `candidates_pending_total`, `review_queue_depth` |
| 运行时 | `process_cpu_seconds_total`, `process_resident_memory_bytes` |

### Loki（日志）

| 项目 | 说明 |
|------|------|
| 职责 | 聚合和查询结构化日志 |
| 协议 | 接收 OTLP 或 Loki push API |
| 关联 | 通过 `traceId` 标签与 Tempo 双向跳转 |
| 保留 | 默认 14 天，可通过配置调整 |

日志格式要求：

- JSON 结构化输出，包含 `timestamp`、`level`、`message`、`traceId`、`spanId`、`requestId`、`service`
- `packages/server/src/lib/runtime/request-context.ts` 已提供 `requestId`/`traceId` 上下文，日志中间件直接消费
- `LOG_RAG_ENABLED`、`LOG_USER_OPS_ENABLED` 等开关继续控制领域日志的采集范围

### Grafana（可视化）

| 项目 | 说明 |
|------|------|
| 职责 | 统一查询、仪表盘、告警 |
| 数据源 | Tempo、Prometheus、Loki |
| 面板 | 运行状态概览、服务级别 SLI/SLO、队列深度趋势、错误率分布 |

预置仪表盘：

- **系统概览**：各服务实例的请求量、错误率、延迟 P50/P95/P99
- **检索性能**：retrieval query 的分阶段耗时（语义召回、关键词召回、图扩展、合并重排）
- **异步管道**：candidate 处理队列深度、任务处理耗时、dead letter 趋势
- **基础设施**：数据库连接池、Redis 缓存命中率、Neo4j 查询延迟

## 与现有架构的集成

### Nest 模块集成

可观测性逻辑按六边形架构分层：

| 层 | 集成方式 |
|---|---|
| `backend-core` | 定义 `ObservabilityPort`（trace context propagation、metrics recording 接口），domain/application 层通过 port 声明观测需求，不直接依赖 SDK |
| `host-local` | 装配 `ObservabilityModule`（NestJS module），将 OTel SDK 初始化、auto-instrumentation 注册、exporter 配置注入为全局 provider |
| `host-distributed` | 同上，额外配置 Collector endpoint 与多实例 service.name 区分 |
| `server` | 兼容壳层继续使用现有 `request-context.ts` 的 requestId/traceId 传播，不引入新的观测耦合 |

`ObservabilityModule`（目标 Nest module 结构）：

```
packages/host-local/src/nest/observability/
├── observability.module.ts     # NestJS module 定义
├── otel.provider.ts            # OTel SDK 初始化与生命周期管理
├── trace.interceptor.ts        # 自动 span 创建拦截器
├── metrics.controller.ts       # /metrics 端点（Prometheus 格式）
└── health.instrumentation.ts   # 健康检查指标注入
```

### 与现有 health/ready 端点的关系

现有的 `/health` 和 `/ready` 端点（由 `packages/server/src/lib/runtime/runtime-metadata.ts` 提供）继续作为 liveness/readiness 探针，不被替代。可观测性体系在这些端点之上叠加：

- `/health` 的 `dependencies` 输出可被 Prometheus 采集为 gauge 指标
- `readiness` 状态变化可触发 Grafana 告警
- `requestContext.traceHeader` 字段说明当前实例使用的 trace 传播头约定

## 部署 Profile 差异

| 能力 | `local-agent` | `team-monolith` | `distributed` |
|------|--------------|-----------------|---------------|
| Traces | console exporter（开发时查看） | OTLP → Tempo 或 console | OTLP → Collector → Tempo |
| Metrics | `/metrics` 端点可选暴露 | `/metrics` 端点 + Prometheus scrape | Collector 聚合 + Prometheus |
| Logs | stdout JSON | stdout JSON → Loki（可选） | OTLP → Collector → Loki |
| Collector | 不要求 | 可选 | 必需基础设施 |
| Grafana | 不要求 | 可选 | 标准部署组件 |

`local-agent` 场景下，开发者可通过 `OTEL_TRACES_EXPORTER=console` 在终端直接查看 span 输出，无需任何后端基础设施。`team-monolith` 在 Docker Compose 部署中可选择性加入 Grafana + Prometheus + Loki 的 compose profile。`distributed` 将这些作为标准基础设施组件包含在 compose 中。

## 配置策略

所有可观测性配置通过环境变量控制，遵循 TrapMap 现有的 `TRAPMAP_` / `OTEL_` 前缀约定：

| 环境变量 | 默认值 | 说明 |
|---------|-------|------|
| `OTEL_ENABLED` | `false` | 总开关，关闭时所有 SDK 组件为 noop |
| `OTEL_SERVICE_NAME` | `trapmap` | 服务名称，注册到 OTel resource |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP exporter 端点 |
| `OTEL_TRACES_EXPORTER` | `otlp` | traces 导出方式：`otlp` / `console` / `none` |
| `OTEL_METRICS_EXPORTER` | `otlp` | metrics 导出方式：`otlp` / `prometheus` / `console` / `none` |
| `OTEL_LOGS_EXPORTER` | `otlp` | logs 导出方式：`otlp` / `console` / `none` |
| `OTEL_SAMPLING_RATE` | `1.0` | traces 采样率（0.0 ~ 1.0） |
| `OTEL_RESOURCE_ATTRIBUTES` | (无) | 额外 resource 属性，如 `deployment.environment=staging` |
| `TRAPMAP_METRICS_ENABLED` | `false` | 是否暴露 `/metrics` Prometheus 端点 |
| `TRAPMAP_METRICS_PATH` | `/metrics` | Prometheus scrape 端点路径 |

部署 profile 自动设置推荐默认值：

- `local-agent`：`OTEL_ENABLED=true`, `OTEL_TRACES_EXPORTER=console`, 其余 `none`
- `team-monolith`：`OTEL_ENABLED=true`, exporter 按实际基础设施配置
- `distributed`：`OTEL_ENABLED=true`, 全部走 OTLP exporter，`OTEL_SAMPLING_RATE=0.1`（默认 10% 采样）

## 健康检查集成

可观测性体系增强（不替代）现有的 health/readiness 检查：

| 端点 | 当前职责 | 可观测性增强 |
|------|---------|------------|
| `/health` | liveness 探针 | 输出中增加 `observability.enabled`、`observability.exporterStatus` 字段 |
| `/ready` | traffic readiness | 当 OTel exporter 连续失败超过阈值时，`readiness` 可降级为 `degraded` |
| `/metrics` | 新增 | Prometheus 格式指标端点，包含标准 `up`、`process_*`、`http_*` 指标 |

Collector 自身的健康检查独立于应用进程，由 Docker/Kubernetes 的基础设施探针管理。

## 非目标

当前阶段明确不做：

- 不引入商业 APM 产品（Datadog、New Relic）作为默认方案
- 不为 `backend-core` domain 层引入 SDK 依赖；domain 层只通过 port 接口声明观测需求
- 不在 `local-agent` 中强制要求 Grafana/Prometheus/Loki 基础设施
- 不实现自定义 metrics 聚合或自建时序数据库
- 不把 trace context 传播到 CLI 客户端（CLI 不是可观测性的观测对象）
