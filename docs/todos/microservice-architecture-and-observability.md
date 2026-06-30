# 微服务架构与可观测性全景

> 生成日期: 2026-06-29
> 范围: 六个有界上下文的双重运行模式、服务间通信、可观测性、服务发现、内存管理、RPC 引入路径

---

## 目录

- [1. 六个有界上下文的三层结构](#1-六个有界上下文的三层结构)
- [2. 单体模式下的模块组装 (host-local)](#2-单体模式下的模块组装-host-local)
- [3. 分布式模式下的 Worker 启动 (host-distributed)](#3-分布式模式下的-worker-启动-host-distributed)
- [4. 能力模型与路由表面](#4-能力模型与路由表面)
- [5. 服务间通信机制](#5-服务间通信机制)
- [6. 可观测性三支柱现状](#6-可观测性三支柱现状)
- [7. 已有可观测性基础设施](#7-已有可观测性基础设施)
- [8. 可观测性成熟度评估](#8-可观测性成熟度评估)
- [9. 改进路径](#9-改进路径)
- [10. 服务发现](#10-服务发现)
- [11. 内存管理](#11-内存管理)
- [12. RPC 引入路径](#12-rpc-引入路径)

---

## 1. 六个有界上下文的三层结构

每个有界上下文存在于三个层次，可以在单体和分布式两种运行模式间无缝切换。

### 1.1 有界上下文一览

| 上下文 | 包名 | 职责 |
|---|---|---|
| identity-access | `service-identity-access` | 认证、会话、团队、成员管理、Access Key 生命周期 |
| knowledge-read | `service-knowledge-read` | 读侧查询、语义/关键词/图辅助检索、投影状态 |
| knowledge-write | `service-knowledge-write` | 聚合变更、知识条目 CRUD、版本修订、生命周期转换 |
| candidate-ingestion | `service-candidate-ingestion` | 候选提交流水线、去重检测、结果发布 |
| governance-review | `service-governance-review` | 审核批准/拒绝、维护/衰减决策、反馈、证据管理 |
| job-runtime | `service-job-runtime` | 任务队列调度与消费、Outbox Worker、定时任务 |

### 1.2 三层结构

以 `candidate-ingestion` 为代表:

```
第 1 层: backend-core (框架无关的纯业务逻辑)
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   createCandidateIngestionModule(deps: CandidateIngestionDeps)      │
│                                                                     │
│   接收 Ports (纯接口):                                              │
│     • candidateRepo: CandidateRepositoryPort                        │
│     • auditLog: AuditLogPort                                        │
│     • knowledgeWrite: KnowledgeWritePort                            │
│     • jobRuntime?: JobRuntimePort                                   │
│                                                                     │
│   返回: CandidateIngestionPort 实现                                 │
│     (submit / getById / listByStatus / applyResolution / ...)       │
│                                                                     │
│   ✦ 零 HTTP 依赖  ✦ 零 NestJS 依赖  ✦ 零 Fastify 依赖              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
第 2 层: service-candidate-ingestion (HTTP 适配层)
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   deps.ts    ─── 定义 CandidateIngestionPortDeps 依赖信封            │
│   routes.ts  ─── 注册 Fastify 路由:                                 │
│                   POST /internal/candidates                         │
│                   GET  /internal/candidates/:id                     │
│                   GET  /internal/candidates                         │
│                   POST /internal/candidates/:id/resolution          │
│                   POST /internal/candidates/:id/manual-result       │
│                   POST /internal/candidates/:id/publish             │
│                   GET  /internal/health                             │
│   server.ts  ─── createCandidateIngestionServer(config, deps)       │
│                   返回 { app, module, start(), close() }            │
│                                                                     │
│   ✦ 可独立启动为 Fastify HTTP 服务 (Worker 模式)                    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                       ┌───────┴────────┐
                       ▼                ▼
第 3 层: Host Assembly (宿主组装)
┌──────────────────────────────┐  ┌──────────────────────────────────┐
│     host-local (单体模式)     │  │   host-distributed (分布式模式)   │
│                              │  │                                  │
│  CandidateIngestionModule    │  │  --service candidate-ingestion   │
│    .forDeps(deps)            │  │                                  │
│                              │  │  ① loadServiceConfig(...)        │
│  → NestJS DynamicModule      │  │  ② createServiceDatabase(pool)  │
│  → 全局 Provider             │  │  ③ createServicePorts(pool)      │
│  → Token 注入                │  │  ④ InternalServiceClient (HTTP)  │
│                              │  │  ⑤ createCandidateIngestionServer│
│  模块间: 直接函数调用         │  │     (config, deps)               │
│  (零网络开销)                │  │                                  │
│                              │  │  模块间: HTTP 远程调用            │
│                              │  │  (通过 InternalServiceClient)    │
└──────────────────────────────┘  └──────────────────────────────────┘
```

---

## 2. 单体模式下的模块组装 (host-local)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  AppModule (host-local/src/nest/app.module.ts)                          │
│                                                                         │
│  ① createHostLocalRuntime() ── 启动时一次性创建全部共享基础设施          │
│     ├─ PostgreSQL 连接池 / JSON Store                                   │
│     ├─ 全部 9 个 Repository Port 实现                                   │
│     ├─ SessionLookup / TeamLookup / PermissionCheck Port                │
│     ├─ RetrievalQuery / AuditLog / Queue Port                           │
│     └─ AI Provider 实例                                                 │
│                                                                         │
│  ② 逐个组装 6 个 NestJS Module:                                        │
│                                                                         │
│   IdentityAccessModule.forDeps({                                        │
│     sessionRepo, accessKeyRepo, teamRepo, membershipRepo, userRepo      │
│   })                                                                    │
│     → createIdentityAccessModule(deps)                                  │
│     → { provide: IDENTITY_ACCESS_PORT, useValue: port }                 │
│     → global: true                                                      │
│                                                                         │
│   KnowledgeReadModule.forDeps({ retrieval, knowledgeRepo })             │
│   KnowledgeWriteModule.forDeps({ knowledgeRepo, auditLog, queue })      │
│                                                                         │
│   CandidateIngestionModule.forDeps({                                    │
│     candidateRepo, auditLog,                                            │
│     knowledgeWrite ← 从 KnowledgeWriteModule 的 Provider 取出           │
│     jobRuntime     ← 从 JobRuntimeModule 的 Provider 取出               │
│   })                                                                    │
│                                                                         │
│   GovernanceReviewModule.forDeps({                                      │
│     knowledgeRepo, feedbackRepo, auditLog,                              │
│     knowledgeWrite ← 同上，跨模块注入                                   │
│   })                                                                    │
│                                                                         │
│   JobRuntimeModule.forDeps({ queue, outbox })                           │
│                                                                         │
│  ③ imports: [                                                           │
│       IdentityAccessModule,     ← global provider                       │
│       KnowledgeReadModule,      ← global provider                       │
│       KnowledgeWriteModule,     ← global provider                       │
│       CandidateIngestionModule, ← global provider                       │
│       GovernanceReviewModule,   ← global provider                       │
│       JobRuntimeModule,         ← global provider                       │
│       GatewayModule             ← 路由注册 + 中间件                     │
│     ]                                                                   │
│                                                                         │
│  ④ configure(consumer):                                                 │
│     consumer.apply(RequestContextMiddleware, LoggingMiddleware)          │
│       .forRoutes('*')                                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.1 `Module.forDeps()` 内部机制

```
┌─────────────────────────────────────────────────────────────────┐
│  @Module({})                                                    │
│  export class CandidateIngestionModule {                        │
│    static forDeps(deps: CandidateIngestionDeps) {               │
│      const port = createCandidateIngestionModule(deps);         │
│      return {                                                   │
│        module: CandidateIngestionModule,                        │
│        providers: [{                                            │
│          provide: CANDIDATE_INGESTION_PORT,  ← Token 字符串     │
│          useValue: port                       ← 实现注入        │
│        }],                                                      │
│        exports: [CANDIDATE_INGESTION_PORT],                     │
│        global: true,                     ← 全局可注入           │
│      };                                                         │
│    }                                                            │
│    static forTesting(port) { ... }      ← 测试时直接传 Mock     │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
```

关键设计原则: "Adapter selection is the host assembly's responsibility — business code never chooses between in-process and remote."

---

## 3. 分布式模式下的 Worker 启动 (host-distributed)

### 3.1 启动流程

```
docker-compose up (distributed profile)
│
├─ gateway 容器
│   host-distributed --service gateway            (port 4000)
│   │
│   │  创建 InternalServiceClients:
│   │  ┌──────────────────────────────────────────────────────┐
│   │  │  identityAccessClient → http://identity-access:4001  │
│   │  │  knowledgeReadClient  → http://knowledge-read:4002   │
│   │  │  knowledgeWriteClient → http://knowledge-write:4003  │
│   │  │  candidateClient      → http://candidate-worker:4004│
│   │  │  governanceClient     → http://governance-worker:4005│
│   │  │  jobRuntimeClient     → http://outbox-worker:4006    │
│   │  └──────────────────────────────────────────────────────┘
│   │
│   │  每个方法 = 一个 fetch() 调用:
│   │  candidateIngestion.submit(body)
│   │    → POST http://candidate-worker:4004/internal/candidates
│   │
│   └─ Gateway 是唯一对外暴露的服务 (外部只能访问 :4000)
│
├─ candidate-worker 容器
│   host-distributed --service candidate-ingestion  (port 4004)
│   │
│   │  ① loadServiceConfig('candidate-ingestion')
│   │  ② createServiceDatabase(config)  → PostgreSQL 连接池
│   │  ③ createServicePorts(pool)       → ~1200 行, 实现所有 Port:
│   │     ├─ CandidateRepositoryPort   (直接 SQL)
│   │     ├─ AuditRepositoryPort       (直接 SQL)
│   │     ├─ SessionLookupPort         (直接 SQL)
│   │     ├─ TaskQueuePort             (SKIP LOCKED)
│   │     └─ ...
│   │  ④ createRemoteKnowledgeWriteClient(internalHttpClient)
│   │     → knowledgeWrite 的每个方法 → HTTP 调用 knowledge-write:4003
│   │  ⑤ createCandidateIngestionServer(config, deps)
│   │     → 独立 Fastify 实例, 监听 :4004
│   └
│
├─ governance-worker 容器      (port 4005, 同理)
├─ outbox-worker 容器          (port 4006, 同理)
│
└─ postgres 容器               (共享, 所有 Worker 连同一个库)
    pgvector/pgvector:pg16
```

### 3.2 各服务默认端口

| 服务 | 默认端口 | 启动参数 |
|---|---|---|
| gateway | 4000 | `--service gateway` |
| identity-access | 4001 | `--service identity-access` |
| knowledge-read | 4002 | `--service knowledge-read` |
| knowledge-write | 4003 | `--service knowledge-write` |
| candidate-ingestion | 4004 | `--service candidate-ingestion` |
| governance-review | 4005 | `--service governance-review` |
| job-runtime | 4006 | `--service job-runtime` |

### 3.3 共享基础设施层

所有分布式 Worker 进程共享同一个 PostgreSQL 数据库（当前拓扑: `shared-postgres-phase1`）。每个 Worker 通过 `createServicePorts(pool)` 工厂函数创建全部 Port 实现（约 1200 行），包括:

- 全部 9 个 Repository Port（直接 SQL 查询）
- SessionLookup / TeamLookup / PermissionCheck Port
- RetrievalQuery Port
- TaskQueuePort / OutboxPort

---

## 4. 能力模型与路由表面

### 4.1 部署 Profile 对照

| | local-agent | team-monolith | distributed |
|---|---|---|---|
| routeSurface | `minimal-agent` | `gateway-core` | 见下表 |
| 存储 | json-store-ok | postgres-required | postgres-required |
| 认证 | single-user | team-auth | team-auth |
| 异步 | local-owned | split-owned | remote-expected |
| 进程模型 | 单进程 | 单进程 | 多进程 |

### 4.2 distributed 模式下各 Preset 的路由表面

| Preset | routeSurface | 暴露的路由 |
|---|---|---|
| monolith | `gateway-core` | 全部公开 API |
| api | `gateway-core` | 全部公开 API |
| candidate-worker | `worker-status` | 仅 `/health`, `/ready`, `/meta/routes` |
| governance-worker | `worker-status` | 仅 `/health`, `/ready`, `/meta/routes` |
| outbox-worker | `worker-status` | 仅 `/health`, `/ready`, `/meta/routes` |

**结论**: Worker 容器对外不暴露业务 API，只暴露健康检查端点。所有业务请求必须经过 Gateway 路由。

### 4.3 Capability Flags (18 项)

`DeploymentCapabilities` 接口由 `(profile, runtimeMode, serviceUnit)` 三元组计算，关键 flag 包括:

- `routeSurface`: `'minimal-agent'` | `'gateway-core'` | `'worker-status'`
- `exposesGateway` / `exposesFullHttpApi`
- `supportsTeamAuth` / `supportsJsonStore` / `requiresPostgres`
- `ownsCandidateTaskWork` / `ownsSharedJobTaskWork` / `ownsOutboxWork`
- `supportsReviewGovernance`
- `allowsSingleProcess`

---

## 5. 服务间通信机制

### 5.1 通信矩阵

| 通信方式 | 方向 | 同步/异步 | 用途 |
|---|---|---|---|
| Gateway HTTP 委托 | 外部 → Gateway → Worker | 同步 | 外部请求分发 |
| Internal HTTP Client | Worker → Worker | 同步 | 跨服务调用 (如 candidate → knowledge-write) |
| PostgreSQL Task Queue | 任何 → Worker | 异步 | 任务消费: 去重/摘要/嵌入 (SKIP LOCKED) |
| RabbitMQ (可选) | 任何 → Worker | 异步 | 替代 PG Task Queue |
| Domain Event Outbox | Worker → Outbox Worker | 异步 | 事务性事件发布 (同一事务写 outbox 表) |
| LifecycleEventBus | 进程内 | 同步 | 单进程内领域事件 (仅 monolith/local-agent) |

### 5.2 PostgreSQL Task Queue 详情

- 实现: `server/src/lib/queue/task-queue.ts`
- 并发安全: PostgreSQL `SKIP LOCKED`
- 特性: 优先级、指数退避重试、死信队列、去重键、租约心跳、过期租约回收
- 表结构: `task_queue` (status, priority, attempts, worker_id, lease_until, ...)

### 5.3 RabbitMQ (可选替代)

- 启用方式: `TRAPMAP_TASK_TRANSPORT=rabbitmq` + `TRAPMAP_RABBITMQ_URL`
- Exchange: `trapmap.tasks`
- Queues: `trapmap.candidate`, `trapmap.governance`, ...
- 工厂: `server/src/lib/async/factory.ts`

### 5.4 Domain Event Outbox

- Port: `OutboxPort` (backend-core/src/ports/queue-ports.ts)
- 方法: `enqueue`, `claimBatch`, `complete`, `fail`, `getStatusSnapshot`
- 后端: PostgreSQL 表，claim/complete/fail 生命周期
- Worker: `outbox-worker` 进程轮询发布

---

## 6. 可观测性三支柱现状

### 6.1 Metrics (指标) — ⚠️ 接口有, 实现为 NoOp

**Port 定义 (backend-core)**:

```typescript
// backend-core/src/ports/audit-ports.ts
MetricsPort {
  incrementCounter(name, labels?, value?)
  recordDuration(name, ms, labels?)
  recordGauge(name, value, labels?)
}
```

**实现现状**:
- `host-local`: `NoOpMetricsPort` — 空操作，不输出指标
- `host-distributed`: `NoOpMetricsPort` — 同上
- 未集成 Prometheus / Grafana / OTEL

### 6.2 Logging (日志) — ✅ 基础日志有, 无集中收集

**已实现**:
- NestJS `LoggingMiddleware` (host-local): 请求入口/出口日志 (method, url, statusCode, duration)
- `RequestContextMiddleware`: 注入 requestId / traceId 到请求上下文
- Task Queue: 任务入队/消费/完成/失败/重试/死信 全链路日志 (worker_id, attempt, error)
- `LifecycleEventBus`: 每个 handler 独立 try/catch，错误隔离

**日志目的地**: `logs/` 目录 (本地文件) + stdout (容器模式)

**缺失**: ELK/Loki 集中日志、OpenTelemetry Collector、结构化 JSON 格式标准化

### 6.3 Tracing (链路追踪) — ⚠️ 有 requestId, 无分布式追踪

**已有**:
- `RequestContextMiddleware` 注入 requestId
- Task Queue 记录 worker_id + attempt
- AuditLog 记录操作者/动作/目标

**缺失**:
- 无 OpenTelemetry SDK 集成
- 无跨服务 trace propagation (W3C TraceContext)
- 无 span 自动创建 (HTTP / DB / Queue)
- 无 Jaeger / Tempo / Zipkin 对接

---

## 7. 已有可观测性基础设施

### 7.1 Health & Readiness 探针

每个 Worker / 服务实例暴露:

| 端点 | 用途 |
|---|---|
| `GET /health` | 存活探针 (liveness) |
| `GET /ready` | 就绪探针 (readiness, 检查 DB 连接等) |
| `GET /meta/routes` | 暴露的路由列表 (自描述) |

`docker-compose.yml` 中的 `healthcheck` 配置可对接这些端点。

### 7.2 Task Queue 可观测性 (最完善的部分)

```
TaskQueuePort.getStatusSnapshot()
  → { pending, active, completed, failed, dead }

OutboxPort.getStatusSnapshot()
  → { pending, claimed, completed, failed }

JobRuntimePort.getQueueStatus()
  → 综合队列健康状态

任务生命周期日志 (每步结构化):
  enqueue → claim → start → complete/fail → retry/dead-letter
  字段: taskId, queue, workerId, attempt, duration_ms
```

这是最接近生产级可观测性的部分，可直接对接监控告警。

### 7.3 Audit Log (审计日志)

```
AuditRepositoryPort {
  insert(entry: {
    id, actorId, actorType, action,
    targetType, targetId, metadata, timestamp
  })
  listByFilter(filter)
}
```

覆盖操作:
- 用户认证/登出/团队切换
- 知识提交/更新/废弃
- 审核批准/拒绝
- 候选发布
- 访问密钥 provision/revoke
- 管理操作 (decay, maintenance)

CLI 暴露: `trapmap audit` 命令组查询审计日志。

### 7.4 Observability 契约层 (contracts)

`@trapmap/contracts/src/observability/` 定义了标准化的可观测性类型:

- `HealthStatus` / `ReadinessStatus`
- `QueueSnapshot` (队列状态快照)
- `MetricsPayload` (指标上报载荷)
- `TraceContext` (追踪上下文，预留)

---

## 8. 可观测性成熟度评估

| 维度 | 现状 | 评分 | 差距 |
|---|---|---|---|
| Health 探针 | 完整 | ★★★★★ | — |
| Readiness 探针 | 完整 | ★★★★★ | — |
| Task Queue 监控 | 完善 | ★★★★☆ | 缺 Prometheus 导出 |
| 审计日志 | 完善 | ★★★★☆ | 缺集中查询/告警 |
| 请求日志 | 基础 | ★★★☆☆ | 缺结构化 JSON 格式 |
| 请求级 requestId | 有 | ★★★☆☆ | 缺跨服务传播 |
| Metrics 接口 | 有 (NoOp) | ★★☆☆☆ | 需实现真实后端 |
| 分布式 Tracing | 无 | ★☆☆☆☆ | 需 OTEL SDK 集成 |
| 集中日志 | 无 | ★☆☆☆☆ | 需 ELK/Loki 对接 |
| 告警规则 | 无 | ☆☆☆☆☆ | 需 Alertmanager 等 |
| Dashboard | 无 | ☆☆☆☆☆ | 需 Grafana 面板 |
| SLO/SLI 定义 | 无 | ☆☆☆☆☆ | 需定义关键指标目标 |

### 总体评价

- **接口设计**: ★★★★☆ — Port 抽象完整，`MetricsPort` / `AuditLogPort` / Health 端点都已定义，契约层有 observability 类型
- **实际实现**: ★★☆☆☆ — Metrics 为 NoOp，无分布式追踪，无集中日志，无 Prometheus/Grafana/OTEL 集成
- **最大优势**: Task Queue 的状态快照 + 全链路日志是亮点；Audit Log 覆盖全面；Health/Readiness 探针标准化
- **最大缺口**: 分布式模式下无 trace propagation；`MetricsPort` 全部是空实现；没有 Prometheus / OTEL / 集中日志的任何集成

---

## 9. 改进路径

按优先级排序:

| 优先级 | 项目 | 说明 | 涉及包 |
|---|---|---|---|
| **P0** | 实现 `PrometheusMetricsPort` | 替换 NoOp 实现，暴露 `/metrics` 端点 | `backend-core`, `host-local`, `host-distributed` |
| **P1** | 集成 OpenTelemetry SDK | 实现跨服务 trace propagation (W3C TraceContext)，自动创建 HTTP/DB/Queue span | `server`, `host-distributed`, 各 `service-*` |
| **P2** | 结构化 JSON 日志 + 集中收集 | 标准化日志格式，对接 Loki 或 ELK | `server`, `host-local`, `host-distributed` |
| **P3** | Grafana Dashboard + Alertmanager 告警 | Task Queue 深度、请求延迟 P99、错误率等面板 | 基础设施层 |
| **P4** | SLO/SLI 定义 | 检索延迟、摄入吞吐、审核周转时间等关键指标目标 | 文档 + Dashboard |

**关键优势**: 由于 Port 抽象的存在，接入 Prometheus / OTEL 只需新增适配器实现（如 `PrometheusMetricsPort`、`OtelTracingPort`），不改动任何业务代码。

---

## 10. 服务发现

### 10.1 现状: 环境变量 + 硬编码默认值

当前服务发现机制为**纯环境变量驱动 + localhost 默认值**，无 DNS 发现、无服务注册中心（Consul/etcd）、无 Service Mesh。

```
服务端点解析流程 (service-config.ts):
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   loadServiceConfig('candidate-ingestion')                              │
│     │                                                                   │
│     ├─ ① 读环境变量 TRAPMAP_CANDIDATE_INGESTION_URL                    │
│     │     → 如存在, 直接使用                                           │
│     │                                                                   │
│     └─ ② 回退到 localhost 默认值                                       │
│           → http://localhost:4004                                       │
│                                                                         │
│   默认端口映射 (硬编码):                                                │
│   ┌─────────────────────┬───────┬─────────────────────────────────┐     │
│   │ ServiceName         │ Port  │ 环境变量覆盖                    │     │
│   ├─────────────────────┼───────┼─────────────────────────────────┤     │
│   │ gateway             │ 4000  │ TRAPMAP_GATEWAY_URL             │     │
│   │ identity-access     │ 4001  │ TRAPMAP_IDENTITY_ACCESS_URL     │     │
│   │ knowledge-read      │ 4002  │ TRAPMAP_KNOWLEDGE_READ_URL      │     │
│   │ knowledge-write     │ 4003  │ TRAPMAP_KNOWLEDGE_WRITE_URL     │     │
│   │ candidate-ingestion │ 4004  │ TRAPMAP_CANDIDATE_INGESTION_URL │     │
│   │ governance-review   │ 4005  │ TRAPMAP_GOVERNANCE_REVIEW_URL   │     │
│   │ job-runtime         │ 4006  │ TRAPMAP_JOB_RUNTIME_URL         │     │
│   └─────────────────────┴───────┴─────────────────────────────────┘     │
│                                                                         │
│   自身标识: TRAPMAP_SERVICE_NAME 环境变量                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Gateway 的服务解析方式

```
Gateway (internal-client.ts):
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   createInternalServiceClients(urls: InternalServiceUrls)                │
│                                                                         │
│   urls 来源: loadServiceConfig() 解析出的全部服务 URL 对象              │
│                                                                         │
│   每个客户端方法 = URL 拼接 + fetch():                                  │
│                                                                         │
│   identityAccess.login(body)                                            │
│     → callInternalService(                                              │
│         `${urls.identityAccess}/internal/auth/login`,                    │
│         'POST', body                                                    │
│       )                                                                 │
│                                                                         │
│   callInternalService 内部机制:                                         │
│   ┌───────────────────────────────────────────────────────────────┐     │
│   │  • fetch() API (原生, 无 axios/node-fetch)                    │     │
│   │  • AbortController + 10s 超时 (DEFAULT_INTERNAL_TIMEOUT_MS)   │     │
│   │  • URL 对象构建查询参数                                       │     │
│   │  • 错误标准化: HTTP status → { error, kind } 映射             │     │
│   │     400→bad-request, 401→unauthenticated, 403→forbidden       │     │
│   │     404→not-found, 409→conflict, 503→unavailable, 504→timeout │     │
│   │  • finally 块清理 setTimeout (防泄漏)                         │     │
│   └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
│   内部端点命名: 所有跨服务路由使用 /internal/ 前缀                       │
│   与公开 API 路由物理隔离                                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 10.3 Docker 网络现状

```
docker-compose.yml 网络配置:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   ⚠️ 当前问题:                                                          │
│                                                                         │
│   ① 未定义显式 Docker network → 使用默认 bridge 网络                    │
│   ② 分布式容器未设置 TRAPMAP_*_URL 环境变量                            │
│      → 回退到 localhost 默认值                                          │
│      → 跨容器通信需要 Docker 内部 DNS 名而非 localhost                  │
│      → 这是一个已知 gap, 需要在部署时注入环境变量                       │
│   ③ 未定义 deploy.resources → 无容器级资源限制                          │
│                                                                         │
│   team-monolith profile:                                                │
│     server:4000 (单容器, 无跨服务问题)                                  │
│                                                                         │
│   distributed profile:                                                  │
│     gateway:4000                                                        │
│     candidate-worker  (需 TRAPMAP_CANDIDATE_INGESTION_URL 等注入)       │
│     governance-worker (需 TRAPMAP_GOVERNANCE_REVIEW_URL 等注入)         │
│     outbox-worker     (需 TRAPMAP_JOB_RUNTIME_URL 等注入)               │
│     postgres          (共享)                                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 10.4 服务拓扑模型 (backend-core)

```
topology.ts 定义的逻辑拓扑 (纯描述性, 不参与运行时发现):
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   当前阶段: shared-postgres-phase1                                      │
│                                                                         │
│   5 个逻辑拓扑服务:                                                     │
│     gateway, retrieval, candidate-ingestion, governance, outbox-runtime │
│                                                                         │
│   共享基础设施:                                                         │
│     postgresql, shared-contracts, auth-session-model, queue-outbox      │
│                                                                         │
│   延迟隔离边界 (未实现):                                                │
│     ◇ per-service-database     ← 每服务独立数据库                      │
│     ◇ split-repository-packages ← 每服务独立 Repo 包                   │
│     ◇ service-mesh-event-backbone ← 服务网格事件骨干                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 10.5 服务发现演进路径

| 阶段 | 方案 | 适用规模 | 复杂度 |
|---|---|---|---|
| **当前** | 环境变量 + localhost 默认 | 1-3 节点, 手动部署 | 低 |
| **Phase 1** | Docker Compose 显式网络 + 环境变量注入 | 单机多容器 | 低 |
| **Phase 2** | Docker DNS (Compose 服务名解析) | 单机/小型集群 | 低 |
| **Phase 3** | Kubernetes Service + Headless Service | 多节点, 自动调度 | 中 |
| **Phase 4** | Service Mesh (Istio/Linkerd) + mTLS | 大规模, 零信任网络 | 高 |

**当前优先建议**: Phase 1 — 补全 docker-compose.yml 中分布式容器的环境变量注入与显式网络定义。

---

## 11. 内存管理

### 11.1 数据库连接池

```
分布式模式 (host-distributed/src/shared/database.ts):
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   createServiceDatabase(config) → pg.Pool                               │
│                                                                         │
│   DEFAULT_POOL_CONFIG:                                                  │
│     max: 10                        ← 默认上限                           │
│     idleTimeoutMillis: 30000       ← 30s 空闲回收                       │
│     connectionTimeoutMillis: 5000  ← 5s 连接超时                        │
│                                                                         │
│   实际生效: config.poolSize (默认 5, 覆盖 max:10)                       │
│                                                                         │
│   每个 Worker 独立连接池, 共享同一个 PostgreSQL 实例                     │
│   6 个服务 × 5 连接 = 最多 30 个并发连接                                │
│                                                                         │
│   错误处理: pool.on('error') → 日志记录 (不崩溃)                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

单体模式 (server/src/lib/persistence/postgres-store.ts):
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   PostgresStore 接收外部 pool                                           │
│                                                                         │
│   transactWithPgClient(fn):                                             │
│     pool.connect() → client                                             │
│     BEGIN → fn(client) → COMMIT (失败则 ROLLBACK)                       │
│     finally → client.release()       ← 保证释放                         │
│                                                                         │
│   行级锁: FOR UPDATE 防止并发冲突                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 11.2 缓存体系

项目有一套**纯 TypeScript LRU+TTL 缓存系统**，无外部依赖 (无 Redis / Memcached)。

```
核心: RetrievalCache<V> (server/src/lib/cache/retrieval-cache.ts)
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   基于 Map + V8 插入序保证的手动 LRU:                                   │
│                                                                         │
│   ┌───────────────────────────────────────────────────────────────┐     │
│   │  get(key):                                                    │     │
│   │    ① 查找 entry                                               │     │
│   │    ② 检查 TTL → 过期则删除返回 undefined (惰性过期)           │     │
│   │    ③ LRU 提升: delete + set (移到 Map 末尾)                   │     │
│   │    ④ 更新 hit 计数                                            │     │
│   │                                                               │     │
│   │  set(key, value):                                             │     │
│   │    ① 容量已满 → 删除 Map.first (最久未使用)                   │     │
│   │    ② 插入新 entry (时间戳 + 值)                               │     │
│   │    ③ 更新 eviction 计数                                       │     │
│   │                                                               │     │
│   │  默认: maxSize=200, ttlMs=30min                               │     │
│   │  无后台定时器, 纯惰性过期                                     │     │
│   │  WeakRef + FinalizationRegistry 注册实例 (不阻止 GC)          │     │
│   └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
│   统计: hits, misses, evictions, invalidations (per namespace)          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 11.3 缓存实例分布

```
┌──────────────────────────────────────────────────────────────────────────┐
│  缓存实例                    │ maxSize │ TTL    │ 用途                    │
├──────────────────────────────┼─────────┼────────┼────────────────────────┤
│  LLM Extraction Cache (×2)  │  300    │ 60 min │ 图抽取 phase1/phase2    │
│  (graph-lite/llm-cache.ts)  │         │        │ SHA-256(text+prompt)   │
├──────────────────────────────┼─────────┼────────┼────────────────────────┤
│  Intent Cache                │  200    │ 30 min │ 检索意图识别            │
│  (retrieval/capsules/)       │         │        │ 监听 invalidation 事件 │
├──────────────────────────────┼─────────┼────────┼────────────────────────┤
│  Query Embedding Cache       │  300    │ 20 min │ 查询向量缓存            │
│  (cache/query-embedding-*)   │         │        │ 归一化后的嵌入          │
├──────────────────────────────┼─────────┼────────┼────────────────────────┤
│  Read Model Cache            │  1      │ 60 sec │ 全局检索读模型          │
│  (cache/retrieval-read-*)    │         │        │ 单条目短生命周期        │
└──────────────────────────────┴─────────┴────────┴────────────────────────┘

总内存估算 (峰值):
  (300×2 + 200 + 300 + 1) × ~2KB/entry ≈ ~2.2 MB
  + LLM cache 条目较大 (~10KB) → 实际约 6-8 MB
  占比极低, 不构成内存压力
```

### 11.4 缓存失效机制

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Cache Invalidation (server/src/lib/cache/invalidation.ts)              │
│                                                                         │
│  架构: 进程内 pub/sub (Set<CacheInvalidationListener>)                  │
│                                                                         │
│  失效事件结构:                                                          │
│  {                                                                      │
│    sourceType,       ← 知识条目/候选/标签                               │
│    sourceId,         ← 具体条目 ID                                     │
│    reason,           ← approved | deactivated |                         │
│                        remediation-suppressed |                         │
│                        remediation-reactivated                          │
│    owner,            ← 拥有者标识                                       │
│    trigger           ← outbox-subscriber | shared-job |                 │
│                        write-through-fallback | operator-request        │
│  }                                                                      │
│                                                                         │
│  Freshness 追踪:                                                        │
│    • 每个 namespace 独立 freshness 状态                                 │
│    • pendingInvalidation 标志 + 时间戳                                  │
│    • 显式建模最终一致性: semantics: 'eventual-consistency'              │
│                                                                         │
│  流程:                                                                  │
│    emitCacheInvalidation(event)                                         │
│      → 遍历该 namespace 的所有 registered listeners                     │
│      → 每个 listener 执行自己的清除逻辑                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 11.5 进程内存与资源隔离

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   Node.js V8 堆:                                                       │
│   ┌───────────────────────────────────────────────────────────────┐     │
│   │  • 无 --max-old-space-size 设置                               │     │
│   │  • 无 NODE_OPTIONS 环境变量                                   │     │
│   │  • Docker 容器无 mem_limit / cpus / deploy.resources          │     │
│   │  • V8 默认堆上限: ~1.7GB (64位系统)                           │     │
│   └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
│   Worker 进程模型:                                                      │
│   ┌───────────────────────────────────────────────────────────────┐     │
│   │  • 无 cluster / worker_threads / child_process                │     │
│   │  • 任务 Worker 运行在同一 Node.js 进程内                      │     │
│   │  • 轮询模型: pollIntervalMs=1000, concurrency=1               │     │
│   │  • 分布式模式: 每服务一个 OS 进程 (--service 标志)            │     │
│   │    → 进程级内存隔离自然达成                                   │     │
│   │  • 单体模式: 所有 Worker 共享同一进程                         │     │
│   │    → concurrency=1 限制了内存压力                             │     │
│   └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
│   资源清理模式:                                                         │
│   ┌───────────────────────────────────────────────────────────────┐     │
│   │  • internal-client: AbortController + finally clearTimeout    │     │
│   │  • RabbitMQ: stop() → cancel consumer + close channel + conn  │     │
│   │  • PostgresStore: close() 有 closed 守卫 (防双重关闭)         │     │
│   │  • pg.Pool: connect/release 在 finally 块中 (防泄漏)          │     │
│   └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 11.6 内存管理改进建议

| 优先级 | 项目 | 说明 |
|---|---|---|
| **P0** | Docker 容器资源限制 | 添加 `deploy.resources.limits` (memory/cpus) 防止单容器 OOM 影响宿主 |
| **P1** | NODE_OPTIONS 堆限制 | 按服务角色设置 `--max-old-space-size` (如 Gateway 512MB, Worker 1GB) |
| **P2** | 缓存内存预算 | 为 `RetrievalCache` 添加全局内存字节上限 (当前仅按条目数限制) |
| **P3** | 外部缓存层 | 评估引入 Redis 的时机 (跨进程共享缓存 / 分布式模式下缓存一致性) |
| **P4** | 堆快照监控 | 在生产容器中启用 `--heapsnapshot-signal` 或 `v8.writeHeapSnapshot()` |

---

## 12. RPC 引入路径

### 12.1 现状: 手写 HTTP/JSON "RPC"

当前项目**不使用任何标准 RPC 框架** (无 gRPC / tRPC / JSON-RPC / Protocol Buffers)。跨服务通信是基于原生 `fetch()` 的手写 HTTP/JSON 层，但结构上已经是 RPC 形态:

```
现有 InternalServiceClient 的 RPC 特征:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   ① 强类型服务客户端                                                    │
│      InternalServiceClients 定义每个服务的 typed methods                │
│      identityAccess.login(body): Promise<ServiceResponse>               │
│      knowledgeRead.search(params): Promise<ServiceResponse>             │
│      jobRuntime.schedule(task): Promise<ServiceResponse>                │
│                                                                         │
│   ② 统一请求/响应信封                                                  │
│      请求: { method, url, body?, query? }                               │
│      响应: { status: number, body: unknown }                            │
│                                                                         │
│   ③ 标准化错误码                                                        │
│      HTTP status → { error: string, kind: string }                      │
│      类似 gRPC status code 的错误分类                                  │
│                                                                         │
│   ④ /internal/ 命名空间隔离                                            │
│      内部服务路由与公开 API 路由物理分离                                │
│                                                                         │
│   ⑤ 传输层: HTTP/1.1 + JSON                                            │
│      无 HTTP/2 多路复用                                                 │
│      无二进制序列化                                                     │
│      无连接池 (每次 fetch 独立连接)                                     │
│      无代码生成                                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 12.2 引入 RPC 的候选方案对比

```
┌─────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
│             │ gRPC         │ Connect RPC  │ tRPC         │ 保持现状     │
│             │              │ (bufbuild)   │ (TypeScript) │ + 优化       │
├─────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ 协议        │ HTTP/2       │ HTTP/1.1+2   │ HTTP/1.1     │ HTTP/1.1     │
│             │              │ +gRPC-web    │ (fetch)      │ (fetch)      │
├─────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ 序列化      │ Protobuf     │ Protobuf     │ JSON         │ JSON         │
│             │ (二进制)      │ (二进制)      │ (SuperJSON)  │              │
├─────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ 代码生成    │ 需要         │ 需要         │ 不需要       │ 不需要       │
│             │ .proto → TS  │ .proto → TS  │ (类型推导)    │              │
├─────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ TypeScript  │ 差 (需额外   │ 好           │ 极佳         │ 好           │
│ 原生体验    │ 工具链)      │              │ (端到端类型)  │ (手动维护)   │
├─────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ 流式        │ 原生支持     │ 原生支持     │ 支持         │ 不支持       │
│             │ 双向流       │              │ (SSE/WS)     │              │
├─────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ 浏览器兼容  │ 需 gRPC-web  │ 原生         │ 原生         │ 原生         │
├─────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ 与现有代码  │ 高 (需重写   │ 中 (需重写   │ 低 (可渐进   │ 零           │
│ 迁移成本    │ 路由层)      │ 路由层)      │ 替换)        │              │
├─────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ 生态成熟度  │ 极高         │ 高           │ 高           │ N/A          │
├─────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ 性能 (相对) │ ★★★★★       │ ★★★★☆       │ ★★★☆☆       │ ★★☆☆☆       │
│             │ 二进制+多路复用│ 二进制       │ JSON         │ JSON+无连接池│
└─────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
```

### 12.3 推荐方案: 渐进式引入 Connect RPC 或 tRPC

```
决策树:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   是否需要流式传输 (streaming)?                                         │
│     ├─ 是 → Connect RPC (兼顾浏览器 + Node, HTTP/1.1+2)                │
│     └─ 否 →                                                          │
│         │                                                               │
│         是否需要零代码生成?                                             │
│           ├─ 是 → tRPC (纯 TypeScript, 端到端类型安全)                  │
│           └─ 否 → Connect RPC (更通用, 更高性能)                       │
│                                                                         │
│   两个方案都支持渐进引入: 可以逐个服务替换, 不需要一次性迁移            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 12.4 渐进引入路线图

```
Phase 0: 优化现有 HTTP/JSON 层 (不引入新框架)
───────────────────────────────────────────────────────────────────────────
┌─────────────────────────────────────────────────────────────────────────┐
│  • 引入 HTTP/1.1 连接池 (undici Agent / http.Agent keepAlive)          │
│  • 统一 /internal/ 路由的 OpenAPI schema 生成                          │
│  • 从 contracts 包自动生成 client stub (消除 internal-client 手写)     │
│  • 添加请求/响应 middleware (超时、重试、熔断)                          │
│  预估工期: 1-2 周                                                       │
└─────────────────────────────────────────────────────────────────────────┘
         │
         ▼
Phase 1: 引入 tRPC (首选, 如果不需要 streaming)
───────────────────────────────────────────────────────────────────────────
┌─────────────────────────────────────────────────────────────────────────┐
│  前提: contracts 已有完整 Zod schemas                                    │
│                                                                         │
│  ① 在 backend-core 定义 tRPC router (每个 bounded context 一个)         │
│     → 复用现有 Zod schemas 作为 input/output 验证                       │
│     → 复用现有 use-case 函数作为 resolver                               │
│                                                                         │
│  ② Gateway 注册 tRPC HTTP handler (替代 internal-client 手写)          │
│     → @trpc/server/adapters/fastify                                     │
│                                                                         │
│  ③ Worker 暴露 tRPC endpoint                                           │
│     → 每个 service-* 包添加 tRPC adapter                               │
│                                                                         │
│  ④ Gateway → Worker 通信切换为 tRPC client                             │
│     → @trpc/client → 自动类型安全                                      │
│                                                                         │
│  迁移策略: 逐服务替换, 旧 fetch client 与新 tRPC client 并存           │
│  预估工期: 2-3 周                                                       │
└─────────────────────────────────────────────────────────────────────────┘
         │
         ▼
Phase 2: 引入 Connect RPC (如果需要 streaming 或跨语言)
───────────────────────────────────────────────────────────────────────────
┌─────────────────────────────────────────────────────────────────────────┐
│  前提: 有流式检索 / 实时通知 / 跨语言客户端 需求                        │
│                                                                         │
│  ① 定义 .proto 文件 (从现有 Zod schema 提取)                           │
│     → buf.yaml + buf.gen.yaml 配置                                      │
│     → buf generate 生成 TypeScript stubs                                │
│                                                                         │
│  ② 实现 Connect 服务端 (Node.js Fastify plugin)                        │
│     → @connectrpc/connect-fastify                                       │
│                                                                         │
│  ③ 客户端迁移                                                          │
│     → @connectrpc/connect-web (浏览器)                                  │
│     → @connectrpc/connect-node (服务间)                                 │
│                                                                         │
│  ④ 渐进迁移: Connect 与 JSON HTTP 并存                                 │
│     → 每个 bounded context 独立迁移                                     │
│                                                                         │
│  预估工期: 3-4 周                                                       │
└─────────────────────────────────────────────────────────────────────────┘
         │
         ▼
Phase 3: 高级特性 (按需)
───────────────────────────────────────────────────────────────────────────
┌─────────────────────────────────────────────────────────────────────────┐
│  • 双向流: 实时检索结果推送、审核通知                                   │
│  • mTLS: 服务间 TLS 互信 (配合 Service Mesh)                           │
│  • 负载均衡: 客户端侧 LB (如 gRPC 的 pick-first / round-robin)        │
│  • 反压控制: 流式场景的背压机制                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### 12.5 RPC 引入对现有架构的影响

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   需要修改的层:                                                         │
│                                                                         │
│   service-* 包 (routes.ts)                                              │
│     当前: Fastify route registration                                    │
│     变更: 注册 tRPC/Connect handler (或两者并存)                        │
│     影响: 低 — 路由层薄, 只做请求分发                                   │
│                                                                         │
│   host-distributed (internal-client.ts)                                 │
│     当前: 手写 fetch 调用                                               │
│     变更: 替换为 tRPC client / Connect client                           │
│     影响: 中 — 需要逐方法迁移                                          │
│                                                                         │
│   contracts 包                                                          │
│     当前: Zod schemas                                                   │
│     变更: tRPC 直接复用; Connect 需要 proto + 生成                     │
│     影响: 低 (tRPC) / 高 (Connect)                                     │
│                                                                         │
│                                                                         │
│   不需要修改的层:                                                       │
│                                                                         │
│   ✦ backend-core (use-cases, ports) — 完全不受影响                     │
│   ✦ host-local (单体模式) — 进程内直接调用, 不经过 HTTP               │
│   ✦ 数据库层 — 持久化与传输协议解耦                                    │
│   ✦ 缓存层 — 纯进程内, 与 RPC 无关                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 12.6 异步任务传输的 RPC 定位

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   同步 RPC (HTTP)          vs    异步 RPC (Queue)                       │
│                                                                         │
│   Gateway → Worker                任何 → Task Worker                    │
│   请求/响应                       火后即忘 / 延迟响应                    │
│   当前: fetch()                   当前: PG SKIP LOCKED / RabbitMQ       │
│   演进: tRPC/Connect              演进: 保持不变 (已足够成熟)           │
│                                                                         │
│   异步传输已经有成熟的抽象层:                                           │
│   ┌───────────────────────────────────────────────────────────────┐     │
│   │  AsyncTransport 接口                                          │     │
│   │    ├─ PostgresTaskQueue (默认, SKIP LOCKED)                   │     │
│   │    └─ RabbitmqTaskQueue (可选, amqplib)                       │     │
│   │                                                               │     │
│   │  支持: 优先级 / 指数退避重试 / 死信队列 / 去重键              │     │
│   │        租约心跳 / 过期回收 / 手动 ack-nack                    │     │
│   └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
│   结论: 异步传输层无需引入 RPC 框架, 保持现有 Queue 抽象即可           │
│   RPC 引入范围仅限同步请求/响应通信 (Gateway ↔ Worker)                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 附录: 全部 Port 接口一览

### Repository Ports (`repo-ports.ts`)

| Port | 职责 |
|---|---|
| `KnowledgeRepositoryPort` | CRUD、生命周期转换、版本修订、嵌入缓存、supersede |
| `CandidateRepositoryPort` | insert、getById、updateStatus、attachAnalysis/DuplicateCase/ManualResult、listByStatus、markResolved、findByFingerprint |
| `SessionRepositoryPort` | create、getByTokenHash、deleteByTokenHash、updateActiveTeam |
| `AccessKeyRepositoryPort` | insert、getByTokenHash、getById、revoke、listByMember |
| `TeamRepositoryPort` | insert、getById、getBySlug、listAll、update |
| `MembershipRepositoryPort` | insert、getById、findByUserAndTeam、listByUser、listByTeam、update |
| `UserRepositoryPort` | insert、getById、getByHandle、update |
| `FeedbackRepositoryPort` | insert、getById、listByEntry、listByStatus、listByFilter、update |
| `AuditRepositoryPort` | nextId、insert、getById、listByFilter |

### Internal Ports (`internal-ports.ts`)

| Port | 职责 |
|---|---|
| `IdentityAccessPort` | login、logout、validateSession、selectTeam、createTeam、listTeams、addMember、updateMember、provisionAccessKey |
| `KnowledgeReadPort` | getById、listMine、search、getProjectionStatus |
| `KnowledgeWritePort` | submit、updateEntry、resubmit、supersede、createTrap、approveReviewDecision、rejectReviewDecision、applyMaintenanceDecision、applyDecayDecision、publishCandidateResult、listTraps、getTrap |
| `CandidateIngestionPort` | submit、getById、listByStatus、applyResolution、submitManualResult、publishCandidateResult |
| `GovernanceReviewPort` | approve、reject、applyMaintenance、applyDecay、reviewArtifact、submitFeedback |
| `JobRuntimePort` | schedule、getStatus、getQueueStatus |

### Actor Ports (`actor-ports.ts`)

| Port | 职责 |
|---|---|
| `SessionLookupPort` | resolveSession(sessionToken) → ResolvedSession |
| `TeamLookupPort` | getTeam(teamId)、listTeamsForUser(userId) |
| `PermissionCheckPort` | resolvePermissions(userId, teamId)、hasPermission(userId, teamId, permission) |

### Queue Ports (`queue-ports.ts`)

| Port | 职责 |
|---|---|
| `TaskQueuePort` | enqueue、requeue、getStatusSnapshot、createConsumer |
| `OutboxPort` | enqueue、claimBatch、complete、fail、getStatusSnapshot |
| `WorkflowEnginePort` | start、getStatus、cancel |

### Retrieval Ports (`retrieval-ports.ts`)

| Port | 职责 |
|---|---|
| `RetrievalQueryPort` | search(params)、plan?(params) |
| `ReadModelProjectionPort<TQuery, TResult>` | query、refresh? |
| `KnowledgeReadProjectionPort<TEntry>` | getById、listMine、getStatus |

### Audit Ports (`audit-ports.ts`)

| Port | 职责 |
|---|---|
| `AuditLogPort` | record(entry)、query(filter) |
| `MetricsPort` | incrementCounter、recordDuration、recordGauge |
