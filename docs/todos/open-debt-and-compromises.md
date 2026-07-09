# Engineering Debt And Platform Maturity Closeout

> 状态：active mainline
> 更新日期：2026-07-09
> 当前 tranche：Tranche A - read-side coupling / `service-knowledge-read` deep coupling closeout

本文档现为仓库唯一 active mainline detail。它只保留当前执行所需状态，并内联承载 backlog、deferred/frozen decision reference 与问题回写规则；历史快照和已完成 closeout 不再在此扩展成并行执行面。

## 当前主线状态

- 根入口：[`plan.md`](../../plan.md)
- 当前判断：Agent Eval 主线已完成归档条件，当前 repo 的 active execution surface 已收敛到 engineering debt 和 platform maturity closeout
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
- **优先级理由**：2026-07-08 的 `fallow` baseline 没有发现相对 `main` 的新增 changed-code 风险，但 repo 级 maintenance 信号仍集中在 server/read-side 复杂度、循环依赖和深耦合残留；该 tranche 继续是最直接的结构性收口点
- **目标**：
  - 收紧 `service-knowledge-read` zone 例外，只保留 `runtime-infra` 读侧 seam，不再允许直接依赖 `server`
  - 继续收缩 `runtime-infra` 过渡 seam、compatibility JSONB store 直读例外和非 projection residual；`knowledge-read` entry read temporary direct-backed 例外已关闭
  - 为 repo 级 `PostgresStore instanceof` / pool access 与循环依赖 residual 保持明确收口路径
- **完成条件**：
  - `service-knowledge-read` 的 `@trapmap/server` 直接导入保持归零，边界测试与 zone 规则同步证明其不再是允许例外
  - 与 retrieval / read-model 相关的循环依赖有实际关闭路径，而不是只记录为背景
  - 边界例外、读侧例外与 evidence 回写到相应 architecture/reference 文档，而不是只停留在 debt 描述

### 当前 tranche 已确认的 issue pool

#### 1. `service-knowledge-read` deep coupling

- **分类**：existing debt confirmed
- **影响**：读侧包边界失真，server internals 变更持续放大 blast radius
- **来源**：[`docs/architecture/BOUNDARIES.md`](../architecture/BOUNDARIES.md)、`rtk pnpm exec fallow list --boundaries`
- **证据**：
  - 2026-07-09 Wave 1 已移除 read-side 业务文件对 `server` error taxonomy 和 graph runtime types 的直接依赖，`search-knowledge.ts` / `retrieval-recall-coordinator.ts` 改用 `InvocationError`，`context.ts` / `retrieval-recall-coordinator.ts` 改用 `runtime-infra` graph seam types
  - 2026-07-09 Wave 5 已将 `service-knowledge-read` zone 允许依赖收紧为 `backend-core`、`contracts`、`runtime-infra`，`server` 直接导入改为边界回退
  - 2026-07-09 Wave 2/3 已将 retrieval 与 support default assembly 迁到 `runtime-infra`
  - 剩余 `runtime-infra` 依赖目前主要承载 repo 与 graph runtime seam 类型：`read-model.ts`、`context.ts`
  - `fallow` targets 继续把 `packages/service-knowledge-read/src/retrieval-semantic.ts` 与 `packages/service-knowledge-read/src/retrieval-recall-coordinator.ts` 标成 `break_circular_dependency`

#### Tranche A 当前残留分类（2026-07-09 baseline）

- **infra assembly residual**
  - `retrieval-infra-default.ts`：已降级为兼容 re-export / typed adapter，默认 recall/scoring/query assembly owner 已迁到 `packages/runtime-infra/src/knowledge-read-retrieval-infra.ts`
  - `knowledge-read-support-infra-default.ts`：已降级为兼容 adapter，默认 prompt/cache/governance/decay assembly owner 已迁到 `packages/runtime-infra/src/knowledge-read-support-infra.ts`
- **runtime-infra seam exception**
  - `service-knowledge-read` 已不再保留 zone 级 `server` 依赖；当前唯一架构例外是 `runtime-infra` query-time seam，后续目标是继续缩小其 owner surface
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

#### 3. `PostgresStore instanceof` / pool access 模式

- **分类**：existing debt confirmed
- **影响**：port abstraction 不完整，调用方被迫依赖具体实现判断
- **来源**：[`docs/architecture/BOUNDARIES.md`](../architecture/BOUNDARIES.md)
- **证据**：当前 debt 判断仍成立，且与读侧/运行时基础设施收口直接相关

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
  - dead exports 占比 `7.4%`
  - circular dependencies `9`
  - 代表性 targets：`packages/cli/src/lib/output-profile.ts`、`packages/server/src/lib/ai/prompt-builder.ts`、`packages/server/src/lib/indexing/graph-lite/llm-extract.ts`

## Deferred / Frozen Decisions

| 项目 | 状态 | 当前决策 | 触发重评条件 | 证据入口 |
|---|---|---|---|---|
| 分布式运行时成熟度 | deferred / platform maturity | 保持 deferred，不挤占当前 tranche | baseline 或运行面事故表明其已成为 structural blocker | 相关运行时与平台化历史文档 |
| LangChain `.withStructuredOutput()` | frozen decision | 继续保留 `stripCodeFences -> JSON.parse -> safeParse` | 单 provider 收敛且生产 parse failure rate > 5%，或 LangChain 提供内建 retry-on-parse-failure | 相关 summary/governance 调用链源码 |
| Consul KV | frozen decision | 继续 deferred | 需要亚分钟级 runtime feature flag 传播，或出现 Postgres advisory locks 无法覆盖的分布式协调需求 | 运行时协调与配置文档 |
| Eval platform follow-up | deferred only | Agent Eval 不再保留 active debt；仅保留第二平台可替换性验证参考 | 未来重新启动 eval platform 替换主线 | [`docs/archived/archived-plans/agent-eval-framework-evaluation-and-plan.md`](../archived/archived-plans/agent-eval-framework-evaluation-and-plan.md) |

## 最新基线摘要

> Baseline date: 2026-07-08

本轮基线证据来自以下命令：

- `rtk pnpm exec fallow audit --base main --format json --quiet --explain || true`
- `rtk pnpm exec fallow health --hotspots --targets --format json --quiet --explain || true`
- `rtk pnpm exec fallow list --boundaries || true`

- **existing debt confirmed**
  - 相对 `main` 的 changed-code audit 为 clean；当前需要处理的是 repo 已存在的维护债，而不是本轮新增回归
  - read-side / server 复杂度仍是主要维护风险聚集面
  - `service-knowledge-read` 相关循环依赖和边界耦合仍是稳定信号，支持把 read-side coupling 保持为唯一 active tranche
- **backlog signal retained**
  - repo 级 dead export 比例为 `7.4%`
  - 当前检测到 `9` 个 circular dependencies
  - `packages/web-panel/src/services/api/admin-panel-api.ts` 进入 accelerating hotspot，可作为后续 tranche 的候选项
- **not entering current mainline**
  - 单次 health 输出中的大量复杂度 targets 不直接等于 mainline 排序
  - changed-files audit 为 `0`，因此没有把“本轮改动引入的新债务”写入 active pool

## 证据入口

- [`docs/architecture/BOUNDARIES.md`](../architecture/BOUNDARIES.md)
- [`docs/architecture/DATABASE_OWNERSHIP.md`](../architecture/DATABASE_OWNERSHIP.md)
- [`docs/architecture/SERVICE_BOUNDARIES.md`](../architecture/SERVICE_BOUNDARIES.md)
- [`docs/architecture/RECOMPOSITION_SUMMARY.md`](../architecture/RECOMPOSITION_SUMMARY.md)
- [`docs/archived/archived-plans/backend-engineering-optimization-plan.md`](../archived/archived-plans/backend-engineering-optimization-plan.md)
- [`docs/archived/archived-plans/agent-eval-framework-evaluation-and-plan.md`](../archived/archived-plans/agent-eval-framework-evaluation-and-plan.md)
- [`docs/archived/reports/DEBT_AND_PLACEHOLDER_REPORT.md`](../archived/reports/DEBT_AND_PLACEHOLDER_REPORT.md)
