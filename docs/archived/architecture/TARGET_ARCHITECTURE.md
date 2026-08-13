# 目标架构（运行时重组）

> 由运行时重组计划 Task 00 冻结。所有后续计划、包工作和部署脚本必须引用本文档作为术语、包角色、部署角色、服务角色和架构边界的权威来源。

## 状态

- 阶段：Phase 1（共享数据库，显式所有权）
- 本文档中的术语权威来源已冻结

## 当前状态

TrapMap 起始于 `cli + server + contracts` 的运行时形态，但仓库现已进入中间迁移状态：

| 包 | 当前角色 |
|---|---|
| `packages/client-core` | CLI 和未来客户端的共享网关传输层 |
| `packages/backend-core` | 宿主无关的后端内核和能力模型 |
| `packages/host-local` | `local-agent` / `team-monolith` 的首选轻量宿主运行时 |
| `packages/host-distributed` | `distributed` 的首选重量宿主运行时 |
| `packages/cli` | Commander.js CLI 客户端、输出渲染、本地配置 |
| `packages/server（Wave-10 已删除）` | 过渡外壳加大型兼容性/实现表面；不是 knowledge-write、governance-review 或 candidate-ingestion 的权威组装所有者 |
| `packages/contracts` | 共享 Zod 模式和 TypeScript 类型 |

运行时模型已实现 `deployment profile`（`local-agent`、`team-monolith`、`distributed`）、`runtimeMode`、`serviceUnit` 和 `task transport` 概念。仓库还引入了新宿主包并将首选的根开发脚本重新指向它们。然而，`packages/server（Wave-10 已删除）` 仍持有大量网关路由、应用服务、仓库实现、工作器引导、测试和迁移期事实。

## 目标包角色

### client-core

**包**：`packages/client-core`

客户端共享访问层。提供：

- HTTP 网关 SDK（对网关 API 的类型化请求/响应辅助）
- 会话处理（令牌管理、刷新、认证头注入）
- 错误模型（规范化 HTTP 错误类型、重试策略、限流感知）
- 请求辅助（分页、流式传输、内容类型协商）

不提供：CLI 参数解析、输出渲染、命令编排或任何 UI 特定行为。这些保留在 `packages/cli`（或未来的 Web 客户端包）中。

消费者：`packages/cli`、未来 Web 客户端、任何调用网关的外部集成。

### backend-core

**包**：`packages/backend-core`

后端核心内核。提供：

- 应用服务（用例编排、领域命令处理）
- 端口（仓库、外部适配器、内部跨上下文调用的类型化接口）
- 宿主无关的运行时能力模型（`deploymentProfile`、`runtimeMode`、`serviceUnit`、`routeSurface`、`asyncOwnershipExpectation`、`storagePosture`、`authTeamExpectation`）
- 限界上下文编排（生命周期状态机、outbox 发出、队列分派契约）
- 领域类型（实体、值对象、事件——不是请求/响应模式，那些留在 `contracts` 中）

不提供：HTTP 路由注册、Fastify 插件连接、工作器线程引导、仓库实现或数据库连接管理。这些属于宿主包。

消费者：每个宿主包、每个服务包。

### host

宿主包将 `backend-core` 组装为可执行进程——HTTP 服务器、任务工作器或 outbox 工作器。宿主负责：

- 将具体仓库实现连接到 backend-core 端口
- 注册 HTTP 路由（用于 API 宿主）
- 注册任务/队列处理器（用于工作器宿主）
- 加载配置和环境
- 启动进程（端口绑定、优雅关闭、健康端点）

存在两个宿主包：

| 包 | 部署目标 |
|---|---|
| `packages/host-local` | `local-agent`、`team-monolith` — 单机、最小依赖、低运维负担 |
| `packages/host-distributed` | `distributed` — 多服务单元、独立扩展、读写隔离 |

在迁移期间，`packages/server（Wave-10 已删除）` 继续作为过渡外壳。它将被逐步瘦身，直到 `host-local` 和 `host-distributed` 完全替代它。

## 部署角色

### 轻量宿主（light-host）

单机、本地或单实例部署。特征：

- 最小外部依赖（无需消息代理）
- 低运维负担（单进程或单机少量进程）
- 多个逻辑服务在可行时内联到一个进程中
- 适用于：`local-agent`（单用户、单开发机）、`team-monolith`（小团队、单 Docker 容器）

由 `packages/host-local` 组装。

### 重量宿主（heavy-host）

分布式部署。特征：

- 按服务单元独立扩展
- 检索和写入路径之间的读写隔离
- 显式的服务边界和定义的内部通信契约
- 外部消息代理可选但受支持（task transport：PostgreSQL 或 RabbitMQ）
- 适用于：`distributed`（多团队、生产环境、独立工作器进程）

由 `packages/host-distributed` 组装。

**与部署配置的映射**：

| 配置 | 宿主角色 | 备注 |
|---|---|---|
| `local-agent` | 轻量宿主 | 单进程，内存或本地 PG |
| `team-monolith` | 轻量宿主 | 单 Docker 容器，共享 PG |
| `distributed` | 重量宿主 | 多进程，可选 MQ，共享 PG（Phase 1） |

## 服务角色

每个服务代表一个具有清晰权威所有权边界的限界上下文。服务是逻辑单元；在轻量宿主模式下可能共享进程，在重量宿主模式下作为独立进程运行。

### gateway

- **外部入口**：唯一暴露给 CLI、Web 客户端和外部集成的服务
- **职责**：请求路由、聚合、限流、外部认证边界执行、稳定 API 表面
- **不拥有**：任何权威业务表、任何业务状态机逻辑
- **委托给**：通过内部端口委托给 backend-core 应用服务

### identity-access

- **拥有**：认证决策、会话生命周期、访问密钥管理、团队 CRUD、成员关系 CRUD、RBAC 决策计算
- **权威表**：认证、会话、访问密钥、成员关系、团队表
- **向其他服务提供**：权限决策、actor 查找、团队解析
- **消费者**：gateway（认证中间件）、所有其他服务（授权检查）
- **实现状态**：`packages/service-identity-access` 现在是第四个真实的 `service-*` 包。`packages/host-distributed` 作为薄宿主适配器消费它，`packages/server（Wave-10 已删除）` 仍是兼容性外壳而非权威的身份组装所有者。

### knowledge-read

- **拥有**：检索查询执行、查询追踪、只读投影、状态读模型、读侧缓存
- **权威表**：只读投影表、缓存表、搜索索引表、查询追踪读侧表
- **不拥有**：知识、陷阱、技能、生命周期、维护或衰减的任何权威写入路径
- **投影职责**：从 `knowledge-write` 发出的事件重建读侧状态

### knowledge-write

当前实现事实：`packages/service-knowledge-write` 现在是第一个真实的 `service-*` 包。它拥有 `knowledge-write` 服务组装表面，被 `packages/host-distributed` 和迁移期 `packages/server（Wave-10 已删除）` 兼容性叙述共同消费。

- **拥有**：知识条目 CRUD、陷阱生命周期、技能制品生命周期、维护分配、衰减管理、生命周期状态转换、证据更新
- **权威表**：知识、陷阱、技能生命周期、维护、衰减表
- **发出**：生命周期转换事件、失效事件、投影刷新触发器
- **不拥有**：检索读模型、搜索索引写入（这些是 `knowledge-read` 拥有的投影）

### candidate-ingestion

- 当前实现事实：`packages/service-candidate-ingestion` 现在是第三个真实的 `service-*` 包。它拥有 `candidate-ingestion` 服务组装表面，被 `packages/host-distributed` 消费，而 `packages/server（Wave-10 已删除）` 仍是兼容性外壳，不恢复候选权威组装所有权。
- **拥有**：候选接收、规范化、去重预处理、候选状态推进、重复案例创建、解决结果记录
- **权威表**：候选接收、处理状态、去重分析中间状态表
- **不拥有**：知识权威表（发布结果；`knowledge-write` 消费）
- **负载特征**：突发性、重度异步，适合独立扩展

### governance-review

- 当前实现事实：`packages/service-governance-review` 现在是第二个真实的 `service-*` 包。它拥有 `governance-review` 服务组装表面，被 `packages/host-distributed` 消费，而 `packages/server（Wave-10 已删除）` 仍是兼容性外壳，不恢复审查权威组装所有权。
- **拥有**：人在回路队列、审查工作台状态、冲突解决状态、补救队列状态
- **权威表**：人工干预队列、审查工作台状态、冲突解决状态、补救队列状态表
- **不拥有**：知识生命周期事实表（决策通过命令端口流转给 `knowledge-write`）

### job-runtime

- **拥有**：任务队列、工作流运行、outbox 调度运行时、租约/回收元数据
- **权威表**：任务队列、工作流运行、outbox 调度运行时、租约/回收元数据表
- **不拥有**：任何业务领域事实表
- **角色**：执行由其他服务分派的异步工作；管理任务生命周期、重试、死信处理。同时拥有用于分派跨服务事件的领域事件 outbox。
- **实现状态**：`packages/service-job-runtime` 现在是第五个真实的 `service-*` 包。`packages/host-distributed` 作为薄宿主适配器消费它，`packages/server（Wave-10 已删除）` 仍是兼容性外壳而非权威的 job-runtime 组装所有者。

## 目标包布局

```
Trap-Map/
├── packages/
│   ├── client-core/               # 客户端共享 HTTP 网关 SDK
│   ├── backend-core/              # 后端核心内核（服务、端口、能力模型）
│   ├── service-gateway/           # 网关宿主/传输/组装（尚未创建，当前由 host-local/host-distributed 组装）
│   ├── service-identity-access/   # 认证、会话、访问密钥、成员关系、团队、RBAC
│   ├── service-knowledge-read/    # 检索、只读投影、查询追踪、读缓存
│   ├── service-knowledge-write/   # 已实现的第一个服务包：知识/陷阱/技能/生命周期/维护/衰减写入
│   ├── service-candidate-ingestion/ # 已实现的第三个服务包：候选接收、规范化、去重、状态
│   ├── service-governance-review/ # 审查队列、工作台、冲突解决、补救
│   ├── service-job-runtime/       # 任务队列、工作流运行、outbox 调度、共享任务
│   ├── host-local/                # 轻量宿主组装（local-agent、team-monolith）
│   ├── host-distributed/          # 重量宿主组装（分布式服务）
│   ├── cli/                       # CLI（简化；不再持有共享 HTTP SDK）
│   ├── server/                    # 过渡外壳；正被 host-local/host-distributed 替代
│   ├── contracts/                 # 共享 Zod 模式和 TypeScript 类型
│   └── skills/                    # 项目级 Skill 工作流
├── evals/                         # 检索和摘要评估
├── docs/                          # 项目文档
├── scripts/                       # 自动化和部署脚本
└── docker-compose.yml
```

### 包依赖方向

```
contracts ──────────────────────────────────────────────────┐
    │                                                       │
    ▼                                                       │
client-core ← cli, future web client                        │
    │                                                       │
backend-core ← service-* ← host-local, host-distributed     │
    │                           │                           │
    └───────────────────────────┴───────────────────────────┘
                                ↑
                           server (过渡外壳，持续缩减)
```

关键约束：

1. `client-core` 仅依赖 `contracts`。永不依赖 `backend-core` 或任何服务端包。
2. `backend-core` 依赖 `contracts`。不依赖任何服务或宿主包。
3. 每个 `service-*` 依赖 `backend-core` 和 `contracts`。服务包是对等的；它们不直接相互依赖。跨服务交互通过 `backend-core` 中定义的内部端口进行。
4. `host-local` 和 `host-distributed` 依赖 `backend-core`、`contracts` 以及它们组装的服务包。它们将具体实现连接到端口。`host-distributed` 现在消费真实的 `packages/service-knowledge-write`、`packages/service-governance-review`、`packages/service-candidate-ingestion`、`packages/service-identity-access` 和 `packages/service-job-runtime` 包，而非自身持有这些路由组装。
5. `packages/cli` 依赖 `client-core` 和 `contracts`。不依赖 `backend-core` 或任何服务端包。
6. `packages/server（Wave-10 已删除）`（过渡外壳）在迁移期间依赖 `backend-core`、`contracts` 和服务包。最终被替代。

## 架构原则

1. **所有客户端仅通过网关 SDK / 网关 API 编程。** CLI、Web 客户端、外部集成都通过单一网关 URL 连接。任何客户端永不直接连接到内部服务端点。

2. **所有宿主通过 backend-core 编程，而非业务逻辑。** 宿主包连接端口、配置适配器并启动进程。它们不复制、重新实现或绕过应用服务。

3. **微服务边界基于权威所有权、读写路径和故障域优先。** 物理进程数量是次要考虑。即使两个服务在轻量宿主模式下共享进程，服务边界仍然有效。

4. **Phase 1 保持共享 PostgreSQL，但不以此为借口跳过服务边界定义。** 表级所有权已冻结。权威写入在模块边界执行。跨服务一致性使用 outbox + 队列 + 投影，而非分布式事务。

5. **Phase 1 无分布式事务。** 跨服务写入仅在单个服务的本地 PostgreSQL 事务内原子（权威写入 + 本地 outbox 写入）。跨服务流使用异步最终一致性。

6. **无 RPC 优先架构。** 内部通信从 `backend-core` 中定义的端口优先、传输无关接口开始。轻量宿主使用进程内调用。重量宿主从内部 HTTP/JSON 适配器开始。仅在调用频率、类型稳定性和延迟压力证明其合理性时才采用 RPC。

Phase 2 微服务平台演进更新：

- 第一个冻结的分布式 RPC 接缝是进入 `knowledge-write` 的所有者跳转。
- `packages/host-distributed/src/shared/internal-knowledge-write-client.ts` 现在保持 `KnowledgeWritePort` 契约稳定，同时允许宿主为 `governance-review -> knowledge-write` 和 `candidate-ingestion -> knowledge-write` 选择 `http` 或 `rpc` 传输。
- 当前 RPC 试点范围有意狭窄：它使用 `POST /internal/rpc/knowledge-write` 的单一信封路由，仅覆盖已通过 `KnowledgeWritePort` 委派的冻结权威命令集。
- 这不改变外部模型：`gateway` 仍是唯一的外部可达表面，任何客户端或外部集成不得绕过它直接调用试点接缝。
- 此阶段的协议决策：接缝保持在宿主拥有的信封 RPC 上，而非迁移到 Connect RPC 或 gRPC。决定性约束不是传输机制而是事实所有权：TrapMap 当前在 `packages/contracts` Zod/TypeScript 定义和 `backend-core` 端口中冻结共享契约，尚不接受 `proto`/Buf/codegen 作为第二个权威契约层。
- 如果仓库后续需要正式 RPC 栈，Connect RPC 是优先于原始 gRPC 的下一候选，因为它更好地保留了一元 HTTP 人体工程学，同时仍允许 Connect / gRPC / gRPC-Web 协议支持。该迁移受限于对 Protobuf 模式事实和生成工作流的明确接受。

7. **读侧状态是派生的，非权威的。** `knowledge-read` 投影、缓存和搜索索引由 `knowledge-write` 发出的事件派生。写入侧负责失效触发器；读取侧负责消费它们。

8. **网关不持有业务逻辑。** 它通过端口委托给 backend-core 应用服务。网关负责 API 表面稳定性、请求聚合、限流和认证边界执行——仅此而已。

## 非目标

以下明确不在当前重组范围内：

- 前端 Web 应用或组件实现
- 将单个服务进一步拆分为细粒度技术层服务（例如，独立的 `role-service`、`permission-service`、`queue-service`）
- Phase 1 中每个限界上下文的独立数据库
- 跨数据库分布式事务或两阶段提交
- 超出当前 `knowledge-write` 试点接缝的广泛 RPC 框架选择或仓库范围采用（Connect RPC / gRPC / 其他）

## 参考资料

- [运行时重组计划 00](../plans/runtime-recomposition/00-baseline-and-target-architecture.md) — 计划起源
- [运行时重组计划 01](../plans/runtime-recomposition/01-shared-client-core-extraction.md) — client-core 提取
- [运行时重组计划 02](../plans/runtime-recomposition/02-backend-core-kernel-extraction.md) — backend-core 提取
- [运行时重组计划 03](../plans/runtime-recomposition/03-light-host-assembly.md) — 轻量宿主组装
- [运行时重组计划 04](../plans/runtime-recomposition/04-heavy-microservice-assembly.md) — 重量微服务组装
- [运行时重组计划 05](../plans/runtime-recomposition/05-migration-validation-and-doc-rollout.md) — 迁移和验证
- [数据库所有权](DATABASE_OWNERSHIP.md) — 表级所有权和事务规则
- [服务边界](SERVICE_BOUNDARIES.md) — 服务角色定义和所有权模型
