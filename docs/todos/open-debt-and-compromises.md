# 未完成项与阶段性妥协清单

本文档只记录“当前仍成立”的工程债务、阶段性妥协和明确 deferred 事项。

与 [`docs/archived/reports/DEBT_AND_PLACEHOLDER_REPORT.md`](../archived/reports/DEBT_AND_PLACEHOLDER_REPORT.md) 的区别：

- 本文档只保留当前仍有 owner 的活跃 debt
- 已完成的 closeout、历史背景和冻结决策不再在这里重复保留
- 需要历史上下文时，回看归档计划和归档报告，而不是把已完成事项继续挂在 active debt register

> 更新于 2026-07-07。已清理此前混入本文件的“已完成说明”和历史 closeout 叙述；这些内容不再作为活跃 debt 保留。

## 1. 高频异步任务仍未完全迁移到持久化任务队列

- **状态**：活跃 debt
- **来源**：[`docs/archived/archived-plans/backend-engineering-optimization-plan.md`](../archived/archived-plans/backend-engineering-optimization-plan.md)

当前已存在的事实：

- [`packages/server/src/lib/persistence/schema/queue.ts`](../../packages/server/src/lib/persistence/schema/queue.ts) 已定义 PG 持久队列 schema
- [`packages/server/src/lib/lifecycle/outbox.ts`](../../packages/server/src/lib/lifecycle/outbox.ts) 已实现 outbox dispatcher 与投递循环
- badcase export、remediation 等异步工作流已走 PG-backed job runtime

当前仍未完成：

- 仍有部分高频异步路径（如部分索引重建、批量派生）尚未完全迁移到持久化队列调度，而是作为进程内副作用执行

## 2. 读侧例外与耦合收口尚未完成

- **状态**：活跃 debt

当前仍成立的结构性妥协：

- [`docs/architecture/SERVICE_BOUNDARIES.md`](../architecture/SERVICE_BOUNDARIES.md) 仍允许 temporary direct-backed projections
- [`docs/architecture/DATABASE_OWNERSHIP.md`](../architecture/DATABASE_OWNERSHIP.md) 仍保留 Phase 1/2 的临时直读例外
- [`docs/architecture/RECOMPOSITION_SUMMARY.md`](../architecture/RECOMPOSITION_SUMMARY.md) 仍承认 distributed 组件存在 seam / stub 残留

按影响面排序，当前这条债务的主要收口方向是：

1. `store_snapshot` allowlist 继续收缩，把 `compatibility JSONB store` 的剩余直读调用迁移到 repo-backed 路径
2. 读侧 temporary direct-backed / projection exception 继续压缩
3. `packages/server` Fastify compatibility shell 的进一步瘦身

### Coupling debt

#### PostgresStore `instanceof` pattern

- **优先级**：中
- **范围**：约 20 个 `packages/server/src/lib/` 文件
- **模式**：编排代码通过 `instanceof PostgresStore` 提取 `Pool`，因为 `SkillShareStore` 接口没有暴露 `getPool()`
- **建议方向**：补一个 port-level 的 database pool access abstraction，例如 `PoolProvider`
- **状态**：known debt，deferred；见 `docs/architecture/BOUNDARIES.md` Category A

#### `service-knowledge-read` deep coupling

- **优先级**：高
- **范围**：`packages/service-knowledge-read/src/` 仍存在多处对 `packages/server/src/` 的深导入
- **模式**：读侧例外从原始 CQRS seam 扩大成 recall / scoring / caching / decay / governance / embeddings 等内部实现耦合
- **当前已收口的事实**：`search-knowledge.ts`、`retrieval-semantic.ts`、`retrieval-recall-coordinator.ts` 已收口到 package-local `retrievalInfra` seam，不再直接深导入 server retrieval internals；剩余 server 依赖主要留在 default infra 装配与非本批范围文件（如 `filters.ts`、`read-model.ts`、`response-refinement.ts`）
- **建议方向**：迁移到稳定 port/query seam，只暴露读侧真正需要的 query capabilities
- **状态**：known debt，tracked；见 `docs/architecture/BOUNDARIES.md` Category B

## 3. 分布式运行时成熟度仍是 deferred 平台级事项

- **状态**：deferred / platform maturity

当前已经完成的 closeout 证据不再在本文件重复展开；这里只保留仍成立的残留判断：

- service discovery、独立扩缩容、独立故障域仍未提升为当前默认能力面
- Grafana UI 人肉点击验收和目标环境复验仍未形成 checked-in closeout 证据
- 这类事项属于平台成熟度 follow-up，而不是当前仓库主线的代码未实现

当前明确继续留在 deferred 的平台化事项包括：

- Kubernetes / Ingress / Service Mesh 平台化
- service-to-service auth hardening
- per-service database
- MQ 全面替换
- 外部缓存平台
- dashboard-as-code
- alert rule pack
- container CPU/memory checked-in defaults
- Node heap presets
- PgBouncer / pool introspection contract

与此前 closeout 冻结口径保持一致：这些 deferred 项仍属于“只补到 `/metrics`、trace/span propagation、structured logging、distributed pool-budget env seam，以及基于 `/health`、`/ready`、`/metrics`、`/v1/operations/status/async` 的 operator runbook 与 task queue / internal hop latency / error rate 首批 dashboard/alert/SLO 文档面，**不扩成新的 monitoring platform**”之后明确留下的残留面。

## 4. Eval platform 的活跃剩余项不在 debt register 收口

- **状态**：active owner plan owns the live closeout

当前判断冻结如下：

- retrieval / summary / agent-planning 已全部切到 suite-owned platform event builder，这部分 debt 已闭环
- `LangfuseAdapter` 已以 warning-only mirror 方式接入 aggregate runner，并完成自动化验证
- 当前仍留在 active todo 的剩余 closeout 只剩真实 Langfuse 目标验证；它属于 [`agent-eval-framework-evaluation-and-plan.md`](./agent-eval-framework-evaluation-and-plan.md) 中的 active owner plan，而不是本 debt register
- `MLflow` 与第二平台可替换性验证继续留在 deferred，不作为当前 active closeout 的剩余项

## 5. 当前仍保留的显式开发退路

### `packages/web-panel/src/services/admin-panel-service-context.ts`

- `VITE_ADMIN_PANEL_API_MODE=mock` 的 mock 分支仍然存在
- 这不是默认假实现，但它意味着前端链路仍允许绕开真实后端推进局部开发或演示
- 已归档的 badcase 回流闭环与 canonical taxonomy 事实仍成立，但因为已经闭环，不再继续保留为 active debt

## 6. 已冻结为 deferred 的设计决策

### LangChain `.withStructuredOutput()`

- **决策**：继续保留当前 `stripCodeFences -> JSON.parse -> safeParse` 路径
- **原因**：当前重复更多来自 per-module retry loop，而不是结构化解析本身；`.withStructuredOutput()` 也没有解决 parse-failure retry
- **重新评估触发条件**：单 provider 收敛且生产 parse failure rate > 5%，或 LangChain 提供内建 retry-on-parse-failure

### Consul KV

- **决策**：deferred
- **原因**：当前没有明确近期开启场景；runtime config 仍由 env 管理，共享状态由 Postgres 承载，`DiscoveryPort` 已定义 `getKV`/`setKV` seam
- **触发条件**：需要亚分钟级 runtime feature flag 传播，或出现 Postgres advisory locks 无法覆盖的分布式协调需求

## 证据入口

- [`packages/server/src/lib/persistence/schema/queue.ts`](../../packages/server/src/lib/persistence/schema/queue.ts)
- [`packages/server/src/lib/lifecycle/outbox.ts`](../../packages/server/src/lib/lifecycle/outbox.ts)
- [`packages/web-panel/src/services/admin-panel-service-context.ts`](../../packages/web-panel/src/services/admin-panel-service-context.ts)
- [`docs/architecture/SERVICE_BOUNDARIES.md`](../architecture/SERVICE_BOUNDARIES.md)
- [`docs/architecture/DATABASE_OWNERSHIP.md`](../architecture/DATABASE_OWNERSHIP.md)
- [`docs/architecture/RECOMPOSITION_SUMMARY.md`](../architecture/RECOMPOSITION_SUMMARY.md)
- [`docs/archived/archived-plans/backend-engineering-optimization-plan.md`](../archived/archived-plans/backend-engineering-optimization-plan.md)
- [`docs/archived/reports/DEBT_AND_PLACEHOLDER_REPORT.md`](../archived/reports/DEBT_AND_PLACEHOLDER_REPORT.md)
