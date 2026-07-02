# 未完成项与阶段性妥协清单

本文档记录当前仓库里仍未收口、仅作占位，或为了推进节奏而保留的明确妥协项。

与 [`docs/archived/reports/DEBT_AND_PLACEHOLDER_REPORT.md`](../archived/reports/DEBT_AND_PLACEHOLDER_REPORT.md) 的区别：

- 本文档只描述“当前仍成立”的事项
- 归档报告保留历史背景和阶段性快照

## 1. host-local 运行时：已从 scaffold 推进到 Nest 装配

当前 host-local 运行时通过 Nest 模块化装配，早期 scaffolding stubs 已被替换为真实的服务装配：

- [`packages/host-local/src/nest/runtime/host-runtime.ts`](../../packages/host-local/src/nest/runtime/host-runtime.ts)：运行时生命周期装配
- [`packages/host-local/src/nest/runtime/host-services.ts`](../../packages/host-local/src/nest/runtime/host-services.ts)：宿主服务注册
- [`packages/host-local/src/nest/runtime/shared-infra.ts`](../../packages/host-local/src/nest/runtime/shared-infra.ts)：共享基础设施（adapter registry 等）
- [`packages/host-local/src/nest/app.module.ts`](../../packages/host-local/src/nest/app.module.ts)：顶层 Nest module 入口

这意味着早期 scaffolding stubs 已被替换为真实的服务装配。剩余的运行时成熟度问题（如 distributed 侧的完整硬化）归入 deferred 平台级事项，不再是”占位实现”。

## 2. 明确还没完成的工程化事项

### `docs/archived/archived-plans/backend-engineering-optimization-plan.md`（已归档）

当前真正仍未完成的条目只剩一项：

1. 将高频异步任务从进程内副作用迁移到持久化任务队列

当前已存在的事实：

- `packages/server/src/lib/persistence/schema/queue.ts` 已定义 PG 持久队列 schema
- `packages/server/src/lib/lifecycle/outbox.ts` 已实现 outbox dispatcher 与投递循环
- badcase export、remediation 等异步工作流已走 PG-backed job runtime

剩余债务是：仍有部分高频异步路径（如部分索引重建、批量派生）尚未完全迁移到持久化队列调度，而是作为进程内副作用执行。

之前”为检索、摘要、治理失败补齐 `queryId`、结果快照和失败分类”这一条目已经闭环：

- 检索响应已暴露 `queryId`，feedback 已保存 `queryId` + 命中快照 + 正确预期
- 摘要失败分类已有 `summaryEvalFailureKindSchema`（`contracts/src/domain/evals/report.ts`）
- 治理失败分类已由 `summarizeFailureClassifications`（`server/src/routes/operations/status.ts`）暴露
- badcase export / eval draft 链路已由 `scripts/export-badcase-to-eval.ts` 和 `/v1/operations/badcases/:feedbackId/export` 覆盖

### `docs/archived/archived-plans/badcase-feedback-loop.md`（已归档）

badcase 回流链路已全面闭环，包括分类标准：

- 统一分类已定义并落地为 canonical taxonomy：`recall-miss`、`ranking-error`、`summary-hallucination`、`governance-leak`、`stale-content`
- 权威定义位于 [`packages/contracts/src/enum-types/badcase-taxonomy.ts`](../../packages/contracts/src/enum-types/badcase-taxonomy.ts)
- 旧值 `missing-recall`、`outdated-content` 仅作为兼容别名输入，持久化统一回写 canonical taxonomy

## 3. 为推进节奏保留的结构性妥协

### 读侧仍允许阶段性例外

归档报告中已点名的几处妥协目前仍然有效：

- `docs/architecture/SERVICE_BOUNDARIES.md` 允许 temporary direct-backed projections
- `docs/architecture/DATABASE_OWNERSHIP.md` 允许 Phase 1/2 的临时直读例外
- `docs/architecture/RECOMPOSITION_SUMMARY.md` 承认 distributed 组件仍有 seams/stubs

这些都说明：

- 边界和命名已经更清晰
- 但读写彻底分离、distributed 侧完全硬化，还没有全部做完

### 深度细节被有意 deferred

`docs/archived/archived-plans/backend-engineering-optimization-plan.md` 还明确写了两类 closeout 方式：

- `capacityModel.databasePool.maxConnections` 被关闭为 deferred detail
- 热点 `team/query/artifact` drill-down 被关闭为 non-default deep drill-down

这不是 bug，而是范围控制后的有意妥协：先保证 operator surface 的主 contract，暂不把更深的驱动内部状态和热点细节提升为默认 truth surface。

## 4. 仍保留的显式开发退路

### `packages/web-panel/src/services/admin-panel-service-context.ts`

当前 web panel 默认走真实 API，但仍保留：

- `VITE_ADMIN_PANEL_API_MODE=mock` 的 mock 分支

这不是“默认假实现”，但仍然是明确保留的开发/演示退路。只要这个分支存在，就表示前端链路还允许绕开真实后端来推进局部开发。

## 5. 当前判断

按影响面排序，当前最值得优先继续收口的是：

1. `store_snapshot` allowlist 继续收缩：把 `compatibility JSONB store` 的剩余直读调用迁移到 repo-backed 路径
2. 读侧 temporary direct-backed / projection exception 继续压缩
3. compat shell / 重复 transport 清理：`packages/server` Fastify compatibility shell 的进一步瘦身
4. 高频异步任务从进程内副作用迁移到持久化任务队列
5. 平台级 distributed 运维成熟度（service discovery、独立扩缩容、独立故障域）：明确 deferred，在真实吞吐出现后再评估
6. Phase 3/4 closeout deferred：OTEL collector deployment asset、Prometheus/Grafana dashboard-as-code、alert rule pack、service-to-service auth hardening、container CPU/memory checked-in defaults、Node heap presets、PgBouncer / pool introspection contract 仍未落地。本轮只补到 `/metrics`、trace/span propagation、structured logging、distributed pool-budget env seam，以及基于 `/health`、`/ready`、`/metrics`、`/v1/operations/status/async` 的 operator runbook 与 task queue / internal hop latency / error rate 首批 dashboard/alert/SLO 文档面，不扩成新的 monitoring platform。

Phase 4 closeout 对剩余 deferred 的处理原则已经冻结：

- 能用现有 truth source 明确写成“当前不承诺”的事项，不再继续保留为 active checklist，而是直接留在 debt register / deferred 落点
- 只有仍然阻塞当前 active plan 完成定义、且能够在保持 `gateway only` 与既有 truth boundary 不变的前提下做最小真实落地的项，才继续留在 active todo
- 当前明确转 deferred 的包括：Kubernetes/Ingress/Service Mesh 平台化、service-to-service auth hardening、per-service database、MQ 全面替换、外部缓存平台、dashboard-as-code、alert rule pack、Node heap preset 与 PgBouncer introspection contract
- 当前仍留在 active todo 的剩余 closeout 只剩两类：checked-in 资源治理默认值是否要继续最小补齐，以及 active-vs-archived 索引状态何时满足归档条件

## 7. Coupling Debt Register (Phase 0.6 Audit)

The following coupling patterns were identified during the Phase 0.6 coupling audit and logged as known tech debt. They are intentional but should be tracked for future resolution.

### 7.1 PostgresStore `instanceof` Pattern

- **Priority**: Medium
- **Scope**: ~20 files across `packages/server/src/lib/`
- **Pattern**: Orchestration code uses `instanceof PostgresStore` to extract `Pool` from the Store interface because `SkillShareStore` does not expose `getPool()`
- **Resolution**: Introduce a port-level "database pool access" abstraction (e.g. `PoolProvider` interface)
- **Status**: Known debt, deferred. See `docs/architecture/BOUNDARIES.md` Category A.

### 7.2 service-knowledge-read Deep Coupling

- **Priority**: High
- **Scope**: 30+ internal imports from `packages/server/src/` in `packages/service-knowledge-read/src/`
- **Pattern**: Despite the zone-level CQRS exception, imports have grown beyond the original read-side scope into wholesale duplication of server internals (recall, scoring, caching, decay, governance, embeddings)
- **Resolution**: Migrate to stable port interfaces that expose only the query capabilities the read-side needs
- **Status**: Known debt, tracked. See `docs/architecture/BOUNDARIES.md` Category B.

## 8. Library Replacement Decisions (Phase 3)

> Full evaluation: [`docs/todos/library-replacement-evaluation.md`](library-replacement-evaluation.md)

### 8.1 Resilience Library — Replace with `cockatiel`

- **Decision**: Replace hand-rolled `executeWithResilience` with `cockatiel`
- **Why**: Current `withTimeout` uses `setTimeout` without `AbortController` cancellation. On retry, the old Promise remains pending, leaking connections and risking double-execution side effects. `cockatiel` solves this natively.
- **Status**: Planned for current hardening phase (before production traffic)
- **Migration scope**: New `resilience-v2.ts` wrapping `cockatiel`, preserving existing `ResiliencePolicy`/`ResilienceResult` interfaces, 5 call sites to migrate

### 8.2 LangChain `.withStructuredOutput()` — Keep Current Approach

- **Decision**: Keep manual `stripCodeFences -> JSON.parse -> safeParse` pattern
- **Why**: The parsing boilerplate is already minimal (~15 lines per call site, extracted into helpers). The real duplication is per-module retry loops, not parsing. `.withStructuredOutput()` does not add built-in retry-on-parse-failure and would create a split code path across the 6+ providers supported by `ChatProvider`.
- **Trigger to re-evaluate**: Single-provider consolidation AND >5% parse failure rate in production logs, OR LangChain adds built-in retry-on-parse-failure
- **Immediate action**: Extract the retry-loop duplication into a shared `invokeWithParseRetry` wrapper (no library change needed)

### 8.3 Consul KV — Deferred

- **Decision**: Defer to future phase
- **Why**: No concrete near-term use case. Runtime config is served by env vars; shared state uses Postgres; no leader election or distributed lock patterns exist. The `DiscoveryPort` interface already defines `getKV`/`setKV` and is tested.
- **Trigger to include**: Runtime feature flags requiring sub-minute propagation (canary rollouts, kill switches), or distributed coordination needs that Postgres advisory locks cannot serve

### 8.4 2026-07-02 Distributed Local Closeout Gaps

- **Status**: Active debt, observed in local deployment validation
- **Why it is still current**: 本轮已经证明 distributed 七进程拓扑可以通过挂载本地工作区的容器手工跑起来，但 checked-in deployment/discovery/observability 闭环仍未达到 closeout 要求

Current confirmed gaps:

- `packages/host-distributed/Dockerfile` 无法完成 checked-in distributed 镜像构建：构建过程未复制 `packages/runtime-infra`，`docker compose --profile distributed up -d --build` 因 `tsc -b` 失败而中断。
- distributed gateway 当前不提供符合 closeout 口径的 `/metrics` surface：`GET /metrics` 被 gateway auth hook 拦成 `401`，导致 `rtk pnpm test:observability-benchmark -- --base-url http://127.0.0.1:4000` 无法通过。
- request correlation 证据未闭环：`GET /health` 不回显 `x-request-id` / `traceparent`；stdout 只有 Fastify `reqId`，缺少 `requestId` / `traceId` 结构化日志证据。
- Prometheus checked-in targets 与 distributed 实际监听端口不一致，当前无法形成有效抓取。
- Consul agent 本身可达，手工注册 probe service 可成功；但应用自动注册后 `v1/agent/services` / `v1/catalog/services` 未出现 TrapMap 实例，说明“代码存在注册 seam”与“本地可验收注册证据”之间仍有缺口。
- 分布式业务路径只证明了 gateway 到内部服务的 HTTP hop 可达；`identity-access` 登录链路当前仍返回 `500`，尚不能作为“业务面已健康”的 closeout 证据。

Remaining closeout work:

- 修复 distributed Docker build/compose 资产，使 checked-in compose 可以直接构建并起全量服务。
- 为 distributed gateway 补齐或显式开放可观测性 surface：`/metrics`、request-id / trace header 回显、结构化日志字段。
- 对齐 Prometheus scrape targets 与 distributed 实际端口或统一其 runtime 端口约定。
- 查清并修复 Consul 自动注册未落地的原因，补齐本地 catalog / health passing 证据。
- 在目标环境重复执行 Consul / Grafana / Tempo / Loki / benchmark 验收，不能用本地结果替代。

## 6. 证据入口

- [`packages/host-local/src/nest/runtime/host-runtime.ts`](../../packages/host-local/src/nest/runtime/host-runtime.ts)
- [`packages/host-local/src/nest/runtime/host-services.ts`](../../packages/host-local/src/nest/runtime/host-services.ts)
- [`packages/host-local/src/nest/runtime/shared-infra.ts`](../../packages/host-local/src/nest/runtime/shared-infra.ts)
- [`packages/host-local/src/nest/app.module.ts`](../../packages/host-local/src/nest/app.module.ts)
- [`packages/contracts/src/enum-types/badcase-taxonomy.ts`](../../packages/contracts/src/enum-types/badcase-taxonomy.ts)
- [`packages/server/src/lib/persistence/schema/queue.ts`](../../packages/server/src/lib/persistence/schema/queue.ts)
- [`packages/server/src/lib/lifecycle/outbox.ts`](../../packages/server/src/lib/lifecycle/outbox.ts)
- [`packages/web-panel/src/services/admin-panel-service-context.ts`](../../packages/web-panel/src/services/admin-panel-service-context.ts)
- [`docs/archived/archived-plans/backend-engineering-optimization-plan.md`](../archived/archived-plans/backend-engineering-optimization-plan.md)
- [`docs/archived/archived-plans/badcase-feedback-loop.md`](../archived/archived-plans/badcase-feedback-loop.md)
- [`docs/archived/reports/DEBT_AND_PLACEHOLDER_REPORT.md`](../archived/reports/DEBT_AND_PLACEHOLDER_REPORT.md)
