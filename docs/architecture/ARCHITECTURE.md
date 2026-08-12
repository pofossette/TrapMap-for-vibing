# TrapMap 架构

> 权威的事实来源和防漂移守卫规则见 [SYSTEM_TRUTH_SOURCES.md](../reference/SYSTEM_TRUTH_SOURCES.md)。

> **历史说明**：`packages/server（Wave-10 已删除）` 已于 Wave-10 删除（提交 `a66d94e6`）。本页中保留的 `packages/server（Wave-10 已删除）` 结构说明描述的是删除前的架构，概念上仍然适用但路径已不存在。当前架构由 `host-local` / `host-distributed` 宿主层和六个 service owner 包组成。详见 `docs/archived/archived-plans/compatibility-shell-retirement-runtime-infra-ownership.md`。

## 系统架构

> 当前正式运行入口是 `packages/host-local`（light）与 `packages/host-distributed`（heavy）。各 service owner 包通过 owner-local PostgreSQL bundle 管理数据。

Phase 0 目标架构冻结补充事实：

- 唯一长期后端主线固定为 `Nest host + framework-free domain core + gradual service extraction`。
- 当前默认实现已经切到 `packages/host-local/src/nest/**`；`packages/server（Wave-10 已删除）` 只保留 Fastify compatibility shell 与 shared runtime/status seam，不再是默认宿主主线。宿主替换的是 host/transport/DI，而不是 `backend-core`、`contracts` 或 service owner contract。
- 运行模型固定为 `embedded/local-agent -> team-monolith -> distributed` 三档；`embedded` 是当前 `local-agent` 的长期产品语义，不新增第四种 profile。
- gateway 继续是宿主拥有的统一外部适配层，而不是当前主线里的 `service-gateway` package 前提。
- 当前 `distributed` 成熟度冻结为 `Level 2 / transitional-microservice`。

Phase 1 边界收敛补充事实：

- 架构边界的自动化守护和 zone 规则详见 [BOUNDARIES.md](BOUNDARIES.md)。
- `packages/server（Wave-10 已删除）` 当前是 compatibility shell 与 runtime/status surface。它仍是 partial compatibility shell：maintenance/decay 写路径已降级为 compatibility-only；candidate/review legacy 写路径已经删除。
- `packages/backend-core` 当前承载 command/use-case/port 模式与内核契约，是后续收敛目标，不是允许与 `packages/server（Wave-10 已删除）` 平行增长的第二主实现面。
- `packages/host-local` 与 `packages/host-distributed` 当前承载宿主装配、HTTP/worker transport 和 concrete port wiring；它们消费 `backend-core` 契约，不重新定义业务真相。
- `packages/host-distributed` 当前承载 distributed 形态下的 authoritative candidate resolution、review decision、maintenance batch 与 decay batch 写编排。

Phase 1 Nest 宿主试点补充事实：

- 当前默认 `light` 主线已经固定为 `gateway + 六个 bounded-context module`，统一注册在 `packages/host-local/src/nest/app.module.ts`，全部经 `createNestAdapter` 消费各 service 包的 `create<X>RouteDefs`。
- Nest 代码落点固定在 `packages/host-local/src/nest/`，目录职责包括：`gateway/`（外部 controller，消费网关 RouteDef）、六个 bounded-context module、`adapters/`（in-process / remote provider factory）、`config/`（ConfigModule bridge）、`runtime/`（request context、exception filter、validation pipe、auth guard、logging middleware）。
- Nest controller 不重写业务逻辑，只注入 `backend-core` Port 或 service-assembly factory。
- 异常映射统一为 canonical envelope：`code`、`message`、`kind`、`requestId`、`traceId?`、`details?`；兼容窗口内保留 `error` 作为 `message` 别名。
- `401` 停留在 guard 层，不扩写进 `InvocationErrorKind`。
- Nest 宿主现已是默认 `light` 主线，通过 `pnpm dev:local-agent`、`pnpm dev:team-monolith` 或 `pnpm --filter @trapmap/host-local dev` 启动；旧 Fastify 入口已删除。

Phase 2 modular-monolith cutover 补充事实：

- 六个 bounded context 固定为 `identity-access`、`knowledge-read`、`knowledge-write`、`governance-review`、`candidate-ingestion`、`job-runtime`；`gateway` 继续只是宿主拥有的 transport shell。
- `backend-core` 已经按这六个 context 落地 `src/<context>/{domain,application,module.ts,index.ts}`；`src/modules/*.ts` 在迁移窗口内退化为对 `<context>/index.ts` 的 compatibility re-export。`backend-core` 必须继续承担 framework-free 的 `ports`、`invocation`、`runtime capability/topology`、testing utilities，以及各 context 的 `domain/application/module` factory；PG/MQ concrete 细节不得进入这里。Nest/Fastify 框架导入是 2026-08 统一后的唯一例外（测试接缝 `src/testing/` 除外），只允许集中在 `src/http/adapters/{nest.ts,fastify.ts}`（RouteDef 双 adapter）。
- `embedded/local-agent` 与 `team-monolith` 在 Phase 2 以后共用同一个 `packages/host-local/src/nest/app.module.ts` 和同一套 bounded-context module graph；profile 差异只允许出现在 capability、provider wiring 和 route surface gating。当前六个 bounded-context Nest module 已经全部在 `app.module.ts` 注册。
- `packages/server（Wave-10 已删除）` 只保留 compatibility shell 与 runtime/status；`packages/host-distributed` 保留为 distributed 的部署展开层，但不拥有第二套业务真相。
- `packages/service-*` 包继续保留，但只作为 distributed internal transport / process entry thin assembly；业务 owner 仍以 `backend-core` module 和本文档定义的边界为准。

Phase 2 异步 contract 补充事实：

- `packages/contracts/src/domain/async.ts` 冻结 async event / shared job 的 idempotency key、retry policy、dead-letter meaning 和 operator action catalog。
- `packages/contracts/src/domain/operations.ts` + `packages/server（Wave-10 已删除）/src/routes/operations/status.ts` 共同定义 operator-visible async runtime contract：runtime mode semantics、freshness / projection lag contract、failure taxonomy、idempotency contract、retry / reclaim / resume contract。
- `workflow_runs.stats` 是当前长任务 checkpoint / resume 的权威持久化 surface；bulk path 在进入 Phase 3 之前，不应再额外发明第二套 checkpoint 记录面。

Phase 3 operator / config / capacity 补充事实：

- `packages/server（Wave-10 已删除）/src/routes/operations/status.ts` 继续作为 operator truth surface，并在 Phase 2 contract 之上加厚 `operatorHome`、`configGovernance`、`capacityModel` 与 `bulkOperations`。
- `packages/server（Wave-10 已删除）/src/config.ts` 现在提供 config governance summary：fingerprint、deprecated env、conflict warning 与 profile-aware capability summary。
- `packages/server（Wave-10 已删除）/src/routes/operations/stats.ts` 继续承担系统级 summary，并额外暴露 namespace 级 cache invalidation / pending invalidation 视角，作为 capacity modeling 的基础观测入口。

Phase 4 closeout 补充事实：

- `capacityModel.databasePool.maxConnections` 当前仍是保守扩展位，不是正式 runtime/driver introspection contract；当前权威语义是“是否配置数据库池 + 可为空的扩展位 shape”。
- 默认 operator surface 明确保留高层容量摘要，不把热点 `team/query/artifact` 明细纳入默认首页；热点分析如有需要，应作为后续 deep drill-down 能力单独设计。
- 上述两项都不阻塞后端工程化总计划 closeout。

Phase 5 六服务 ownership 冻结补充事实：

- 逻辑服务边界按最终业务真相 ownership 划分，不按请求入口划分。
- `knowledge-write` 拥有 knowledge/trap/evidence 写模型真相，包括审核后的最终状态变更、maintenance/decay 结果落地，以及 candidate result publish 的最终聚合写入。
- `review` 拥有人工治理流程：review queue、审核决策、治理资格校验、feedback 闭环、maintenance/decay/operator 命令；它不直接写 knowledge 主聚合，必须通过 `KnowledgeWritePort` 委托最终聚合更新。
- `candidate-ingestion` 拥有候选提交、去重、预处理、resolution/manual result/lineage 事实；它不直接写 knowledge repo，必须通过 `KnowledgeWritePort` 发布结果。
- `knowledge-read` 只消费写侧/治理侧派生事件或只读投影，不直接复用写侧事务对象。
- `job-runtime` 只拥有 queue/outbox/worker/retry/reclaim/status 等 runtime 编排；worker handler 只做 transport glue，不内嵌业务判断。

## 当前分层与传输统一（2026-08 maintainability-rework）

Wave 9 之后的结构事实（与 `SYSTEM_TRUTH_SOURCES.md`、`BOUNDARIES.md` 一致）：

- **domain 纯规则层真实存在**：`packages/backend-core/src/<context>/domain/` 是六个有界上下文的真实规则落点（lifecycle/policy/conflict/dedup/retrieval 等），只含纯函数、零框架、零 DB 依赖，并配套单元测试。`service-*` 的 pg-ports 只保留 SQL 与行映射（如 knowledge-write pg-ports 已从 876 行收敛到 ~150 行）；infrastructure 层禁止新增业务判断。
- **双宿主共享 RouteDef**：`packages/backend-core/src/http/route-contract.ts` 定义框架中立的 `RouteDef`（method/path/Zod schema/handler + canonical error envelope）。各 service 包以 `create<X>RouteDefs(deps)` 工厂声明路由；host-local 六个 bounded-context Nest module 与 gateway module 经 `createNestAdapter` 消费，host-distributed gateway 与各 Fastify 服务入口经 `createFastifyAdapter` 消费同一份 RouteDef，宿主内不手写重复路由实现。
- **gateway 转发薄化**：`packages/host-distributed/src/gateway/route-defs.ts` 承载网关路由声明（`createGatewayRouteDefs`），`routes.ts` 收缩为薄传输壳（~180 行），只做注册/认证/转发，业务与校验语义全部来自共享 RouteDef 与 service ports。

## Server Bounded Context

当前 `packages/server（Wave-10 已删除）` 以内聚职责划分为七个 bounded context：

- `身份与访问`：auth、session、access key、team、membership、user
- `知识治理`：knowledge、traps、review、decay、evidence、知识生命周期维护规则
- `工件生命周期`：artifact 导入/导出、激活、lifecycle、profile、capsule、manifest
- `候选摄取`：candidates、duplicates、lineage、pre-review、异步 candidate 处理
- `检索读侧`：retrieval read model、capsule recall、graph query adapter、retrieval cache
- `反馈与修复`：feedback、remediation、badcase 持久化、reactivation hook
- `运维与运行时`：operator 端点、stats、migration/admin 流程、runtime/status

工作规则：

- route 是 transport adapter，只负责校验、鉴权、actor 解析、delegate 和响应映射。
- application service 负责多步业务编排、生命周期变化、side effect 触发和已命名的 compatibility debt。
- repository 是业务路径的默认持久化入口；compatibility store 不是并行一等公民。
- `store.snapshot()` / `store.transact()` 只允许留在已命名 compat allowlist：repository internals、bootstrap、migration/backfill、受控 admin/diagnostic、projection exceptions 与已命名迁移债务。

## 可观测性与服务发现

可观测性与服务发现的目标架构分别定义在专用文档中：

- 可观测性架构（LGTM 栈 + OpenTelemetry）：[OBSERVABILITY.md](OBSERVABILITY.md)
- 服务发现架构（Consul）：[SERVICE-DISCOVERY.md](SERVICE-DISCOVERY.md)
- 技术选型对比：[TECH-SELECTION.md（已归档）](../archived/architecture/TECH-SELECTION.md)

核心选型：Consul（服务发现）、Prometheus（指标）、Tempo（追踪）、Loki（日志）、Grafana（可视化）、OpenTelemetry（采集标准）。

Docker Compose 配置见仓库根目录 `docker-compose.observability.yml`，配套配置文件在 `config/` 目录下。

三个 deployment profile 下的可观测性/服务发现行为差异：

| Profile | 可观测性 | 服务发现 |
|---|---|---|
| `local-agent` | 可选，降级为 console/noop exporter | 不需要 |
| `team-monolith` | 可选，连接外部后端 | 可选增强 |
| `distributed` | 必需，全量管线 | 必需基础设施 |

## Server Layer Ownership

当前 `packages/server（Wave-10 已删除）` 采用五层 ownership 模型，对应现有目录而不是新的部署拆分：

| Layer | 当前目录/模块 | Ownership |
|---|---|---|
| `domain` | `packages/server（Wave-10 已删除）/src/lib/<context>/` 中的实体、规则、仓库接口、policy | 表达 bounded context 语义、不变量、状态转移和聚合边界 |
| `application` | `packages/server（Wave-10 已删除）/src/lib/<context>/application-*.ts`、命名 service/processor | 编排命令式业务用例，协调 `repos.*`、lifecycle、权限前提和受控 side effect |
| `infrastructure` | `packages/server（Wave-10 已删除）/src/lib/persistence/`、`repos/`、`queue/`、`runtime/`、`ai/`、`lifecycle/`、`bootstrap/` | 持久化、队列、AI/provider、runtime metadata、startup/bootstrap、worker wiring |
| `interfaces/http` | `packages/server（Wave-10 已删除）/src/routes/` | Fastify transport adapter：请求解析、鉴权、delegate、响应映射 |
| `interfaces/worker` | `packages/server（Wave-10 已删除）/src/worker.ts`、worker/bootstrap 模块 | 异步任务消费与重试边界，把任务载荷翻译成 application/infrastructure 调用 |

层间约束：

- runtime/bootstrap responsibility 留在 `infrastructure`，不进入 `domain` 或 `application`。
- `interfaces/http` 和 `interfaces/worker` 都不定义业务规则，只适配 transport/runtime 触发。
- read-model assembly 留在 `检索读侧` 或其他明确的读侧模块；写侧 application service 默认不拼装 retrieval/runtime projection，除非文档显式声明这种耦合是刻意的。
- `backend-core` / `host-*` 对这些边界的角色是“承接并装配”，不是绕过 `packages/server（Wave-10 已删除）` 当前事实再定义一套并行 ownership。

## 重上下文的具体落点

### 知识治理

- `domain` / `application`：`knowledge`、`traps`、`review`、`decay` 的命令语义、生命周期规则、共享 application service。
- `infrastructure`：knowledge repository、索引 side effect、lifecycle subscriber、兼容层适配。
- `interfaces/http`：知识、trap、review、decay 路由只做 transport delegate。
- 约束：检索 read-model 和 response assembly 不回流到知识写服务内部。

### 候选摄取

- `domain` / `application`：candidate submission、duplicate detection、resolution、pre-review、processing policy。
- `infrastructure`：queue、candidate recovery、startup re-enqueue、worker supervision、PG/JSON persistence 细节。
- `interfaces/worker`：消费 candidate task 并调用既有 application/infrastructure 能力。
- 约束：中断恢复和重入队属于 bootstrap/runtime，不属于 candidate domain 本身。

### 反馈与修复

- `domain` / `application`：feedback、remediation、badcase/reactivation 相关命令和状态变化。
- `infrastructure`：badcase 持久化、subscriber/hook wiring、异步执行、operator-facing persistence adapter。
- `interfaces/http` / `interfaces/worker`：只暴露命令入口或执行异步载荷。
- 约束：修复动作的运行时触发方式不能替代领域规则定义。

### 运维与运行时

- `domain` / `application`：仅保留被明确命名的 operator use case。
- `infrastructure`：`/health`、`/ready`、runtime snapshot、migration/admin flow、startup sequence、worker lifecycle。
- `interfaces/http`：operations/status/admin 路由仅暴露这些能力。
- 约束：进程状态、bootstrap 顺序、依赖健康判定属于基础设施 ownership，而不是业务服务。

## 持久化演进边界

Round 0 已对数据库现代化方案完成基线冻结，后续架构演进遵守以下约定：

- 业务主事实进入 PostgreSQL 结构化主表与历史/事件表。
- `store_snapshot` 仅保留给尚未迁移的兼容域，不再是 PG 主读路径用于身份/审计域。
- 双写兼容层只允许短期存在，必须在后续轮次停止双写并删除旧层。
- 检索索引、embedding、capsule、profile、manifest、usage rollup 属于派生层，不得反向成为业务真相。

> 权威的迁移状态记录见 [docs/reference/DATA_MODEL.md](../reference/DATA_MODEL.md)。`store_snapshot` 当前仅作为兼容层，不再接纳新的核心业务主路径。

当前收敛状态：

- Knowledge / Artifact / Candidate / Task Queue 已由 PostgreSQL 主表和 migration 驱动。
- Team / User / Member / Session / AccessKey 及部分辅助域已通过 PostgreSQL 结构化表承载主读写路径。
- 应用启动负责执行 migration，不负责为核心领域动态建表。

### 启动序列

应用启动由宿主层统一编排（`packages/host-local/src/nest/` 或 `packages/host-distributed/src/`），严格按以下顺序执行：

1. **Repositories** (`bootstrap-repositories.ts`) — 运行 Drizzle 迁移、创建所有 flat props repo 和统一 `repos` 对象、确保 HNSW 向量索引、注册 graph channel
2. **Candidate Recovery** (`bootstrap-candidate-recovery.ts`) — 查找并重新排队中断的候选（JSON + PG 双路径）
3. **Workers** (`bootstrap-workers.ts`) — 创建并启动 PostgreSQL task worker（仅 PG 模式）
4. **Graph Reconciliation** (`bootstrap-graph-reconciliation.ts`) — 对账图索引
5. **Lifecycle** (`bootstrap-lifecycle.ts`) — 注册 domain event 订阅者、启动 outbox worker（仅 PG 模式）

关键约束：Repos 必须先于 Candidate Recovery 和 Workers 初始化，因为两者依赖 `repos.candidate`。

启动序列是基础设施责任，不属于任何 bounded context 的 domain/application service。领域模块可以声明它需要的 repository、event、queue contract，但不能拥有进程启动顺序、worker 存活或 readiness 判定。

运行时状态约束：

- `packages/server（Wave-10 已删除）/src/lib/runtime/request-context.ts` 负责为每个请求建立统一 `requestId` / trace header 上下文
- `packages/server（Wave-10 已删除）/src/lib/runtime/runtime-metadata.ts` 负责构建 `/health` 与 `/ready` 共用的 runtime snapshot
- JSON store 模式下 `queueWorker` / `outboxWorker` 会显示为 `not-configured`，这不是异常
- PostgreSQL 模式下：
  - 当前进程拥有本地 consumer 且正在运行：`running`
  - 当前进程不拥有该类 work，由其他实例承接：`remote`
  - 当前进程应拥有该类 work 但本地 worker 未运行：`degraded`
- API-only 进程在 PostgreSQL 部署下可对 worker dependency 报告 `remote`，不应因此被判为不健康
- 当 graph backend 进入 fail-open fallback 时，实例 runtime `readiness` 应为 `degraded` 而非 `not-ready`
- 当前 Phase 1 runtime snapshot 只对已观测的运行时依赖给出判断，明确覆盖 graph query backend 与 candidate task worker；更广义的后台依赖健康会在后续 runtime foundations 阶段继续扩展

### 系统分层架构图

```mermaid
flowchart TB
    subgraph 表现层["表现层 (Presentation)"]
        CLI["CLI 客户端<br/>(Commander.js)"]
        HTTP["HTTP 客户端<br/>(curl, Postman)"]
    end

    subgraph 路由层["路由层 (Route Layer - 薄)"]
        Routes["RouteDef 路由<br/>auth | teams | members | knowledge<br/>review | retrieval | operations | traps"]
    end

    subgraph 业务逻辑层["业务逻辑层 (Business Logic)"]
        AI["AI 提供商抽象<br/>(OpenAI/Ollama/Compatible/Google GenAI)"]
        Gov["治理<br/>(RBAC + 资格)"]
        Ret["检索管道<br/>(v1/v2/v3 模式)"]
        Idx["索引管道<br/>(向量/关键词/图)"]
        Ing["异步入库<br/>(候选 + 重复检测)"]
        Art["工件派生<br/>(胶囊/配置文件/清单)"]
    end

    subgraph 持久层["持久层 (Persistence)"]
        StoreInt["存储接口<br/>(抽象)"]
        JsonStore["JsonStore<br/>(文件级，原子操作)"]
        PgStore["PostgresStore<br/>(PostgreSQL + Drizzle)"]
    end

    表现层 --> 路由层
    路由层 --> 业务逻辑层
    业务逻辑层 --> 持久层
    存储接口 --> JsonStore
    存储接口 --> PgStore
```

### 请求生命周期流程图

```mermaid
sequenceDiagram
    participant 客户端 as CLI/HTTP 客户端
    participant 路由 as 路由处理器
    participant 请求上下文 as 请求上下文
    participant 认证 as 认证中间件
    participant 治理 as 治理层
    participant 服务 as 业务服务
    participant 存储 as 存储接口

    客户端->>路由: HTTP 请求
    路由->>请求上下文: 解析/生成 requestId 与 trace header
    路由->>认证: 验证会话/密钥
    认证->>认证: 加载用户上下文
    认证->>治理: 检查权限
    治理->>治理: 验证资格

    alt 权限拒绝
        治理-->>客户端: 403 禁止访问
    else 权限通过
        治理->>服务: 执行业务逻辑
        服务->>存储: 读/写数据
        存储-->>服务: 结果
        服务-->>路由: 响应数据
        路由-->>客户端: HTTP 响应
    end
```

## 模块划分

### 1. CLI 包 (`packages/cli`)

**职责**：所有用户交互的终端客户端

**命令**：
```
auth/          login, logout, session
team/          create, list, select
member/        create, update
knowledge/     submit, resubmit, inspect, list
trap/          trap 特定操作
retrieval/     search (v1, v2, v3), plan
review/        queue, approve, reject
operations/    import, export, edit
skill/         skill 操作
audit/         审计日志查看
```

**关键组件**：
- `config.ts` - CLI 状态管理（会话、团队、输出格式）
- `http.ts` - 带认证头注入的 HTTP 客户端
- `input.ts` - 用户输入处理（提示、选择）
- `output.ts` - 格式化输出（表格、JSON、ANSI 颜色）

### 2. Server 包 (`packages/server（Wave-10 已删除）`)

**职责**：迁移期兼容壳层与既有 Fastify 实现面；当前仍承载大量权威实现、测试和运行时基础设施

**路由处理器**：
| 文件 | 端点类别 |
|------|---------|
| `auth.ts` | 认证（登录/登出/会话） |
| `teams.ts` | 团队 CRUD 和选择 |
| `members.ts` | 成员管理 |
| `access-keys.ts` | 访问密钥发放 |
| `traps.ts` | Trap 特定操作（通过共享应用服务） |
| `knowledge.ts` | 知识 CRUD 和提交（通过共享应用服务） |
| `review.ts` | 审核队列表和决策 |
| `retrieval.ts` | 搜索端点（v1, v2, v3） |
| `operations.ts` | 导入/导出，工件编辑 |
| `candidates.ts` | 异步摄取管道 |

**知识/Trap 应用服务**：`knowledge.ts` 和 `traps.ts` 的提交/重提/取代工作流委托给 `lib/knowledge/application-service.ts`。路由 → 应用服务 → 仓库 的分层确保 knowledge 和 trap 路由共享相同的持久化语义，消除了此前 trap 路由缺失治理/生命周期持久化的正确性问题。

**业务逻辑库**：
| 目录 | 用途 |
|------|------|
| `lib/ai/` | AI 提供商抽象 |
| `lib/artifacts/` | 工件派生 |
| `lib/candidates/` | 异步摄取管道 |
| `lib/governance/` | RBAC 和资格 |
| `lib/indexing/` | 多适配器索引 |
| `lib/knowledge/` | 知识应用服务（submit/resubmit/supersede）、仓库接口和 PG 实现 |
| `lib/retrieval/` | 检索管道 |
| `lib/persistence/` | 存储实现 |

### 3. Contracts 包 (`packages/contracts`)

**职责**：共享 Zod schema 和 TypeScript 类型

**领域 Schema**：
```
domain/
├── common.ts       # EntityId, SecurityLevel, Permission, LifecycleState
├── auth.ts         # 认证类型
├── team.ts         # Team, Member, AccessKey
├── knowledge.ts    # KnowledgeEntry, KnowledgeSubmission, KnowledgeRevision
├── artifacts.ts    # SkillArtifact, SkillCapsule, SkillProfile, ClientManifest
├── retrieval.ts    # RetrievalQuery, RetrievalResponse, CapsuleMatch
├── review.ts       # ReviewQueue, ReviewDecision
├── candidates.ts   # CandidateSubmission, DuplicateCase
└── plans.ts        # TrapFirstPlan, GraphPlan, PlanTrapNode
```

### 4. Evals 包 (`evals/`)

**职责**：评估数据集和自动化测试运行器

**结构**：
```
evals/
├── retrieval/      # 检索评估
│   ├── run.ts      # 运行器入口
│   ├── smoke.ts    # smoke 层数据集导出
│   ├── core.ts     # core 层数据集导出
│   ├── datasets/   # 测试用例定义
│   ├── scenarios/  # Fixture 状态定义
│   └── lib/        # 运行器基础设施
├── summary/        # 摘要评估
│   ├── run.ts      # 运行器入口
│   ├── smoke.ts / core.ts
│   ├── datasets/
│   ├── scenarios/
│   └── lib/        # 评判器和评分基础设施
├── graph-extraction/  # 图提取评估
└── scripts/        # 统一运行器（eval-all.ts, eval-ci.ts）
```

## 技术细节

### AI 提供商抽象

```typescript
// 支持的提供商
type AIProvider = 'openai' | 'openai-compatible' | 'ollama' | 'google-genai' | 'fallback'

// 提供商配置通过环境变量（自动解析：AI_PROVIDER 显式值优先，其次 OPENAI_API_KEY → openai、GEMINI_API_KEY → google-genai，否则 fallback）
AI_PROVIDER=openai
AI_BASE_URL=https://api.openai.com/v1  // 兼容提供商使用
AI_API_KEY=sk-...
AI_CHAT_MODEL=gpt-4o-mini
AI_EMBEDDING_MODEL=text-embedding-3-small
```

`packages/server（Wave-10 已删除）/src/lib/ai/` 中的抽象层标准化：
- 聊天补全（系统提示、消息、参数）
- Embeddings 生成（文本 → 向量）
- 流式响应

### 多适配器索引

```mermaid
flowchart TB
    subgraph 索引管道["索引管道"]
        状态变更["条目状态变更\nsubmitted → approved"]
        索引状态["索引状态记录\n（每个适配器独立同步）"]
        
        subgraph 多适配器["多适配器"]
            向量["向量适配器\nVector Adapter"]
            关键词["关键词适配器\nKeyword Adapter"]
            图["图适配器\nGraph Adapter"]
        end
        
        一致性检查["一致性检查\n（启动时执行）"]
    end

    状态变更 --> 索引状态
    索引状态 --> 向量
    索引状态 --> 关键词
    索引状态 --> 图
    向量 --> 一致性检查
    关键词 --> 一致性检查
    图 --> 一致性检查
```

**适配器**：
- **Vector**：OpenAI embeddings + 余弦相似度
- **Keyword**：BM25/基于分词的词法匹配
- **Graph**：Graphology DAG 用于关系扩展

> **入库预计算策略**：三个适配器在入库阶段完成所有昂贵计算（Embedding API、LLM 图实体提取、Token 分词），检索阶段直接读取预计算结果。检索路径的召回/评分/图遍历均不调用 LLM。完整的预计算措施清单见 [PRECOMPUTATION.md（已归档）](../archived/architecture/PRECOMPUTATION.md)。

### 检索管道

```mermaid
flowchart TB
    subgraph 检索管道["检索管道"]
        请求["请求\n（查询）"]
        验证["验证\n（Zod）"]
        认证["认证上下文\n（会话+团队）"]
        资格["资格过滤\n（审批+团队+等级）"]
        模式分发["模式分发\n（语义|混合|图辅助）"]
        
        subgraph 召回["召回阶段"]
            语义召回["语义召回"]
            关键词召回["关键词召回"]
            图扩展["图扩展"]
        end
        
        合并["合并+重排"]
        组装["组装\n（分桶+引用）"]
        
        subgraph 约束["约束条件"]
            全局约束["全局约束"]
            项目知识["项目知识"]
            团队范围["团队范围"]
        end
    end

    请求 --> 验证
    验证 --> 认证
    认证 --> 资格
    资格 --> 模式分发
    模式分发 --> 语义召回
    模式分发 --> 关键词召回
    模式分发 --> 图扩展
    语义召回 --> 合并
    关键词召回 --> 合并
    图扩展 --> 合并
    合并 --> 组装
    组装 --> 约束
```

### 陷阱优先计划编译 (v3)

```mermaid
flowchart TB
    subgraph 陷阱优先计划["陷阱优先计划编译"]
        查询输入["查询输入"]
        GraphRAG["GraphRAG Lite 封装器"]
        路由["置信度感知路由"]
        
        subgraph 高置信度路径["高置信度路径"]
            陷阱优先["陷阱优先计划\n（类型边+引用）"]
        end
        
        subgraph 低置信度降级路径["低置信度降级路径"]
            受控检索["受控检索响应\n（v1/v2）"]
        end
    end

    查询输入 --> GraphRAG
    GraphRAG --> 路由
    路由 -->|高置信度| 陷阱优先
    路由 -->|低置信度| 受控检索
```

### 异步摄取管道

```mermaid
flowchart TB
    subgraph 异步入库["异步入库管道"]
        候选提交["候选提交"]
        已接收["状态：已接收"]
        已排队["状态：已排队"]
        分析中["状态：分析中\n（指纹检查+语义相似度检查）"]
        
        subgraph 分析结果["分析结果"]
            检测到重复["检测到重复"]
            分析完成["分析完成"]
            待审核["状态：待审核"]
        end
        
        审核员操作["审核员操作\nPOST /v1/candidates/:candidateId/manual-result\n{ resolution: merge|discard|keep_both }"]
        解决方案["解决方案已应用\n（发布/合并）"]
    end

    候选提交 --> 已接收
    已接收 -->|异步处理| 已排队
    已排队 --> 分析中
    分析中 --> 检测到重复
    分析中 --> 分析完成
    分析完成 --> 待审核
    检测到重复 --> 审核员操作
    待审核 --> 审核员操作
    审核员操作 --> 解决方案
```

### 会话与认证

```mermaid
flowchart TB
    subgraph 登录流程["登录流程"]
        登录请求["登录请求"]
        登录接口["POST /v1/auth/login\n{ accessKey }"]
        验证凭据["SHA-256 哈希查找密钥"]
        创建会话["创建会话"]
        设置Cookie["设置 Cookie\n并返回会话"]
    end
    
    subgraph 会话检查["会话检查"]
        会话检查节点["会话检查\nGET /v1/auth/session"]
        验证会话["验证会话 ID"]
        加载上下文["加载用户上下文\n（团队、权限、等级）"]
    end
    
    subgraph 权限控制["权限控制"]
        RBAC中间件["RBAC 中间件"]
        权限检查["权限检查\n（knowledge:submit,\nknowledge:review 等）"]
    end

    登录请求 --> 登录接口
    登录接口 --> 验证凭据
    验证凭据 --> 创建会话
    创建会话 --> 设置Cookie
    
    设置Cookie --> 会话检查节点
    会话检查节点 --> 验证会话
    验证会话 --> 加载上下文
    加载上下文 --> RBAC中间件
    RBAC中间件 --> 权限检查
```

## 持久化架构

### 存储接口

```typescript
interface Store {
  // 事务支持原子操作
  transact<T>(fn: (tx: Transaction) => T): Promise<T>;

  // 知识条目
  createKnowledgeEntry(entry: KnowledgeEntry): Promise<void>;
  getKnowledgeEntry(id: EntityId): Promise<KnowledgeEntry | null>;
  updateKnowledgeEntry(id: EntityId, updates: Partial<KnowledgeEntry>): Promise<void>;
  listKnowledgeEntries(query: PaginatedQuery): Promise<KnowledgeEntry[]>;

  // 团队
  createTeam(team: Team): Promise<void>;
  getTeam(id: EntityId): Promise<Team | null>;
  listTeams(): Promise<Team[]>;

  // ... etc
}
```

核心业务路由（auth、knowledge、traps、retrieval 等）通过 `app.skillShareer.repos` 读写数据。`store_snapshot` / `JsonStore` 仅作为兼容回退层保留。详见 [SYSTEM_TRUTH_SOURCES.md](../reference/SYSTEM_TRUTH_SOURCES.md) 和 [PERSISTENCE.md](components/PERSISTENCE.md)。

### PostgresStore（推荐主路径）

```mermaid
flowchart TB
    subgraph Postgres存储特性["PostgresStore 特性"]
        B1["Drizzle ORM schema"]
        B2["连接池"]
        B3["ACID 事务"]
        B4["常用查询的索引"]
    end
```

> **JSON 回退**：未设置 `TRAPMAP_DATABASE_URL` 时自动回退到 JsonStore（原子写入、文件锁定），仅用于兼容，不推荐生产使用。

## 环境配置

### 必需变量

| 变量 | 描述 |
|------|------|
| `OPENAI_API_KEY` | OpenAI API 密钥 |
| `TRAPMAP_SYSTEM_ADMIN_KEY` | 管理员密钥 |

### 可选变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `TRAPMAP_DATABASE_URL` | (无) | PostgreSQL 连接字符串 |
| `TRAPMAP_DATA_FILE` | `.data/skill-shareer.json` | JSON 存储路径 |
| `HOST` | `127.0.0.1` | 服务器绑定主机 |
| `PORT` | `4000` | 服务器端口 |
| `AI_PROVIDER` | 自动解析：`openai` / `google-genai` / `fallback` | AI 提供商类型 |
| `AI_BASE_URL` | (无) | 兼容提供商的 Base URL |
| `AI_API_KEY` | (无) | 兼容提供商的 API 密钥 |
| `AI_CHAT_MODEL` | `gpt-4o-mini` | 聊天模型名称 |
| `AI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding 模型名称 |

## 部署

### Docker Compose

```yaml
services:
  server:
    build:
      context: .
      dockerfile: packages/server（Wave-10 已删除）/Dockerfile
    container_name: trapmap-server
    ports:
      - "4000:4000"
    volumes:
      - ./.data:/app/.data
      - ./logs:/app/logs
    environment:
      - NODE_ENV=production
      - HOST=0.0.0.0
      - PORT=4000
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - TRAPMAP_SYSTEM_ADMIN_KEY=${TRAPMAP_SYSTEM_ADMIN_KEY:-}
      - AI_PROVIDER=${AI_PROVIDER:-}
      - AI_BASE_URL=${AI_BASE_URL:-}
      - AI_API_KEY=${AI_API_KEY:-}
      - AI_CHAT_MODEL=${AI_CHAT_MODEL:-}
      # Embedding Provider
      - EMBEDDING_PROVIDER=${EMBEDDING_PROVIDER:-}
      - EMBEDDING_BASE_URL=${EMBEDDING_BASE_URL:-}
      - EMBEDDING_API_KEY=${EMBEDDING_API_KEY:-}
      - EMBEDDING_MODEL=${EMBEDDING_MODEL:-}
      - TRAPMAP_DATABASE_URL=postgres://trapmap:trapmap@postgres:5432/trapmap
      # Logging Configuration
      - LOG_USER_OPS_ENABLED=${LOG_USER_OPS_ENABLED:-false}
      - LOG_USER_OPS_DIR=${LOG_USER_OPS_DIR:-/app/logs/user-ops}
      - LOG_RAG_ENABLED=${LOG_RAG_ENABLED:-false}
      - LOG_RAG_DIR=${LOG_RAG_DIR:-/app/logs/rag}
      - LOG_MAX_FILE_SIZE_MB=${LOG_MAX_FILE_SIZE_MB:-10}
      - LOG_MAX_BACKUP_FILES=${LOG_MAX_BACKUP_FILES:-5}
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:4000/health"]
      interval: 30s
      timeout: 10s
      start_period: 5s
      retries: 3
    restart: unless-stopped

  postgres:
    image: pgvector/pgvector:pg16
    container_name: trapmap-postgres
    ports:
      - "5434:5432"
    environment:
      POSTGRES_DB: trapmap
      POSTGRES_USER: trapmap
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-trapmap}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U trapmap -d trapmap"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
```

> 完整 compose 文件见仓库根目录 `docker-compose.yml`。

## 健康检查

```bash
curl http://127.0.0.1:4000/health
# 响应：
{
  "status": "ok",
  "liveness": "alive",
  "readiness": "ready",
  "product": "trapmap",
  "packages": ["cli", "server", "contracts"],
  "requestContext": {
    "requestIdHeader": "x-request-id",
    "traceHeader": "traceparent"
  },
  "dependencies": {
    "database": "json-store",
    "queueWorker": "not-configured",
    "graphQuery": "disabled"
  },
  "graphQuery": {
    "mode": "disabled",
    "backendKind": "memory",
    "failOpen": true
  },
  "memory": { "rssMb": 128, "heapUsedMb": 64, "heapTotalMb": 96 },
  "uptimeSeconds": 42
}
```

### 就绪检查

```bash
curl http://127.0.0.1:4000/ready
# 响应：
{
  "ok": true,
  "liveness": "alive",
  "readiness": "ready",
  "product": "trapmap",
  "packages": ["cli", "server", "contracts"],
  "requestContext": {
    "requestIdHeader": "x-request-id",
    "traceHeader": "traceparent"
  },
  "dependencies": {
    "database": "postgres",
    "queueWorker": "running",
    "graphQuery": "healthy"
  },
  "graphQuery": {
    "mode": "enabled-primary",
    "backendKind": "neo4j",
    "failOpen": true
  }
}
```

> `dependencies.database` 字段值为 `postgres` 或 `json-store`，取决于实际存储后端。`dependencies.queueWorker` 与 `dependencies.graphQuery` 共同表达当前已观测依赖下实例是否 `ready`、`degraded` 或 `not-ready`。当 `readiness === "not-ready"` 时，`/ready` 应返回 HTTP `503`。
