# 数据库所有权规则

> 由运行时重组计划 Task 00 冻结。本文档定义表级所有权、事务边界规则以及共享 PostgreSQL 数据库在 Phase 1 的约束。

## 状态

- 阶段：Phase 1（共享 PostgreSQL，显式所有权）
- 取代任何隐式的"所有服务均可写入所有表"的惯例

## 指导原则

1. **每张表只有一个权威写入者。** 任何权威表不应拥有超过一个负责写入的所属服务。
2. **共享数据库不等于共享写权限。** 即使所有服务连接到同一个 PostgreSQL 实例，表级写入所有权在模块边界处被严格执行。
3. **跨服务一致性通过 outbox 实现，而非分布式事务。** Phase 1 不引入跨数据库的分布式事务或两阶段提交。
4. **读侧状态是派生的。** 投影、缓存和搜索索引由写侧服务发出的事件派生而来，可以被重建。

## 表级所有权

### identity-access（仅写入）

`identity-access` 服务拥有以下表的所有权威写入权限：

| 表族 | 示例 | 所有权 |
|---|---|---|
| 认证/会话 | `sessions` 及会话相关表 | `identity-access` 写入 |
| 访问密钥 | `access_keys`、`pg_access_keys` | `identity-access` 写入 |
| 用户 | `users`、`pg_users` | `identity-access` 写入 |
| 团队 | `teams`、`pg_teams` | `identity-access` 写入 |
| 成员关系 | `memberships`、`pg_memberships` | `identity-access` 写入 |

其他服务可通过 `backend-core` 中定义的 `IdentityAccessPort` 读取这些表。其他任何服务不得直接写入这些表。

### knowledge-write（仅写入）

`knowledge-write` 服务拥有以下表的所有权威写入权限：

| 表族 | 示例 | 所有权 |
|---|---|---|
| 知识条目 | `knowledge_entries`、`knowledge_labels`、`knowledge_boundary_*`、`knowledge_maintenance_assignments` | `knowledge-write` 写入 |
| 知识修订 | `knowledge_revisions` | `knowledge-write` 写入 |
| 生命周期事件 | `lifecycle_events` | `knowledge-write` 写入 |
| 技能制品 | `skill_artifacts`、`artifact_revisions`、`skill_artifact_*`（元数据、文件、脚本描述符、配置文件、胶囊、客户端清单、边界、维护、Agent 审查） | `knowledge-write` 写入 |
| 制品生命周期事件 | `artifact_lifecycle_events` | `knowledge-write` 写入 |
| 衰减元数据 | 衰减状态列、衰减配置 | `knowledge-write` 写入 |
| 证据 | 证据元数据表 | `knowledge-write` 写入 |
| 反馈 | `feedback` 表 | `knowledge-write` 写入 |

其他服务可通过内部端口读取这些表。如果 `candidate-ingestion` 需要发布新的知识条目，或 `governance-review` 需要批准/拒绝/应用维护/应用衰减，它们通过远程 `KnowledgeWritePort` 命令表面执行。它们不会直接写入 `knowledge_entries`、生命周期表或维护/衰减事实表。

### candidate-ingestion（仅写入）

`candidate-ingestion` 服务拥有以下表的所有权威写入权限：

| 表族 | 示例 | 所有权 |
|---|---|---|
| 候选项 | `candidates` | `candidate-ingestion` 写入 |
| 候选分析 | `candidate_analyses` | `candidate-ingestion` 写入 |
| 候选手动结果 | `candidate_manual_results` | `candidate-ingestion` 写入 |
| 候选解决结果 | `candidate_resolution_outcomes` | `candidate-ingestion` 写入 |
| 重复案例 | `candidate_duplicate_cases`、`candidate_duplicate_matches` | `candidate-ingestion` 写入 |
| 实体谱系 | `entity_lineage` | `candidate-ingestion` 写入 |

当候选项解析产生已发布实体（知识条目或技能制品）时，对目标领域表的写入由所属服务（`knowledge-write`）执行，而非 `candidate-ingestion`。

### governance-review（仅写入）

`governance-review` 服务拥有以下表的所有权威写入权限：

| 表族 | 示例 | 所有权 |
|---|---|---|
| 人工干预队列 | 审查队列状态表 | `governance-review` 写入 |
| 审查工作台状态 | 工作台会话表 | `governance-review` 写入 |
| 冲突解决状态 | 冲突检测和解决表 | `governance-review` 写入 |
| 补救队列状态 | 补救任务表、抑制状态 | `governance-review` 写入 |

`governance-review` 不直接修改知识生命周期事实表。当审查决策改变知识条目的生命周期状态，或当维护/衰减改变最终知识聚合状态时，决策通过远程 `KnowledgeWritePort` 命令流转，由 `knowledge-write` 执行权威变更。

### job-runtime（仅写入）

`job-runtime` 服务拥有以下表的所有权威写入权限：

| 表族 | 示例 | 所有权 |
|---|---|---|
| 任务队列 | `task_queue` | `job-runtime` 写入 |
| 工作流运行 | `workflow_runs` | `job-runtime` 写入 |
| Outbox 调度运行时 | `domain_event_outbox`、outbox 处理状态 | `job-runtime` 写入 |
| 租约/回收元数据 | 任务租约、回收计数器、死信状态 | `job-runtime` 写入 |

`job-runtime` 不拥有任何业务领域事实表。它仅执行由其他服务分派的工作，并管理任务生命周期、重试和死信处理的运行时机制。

### knowledge-read（只读投影）

`knowledge-read` 服务不拥有任何权威事实表。它可能拥有：

| 表族 | 示例 | 所有权 |
|---|---|---|
| 只读投影 | 物化视图、反规范化读模型 | `knowledge-read` 写入（仅派生） |
| 缓存表 | 外部缓存索引元数据 | `knowledge-read` 写入（仅派生） |
| 搜索索引表 | `knowledge_embeddings`、`knowledge_keywords`、`knowledge_search_documents`、`graph_index_documents` | `knowledge-read` 写入（仅派生） |
| 查询追踪读侧 | `retrieval_badcase_traces`、查询分析 | `knowledge-read` 写入（仅派生） |

这些表由 `knowledge-write` 和其他权威服务发出的事件派生而来，可随时从权威来源重建。

## 读取访问规则

- 任何服务可以读取其自身拥有的表。
- 对于其他服务拥有的表，读取必须通过适当的内部端口（在 `backend-core` 中定义），而非直接访问表。例外：在 Phase 1 期间，当服务仍共享单一 `packages/server` 代码库时，允许直接读取，但必须在调用处添加注释记录：`// PHASE-1-TEMPORARY: direct read from <table>; replace with projection read after Phase 2`
- `knowledge-read` 的 `knowledge-entry:getById` 与 `knowledge-entry:listMine` 已由 `knowledge-read` 自有派生 entry projection 承载；请求路径不得直接读取 `knowledge-write` 权威表。projection refresh 可以通过仓库端口读取权威来源并在失效后重建快照。
- `governance-review` 拥有审查队列、维护操作员视图和衰减工作台读取。如果治理侧读取在 Phase 2 仍需要共享权威状态，必须记录为临时直接支持的操作员投影，而非并入 `knowledge-read`。

## 事务边界规则

### 单服务事务

每个所属服务可使用本地 PostgreSQL 事务保证以下操作的原子性：

- 权威写入（例如，插入新的知识条目）
- 本地 outbox 写入（例如，向 `domain_event_outbox` 追加生命周期转换事件）

两个操作一起提交或回滚。这是主要的一致性机制。

```
BEGIN;
  INSERT INTO knowledge_entries (...);
  INSERT INTO domain_event_outbox (...);
COMMIT;
```

### 跨服务流程

多个服务的写入不得包装在单一的跨服务数据库事务中。跨服务流程遵循以下模式：

1. **权威写入**：所属服务写入其权威表，并在单一事务中追加到其本地 outbox。
2. **Outbox 追加**：outbox 事件与权威写入原子提交。
3. **异步投递**：`job-runtime` 拾取 outbox 事件并投递给目标服务。
4. **投影/后续处理**：目标服务处理事件并更新自身状态（投影表、缓存失效、向另一个所属服务分派命令）。

```
Service A:  BEGIN; write_authoritative; append_outbox; COMMIT;
                  ↓ (async)
job-runtime:     pick up outbox event → deliver to Service B
                  ↓
Service B:  BEGIN; update_projection; append_own_outbox; COMMIT;
```

### 同步查询 + 异步后续

网关或同步调用方在权威写入提交后收到"已接收/已授权/已写入"的即时响应。调用方不得假设：

- 投影已更新
- 缓存失效已完成
- 治理副作用已处理
- 读侧索引反映最新写入

这是设计如此。同步响应保证权威写入的持久性；异步后续保证派生状态的最终一致性。

### 禁止的模式

| 模式 | 禁止原因 |
|---|---|
| 跨服务 BEGIN/COMMIT 跨越多个服务 | 违反服务所有权边界；产生隐式耦合 |
| Service A 直接写入 Service B 的权威表 | 违反单一写入者所有权规则 |
| 假设同步写入返回后投影已是最新 | 违反异步后续契约 |
| 使用共享数据库连接作为隐式分布式事务 | 服务间无隔离；回滚语义未定义 |

## Phase 1 约束

1. **共享 PostgreSQL**：所有服务连接到同一个 `TRAPMAP_DATABASE_URL`。这是临时安排，不意味着共享写权限。
2. **无分布式事务**：无两阶段提交、无 XA 事务、无跨服务 `BEGIN`/`COMMIT`。
3. **Outbox 是跨服务一致性机制**：所有跨服务状态传播通过 outbox + 队列 + 异步投递实现。
4. **所有权在模块边界执行**：即使服务共享数据库连接，每个服务的仓库层在写入时只能访问其拥有的表。
5. **允许投影重建**：`knowledge-read` 可随时从权威事件重建其投影表。这是派生状态的恢复机制。

## 数据库访问模式总结

| 服务 | 权威写入 | 读取自身表 | 读取其他服务的表 |
|---|---|---|---|
| `identity-access` | 认证、会话、访问密钥、用户、团队、成员关系 | 是 | 通过 `IdentityAccessPort` |
| `knowledge-write` | 知识、制品、生命周期、衰减、维护、证据、反馈 | 是 | 通过内部端口 |
| `candidate-ingestion` | 候选、重复案例、谱系 | 是 | 通过远程 `KnowledgeWritePort` 发布 |
| `governance-review` | 审查队列、工作台、冲突、补救 | 是 | 通过远程 `KnowledgeWritePort` 批准/拒绝/维护/衰减 |
| `job-runtime` | 任务队列、工作流运行、outbox | 是 | 通过内部端口（事件投递） |
| `knowledge-read` | 投影、搜索索引、查询追踪（仅派生） | 是 | Phase 2：仅显式声明的临时直接支持条目投影可直接读取；检索/搜索/查询追踪保持派生 |

## 未来数据库演进

### Phase 2：共享模式卫生

- 按所属服务进行清晰的表分组和命名规范
- 明确记录哪个服务可写入哪张表
- 模式迁移所有权：每个服务的迁移仅涉及其拥有的表

### Phase 3：投影加固

- 读侧投影、治理队列状态和异步运行时状态收敛到所属服务
- 路由本地的临时查询被显式投影表替代

### Phase 4：选择性拆分评估

数据库拆分仅在满足以下一个或多个条件时评估：

- 单个服务需要独立扩展，且数据库热点集中在该领域
- 某领域需要独立的备份/恢复/保留策略
- 某领域的访问模式对主数据库造成稳定干扰
- 安全或合规要求强制独立数据边界

在达到这些阈值之前，表级所有权、事务边界和投影治理已足够。

## 连接与容量规划

- 每个服务必须支持独立的连接池大小、空闲超时和语句超时配置。
- `knowledge-read` 和 `job-runtime` 是连接使用量最高的服务；优先监控。
- 不要默认使用单体时代的单连接池每进程值。

## 参考资料

- [目标架构](TARGET_ARCHITECTURE.md) — 包角色、部署角色、服务角色
- [服务边界](SERVICE_BOUNDARIES.md) — 服务角色定义和所有权模型
- [运行时重组计划 00](../plans/runtime-recomposition/00-baseline-and-target-architecture.md) — 计划起源、数据库原则
- [运行时重组计划 04](../plans/runtime-recomposition/04-heavy-microservice-assembly.md) — 数据库处理策略、表级所有权、事务边界
