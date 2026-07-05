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

## 5.1 Agent Eval Platform 当前残留

- **Status**: Active debt, not a regression introduced by the 2026-07-04 Langfuse adapter pass
- retrieval / summary / agent-planning 现都已切到 suite-owned platform event builder；此前 aggregate runner 内联镜像这项 debt 已闭环，不再继续登记为 active debt
- `LangfuseAdapter` 已以 warning-only mirror 方式接入 aggregate runner，并完成 mock/fake client 自动化验证
- 真实 Langfuse 服务联通尚未形成 checked-in closeout 证据；截至 2026-07-05 12:11:22 CST，本次执行 shell 中 `LANGFUSE_BASE_URL`、`LANGFUSE_PUBLIC_KEY`、`LANGFUSE_SECRET_KEY` 均为空，且仓库内没有 checked-in Langfuse deployment/config 可对接，因此当前只验证了缺配置 warning 路径和本地测试 double 映射
- `rtk pnpm eval -- core --dry-run --platform langfuse` 当前仍暴露既有 suite 结果：
  - ingestion failed bundles: `1`
  - agent-planning failed cases: `3`
- 这组失败来自当前 core dry-run 基线，不应被解释为 `langfuse` mirror 接入引入的新行为漂移
- `MLflow` 与第二平台可替换性验证继续留在 deferred，不作为当前 active closeout 的剩余项

Phase 4 closeout 对剩余 deferred 的处理原则已经冻结：

- 能用现有 truth source 明确写成“当前不承诺”的事项，不再继续保留为 active checklist，而是直接留在 debt register / deferred 落点
- 只有仍然阻塞当前 active plan 完成定义、且能够在保持 `gateway only` 与既有 truth boundary 不变的前提下做最小真实落地的项，才继续留在 active todo
- 当前明确转 deferred 的包括：Kubernetes/Ingress/Service Mesh 平台化、service-to-service auth hardening、per-service database、MQ 全面替换、外部缓存平台、dashboard-as-code、alert rule pack、Node heap preset 与 PgBouncer introspection contract
- 当前仍留在 active todo 的剩余 closeout 只剩真实 Langfuse 目标验证这一个 environment-blocked 项；第二平台与更宽的平台化工作继续走 deferred 落点

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

> Full evaluation: [`../archived/archived-plans/library-replacement-evaluation.md`](../archived/archived-plans/library-replacement-evaluation.md)

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

### 8.4 2026-07-03 Distributed Local Closeout Gaps

- **Status**: Active debt, observed in local deployment validation
- **Why it is still current**: 本轮已经把 checked-in distributed compose 推进到“可 clean build 并拉起七进程 distributed 拓扑”，也补齐了 gateway `/live`、`/ready`、`/health`、`/metrics`、request-id / `traceparent` 回显与结构化日志证据；deployment/discovery/observability 的 API 面闭环已基本形成，但 Grafana UI 与目标环境 closeout 仍未完成

Current confirmed gaps:

- `packages/host-distributed/Dockerfile` 的两处硬阻塞已修复：
  - 已补齐 `packages/runtime-infra` / `packages/server` project reference 链
  - 已补齐 workspace package `node_modules` 布局，distributed 镜像现可成功构建并启动
- distributed gateway 的 observability surface 已补齐到“最小可验证”：
  - `GET /live` 现返回 `200`
  - `GET /ready` 现返回 `200`
  - `GET /metrics` 现返回 `200`
  - `GET /health` 现回显 `x-request-id` / `traceparent`
  - stdout 现出现 `request.completed` 结构化日志，包含 `requestId` / `traceId`
  - `rtk pnpm test:observability-benchmark -- --base-url http://127.0.0.1:4000` 现可执行
- checked-in compose 资产已补齐到 closeout 预期的七进程拓扑：
  - `docker-compose.yml` distributed profile 现已定义 `gateway`、`identity-access`、`knowledge-read`、`knowledge-write`、`candidate-worker`、`governance-worker`、`outbox-worker`、`postgres`
- Prometheus checked-in assets 已基本对齐：
  - `prometheus` 现同时接入 `trapmap-observability` 与 `trapmap-distributed`
  - checked-in targets 已对齐 `gateway:4000`、`identity-access:4001`、`knowledge-read:4002`、`knowledge-write:4003`、`candidate-worker:4004`、`governance-worker:4005`、`outbox-worker:4006`
  - 其后 checked-in 代码已为 distributed workers 补齐 `/metrics` route
  - 最新 full-docker 实测已确认 seven TrapMap targets 全部 `up`
- Consul root cause 已从“应用未注册”收缩为“observability compose 里的 consul 双网卡启动失败”，宿主 `000` 也已进一步定位到 shell 代理链路：
  - 去掉 `trapmap-observability` 挂载后，`consul` 本身已恢复健康，Prometheus `consul:8500` target 也转为 `up`
  - `rtk docker exec trapmap-consul wget -qO- http://127.0.0.1:8500/v1/agent/services` 已返回 `trapmap-gateway-1`
  - `rtk docker exec trapmap-consul wget -qO- http://127.0.0.1:8500/v1/catalog/services` 已返回 `{"consul":[],"gateway":[]}`
  - `rtk docker exec trapmap-consul wget -qO- http://127.0.0.1:8500/v1/health/checks/gateway` 已返回 `passing`
  - 当前 shell 中 `curl http://127.0.0.1:8500/...` 会命中 `127.0.0.1:7890` 代理；`curl --noproxy '*' http://127.0.0.1:8500/v1/catalog/services` 已可返回 `200` 与 `{"consul":[],"gateway":[]}`
- Loki root cause 已从“查询为空”收敛为“observability compose 缺少 log shipper”，并已用最小 promtail 方案补齐：
  - checked-in `docker-compose.observability.yml` 新增 `promtail`
  - `config/promtail.yml` 当前直接 tail `/var/lib/docker/containers/*/*-json.log` 并给流打上 `service=trapmap`
  - `curl -G -s 'http://127.0.0.1:3100/loki/api/v1/query_range' --data-urlencode 'query={service="trapmap"} | json | requestId="loki-check-002"'` 已返回 gateway `request.completed` 结构化日志
- benchmark 最新 full-docker 实测已闭环：
  - `process_resident_memory_bytes=76.93MB`
  - `nodejs_heap_size_used_bytes=12.86MB`
  - `nodejs_heap_size_total_bytes=14.5MB`

Remaining closeout work:

- Grafana UI 尚未做人肉点击验收；当前只用 API 口径确认 Prometheus / Tempo / Loki datasource 后端可达。
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
