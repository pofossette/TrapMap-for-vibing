# @trapmap/runtime-infra

TrapMap 宿主与服务的共享运行时基础设施层。提供存储、异步传输、AI 提供者、图查询后端和事件总线的统一组装入口。

## 职责

- **运行时组装** -- 通过 `createRuntimeSharedInfra` 一次性构建完整的共享基础设施对象（store、repos、async transport、AI providers、graph query、event bus）
- **read-side retrieval 默认装配** -- 暴露 `createDefaultKnowledgeReadRetrievalInfra`，把知识读取服务所需的 embedding、routing、recall、scoring 默认实现收口到稳定 owner seam
- **存储抽象** -- 提供 JSON 文件存储和 PostgreSQL 存储两种实现，由配置自动选择
- **异步任务队列** -- 基于 PostgreSQL `SKIP LOCKED` 的持久化任务队列，支持优先级、指数退避重试、死信队列和租约回收；可选 RabbitMQ 后端
- **领域事件 Outbox** -- 将写路径事务中的事件持久化到 PostgreSQL，由后台 worker 异步处理，解耦 HTTP 请求生命周期与重副作用（索引、冲突检测等）
- **运行时模式控制** -- 通过 `RuntimeMode` 决定启动哪些 worker（API / task-worker / outbox-worker / combined）
- **可观测性** -- 内置 Prometheus 格式指标采集，覆盖执行计数、延迟直方图、队列积压、重试/回收等维度

## 模块结构

| 模块 | 说明 |
|---|---|
| `shared-infra.ts` | 顶层组装函数 `createRuntimeSharedInfra`，统一创建并返回完整的 `RuntimeInfraShared` 对象 |
| `store.ts` | 从 `@trapmap/server` 重导出 `JsonStore`、`SkillShareerStore`、`StoreData` 等存储类型 |
| `store-factory.ts` | 工厂函数 `createSkillShareerStore`：有 `databaseUrl` 时创建 `PostgresStore`，否则创建 `JsonStore` |
| `postgres-store.ts` | `PostgresStore` 实现 -- 基于 `pg.Pool` 的事务性快照存储，使用 `SELECT ... FOR UPDATE` 保证并发安全 |
| `repos.ts` | `createRuntimeInfraRepos` -- 统一创建所有领域仓库（knowledge、candidate、feedback、audit、graph-index 等共 15 个） |
| `async-transport.ts` | 异步传输接口定义（`AsyncTransport`、`AsyncTaskTransport`、`AsyncEventTransport`）及 PostgreSQL 实现工厂 |
| `async-factory.ts` | `createAsyncTransport` -- 根据配置选择 PostgreSQL 或 RabbitMQ 作为任务传输后端 |
| `task-queue.ts` | PostgreSQL 任务队列实现：`createTaskQueue`（入队/出队/重试/死信/租约回收）和 `createTaskWorker`（轮询消费 worker） |
| `rabbitmq-task-queue.ts` | RabbitMQ 任务传输实现 `createRabbitMqTaskTransport`，实现相同的 `AsyncTaskTransport` 接口 |
| `outbox.ts` | `createDomainEventOutbox` -- 领域事件 Outbox，支持事务内入队、批量 claim（SKIP LOCKED）、指数退避重试、过期租约回收 |
| `event-bus.ts` | `LifecycleEventBus` -- 基于 Node.js `EventEmitter` 的进程内领域事件总线，支持同步/异步派发 |
| `lifecycle-types.ts` | 生命周期事件类型定义：`DomainEvent`、`DomainEventHandler`、`TransitionDefinition`、`TransitionContext` |
| `metrics.ts` | 运行时指标模块 -- 计数器、直方图、Gauge 的内存采集，`renderPrometheusMetrics` 导出 Prometheus 文本格式 |
| `runtime-contract.ts` | 运行时模式与 worker 快照：`RuntimeMode` 类型、`shouldBoot*` 决策函数、`snapshotRuntimeWorker` |
| `knowledge-read-retrieval-infra.ts` | `service-knowledge-read` retrieval seam 的默认实现 owner，封装 embedding/cache、routing、conflict enrichment、recall 和 scoring 默认装配 |

### 关于类型级 seam 接口

`shared-infra.ts` 中导出的 `RuntimeInfraAdapterRegistry`、`RuntimeInfraAiProviders`、`RuntimeInfraGraphQueryBackend` 等类型**不是独立模块**，而是从 `RuntimeInfraShared` 接口提取的类型别名。它们作为类型级 seam 接口存在，允许消费方在不引用完整 `RuntimeInfraShared` 的情况下约束特定字段的类型。

## 关键导出

**组装入口：**
- `createRuntimeSharedInfra(config)` -- 返回 `Promise<RuntimeInfraShared>`
- `createDefaultKnowledgeReadRetrievalInfra()` -- 返回 read-side retrieval 默认基础设施对象

**存储：**
- `JsonStore`、`PostgresStore`、`createSkillShareerStore`

**异步传输：**
- `createAsyncTransport`、`createPostgresTaskTransport`、`createPostgresEventTransport`
- `createRabbitMqTaskTransport`

**任务队列：**
- `createTaskQueue`、`createTaskWorker`、`taskQueue`（Drizzle 表定义）

**事件：**
- `LifecycleEventBus`、`createDomainEventOutbox`
- `DomainEvent`、`DomainEventHandler`

**指标：**
- `renderPrometheusMetrics`、`getRuntimeMetricsSnapshot`、`resetRuntimeMetrics`
- `recordRuntimeExecution`、`recordRuntimeRetry`、`recordRuntimeReclaim`、`recordRuntimeBacklog`
- `recordDatabaseMetric`、`recordQueueMetric`

**运行时模式：**
- `shouldBootApiRuntime`、`shouldBootTaskWorker`、`shouldBootOutboxWorker`、`shouldOwnAsyncWork`
- `snapshotRuntimeWorker`

## 依赖

| 依赖 | 用途 |
|---|---|
| `@trapmap/server` | 提供存储实现、领域仓库工厂、AI providers、adapter registry、graph query backend |
| `drizzle-orm` | 任务队列和 Outbox 的 ORM 层 |
| `pg` | PostgreSQL 连接池 |
