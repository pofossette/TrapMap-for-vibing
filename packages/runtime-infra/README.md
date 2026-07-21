# @trapmap/runtime-infra

TrapMap compatibility shell 的共享运行时基础设施层。提供存储、AI 提供者和图查询后端的统一组装入口。

## 职责

- **运行时组装** -- 通过 `createRuntimeSharedInfra` 一次性构建共享基础设施对象（store、repos、AI providers、graph query）
- **read-side retrieval 默认装配** -- 暴露 `createDefaultKnowledgeReadRetrievalInfra`，把知识读取服务所需的 embedding、routing、recall、scoring 默认实现收口到稳定 owner seam
- **存储抽象** -- 提供 JSON 文件存储和 PostgreSQL 存储两种实现，由配置自动选择
- **异步运行时** -- 任务队列、Outbox、worker 与 RabbitMQ transport 已归属 `@trapmap/service-job-runtime`，由 host 显式组合
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
