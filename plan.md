# TrapMap Backend Engineering Master Plan

## 状态

- 状态：`active`
- 日期：`2026-06-20`
- 本文件角色：根级总控执行计划与索引，统一后端工程化、可扩展性、异步处理与验证回写
- 已归档旧根计划：[`docs/archived/archived-plans/plan-2026-06-20-runtime-recomposition-root-archived.md`](docs/archived/archived-plans/plan-2026-06-20-runtime-recomposition-root-archived.md)

## 背景

TrapMap 当前的真实代码结构已经进入“多层后端演进期”：

- `packages/server` 仍然是权威实现、测试与兼容壳层的主要落点，`buildServer()`、`runStartupSequence()`、`/v1/operations/status/async` 等主入口都在这里。
- `packages/backend-core`、`packages/host-local`、`packages/host-distributed` 已存在，说明 runtime capability、宿主装配和服务边界不再只是文档叙事，而是已进入代码层。
- `task_queue`、`domain_event_outbox`、`workflow_runs`、retrieval cache、intent cache、operator routes 已经形成异步和运维基座，但 failure semantics、freshness、config governance、capacity modeling 仍未统一成一条执行主线。

因此当前更需要的不是再新增一批分散计划，而是用一条新的根计划把已有后端工程化成果、活跃参考计划和待收敛债务重新编排成一条可直接执行的轨道。

## 当前事实

- 当前后端主代码入口：
  - `packages/server/src/app.ts`
  - `packages/server/src/bootstrap/run-startup-sequence.ts`
  - `packages/server/src/routes/operations/status.ts`
  - `packages/server/src/lib/runtime/runtime-metadata.ts`
  - `packages/server/src/lib/operations/read-model.ts`
  - `packages/server/src/config.ts`
- 当前后端演进相关包已存在：
  - `packages/backend-core`
  - `packages/host-local`
  - `packages/host-distributed`
- 当前活跃长期计划入口仍分散在：
  - `docs/plans/backend-engineering-roadmap/`
  - `docs/plans/runtime-recomposition/`
  - `docs/plans/deployment-flexibility/`
- `docs/todos/backend-engineering-optimization-plan.md` 已记录工程化问题池，但它不是正式总控执行计划。

## 这轮要做的变更

- 用新的后端工程化总控计划接管根 `plan.md`。
- 保留并吸收现有 active-reference 计划的有效结论，但把执行入口统一到新的索引目录。
- 按阶段明确：
  - 当前事实
  - 要做的变更
  - non-goals
  - 主要修改文件
  - 文档更新
  - 测试 / eval 更新
  - 必要示例

## Non-Goals

- 本轮不直接实现后端代码改造。
- 本轮不把 Web 面板和前端规划并入根计划。
- 本轮不把 `docs/superpowers/plans/` 自动提升为正式活跃长期计划目录。
- 本轮不重写已有运行时/部署计划的技术内容，只做承接、边界澄清和执行排序。

## 总体目标

- 让 TrapMap 的后端工程化主线从“文档上可扩展”收敛到“执行上可推进”。
- 让边界、异步运行时、失败语义、operator 能力、配置治理、容量建模和验证闭环进入统一总控轨道。
- 让未来的代码执行可以直接沿根计划和阶段计划推进，而不需要再手动拼接多份历史文档。

## 进度跟踪

- [x] Phase 0 baseline 与 gap matrix 固化完成
- [x] Phase 1 边界与兼容收敛完成
- [x] Phase 2 异步运行时与失败语义完成
- [x] Phase 3 operator / config / capacity / cache-ops 完成
- [x] Phase 4 验证、eval 与文档回写完成

## 子计划索引

- [backend-engineering-masterplan/README.md](docs/plans/backend-engineering-masterplan/README.md)
  作用：后端工程化正式执行包索引，说明与 `docs/plans`、`docs/todos`、`docs/archived`、`docs/superpowers` 的边界。
- [00-current-state-and-gap-baseline.md](docs/plans/backend-engineering-masterplan/00-current-state-and-gap-baseline.md)
  作用：冻结当前实现基线、活跃参考计划和真实 gap。
- [01-boundaries-and-compat-convergence.md](docs/plans/backend-engineering-masterplan/01-boundaries-and-compat-convergence.md)
  作用：收敛 route / application / repo / runtime / compat 边界。
- [02-async-runtime-and-failure-semantics.md](docs/plans/backend-engineering-masterplan/02-async-runtime-and-failure-semantics.md)
  作用：统一 async runtime、freshness、failure semantics、idempotency、retry、resume。
- [03-operator-config-capacity-and-cache-ops.md](docs/plans/backend-engineering-masterplan/03-operator-config-capacity-and-cache-ops.md)
  作用：补强 operator surface、config governance、capacity modeling、cache 与 bulk path operations。
- [04-validation-rollout-and-doc-backfill.md](docs/plans/backend-engineering-masterplan/04-validation-rollout-and-doc-backfill.md)
  作用：定义验证矩阵、文档回写、旧计划退出与最终 closeout。

## 阶段依赖

- `Phase 0` 是所有后续阶段的前置。
- `Phase 1` 先冻结真实边界和兼容责任，再推进运行时 contract 收敛。
- `Phase 2` 在 `Phase 1` 收紧边界后统一异步和失败语义。
- `Phase 3` 建立在 `Phase 2` 的 contract 之上，把运维与容量能力做厚。
- `Phase 4` 负责统一验证、归档、文档事实源回写和 closeout。

## 当前阶段结论

- `Phase 0` 已冻结当前实现、活跃计划状态和 gap matrix。
- `Phase 1` 已把 route / application / repository / runtime / compatibility 的 ownership、compat allowlist，以及 `packages/server` 与 `backend-core` / `host-*` 的承接关系回写为正式事实源。
- `Phase 2` 已完成：async runtime contract、freshness / projection lag contract、idempotency / retry / resume semantics、failure taxonomy 与 operator-visible async status 已统一到 `packages/contracts`、`packages/server/src/routes/operations/status.ts` 及相关事实源文档。
- `Phase 3` 已完成：`GET /v1/operations/status/async` 额外暴露 `operatorHome`、`configGovernance`、`capacityModel`、`bulkOperations`；`packages/server/src/config.ts` 提供 fingerprint / deprecated env / conflict warning / profile-aware capability summary；`GET /v1/operations/stats/summary` 额外暴露 `cacheInvalidationByNamespace` 与 `cachePendingInvalidationByNamespace`。
- `Phase 4` 已完成：验证矩阵、文档 truth-source 回写、旧计划与 active-reference 边界、以及 closeout 规则已经统一；本轮不再新增 `Phase 5`，也不回头重做 `Phase 2` / `Phase 3`。
- `Phase 3` 遗留 open question 已在 closeout 中处理：
  - `capacityModel.databasePool.maxConnections` 继续保留为 operator-facing 扩展位，但在当前仓库中明确降级为 deferred detail；正式 contract 仅保证 `configured` 与 `maxConnections: null | integer` 这一保守 shape，不把驱动内部连接池状态升级为新的 runtime contract。
  - 热点 `team/query/artifact` 明确不进入默认 operator surface，保持为后续深钻能力；默认首页只保留 backlog / latency / cache pressure 等高层容量信号。
- 当前不存在阻塞本总计划收尾的 open question。

## 计划边界说明

- `docs/plans/`：当前仍被引用、仍应执行的长期计划。
- `docs/archived/archived-plans/`：被替代、完成或退出活跃轨道的历史计划。
- `docs/todos/`：问题池、提案和待升级工作项，不直接充当执行计划。
- `docs/superpowers/plans/`：Superpowers 工作流输出区，除非被本根计划或 `docs/plans/README.md` 显式接管，否则不自动视为活跃长期计划。

## 完成定义

当以下条件全部满足时，可认为这轮后端工程化总控计划完成：

- 根 `plan.md` 与 `docs/plans/backend-engineering-masterplan/` 成为唯一明确的后端工程化执行入口。
- 当前活跃参考计划与问题池的关系已经写清，不再需要执行者自行判断入口。
- 每个阶段都明确了目标、范围、主要修改文件、完成标准、文档更新、测试 / eval 更新和必要示例。
- 文档事实源、结构守卫和归档路径与仓库规则保持一致。
