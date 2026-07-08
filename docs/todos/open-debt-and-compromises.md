# Engineering Debt And Platform Maturity Closeout

> 状态：active mainline
> 更新日期：2026-07-08
> 当前 tranche：Tranche A - read-side coupling / `service-knowledge-read` deep coupling closeout

本文档现为仓库唯一 active mainline detail。它同时承担当前执行主线、debt pool、queued tranche、deferred 冻结决策和问题回写入口。

## 当前主线状态

- 根入口：[`plan.md`](../../plan.md)
- 当前判断：Agent Eval 主线已完成归档条件，当前 repo 的 active execution surface 已收敛到 engineering debt 和 platform maturity closeout
- 主线目标：按 tranche 收口仍然成立的结构性债务，优先处理会持续放大维护成本、边界耦合或默认运行面复杂度的事项
- debt pool 说明：当前池子仍不完整，可以继续补录；但任何新条目都必须带上来源、影响、分类和证据

## Active Focus Tranche

### Tranche A - read-side coupling / `service-knowledge-read` deep coupling closeout

- **状态**：进行中
- **优先级理由**：2026-07-08 的 `fallow` baseline 没有发现相对 `main` 的新增 changed-code 风险，但 repo 级 maintenance 信号仍集中在 server/read-side 复杂度、循环依赖和深耦合残留；该 tranche 继续是最直接的结构性收口点
- **目标**：
  - 压缩 `service-knowledge-read` 对 `packages/server/src/**` 的剩余深导入
  - 把仍依赖 server internals 的默认 infra 装配、graph runtime 类型和少量 read runtime 接线迁移到稳定 port/query seam
  - 继续收缩 temporary direct-backed projection / compatibility JSONB store 直读例外
- **完成条件**：
  - `service-knowledge-read` 的剩余 server deep import 残留面有显式清单并持续下降
  - 与 retrieval / read-model 相关的循环依赖有实际关闭路径，而不是只记录为背景
  - 边界例外、读侧例外与 evidence 回写到相应 architecture/reference 文档，而不是只停留在 debt 描述

### 当前 tranche 已确认的 issue pool

#### 1. `service-knowledge-read` deep coupling

- **分类**：existing debt confirmed
- **影响**：读侧包边界失真，server internals 变更持续放大 blast radius
- **来源**：[`docs/architecture/BOUNDARIES.md`](../architecture/BOUNDARIES.md)、`rtk pnpm exec fallow list --boundaries`
- **证据**：
  - `service-knowledge-read` 当前仍被允许导入 `backend-core`、`contracts`、`server`、`runtime-infra`
  - `fallow` targets 继续把 `packages/service-knowledge-read/src/retrieval-semantic.ts` 与 `packages/service-knowledge-read/src/retrieval-recall-coordinator.ts` 标成 `break_circular_dependency`

#### 2. 读侧 temporary direct-backed / projection exception

- **分类**：existing debt confirmed
- **影响**：读写边界不稳，projection/query seam 难以收敛
- **来源**：[`docs/architecture/SERVICE_BOUNDARIES.md`](../architecture/SERVICE_BOUNDARIES.md)、[`docs/architecture/DATABASE_OWNERSHIP.md`](../architecture/DATABASE_OWNERSHIP.md)
- **证据**：
  - 当前权威文档仍承认 temporary direct-backed projections 与 Phase 1/2 直读例外
  - 与 read-side coupling 同属一个收口面，不宜拆成并行主线

#### 3. `PostgresStore instanceof` / pool access 模式

- **分类**：existing debt confirmed
- **影响**：port abstraction 不完整，调用方被迫依赖具体实现判断
- **来源**：[`docs/architecture/BOUNDARIES.md`](../architecture/BOUNDARIES.md)
- **证据**：当前 debt 判断仍成立，且与读侧/运行时基础设施收口直接相关

## Queued Tranches

### Tranche B - async queue migration completion

- **状态**：queued
- **保留原因**：仍有高频异步路径未完全迁移到持久化任务队列，但当前 baseline 没显示它比 read-side coupling 更应先占用唯一 active tranche
- **核心证据**：
  - [`packages/server/src/lib/persistence/schema/queue.ts`](../../packages/server/src/lib/persistence/schema/queue.ts)
  - [`packages/server/src/lib/lifecycle/outbox.ts`](../../packages/server/src/lib/lifecycle/outbox.ts)
  - 历史主线：[`docs/archived/archived-plans/backend-engineering-optimization-plan.md`](../archived/archived-plans/backend-engineering-optimization-plan.md)

### Tranche C - dead export / complexity quick wins

- **状态**：queued
- **保留原因**：`fallow health` 给出稳定 repo-level 信号，但这些项目目前更适合作为 tranche A/B 过程中的 opportunistic cleanup，而不是独立主线
- **核心信号**：
  - dead exports 占比 `7.4%`
  - circular dependencies `9`
  - 代表性 targets 包括 `packages/cli/src/lib/output-profile.ts`、`packages/server/src/lib/ai/prompt-builder.ts`、`packages/server/src/lib/indexing/graph-lite/llm-extract.ts`

## Deferred / Frozen Decisions

### 分布式运行时成熟度

- **状态**：deferred / platform maturity
- **保留范围**：
  - Kubernetes / Ingress / Service Mesh 平台化
  - service-to-service auth hardening
  - per-service database
  - MQ 全面替换
  - 外部缓存平台
  - dashboard-as-code / alert rule pack
  - container CPU/memory checked-in defaults
  - Node heap presets
  - PgBouncer / pool introspection contract
- **判断**：除非 baseline 或运行面事故表明这些项已成为当前 structural blocker，否则继续保持 deferred，不挤占 Tranche A

### LangChain `.withStructuredOutput()`

- **状态**：frozen decision
- **决策**：继续保留当前 `stripCodeFences -> JSON.parse -> safeParse` 路径
- **重新评估触发条件**：单 provider 收敛且生产 parse failure rate > 5%，或 LangChain 提供内建 retry-on-parse-failure

### Consul KV

- **状态**：frozen decision
- **决策**：继续 deferred
- **重新评估触发条件**：需要亚分钟级 runtime feature flag 传播，或出现 Postgres advisory locks 无法覆盖的分布式协调需求

### Eval platform follow-up

- **状态**：deferred only
- **判断**：Agent Eval 当前不再保留 active debt；若未来继续推进，只剩 `MLflow` 等第二平台可替换性验证，见 [`docs/archived/archived-plans/agent-eval-framework-evaluation-and-plan.md`](../archived/archived-plans/agent-eval-framework-evaluation-and-plan.md)

## Issue Intake / Backfill Rules

- 新问题优先回写到本文档，不新开并行 active 主线，除非它已经明确取代当前 tranche
- 每个新条目必须至少包含：
  - 来源：哪份文档、哪个命令、哪段代码或哪次事故
  - 影响：为何它是当前工程债，而不是纯背景信息
  - 分类：`existing debt confirmed`、`new debt to add`、`noise / not entering current mainline`
  - 证据：最小可复核文件、命令或数据点
- `noise / not entering current mainline` 不写成 active issue，只能在本节或提交说明中解释为何不入池
- 已完成 closeout 直接转归档，不继续留在 active mainline 里占位

## `fallow` Baseline Review

> Baseline date: 2026-07-08

本轮先执行：

- `rtk pnpm exec fallow audit --base main --format json --quiet --explain || true`
- `rtk pnpm exec fallow health --hotspots --targets --format json --quiet --explain || true`
- `rtk pnpm exec fallow list --boundaries || true`

### Stable conclusions

- **existing debt confirmed**
  - 相对 `main` 的 changed-code audit 为 clean；当前需要处理的是 repo 已存在的维护债，而不是本轮新增回归
  - read-side / server 复杂度仍是主要维护风险聚集面，`packages/server/src/app.ts`、`packages/server/src/routes/knowledge.ts` 等 hotspot 继续存在
  - `service-knowledge-read` 相关循环依赖和边界耦合仍是稳定信号，支持把 read-side coupling 保持为唯一 active tranche
- **new debt to add**
  - repo 级 dead export 比例为 `7.4%`
  - 当前检测到 `9` 个 circular dependencies
  - `packages/web-panel/src/services/api/admin-panel-api.ts` 进入 accelerating hotspot，可作为后续 tranche 的候选项
- **noise / not entering current mainline**
  - 单次 health 输出中的大量复杂度 targets 不直接等于 mainline 排序；只有跨文档、边界和维护风险都稳定的项才进入当前 tranche
  - changed-files audit 为 `0`，因此没有把“本轮改动引入的新债务”写入 active pool

## 证据入口

- [`docs/architecture/BOUNDARIES.md`](../architecture/BOUNDARIES.md)
- [`docs/architecture/DATABASE_OWNERSHIP.md`](../architecture/DATABASE_OWNERSHIP.md)
- [`docs/architecture/SERVICE_BOUNDARIES.md`](../architecture/SERVICE_BOUNDARIES.md)
- [`docs/architecture/RECOMPOSITION_SUMMARY.md`](../architecture/RECOMPOSITION_SUMMARY.md)
- [`docs/archived/archived-plans/backend-engineering-optimization-plan.md`](../archived/archived-plans/backend-engineering-optimization-plan.md)
- [`docs/archived/archived-plans/agent-eval-framework-evaluation-and-plan.md`](../archived/archived-plans/agent-eval-framework-evaluation-and-plan.md)
- [`docs/archived/reports/DEBT_AND_PLACEHOLDER_REPORT.md`](../archived/reports/DEBT_AND_PLACEHOLDER_REPORT.md)
