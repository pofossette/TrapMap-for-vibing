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

- **Status**: Deferred/platform residue only; the remaining live Langfuse closeout stays in the active owner plan, not in this debt register
- retrieval / summary / agent-planning 现都已切到 suite-owned platform event builder；此前 aggregate runner 内联镜像这项 debt 已闭环，不再继续登记为 active debt
- `LangfuseAdapter` 已以 warning-only mirror 方式接入 aggregate runner，并完成 mock/fake client 自动化验证
- 真实 Langfuse 服务联通尚未形成 checked-in closeout 证据；截至 2026-07-06 11:35:08 CST，本次执行 shell 中 `LANGFUSE_BASE_URL`、`LANGFUSE_PUBLIC_KEY`、`LANGFUSE_SECRET_KEY` 仍均为空，且仓库内没有 checked-in Langfuse deployment/config 可对接，因此当前 active owner plan 只保留这一个 environment-blocked closeout
- `rtk pnpm eval -- core --dry-run --platform langfuse` 当前仍暴露既有 suite 结果：
  - ingestion failed bundles: `1`
  - agent-planning failed cases: `3`
- 这组失败来自当前 core dry-run 基线，不应被解释为 `langfuse` mirror 接入引入的新行为漂移
- `MLflow` 与第二平台可替换性验证继续留在 deferred，不作为当前 active closeout 的剩余项

Phase 4 closeout 对剩余 deferred 的处理原则已经冻结：

- 能用现有 truth source 明确写成“当前不承诺”的事项，不再继续保留为 active checklist，而是直接留在 debt register / deferred 落点
- 只有仍然阻塞当前 active plan 完成定义、且能够在保持 `gateway only` 与既有 truth boundary 不变的前提下做最小真实落地的项，才继续留在 active todo
- 当前明确转 deferred 的包括：Kubernetes/Ingress/Service Mesh 平台化、service-to-service auth hardening、per-service database、MQ 全面替换、外部缓存平台、dashboard-as-code、alert rule pack、Node heap preset 与 PgBouncer introspection contract
- 当前仍留在 active todo 的剩余 closeout 只剩真实 Langfuse 目标验证这一个 environment-blocked 项；第二平台与更宽的平台化工作继续走 debt register / deferred 落点

## 5.2 2026-07-06 Stage 1B 静态盘点快照

- `rtk pnpm exec fallow dead-code --unused-files --unused-exports --duplicate-exports --re-export-cycles --format json --quiet` 当前返回 `244` 个死代码类问题：`9` 个 unused files、`227` 个 unused exports、`8` 个 duplicate exports、`0` 个 re-export cycles
- `rtk pnpm knip --reporter json` 与 fallow 对 `packages/host-distributed/src/testing/distributed-runtime-smoke-service.ts`、`packages/host-local/src/nest/config/config-bridge.ts`、`packages/host-local/src/nest/main.ts`、`packages/web-panel/src/shared/hooks/use-debounced-value.ts` 的“孤立/未被引用”判断形成交叉印证
- 显式占位实现仍然存在：
- 本轮已闭环的显式占位实现：
  - `packages/host-local/src/nest/runtime/backend-core-adapters.ts` 已在无 async transport 时 fail-fast，不再返回 `job_local_stub` / `evt_local_stub`
  - `packages/cli/src/lib/markdown-formatter.ts` 已移除 `_Entry fallback rendering not implemented yet._`
  - `packages/server/src/lib/decay/freshness.ts` 已支持显式 version context
- `packages/contracts/src/domain/retrieval.ts` 现已补出 `retrievalSearchBodySchema`，`packages/host-local/src/nest/gateway/gateway.schemas.ts` 也已直接复用这个共享 contract；gateway body 兼容面仍保持 `query` / `teamId` / `limit`
- 边界测试限定的 server 深导入名单已固化在：
  - `packages/host-local/src/nest/runtime/import-boundary.test.ts`
  - `packages/service-knowledge-read/src/import-boundary.test.ts`
- 本轮直接扫描这些受测文件时，`host-local` 受测 runtime 文件未命中测试中列出的 forbidden imports；`service-knowledge-read` 受测文件未命中测试所禁的 retrieval seam，但仍存在多处其他 `@trapmap/server/lib/*` 深导入，说明“host-local/runtime 一侧的 seam 已命名化，但读侧耦合尚未完成收口”
- `packages/host-local/src/nest/runtime/host-runtime.ts` 已改为消费 `KnowledgeReadRetrievalQueryOptions['services']` 这个显式 seam type，而 `service-knowledge-read/src/context.ts` / `retrieval-types.ts` / `store.ts` / `rag-log.ts` 也已落到 package-local seam；当前剩余主要债务已收缩为第二批重耦合文件：`search-knowledge.ts`、`filters.ts`、`read-model.ts`、`retrieval-semantic.ts`、`retrieval-recall-coordinator.ts`、`response-citations.ts`、`response-assembly.ts`
- `rtk pnpm exec fallow audit --base main` 本轮未能作为 clean pass 证据使用，阻塞项是仓库现存的 `packages/server/src/lib/runtime/resilience-v2.test.ts -> ./resilience-v2.js` unresolved import，与本次 Stage 2B 改动无直接关系

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
- **Status**: Completed on 2026-07-06 in Stage 2A hardening
- **Closeout**: `packages/server/src/lib/runtime/resilience-v2.ts` now wraps `cockatiel` with aggressive timeout cancellation, retry/backoff, optional circuit breaker, compatibility re-export via `resilience.ts`, and all 5 server call sites migrated

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

- Grafana UI 尚未做人肉点击验收；2026-07-06 这一轮只补到了 Grafana `/api/datasources`、Prometheus health API、Loki health API、Tempo `/ready` 与 benchmark/API 验证。
- 当前 live Consul catalog 仍未收口：`/v1/catalog/services` 只返回 `consul`，`/v1/health/checks/gateway` 为空，说明本地现有 gateway/runtime 还未以当前 compose 方式完成注册。
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
