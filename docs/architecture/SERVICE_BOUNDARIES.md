# 服务边界

> 由运行时重组计划 Task 00 冻结。本文档定义服务角色、权威所有权、内部通信契约以及服务间交互的规则。

## 状态

- 阶段：Phase 1（逻辑边界已定义；物理进程分离渐进推进）
- 执行里程碑：仓库中已实现 6 个物理 `service-*` 拆分：`packages/service-identity-access`、`packages/service-knowledge-read`、`packages/service-knowledge-write`、`packages/service-candidate-ingestion`、`packages/service-governance-review`、`packages/service-job-runtime`。

## 服务清单

| 服务 | 包 | 限界上下文 |
|---|---|---|
| `gateway` | 由 `host-local` / `host-distributed` 组装，无独立包 | 外部 API 表面、请求聚合 |
| `identity-access` | `packages/service-identity-access` | 认证、会话、访问密钥、成员关系、团队、RBAC |
| `knowledge-read` | `packages/service-knowledge-read` | 检索、读投影、查询追踪、读缓存 |
| `knowledge-write` | `packages/service-knowledge-write` | 知识/陷阱/技能/生命周期/维护/衰减写入 |
| `candidate-ingestion` | `packages/service-candidate-ingestion` | 候选接收、规范化、去重、状态推进 |
| `governance-review` | `packages/service-governance-review` | 审查队列、工作台、冲突解决、补救 |
| `job-runtime` | `packages/service-job-runtime` | 任务队列、工作流运行、outbox 调度、共享任务 |

## 服务定义

### gateway

**用途**：所有客户端（CLI、Web、外部集成）的唯一外部入口。

**职责**：
- API 表面稳定性（版本化端点、向后兼容）
- 将请求路由到适当的 backend-core 应用服务
- 请求聚合（在需要时将多个内部调用的结果合并为单一响应）
- 限流和节流
- 外部认证边界执行（令牌验证、会话解析）
- 统一错误响应格式
- 健康检查和就绪端点

**不包含**：
- 不持有任何业务领域状态
- 不实现业务逻辑（检索评分、RBAC 决策计算、生命周期状态机）
- 不拥有任何权威数据库表
- 不对任何领域表执行写入

**消费的内部端口**：`IdentityAccessPort`（认证中间件）、`KnowledgeReadPort`（检索查询）、`KnowledgeWritePort`（生命周期命令）、`CandidateIngestionPort`（候选提交）、`GovernanceReviewPort`（审查队列查询）、`JobRuntimePort`（状态查询）

**外部边界**：这是系统外部唯一可达的服务。所有外部流量从此处进入。

### identity-access

**用途**：集中式认证、身份和访问控制。

**实现状态**：已实现为 `packages/service-identity-access`。`packages/host-distributed` 现在仅作为身份服务进程的薄宿主适配器，`packages/server` 仍是兼容性外壳而非权威的身份组装所有者。

**职责**：
- 用户认证（登录、会话创建、会话验证）
- 会话生命周期管理（刷新、过期、撤销）
- 访问密钥生成、验证和撤销
- 团队 CRUD 操作
- 成员关系管理（添加/移除成员、角色分配）
- RBAC 决策计算（权限检查、角色模板解析、安全级别执行）
- Actor 查找（为审计和授权解析 actor 引用）

**权威表**：认证、会话、访问密钥、用户、团队、成员关系表

**向其他服务提供**：
- `IdentityAccessPort`：权限检查、actor 解析、团队验证
- 其他服务调用此端口，而非直接查询身份表

**消费者**：gateway（每个认证请求）、所有其他服务（写入前的授权）

### knowledge-read

**用途**：优化的读取路径，用于检索、搜索和查询分析。

**实现状态**：已实现为 `packages/service-knowledge-read`。`packages/host-distributed` 当前承载 `gateway + 六个服务入口` 的分布式宿主装配，其中 `knowledge-read` 的权威读取组装仍位于 `packages/service-knowledge-read`；`packages/server` 仍是兼容性外壳而非权威读取组装所有者。

**职责**：
- 检索查询执行（v1 语义/混合/图辅助、v2 胶囊、v3 图计划）
- 查询追踪和分析（queryId 生成、坏案例追踪记录）
- 只读投影维护（反规范化读模型、物化视图）
- 状态读模型（面向操作员的知识、制品、衰减、维护状态查询）
- 读侧缓存管理（检索读模型缓存、意图缓存、嵌入缓存）
- 搜索索引管理（knowledge_embeddings、knowledge_keywords、knowledge_search_documents、graph_index_documents）

**Phase 2 边界契约**：
- `GET /internal/knowledge-read/projection-status` 是读侧成熟度、新鲜度、回退和一致性报告的唯一状态表面。
- 网关也在 `GET /v1/knowledge/projection-status` 转发此契约，供外部操作员可见。
- `knowledge-entry:getById` 和 `knowledge-entry:listMine` 仍是 `knowledge-read` 拥有的临时直接支持投影。它们被显式允许读取共享权威表，直到派生条目投影替代它们。
- `retrieval-search`、检索查询追踪、搜索索引和缓存元数据是 `knowledge-read` 拥有的派生读侧表面，而非路由本地的直接 SQL 组装。
- `review-queue` 仍由 `governance-review` 拥有和提供，而非 `knowledge-read`。
- `maintenance entries` 仍是面向治理/操作员的读表面。如果它们在 Phase 2 仍读取共享权威状态，则被视为 `governance-review` 拥有的临时直接支持操作员投影。
- `decay entries/search` 在服务于衰减工作台时保留在 `governance-review` 中。仅面向检索的派生搜索属于 `knowledge-read`。

**权威表**：无（此服务写入的所有表均为派生投影）

**写入的派生表**：
- 搜索索引表（嵌入、关键词、搜索文档、图索引）
- 查询追踪读侧表（retrieval_badcase_traces）
- 投影缓存元数据

**投影职责**：从 `knowledge-write` 发出的事件重建读侧状态。写入侧负责失效触发器；读取侧负责消费它们。

**不拥有**：知识、陷阱、技能、生命周期、维护或衰减的任何权威写入路径

### knowledge-write

**用途**：知识领域的权威写入路径。

**实现状态**：已实现为 `packages/service-knowledge-write`。`packages/host-distributed` 现在是此服务的薄宿主适配器，`packages/server` 仍是兼容性外壳而非权威的组装所有者。

**职责**：
- 知识条目创建、更新、重新提交和取代
- 陷阱生命周期管理（提交、批准、拒绝、停用）
- 技能制品生命周期管理（导入、编辑、审查、激活）
- 生命周期状态机执行（草稿 -> 已提交 -> Agent 通过/已拒绝 -> 已批准/已拒绝 -> 已停用）
- 维护分配和验证
- 衰减状态计算和管理
- 证据元数据管理
- 反馈记录和处理
- 生命周期转换事件发出（到 outbox 以进行投影失效）

**权威表**：知识条目、知识标签、知识边界表、知识修订、生命周期事件、技能制品、制品修订、skill_artifact_* 结构表、衰减元数据、证据元数据、反馈表

**发出**：
- 生命周期转换事件（通过 outbox）
- 失效事件（用于缓存和投影刷新）
- 投影刷新触发器

**不拥有**：检索读模型、搜索索引写入（这些是 `knowledge-read` 拥有的投影）

### candidate-ingestion

- 当前实现事实：`packages/service-candidate-ingestion` 现在是第三个真实的 `service-*` 包。`packages/host-distributed` 作为薄宿主适配器消费它，`packages/server` 仍是兼容性外壳而非权威的候选组装所有者。

**用途**：新知识候选项的异步接收和处理管道。

**职责**：
- 候选接收（接收陷阱和技能提交）
- 载荷规范化（标准化候选数据）
- 重复检测预处理（指纹计算、语义相似度、精确通道匹配）
- 候选状态推进（已接收 -> 已排队 -> 分析中 -> 检测到重复 / 准备审查 / 已解决 / 错误）
- 重复案例创建和匹配记录
- 解决结果记录（独立发布或合并）
- 实体谱系追踪

**权威表**：candidates、candidate_analyses、candidate_manual_results、candidate_resolution_outcomes、candidate_duplicate_cases、candidate_duplicate_matches、entity_lineage

**不拥有**：知识权威表。当候选项解析为"独立"时，实际的知识/技能条目创建通过远程 `KnowledgeWritePort` 命令分派给 `knowledge-write`。在分布式宿主中，`candidate-ingestion` 不得在远程发布成功之前将候选项标记为已解决，且不得保留到知识事实的本地回退写入路径。

**负载特征**：突发性、重度异步。接收提交后通过多步管道处理。适合独立于同步 API 路径的独立扩展。

### governance-review

**用途**：人在回路的审查工作流和冲突解决。

**实现状态**：已实现为 `packages/service-governance-review`。`packages/host-distributed` 现在是审查决策/反馈服务组装的薄宿主适配器，`packages/server` 仍是兼容性外壳而非权威的审查组装所有者。

**职责**：
- 审查队列管理（知识审查队列、技能制品审查队列）
- 审查工作台状态（分配审查员、追踪审查会话）
- 冲突解决工作流（当重复候选项需要人工判断时）
- 补救队列管理（反馈驱动的补救任务）
- 知识条目的抑制和重新激活状态（由反馈聚合驱动）

**权威表**：人工干预队列、审查工作台状态、冲突解决状态、补救队列状态表

**不拥有**：知识生命周期事实表。审查决策（批准、拒绝、维护、衰减）通过远程 `KnowledgeWritePort` 命令流转；`knowledge-write` 执行权威的生命周期或聚合变更。`governance-review` 不得对知识事实表保留直接仓库写入，即使在共享 PostgreSQL 的 Phase 1 姿态下也是如此。

**关键约束**：此服务不仅仅是简单的工作器。它管理治理状态机和人工工作流编排。

### job-runtime

**用途**：共享的异步执行基底。

**职责**：
- 任务队列管理（入队、出队、租约、回收、死信）
- 工作流运行追踪（长期运行任务快照、进度、完成）
- Outbox 事件调度（拾取 outbox 事件并投递给目标服务）
- 共享任务执行（生命周期索引后续、补救重新激活、坏案例导出草稿生成、胶囊索引重建）
- 任务重试、退避和失败处理

**权威表**：task_queue、workflow_runs、domain_event_outbox、outbox 处理状态、租约/回收元数据

**不拥有**：任何业务领域事实表。它仅执行由其他服务分派的工作。

**角色说明**：`job-runtime` 是基础设施服务。它提供其他服务用来实现最终一致性的执行基底。它不做业务决策。

**实现状态**：已实现为 `packages/service-job-runtime`。`packages/host-distributed` 现在仅作为运行时进程的薄宿主适配器，`packages/server` 仍是兼容性外壳而非权威的运行时组装所有者。

## 内部通信

### 端口优先设计

所有跨服务通信通过 `backend-core` 中定义的内部端口进行。每个端口规定：

- 请求/响应形状（在 `backend-core` 中类型化）
- 超时/取消预期
- 幂等性预期
- 错误分类
- 追踪/关联 ID 传播

### 端口清单

| 端口 | 提供者 | 消费者 |
|---|---|---|
| `IdentityAccessPort` | `identity-access` | gateway、所有其他服务 |
| `KnowledgeReadPort` | `knowledge-read` | gateway |
| `KnowledgeWritePort` | `knowledge-write` | gateway、candidate-ingestion（发布）、governance-review（决策） |
| `CandidateIngestionPort` | `candidate-ingestion` | gateway |
| `GovernanceReviewPort` | `governance-review` | gateway |
| `JobRuntimePort` | `job-runtime` | gateway（状态）、所有服务（分派） |

### 按服务对的通信模式

#### 同步（查询/决策）

- `gateway` -> `identity-access`（每个请求的认证检查）
- `gateway` -> `knowledge-read`（检索查询）
- `gateway` -> `knowledge-write`（生命周期命令）
- `gateway` -> `candidate-ingestion`（候选提交）
- `gateway` -> `governance-review`（审查队列查询）
- `governance-review` -> `knowledge-write`（审查决策）
- `candidate-ingestion` -> `knowledge-write`（发布已解析候选）
- `governance-review` -> `knowledge-write`（维护/衰减聚合变更）

**轻量宿主模式**：通过端口接口的进程内直接调用。

**重量宿主模式**：默认使用内部 HTTP/JSON 适配器。当前 Phase 2 试点仅为冻结的 `knowledge-write` 所有者跳转添加可选 RPC 接缝，同时保持相同的 `KnowledgeWritePort` 契约和失败分类。

当前 RPC 试点范围：

- `governance-review` -> `knowledge-write`
- `candidate-ingestion` -> `knowledge-write`

当前试点约束：

- 传输选择器由宿主拥有；服务包仍仅依赖 `backend-core` 端口。
- RPC 信封路由限于已通过 `KnowledgeWritePort` 委派的现有权威命令集。
- 审查/候选所有者必须保持相同的超时、追踪传播和规范 `InvocationError` 映射，无论宿主选择 `http` 还是 `rpc`。
- 试点不引入 Protobuf、Buf、Connect RPC 或 gRPC 作为新的仓库事实表面。在明确变更之前，正式协议栈保持延迟，当前接缝保持在仓库拥有的信封 RPC 上。

#### 异步（事件/队列）

- `knowledge-write` -> outbox -> `job-runtime` -> `knowledge-read`（投影刷新、缓存失效）
- `knowledge-write` -> outbox -> `job-runtime` -> `governance-review`（生命周期副作用）
- `candidate-ingestion` -> queue -> `job-runtime`（候选处理管道）
- `governance-review` -> outbox -> `job-runtime`（补救后续）
- `job-runtime` -> 任意服务（共享任务执行）

**传输**：PostgreSQL 支持的 task_queue + domain_event_outbox（Phase 1）。`distributed` 配置可选使用 RabbitMQ。

### 通信规则

1. **禁止直接服务间数据库写入。** Service A 不得写入 Service B 的权威表。所有跨服务状态变更通过端口进行。
2. **禁止候选/审查到知识边界的本地回退写入。** 如果远程 `KnowledgeWritePort` 调用返回 `404`、`409`、`403`、`503` 或 `timeout`，调用方必须暴露失败语义，而非静默本地修改知识表。
3. **禁止循环同步调用。** 如果 Service A 同步调用 Service B，Service B 不得同步调用 Service A。反向通信使用异步事件传播。
4. **同步调用有界。** 每个同步内部调用必须有超时和失败策略（快速失败、回退、带退避的重试）。
5. **异步事件按聚合有序。** 同一聚合（例如，同一知识条目 ID）的 outbox 事件必须按序投递。

## 所有权模型

### 权威所有权

每个服务对其表拥有独占写入权限。这是主要的服务边界定义。

| 领域 | 所有者 | 边界规则 |
|---|---|---|
| 认证/会话/访问密钥 | `identity-access` | 仅 `identity-access` 写入认证状态 |
| 用户/团队/成员关系 | `identity-access` | 仅 `identity-access` 写入身份状态 |
| 知识/陷阱/技能 | `knowledge-write` | 仅 `knowledge-write` 写入知识领域状态 |
| 生命周期/衰减/维护 | `knowledge-write` | 仅 `knowledge-write` 写入生命周期状态 |
| 候选/重复/谱系 | `candidate-ingestion` | 仅 `candidate-ingestion` 写入候选管道状态 |
| 审查队列/补救 | `governance-review` | 仅 `governance-review` 写入治理状态 |
| 任务队列/工作流/outbox | `job-runtime` | 仅 `job-runtime` 写入运行时基础设施状态 |
| 投影/搜索索引 | `knowledge-read` | `knowledge-read` 仅写入派生状态 |

### 投影所有权

| 投影 | 写入者 | 事实来源 | 失效触发器 |
|---|---|---|---|
| 检索读模型 | `knowledge-read` | `knowledge-write` 权威表 | 生命周期转换事件 |
| 搜索索引 | `knowledge-read` | `knowledge-write` 权威表 | 条目创建/更新/停用事件 |
| 查询追踪 | `knowledge-read` | 检索查询 | 自生成 |
| 审查队列 | `governance-review` | `governance-review` 队列/工作台表 | 治理状态转换 |
| 维护操作员投影 | `governance-review` | `knowledge-write` 维护事实 + 治理操作员读模型 | 维护决策事件 |
| 衰减工作台搜索 | `governance-review` | `governance-review` 衰减工作台状态 | 衰减决策事件 |
| 权限缓存 | `identity-access` | 用户/团队/成员关系表 | 成员关系/角色变更事件 |

### 故障域隔离

| 服务 | 失败影响 | 降级策略 |
|---|---|---|
| `gateway` | 所有外部流量受影响 | 无回退；网关是唯一入口 |
| `identity-access` | 所有服务认证失败 | 快速关闭：超时时拒绝访问 |
| `knowledge-read` | 检索不可用 | 网关对检索端点返回 503；写入路径不受影响 |
| `knowledge-write` | 写入命令失败 | 网关对写入端点返回 503；检索继续使用过期数据 |
| `candidate-ingestion` | 新候选无法提交 | 现有知识不受影响；候选在积压中排队 |
| `governance-review` | 审查工作流停滞 | 现有已批准知识不受影响；待审查延迟 |
| `job-runtime` | 异步处理停止 | 权威写入仍然成功（本地提交）；投影落后 |

## Phase 1 物理进程映射

在 Phase 1 期间，逻辑服务可能合并到更少的物理进程中：

### 轻量宿主（local-agent / team-monolith）

所有七个逻辑服务在单一进程中运行。端口调用为进程内直接调用。这是当前 `packages/server` 行为的形式化。

### 重量宿主（分布式）-- 初始拓扑

| 物理宿主 | 逻辑服务 |
|---|---|
| `gateway-host` | `gateway` |
| `core-api-host` | `identity-access` + `knowledge-write` |
| `read-host` | `knowledge-read` |
| `worker-host` | `candidate-ingestion` + `governance-review` + `job-runtime` |

此 4 进程拓扑是 `distributed` 的初始 Phase 1 目标。它提供读写隔离和工作器分离，而无需 7 个独立进程。

注意：将 identity-access 和 knowledge-write 共置意味着 knowledge-write 崩溃也会导致所有服务的认证中断。此权衡在 Phase 1 为运维简洁性而可接受；在 Phase 2 中，如果认证可用性变得关键，应评估将 identity-access 拆分为独立进程。

### 未来物理分离

随着负载模式、故障域要求和运维成熟度的演进，以下服务是独立物理进程的候选：

1. `identity-access`（高频认证检查，受益于独立扩展）
2. `knowledge-read`（读密集，受益于独立缓存和连接池）
3. `candidate-ingestion`（突发负载，与写入路径的扩展特征不同）
4. `governance-review`（人工工作流，不同的可用性要求）

## 交互规则

1. 服务不得直接从另一个 `service-*` 包导入代码。可通过 CI 检查没有任何 `service-*` 包出现在另一个 `service-*` 包的 `package.json` 的 `dependencies` 中来验证。所有跨服务交互通过 `backend-core` 端口进行。
2. 宿主包不得嵌入业务逻辑。它仅将端口连接到实现并启动进程。
3. 服务的仓库层只能写入其拥有的表。读取其他服务的表必须通过端口（Phase 1 临时例外有文档记录）。
4. 新领域表必须在创建前分配给恰好一个所属服务。
5. 跨服务事件必须通过 outbox 模式路由，而非跨服务边界的直接函数调用（异步流）。
6. `gateway` API 表面是与外部客户端的契约。内部服务边界是实现细节，不得泄露到 API 表面。

## 参考资料

- [目标架构](TARGET_ARCHITECTURE.md) — 包角色、部署角色、架构原则
- [数据库所有权](DATABASE_OWNERSHIP.md) — 表级所有权和事务规则
- [运行时重组计划 00](../plans/runtime-recomposition/00-baseline-and-target-architecture.md) — 计划起源、服务角色定义
- [运行时重组计划 04](../plans/runtime-recomposition/04-heavy-microservice-assembly.md) — 重量微服务组装、内部端口、通信策略
