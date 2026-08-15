# Engineering Debt And Platform Maturity Closeout

> 状态：archived
> 归档日期：2026-07-11
> 历史执行状态：Tranche A - read-side coupling / `service-knowledge-read` deep coupling closeout

本文档曾是仓库唯一 active mainline detail，现仅保留当时的 backlog、deferred/frozen decision reference 与问题回写规则作为历史审计材料；不得将其恢复为当前执行面。

## 历史主线状态

- 历史根入口：[`plan-2026-07-11-engineering-debt-closeout-index-archived.md`](plan-2026-07-11-engineering-debt-closeout-index-archived.md)
- 历史判断：Agent Eval 主线已完成归档条件，当时 repo 的 active execution surface 收敛到 engineering debt 和 platform maturity closeout
- 主线目标：按 tranche 收口仍然成立的结构性债务，优先处理会持续放大维护成本、边界耦合或默认运行面复杂度的事项
- debt pool 说明：当前池子仍不完整，可以继续补录；但任何新条目都必须带上来源、影响、分类和证据

## 成功条件

- 入口文档与 `docs/todos/` 目录规则持续只承认一个 active mainline detail
- 当前 tranche 的边界耦合、循环依赖和读侧例外有可验证的下降路径，而不是继续停留在背景描述
- backlog、deferred、frozen decision 仅作为主线内联参考存在，不再演化为并行 active checklist

## 问题回写规则

- 新问题优先回写到本文档，不新开并行 active 主线，除非它已经明确取代当前 tranche
- 每个新条目必须至少包含：来源、影响、分类、证据
- `noise / not entering current mainline` 不写成 active issue，只能说明为何不入池
- 已完成 closeout 直接转归档，不继续留在 active mainline 里占位

## Active Focus Tranche

### Tranche A - read-side coupling / `service-knowledge-read` deep coupling closeout

- **状态**：进行中
- **优先级理由**：2026-07-09 的 `fallow` baseline 没有发现相对 `main` 的新增 changed-code 风险，但 repo 级 maintenance 信号仍集中在 server/read-side 复杂度、循环依赖和深耦合残留；该 tranche 继续是最直接的结构性收口点
- **目标**：
  - 收紧 `service-knowledge-read` zone 例外，只保留 `runtime-infra` 读侧 seam，不再允许直接依赖 `server`
  - 继续收缩 `runtime-infra` 过渡 seam、compatibility JSONB store 直读例外和非 projection residual；`knowledge-read` entry read temporary direct-backed 例外已关闭
  - 将 repo 级生产路径上的 `PostgresStore instanceof` 判断收口为结构化 pool seam，并继续缩小该 seam surface
- **完成条件**：
  - `service-knowledge-read` 的 `@trapmap/server` 直接导入保持归零，边界测试与 zone 规则同步证明其不再是允许例外
  - 与 retrieval / read-model 相关的循环依赖有实际关闭路径，而不是只记录为背景
  - repo 级生产路径不再依赖 `instanceof PostgresStore`；剩余 pool access debt 只保留为明确记录的结构化 seam / compatibility residual
  - 边界例外、读侧例外与 evidence 回写到相应 architecture/reference 文档，而不是只停留在 debt 描述

### 当前 tranche 已确认的 issue pool

#### 1. `service-knowledge-read` deep coupling

- **分类**：existing debt confirmed
- **影响**：读侧包边界失真，server internals 变更持续放大 blast radius
- **来源**：[`docs/architecture/BOUNDARIES.md`](../architecture/BOUNDARIES.md)、`pnpm exec fallow list --boundaries`
- **证据**：
  - 2026-07-09 Wave 1 已移除 read-side 业务文件对 `server` error taxonomy 和 graph runtime types 的直接依赖，`search-knowledge.ts` / `retrieval-recall-coordinator.ts` 改用 `InvocationError`，`context.ts` / `retrieval-recall-coordinator.ts` 改用 `runtime-infra` graph seam types
  - 2026-07-09 Wave 5 已将 `service-knowledge-read` zone 允许依赖收紧为 `backend-core`、`contracts`、`runtime-infra`，`server` 直接导入改为边界回退
  - 2026-07-09 Wave 2/3 已将 retrieval 与 support default assembly 迁到 `runtime-infra`
  - 2026-07-09 Wave 6 已让 `retrieval-infra.ts` 直接依赖 `retrieval-infra-default.ts`，不再通过同时承载 query-port adapter 的 `server-retrieval-seam.ts` 获取默认 infra，关闭 `search-knowledge -> retrieval-infra -> server-retrieval-seam -> search-knowledge` 循环路径
  - 2026-07-09 Wave 7 已让 `http-hooks.ts` 改用 `metrics.ts`、`request-context.ts`、`runtime-contract.ts` 直接导入，关闭 `server/src/lib/runtime/http-hooks.ts` <-> `server/src/lib/runtime/index.ts` 的 runtime barrel cycle
  - 剩余 `runtime-infra` 依赖目前主要承载 repo 与 graph runtime seam 类型：`read-model.ts`、`context.ts`
  - `pnpm exec fallow dead-code --circular-deps --format json --quiet --top 10` 当前显示 `total_issues=0` / `circular_dependencies=0`
  - `pnpm exec fallow --format json --quiet --summary` 当前显示 `unused_files=0`，`retrieval-infra-default.ts` 已由 `retrieval-infra.ts` 显式引用，不再是 unused compatibility file

#### Tranche A 当前残留分类（2026-07-09 baseline）

- **infra assembly residual**
  - `retrieval-infra-default.ts`：已降级为兼容 re-export / typed adapter，默认 recall/scoring/query assembly owner 已迁到 `packages/runtime-infra/src/knowledge-read-retrieval-infra.ts`，且 `retrieval-infra.ts` 直接使用该 adapter，避免 query-port seam 重新进入默认 infra 路径
  - `knowledge-read-support-infra-default.ts`：已降级为兼容 adapter，默认 prompt/cache/governance/decay assembly owner 已迁到 `packages/runtime-infra/src/knowledge-read-support-infra.ts`
- **runtime-infra seam exception**
  - `service-knowledge-read` 已不再保留 zone 级 `server` 依赖；当前唯一架构例外是 `runtime-infra` query-time seam，后续目标是继续缩小其 owner surface
- **structural pool seam residual**
  - 2026-07-10 targeted cleanup 已关闭当前 active production paths 上的 `instanceof PostgresStore` 判断；剩余 debt 收敛为 `packages/runtime-infra/src/store.ts`、`packages/runtime-infra/src/knowledge-read-retrieval-infra.ts` 与 `packages/server/src/lib/store/store-pool.ts` 这类结构化 `getPool` seam，以及调用方对该 seam 的有限依赖
- **graph/runtime seam**
  - Wave 1 已完成首轮收口：graph runtime state/backend 类型不再直接从 `server` 暴露到 read-side 业务文件，现通过 `runtime-infra` 类型 seam 承载
- **query / error seam**
  - Wave 1 已完成首轮收口：无效 mode / entry not found 错误改为 `backend-core` `InvocationError`，不再依赖 `server` `AppError`
- **compatibility direct-read exception**
  - 仍保留在 architecture/reference truth surface 中；本波未扩展，也未把其重新写回并行主线

#### 2. 读侧 projection exception residual

- **分类**：existing debt confirmed
- **影响**：读写边界不稳，projection/query seam 难以收敛
- **来源**：[`docs/architecture/SERVICE_BOUNDARIES.md`](../architecture/SERVICE_BOUNDARIES.md)、[`docs/architecture/DATABASE_OWNERSHIP.md`](../architecture/DATABASE_OWNERSHIP.md)
- **证据**：
  - 2026-07-09 Wave 4 已关闭 `knowledge-entry:getById` / `knowledge-entry:listMine` 的 temporary direct-backed 例外，二者改由 `service-knowledge-read` 自有 entry projection 提供
  - Tranche A 剩余项转为 compatibility JSONB store 直读、repo 级 `PostgresStore instanceof` / pool access、以及非 entry projection residual，不再把这两个 entry read surface 记为 active exception
  - 与 read-side coupling 同属一个收口面，不宜拆成并行主线

#### 3. Structural pool seam / compatibility residual

- **分类**：existing debt confirmed
- **影响**：port abstraction 仍未完整承载数据库能力，调用方仍需通过结构化 seam 探测 pool access
- **来源**：[`docs/architecture/BOUNDARIES.md`](../architecture/BOUNDARIES.md)
- **证据**：
  - 2026-07-10 targeted cleanup 已将 `packages/runtime-infra/src/shared-infra.ts` 从 `instanceof PostgresStore` 切换到本地 `getStorePool(store)` 结构化 seam；对应新增 `packages/runtime-infra/src/store.test.ts` 与 import-boundary 守护
  - `rg "instanceof PostgresStore|new PostgresStore|getPool\\(" packages/runtime-infra/src packages/server/src -g '!**/*.test.ts' -g '!**/__tests__/**' -g '!**/__fixtures__/**'` 当前不再命中生产路径上的 `instanceof PostgresStore`；剩余命中集中在结构化 `getPool` seam、本地 `PostgresStore` 构造和 compatibility store 实现
  - 与 read-side coupling 同属一个收口面，后续重点转为结构化 pool seam shrinkage 与 compatibility JSONB direct-read residual，而不是继续保留 concrete-class 判断

### 新近补录的问题池（2026-07-11）

#### 4. Distributed runtime platform-maturity gaps

- **分类**：deferred / platform maturity
- **影响**：当前 `distributed` 已有真实多进程与内部 HTTP hop，但共享 PostgreSQL、有限的 readiness 覆盖和粗粒度容量视图会限制故障隔离与独立扩缩容。
- **来源**：[`docs/architecture/SERVICE_BOUNDARIES.md`](../architecture/SERVICE_BOUNDARIES.md)、[`docs/architecture/DATABASE_OWNERSHIP.md`](../architecture/DATABASE_OWNERSHIP.md)、[`docs/architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md)
- **证据**：
  - `distributed` 当前明确是 `Level 2 / transitional-microservice`，所有服务仍连接同一 `TRAPMAP_DATABASE_URL`；表级 ownership 已受约束，但尚未形成物理存储隔离。
  - runtime snapshot 当前重点覆盖 graph query backend 与 candidate task worker；更广义后台依赖健康仍是后续工作。
  - operator 默认表面只提供高层容量摘要，按服务、队列积压和投影延迟的深度诊断尚未形成默认能力。
- **后续入口**：保持 deferred，待 read-side coupling tranche 收口或运行面事故表明其成为结构性阻塞时，单独设计数据库隔离、服务级 readiness SLO 和 capacity drill-down。

#### 5. Service-discovery documentation fact alignment

- **分类**：documentation integrity backlog
- **影响**：`distributed` 的服务发现前提在架构说明中出现不一致表述，可能使部署者把可选 Consul overlay 误解为启动硬依赖。
- **来源**：[`docs/architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md)、[`docs/architecture/SERVICE-DISCOVERY.md`](../architecture/SERVICE-DISCOVERY.md)
- **证据**：前者的 profile 表将 `distributed` 服务发现描述为“必需基础设施”，后者的权威接缝说明则定义为“Docker DNS / 显式 URL + 可选 dynamic discovery overlay”，且 discovery 失败时 gateway 必须静态 URL 回退。
- **后续入口**：在下一轮架构文档事实校准中，以 `SERVICE-DISCOVERY.md` 和 `packages/host-distributed/src/config/service-config.ts` 为准，统一 profile 表、部署文档和运行时图的措辞；不改变当前运行时行为。

## Queued Tranches

### Tranche B - async queue migration completion

- **状态**：queued
- **进入条件**：当 read-side coupling 不再是最高优先级结构债，且异步路径迁移已成为默认运行面的主要阻塞项
- **最小证据**：
  - [`packages/server/src/lib/persistence/schema/queue.ts`](../../packages/server/src/lib/persistence/schema/queue.ts)
  - [`packages/server/src/lib/lifecycle/outbox.ts`](../../packages/server/src/lib/lifecycle/outbox.ts)
  - [`docs/archived/archived-plans/backend-engineering-optimization-plan.md`](../archived/archived-plans/backend-engineering-optimization-plan.md)

### Tranche C - dead export / complexity quick wins

- **状态**：queued
- **进入条件**：当 repo-level maintenance 信号开始转化为当前主线之外的明确回归风险，或 tranche A/B 结束后需要独立收口
- **最小证据**：
  - repo 级 `fallow` cleanup summary：`394` total issues，其中 `unused_files=0`、`unused_exports=230`、`unused_types=113`、`unused_class_members=50`、`unused_dependencies=1`、`circular_dependencies=0`
  - health summary：`302` functions above threshold，其中 critical `57`、high `83`、moderate `162`；dead export 占比仍为 `7.4%`
  - duplication summary：top 50 clone groups 统计为 `19.16%` duplicated lines / `54040` duplicated lines；top clone 大多集中在 CLI/server 测试 helper，但也包含 `service-governance-review` 与 `service-knowledge-write` route error wrapper 重复
  - 代表性 targets：`packages/cli/src/lib/output-profile.ts`、`packages/cli/src/lib/output-profile/renderers.ts`、`packages/server/src/lib/ai/prompt-builder.ts`、`packages/server/src/lib/indexing/graph-lite/llm-extract.ts`、`packages/server/src/lib/retrieval/scoring/boundary-match.ts`

### Tranche D - security candidate verification

- **状态**：queued / verify-before-action
- **进入条件**：当 security candidate 被人工验证为真实风险，或 security rules 从 advisory/off 转为 CI gate
- **最小证据**：
  - `pnpm exec fallow security --format json --quiet --summary` 报告 `99` 个 security candidates：high `2`、medium `96`、low `1`
  - category 分布：`sql-injection=41`、`path-traversal=32`、`ssrf=10`、`dynamic-regex=6`、`code-injection=3`、`command-injection=2`、`header-injection=2`、`secret-pii-log=2`、`insecure-randomness=1`
  - 当前 security config 中 `security_client_server_leak` 与 `security_sink` 均为 configured `off` / effective `warn`，因此这些是待验证候选，不直接作为 confirmed vulnerability 或 active mainline issue

## Deferred / Frozen Decisions

| 项目 | 状态 | 当前决策 | 触发重评条件 | 证据入口 |
|---|---|---|---|---|
| 分布式运行时成熟度 | deferred / platform maturity | 保持 deferred，不挤占当前 tranche | baseline 或运行面事故表明其已成为 structural blocker | 相关运行时与平台化历史文档 |
| LangChain `.withStructuredOutput()` | frozen decision | 继续保留 `stripCodeFences -> JSON.parse -> safeParse` | 单 provider 收敛且生产 parse failure rate > 5%，或 LangChain 提供内建 retry-on-parse-failure | 相关 summary/governance 调用链源码 |
| Consul KV | frozen decision | 继续 deferred | 需要亚分钟级 runtime feature flag 传播，或出现 Postgres advisory locks 无法覆盖的分布式协调需求 | 运行时协调与配置文档 |
| Eval platform follow-up | deferred only | Agent Eval 不再保留 active debt；仅保留第二平台可替换性验证参考 | 未来重新启动 eval platform 替换主线 | [`docs/archived/archived-plans/agent-eval-framework-evaluation-and-plan.md`](../archived/archived-plans/agent-eval-framework-evaluation-and-plan.md) |

## 最新基线摘要

> Baseline date: 2026-07-10

本轮基线证据来自以下命令：

- `pnpm exec vitest run packages/server/src/__tests__/routes-architecture-guard.test.ts`
- `pnpm exec vitest run packages/server/src/routes/operations/badcases.test.ts packages/server/src/routes/operations/capsule-index.test.ts`
- `pnpm exec vitest run packages/server/src/lib/store/store-pool.test.ts`
- `pnpm exec vitest run --project runtime-infra packages/runtime-infra/src/store.test.ts packages/runtime-infra/src/shared-infra.test.ts packages/runtime-infra/src/import-boundary.test.ts`
- `rg "instanceof PostgresStore|new PostgresStore|getPool\\(" packages/runtime-infra/src packages/server/src -g '!**/*.test.ts' -g '!**/__tests__/**' -g '!**/__fixtures__/**'`
- `rg "@trapmap/server" packages/service-knowledge-read/src -n`
- `pnpm exec fallow list --boundaries --format json --quiet`
- `pnpm exec fallow audit --base main --gate new-only --format json --quiet --explain || true`
- `pnpm exec fallow --format json --quiet --summary || true`
- `pnpm exec fallow health --hotspots --targets --format json --quiet --top 20 || true`
- `pnpm exec fallow dupes --format json --quiet --top 10 || true`
- `pnpm exec fallow flags --format json --quiet --top 20 || true`
- `pnpm exec fallow security --format json --quiet --summary || true`
- `pnpm exec fallow list --boundaries --format json --quiet || true`

- **existing debt confirmed**
  - 2026-07-10 targeted verification 全绿：route architecture guard、badcases / capsule-index、server store-pool seam，以及 runtime-infra store/shared-infra/import-boundary tests 均通过
  - repo 级生产路径上的 `instanceof PostgresStore` 判断已从当前 tranche 的 active paths 关闭；剩余 Tranche A debt 收敛为结构化 pool seams、compatibility JSONB direct-read residual、以及 `runtime-infra` seam shrinkage
  - 相对 `main` 的 changed-code audit 为 pass，`changed_files_count=6`，`dead_code_introduced=0`，`complexity_introduced=0`；当前分支未引入新的 fallow gate regression
  - boundary report 显示 `11` 个 zones / `11` 条 rules 且当前 `boundary_violations=0`；`service-knowledge-read` 允许依赖仍为 `backend-core`、`contracts`、`runtime-infra`
  - read-side / server 复杂度仍是主要维护风险聚集面；`service-knowledge-read` 直接 server import、unused default infra file 和 read-side cycle 已关闭，剩余 Tranche A 聚焦 `runtime-infra` seam shrinkage 与 `PostgresStore instanceof` / pool-access 收口
- **backlog signal retained**
  - repo 级 dead export 比例为 `7.4%`，当前检测到 `0` 个 circular dependencies
  - cleanup summary 当前为 `394` total issues，主要由 unused exports/types/class members 构成
  - health summary 当前为 `302` functions above threshold，critical/high/moderate 分别为 `57` / `83` / `162`
  - duplication top signal 仍主要是测试 helper 重复，但跨 service route wrapper 重复可作为后续低风险抽象候选
  - `packages/web-panel/src/services/api/admin-panel-api.ts` 进入 accelerating hotspot，可作为后续 tranche 的候选项
  - security candidates 当前保留为 verify backlog：`99` candidates，但规则 configured `off` 且需要人工确认 trace/reachability 后才能进入 active remediation
- **not entering current mainline**
  - 单次 health 输出中的大量复杂度 targets 不直接等于 mainline 排序
  - feature flag scan 为 `0`，不形成新的 flag cleanup tranche
  - changed-files audit 的 introduced issue 计数为 `0`，因此没有把“本轮改动引入的新债务”写入 active pool
  - security 输出是 candidate/advisory 级别，未验证前不写成 confirmed vulnerability

## 证据入口

- [`docs/architecture/BOUNDARIES.md`](../architecture/BOUNDARIES.md)
- [`docs/architecture/DATABASE_OWNERSHIP.md`](../architecture/DATABASE_OWNERSHIP.md)
- [`docs/architecture/SERVICE_BOUNDARIES.md`](../architecture/SERVICE_BOUNDARIES.md)
- [`docs/architecture/RECOMPOSITION_SUMMARY.md`](../architecture/RECOMPOSITION_SUMMARY.md)
- [`docs/archived/archived-plans/backend-engineering-optimization-plan.md`](../archived/archived-plans/backend-engineering-optimization-plan.md)
- [`docs/archived/archived-plans/agent-eval-framework-evaluation-and-plan.md`](../archived/archived-plans/agent-eval-framework-evaluation-and-plan.md)
- [`docs/archived/reports/DEBT_AND_PLACEHOLDER_REPORT.md`](../archived/reports/DEBT_AND_PLACEHOLDER_REPORT.md)
