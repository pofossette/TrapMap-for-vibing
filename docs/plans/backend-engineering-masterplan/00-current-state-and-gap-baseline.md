# TrapMap Backend Engineering Master Plan - Phase 0 Current State And Gap Baseline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the current backend implementation, active plan landscape, and gap matrix so later execution does not rely on ambiguous repo state.

**Architecture:** Read the real code entrypoints first, then normalize which existing plans remain authoritative references, which are only context, and which gaps must move into the new execution track. This phase produces the factual baseline for all later changes.

**Tech Stack:** TypeScript, Fastify, Zod, Vitest, PostgreSQL, Drizzle, queue/outbox workers, workflow runs, monorepo docs guards.

---

## 目标

- 冻结当前后端实现基线。
- 冻结当前活跃计划入口和问题池边界。
- 产出“当前事实 / gap / 后续承接阶段”的统一矩阵。

## 当前事实

- `packages/server` 仍是权威实现入口，`buildServer()`、startup sequence、operator status 与 config schema 都在其中。
- `packages/backend-core`、`packages/host-local`、`packages/host-distributed` 已经落地到代码目录，不再只是未来目标。
- `docs/plans/backend-engineering-roadmap/`、`runtime-recomposition/`、`deployment-flexibility/` 仍处于 active-reference 语义。
- `docs/todos/backend-engineering-optimization-plan.md` 记录的问题与新主线高度相关，但其角色是问题池，不是执行包。

## 基线盘点

### 1. 当前后端代码入口

当前事实：

- `packages/server/src/app.ts`
  - `buildServer()` 仍负责装配 Fastify、runtime deployment、request context、retrieval/channel registry 与 route registration。
  - `registerCapabilityRoutes()` 继续按 capability 决定 gateway surface，不同 deployment profile 仍通过同一入口折叠。
- `packages/server/src/bootstrap/run-startup-sequence.ts`
  - startup sequence 已明确收敛到 repositories -> candidate recovery -> graph reconciliation -> worker sequence 的顺序化编排。
  - `packages/server` 仍承担启动编排与冻结 `app.skillShareer` 的权威职责。
- `packages/server/src/routes/operations/status.ts`
  - `/v1/operations/status/async` 已暴露 queue/outbox/cache/workflow 状态。
  - `/v1/operations/status` 继续通过 `buildCompatibilityStatusProjection()` 提供 compatibility status。
- `packages/server/src/lib/runtime/runtime-metadata.ts`
  - runtime status 已统一暴露 deployment profile、route surface、async ownership、topology、worker ownership 与 async snapshot。
- `packages/server/src/lib/operations/read-model.ts`
  - compatibility status、audit event、review queue、decay-aware list 等 operator/read projection 已集中到 shared read model，而不是 route-local 拼装。
- `packages/server/src/config.ts`
  - config schema 已覆盖 deployment profile/preset、runtime header、async task transport、RabbitMQ optional config，并在启动时计算 compatibility/resolved deployment。

### 2. 当前宿主与内核包

当前事实：

- `packages/backend-core/src/runtime/`、`ports/`、`modules/`、`use-cases/` 已存在，说明 capability model、port seam、bounded context module 和 use-case pattern 已进入真实代码。
- `packages/host-local/src/bootstrap/`、`http/`、`runtime/`、`config/` 已存在，说明 local-agent / team-monolith 宿主已经不是纯文档目标。
- `packages/host-distributed/src/gateway/`、`identity-access/`、`knowledge-read/`、`knowledge-write/`、`candidate-ingestion/`、`governance-review/`、`job-runtime/`、`shared/` 已存在，说明 distributed profile 的 service-unit 目录结构已经冻结到仓库中。

### 3. 当前计划与问题池边界

当前事实：

- `plan.md` 现已切换为后端工程化总控计划，负责阶段顺序、边界和进度勾选。
- `docs/plans/backend-engineering-masterplan/` 是新的正式执行包目录。
- `docs/plans/backend-engineering-roadmap/` 保留 Stage 1/2/3 细化事实，但不再作为默认起点。
- `docs/plans/runtime-recomposition/` 与 `docs/plans/deployment-flexibility/` 保留 host/runtime/deployment 事实源角色。
- `docs/todos/backend-engineering-optimization-plan.md` 保留为问题池、优先级和背景补充，不承担阶段执行入口角色。

## 活跃计划状态冻结

| 目录 / 文件 | 当前状态 | 说明 |
|---|---|---|
| `plan.md` | active-control | 当前唯一根级执行入口，统一后端工程化阶段顺序 |
| `docs/plans/backend-engineering-masterplan/` | active-execution | 当前正式阶段执行包 |
| `docs/plans/backend-engineering-roadmap/` | active-reference | 保留 Stage 1/2/3 的历史收敛事实，供新阶段引用 |
| `docs/plans/runtime-recomposition/` | active-reference | 保留 backend-core / host-local / host-distributed 目标与迁移背景 |
| `docs/plans/deployment-flexibility/` | active-reference | 保留 deployment profile、gateway-only、distributed profile 的约束事实 |
| `docs/todos/backend-engineering-optimization-plan.md` | problem-pool | 保留问题池与优先级，不直接执行 |
| `docs/archived/archived-plans/` | archived | 历史计划退出区，不再作为默认入口 |
| `docs/superpowers/plans/` | draft-output | 工作流产物区，除非被显式接管，不自动升级为活跃长期计划 |

## Gap Matrix

| 当前事实 | Gap | 后续阶段 |
|---|---|---|
| `packages/server/src/app.ts` 仍同时承担 capability route 注册、runtime deployment 收敛和旧主入口兼容职责 | route / application / repo / runtime / compat 边界仍未完全从 `packages/server` 视角收敛为单一执行规则 | Phase 1 |
| `packages/server/src/lib/operations/read-model.ts` 已集中 compatibility/read projection | compatibility status、repo-backed transaction、旧 `store` 兼容路径的退出标准仍未统一冻结 | Phase 1 |
| `packages/backend-core/src/ports/**`、`modules/**`、`use-cases/**` 已存在 | server 与 backend-core/host-* 之间的 ownership map 还没有被阶段计划写成逐项迁移与保留规则 | Phase 1 |
| `/v1/operations/status/async` 已暴露 queue/outbox/cache/workflow 视图 | freshness、lag、retryable/permanent failure、resume/checkpoint 语义仍分散在 route、worker 和 operator 语义里 | Phase 2 |
| `config.ts` 已支持 `postgres` / `rabbitmq` task transport 和 resolved deployment | 配置分层、deprecated env、冲突检测、config fingerprint 还未成为显式治理 contract | Phase 3 |
| `packages/host-distributed/src/**` 已冻结 distributed 宿主目录结构 | service-unit 运维面、capacity modeling、shared PostgreSQL 预算与 cache/distributed invalidation 运维 contract 仍未正式收口 | Phase 3 |
| `docs/todos/backend-engineering-optimization-plan.md` 已沉淀 operator、capacity、cache、bulk path 问题池 | 问题池与正式执行阶段之间的映射此前未冻结，容易导致重复开题或跳阶段 | Phase 0 |
| 文档索引已存在根计划、执行包、问题池、归档区四层角色 | 文档验证矩阵与后续 closeout/归档规则仍需在最终阶段统一回写 | Phase 4 |

## 范围

- 根 `plan.md`
- `docs/plans/README.md`
- `docs/todos/backend-engineering-optimization-plan.md`
- `docs/reference/REPO_STRUCTURE.md`
- `packages/server/src/app.ts`
- `packages/server/src/bootstrap/run-startup-sequence.ts`
- `packages/server/src/routes/operations/status.ts`
- `packages/server/src/lib/runtime/runtime-metadata.ts`
- `packages/server/src/lib/operations/read-model.ts`
- `packages/server/src/config.ts`
- `packages/backend-core/src/**`
- `packages/host-local/src/**`
- `packages/host-distributed/src/**`

## 主要修改文件

- `plan.md`
- `docs/plans/backend-engineering-masterplan/README.md`
- `docs/plans/README.md`
- `docs/todos/backend-engineering-optimization-plan.md`

## 要做的变更

- [x] 记录当前后端主入口、宿主包和异步/运维主入口文件。
- [x] 盘点当前活跃长期计划目录，标注“继续有效”“仅作参考”“将被接管”的状态。
- [x] 产出 gap matrix，至少覆盖：
  - 边界与兼容债务
  - async runtime / freshness / failure semantics
  - operator surface / config governance / capacity modeling
  - cache / invalidation / bulk path operations
- [x] 在新索引中说明 `docs/plans`、`docs/todos`、`docs/archived`、`docs/superpowers` 的边界。

## Non-Goals

- 不改后端实现。
- 不新增 API、worker 或 config 行为。
- 不在本阶段决定最终 schema 细节或接口字段扩展。

## 文档更新

- [x] 更新 `docs/plans/README.md`，把本执行包列为新的 active-reference 入口。
- [x] 在 `docs/todos/backend-engineering-optimization-plan.md` 增补说明：它是问题池，不是根执行计划。

## 测试 / Eval 更新

- [x] 记录后续阶段的最小验证矩阵：
  - `rtk pnpm typecheck`
  - `rtk pnpm test`
  - `rtk pnpm eval:smoke`
  - `rtk pnpm check:docs-drift`
  - `rtk pnpm check:structure`
- [x] 列出后续需要重点回归的测试面：
  - `packages/server/src/routes/operations/status.test.ts`
  - `packages/server/src/bootstrap/startup.test.ts`
  - `packages/server/src/lib/runtime/runtime-metadata.test.ts`
  - `packages/server/src/lib/queue/task-queue.test.ts`
  - `packages/server/src/lib/lifecycle/outbox.test.ts`

## 必要示例

### Gap Matrix 示例

| 当前事实 | Gap | 后续阶段 |
|---|---|---|
| `packages/server/src/routes/operations/status.ts` 已暴露 async runtime 状态 | queue/outbox/cache/workflow 视图仍需统一 failure/freshness 解释 | Phase 2 / Phase 3 |
| `packages/backend-core/src/ports/**` 已存在 | 真实 route/application/repo 收敛仍未完全映射到统一执行轨道 | Phase 1 |
| `docs/todos/backend-engineering-optimization-plan.md` 已列出工程化方向 | 缺少正式根入口与阶段依赖 | Phase 0 |

## 完成标准

- 当前代码入口、活跃参考计划和问题池的角色已经冻结。
- gap matrix 能直接指导后续阶段，不需要执行者重新拼上下文。
- 新旧计划边界已经写入根计划与索引文件。

## Assumptions / Open Questions

- assumption：`packages/server` 在本轮仍是权威实现面，因此阶段计划可以继续以它为主要修改入口。
- assumption：`packages/backend-core` / `packages/host-*` 在本轮主要作为边界和宿主约束，不要求立即成为所有功能的唯一实现落点。
- open question：后续执行时，如 `docs/plans/backend-engineering-roadmap/` 中某个旧阶段文件仍被别处直接引用，是否需要单独补一条“deprecated but referenced”说明。

## 本阶段结论

当前事实：

- Phase 0 已把代码入口、宿主目录、旧计划状态、问题池角色和 gap 承接关系冻结到新执行包中。

要做的变更：

- 后续只应从 `01-boundaries-and-compat-convergence.md` 开始推进 Phase 1，不再回到旧目录自行重建入口。

Non-Goals：

- 本阶段不把旧 active-reference 目录立即归档。
- 本阶段不改写 `packages/server`、`packages/backend-core`、`packages/host-*` 的实现职责。

Assumptions / Open Questions：

- assumption：旧目录中的 active-reference 计划仍会在一段时间内被引用，因此保留 reference 状态比立即 archive 更稳妥。
- open question：Phase 4 是否需要把 active-reference 进一步细分成 `reference` 与 `deprecated-reference` 两档，还要看后续文档引用面有多大。
