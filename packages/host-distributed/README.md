# TrapMap Host-Distributed

TrapMap 的分布式宿主装配层，负责 `gateway` 与六个服务入口的进程启动、运行时装配和内部传输接线。每个限界上下文模块都可以作为独立服务运行。

## 架构

```
┌─────────────┐
│   Gateway    │  ← 外部 API 入口
│  (port 4000) │
└──────┬───────┘
       │ HTTP
       ├─────────────────────────────────────────────────────────┐
       │                                                         │
       ▼                                                         ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Identity-Access  │  │ Knowledge-Read   │  │ Knowledge-Write  │
│   (port 4001)    │  │   (port 4002)    │  │   (port 4003)    │
└──────────────────┘  └──────────────────┘  └──────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Candidate-       │  │ Review           │  │ Job-Runtime      │
│ Ingestion        │  │ (deploy dir:     │  │                  │
│   (port 4004)    │  │ governance-review)│ │   (port 4006)    │
│                  │  │   (port 4005)    │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

## 服务列表

| 服务 | 端口 | 职责 |
|---------|------|------|
| gateway | 4000 | 外部 API、请求路由 |
| identity-access | 4001 | 认证、会话、权限、成员管理 |
| knowledge-read | 4002 | 检索查询、读模型访问 |
| knowledge-write | 4003 | 知识/陷阱生命周期命令 |
| candidate-ingestion | 4004 | 候选接收入口、去重、处理 |
| governance-review | 4005 | `review` 服务部署目录；评审工作流、反馈队列、治理命令 |
| job-runtime | 4006 | 任务队列、工作流运行、outbox |

## 快速开始

### 启动全部服务

```bash
# 需要 PostgreSQL，并设置 DATABASE_URL 或 TRAPMAP_DATABASE_URL
pnpm start
```

### 启动单个服务

```bash
pnpm start:gateway
pnpm start:identity-access
pnpm start:knowledge-read
# ... 等等
```

### 开发模式

```bash
pnpm dev
pnpm dev:gateway
pnpm dev:candidate-ingestion
```

## 配置

环境变量：

| 变量 | 默认值 | 说明 |
|----------|---------|-------------|
| `DATABASE_URL` | - | PostgreSQL 连接 URL |
| `TRAPMAP_DATABASE_URL` | - | 兼容旧版的共享 PostgreSQL URL |
| `TRAPMAP_SERVICE_DATABASE_URL` | - | 每服务独立数据库 URL（覆盖 DATABASE_URL） |
| `TRAPMAP_SERVICE_NAME` | - | 服务名称（运行单个服务时使用） |
| `TRAPMAP_SERVICE_PORT` | - | 服务端口（覆盖默认值） |
| `TRAPMAP_LOG_LEVEL` | `info` | 日志级别 |
| `TRAPMAP_SERVICE_POOL_SIZE` | `5` | 分布式服务共享 PostgreSQL 连接池预算 |
| `TRAPMAP_<SERVICE>_POOL_SIZE` | 未设置 | 每服务连接池预算覆盖，例如 `TRAPMAP_JOB_RUNTIME_POOL_SIZE=12` |
| `TRAPMAP_GATEWAY_URL` | 本地 `http://localhost:4000`，`distributed` 模式下 `http://gateway:4000` | Gateway 内部 URL |
| `TRAPMAP_IDENTITY_ACCESS_URL` | 本地 `http://localhost:4001`，`distributed` 模式下 `http://identity-access:4001` | Identity-access 内部 URL |
| `TRAPMAP_KNOWLEDGE_READ_URL` | 本地 `http://localhost:4002`，`distributed` 模式下 `http://knowledge-read:4002` | Knowledge-read 内部 URL |
| `TRAPMAP_KNOWLEDGE_WRITE_URL` | 本地 `http://localhost:4003`，`distributed` 模式下 `http://knowledge-write:4003` | Knowledge-write 内部 URL |
| `TRAPMAP_CANDIDATE_INGESTION_URL` | 本地 `http://localhost:4004`，`distributed` 模式下 `http://candidate-worker:4004` | Candidate-ingestion 内部 URL |
| `TRAPMAP_GOVERNANCE_REVIEW_URL` | 本地 `http://localhost:4005`，`distributed` 模式下 `http://governance-worker:4005` | Review 服务内部 URL（部署目录仍为 `governance-review`） |
| `TRAPMAP_JOB_RUNTIME_URL` | 本地 `http://localhost:4006`，`distributed` 模式下 `http://outbox-worker:4006` | Job-runtime 内部 URL |

`packages/host-distributed/src/config/service-config.ts` 是这些默认值的拥有方，负责解析：

- `distributed` profile -> 共享 compose 网络上的 Docker DNS 默认值
- 其他 profile / 本地开发 -> `localhost` 默认值
- 显式 `TRAPMAP_*_URL` 环境变量 -> 最高优先级覆盖
- 分布式数据库连接池预算由 `TRAPMAP_SERVICE_POOL_SIZE` 控制，可通过 `TRAPMAP_<SERVICE>_POOL_SIZE` 按服务覆盖

## 设计原则

1. **服务隔离**：每个服务独立运行，拥有自己的数据库连接池
2. **仅 Gateway 暴露外部访问**：只有 gateway 对外暴露公共 API 端点
3. **基于 HTTP 的服务间通信**：服务通过内部 HTTP 端点相互调用
4. **复用 backend-core**：所有服务使用 `@trapmap/backend-core` 模块
5. **按业务事实归属**：`review` 负责决策，`knowledge-write` 负责最终知识写入，`candidate-ingestion` 通过 `knowledge-write` 发布，`job-runtime` 仅负责传输/运行时编排

## 就绪状态说明

- `test:acceptance` 现已涵盖真实内部 HTTP 跳转测试和多进程运行时收尾，包括 gateway -> candidate-ingestion -> knowledge-write、gateway -> governance-review -> knowledge-write、以及 gateway -> job-runtime。
- `knowledge-read` 现已在 `/internal/knowledge-read/projection-status` 暴露显式的投影/新鲜度契约，gateway 在 `/v1/knowledge/projection-status` 上转发。
- `packages/host-distributed` 当前覆盖 `gateway + 六个服务入口` 的分布式宿主装配；其中 `knowledge-read` 的权威读服务装配和路由契约位于 `packages/service-knowledge-read`。
- 当前 `knowledge-read` 的底层模型仍使用共享的权威 PostgreSQL 存储投影状态契约暴露的临时直读条目。检索/搜索/查询追踪仍为派生的读侧状态。这足以满足边界清晰度要求，但尚未实现独立的派生存储隔离。
- 物理微服务拆分不再受阻于缺失的多进程写路径证明；目前仍受阻于 `eval:smoke` 收尾和读侧 Phase 2 成熟度，而非路由归属声明本身。

## Phase 3 成熟度收尾：`knowledge-write + governance-review`

`knowledge-write` 和 `governance-review` 是本 host 中首个成熟的服务样本，作为后续服务的参考模板。

### 冻结的归属边界

- `governance-review` 负责治理命令、反馈以及修复/维护/衰减工作台流程。它**不**负责最终知识聚合变更。
- `knowledge-write` 负责最终知识聚合变更、生命周期规则和权威写入事实。它接受来自 `governance-review` 和 `candidate-ingestion` 的委托。
- `gateway` 仅负责外部传输、认证、请求/追踪传播和规范错误映射。

### 同步/异步边界

- **同步**：治理命令接收、资格检查、流程解析、审计（`governance-review`）；最终聚合变更（`knowledge-write`）。
- **异步**：后续操作（投影刷新、工件跟进、修复草稿、outbox 分发）进入 outbox/队列/工作流，不再返回同步路径。

### 命令/事件契约

- `governance-review -> knowledge-write`：`approveReviewDecision`、`rejectReviewDecision`、`applyMaintenanceDecision`、`applyDecayDecision`。
- `candidate-ingestion -> knowledge-write`：`publishCandidateResult`。
- 变更后事件使用 `packages/contracts/src/domain/async.ts` 中的规范事件目录。

### 失败语义

- `403 forbidden` / `404 not-found` / `409 conflict` / `503 unavailable` / `504 timeout` 在 gateway、`governance-review` 和 `knowledge-write` 之间保持相同含义。
- `401` 仍属于 gateway/认证传输层关注点，不进入跨归属的失败语义。
- 幂等重放重放相同的命令契约；outbox 重放相同的规范事件。

### 健康检查 / 就绪检查 / 归属声明

- `GET /internal/health` - 存活检查，包含归属声明（两个服务均有）
- `GET /internal/readiness` - 依赖可达性检查，附带运维面向的后续处置（两个服务均有）
- `GET /internal/ownership` - 完整的静态归属声明（两个服务均有）

### 共享 PostgreSQL（过渡期）

两个服务继续共享同一个 PostgreSQL 实例，但使用显式的表归属。`governance-review` 不将知识聚合表作为其默认写入面，`knowledge-write` 也不将评审队列/反馈表作为其写入面。

### 保留的例外

- **命名查询接缝**：`governance-review` 仅能通过文档化的查询接缝或只读投影读取知识摘要。
- **共享实例**：共享 PostgreSQL 实例继续存在；关闭条件记录在 [`docs/archived/archived-plans/nestjs-service-evolution-04-data-runtime-and-cutover-archived.md`](../../docs/archived/archived-plans/nestjs-service-evolution-04-data-runtime-and-cutover-archived.md) 中。

### 验证

- `rtk pnpm test:distributed-acceptance` - 多进程委托、错误分类、请求/追踪传播、幂等重放
- `rtk pnpm test:runtime-closeout:compose` - 临时 Compose 内只启动 PostgreSQL、gateway 和六个内部服务；自动生成管理员密钥和 gateway 空闲端口，重启单个 `knowledge-write`，要求 job-runtime operator surface 持续可用且 gateway 委托在 60 秒内恢复。脚本总会清理容器与 volumes；该本地隔离证据不改变 `Level 2 / transitional-microservice` 成熟度。
- `rtk pnpm test:deployment-smoke` - 服务启动、健康/就绪检查、归属端点
- `rtk pnpm typecheck`
