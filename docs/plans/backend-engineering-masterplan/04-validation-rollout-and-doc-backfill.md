# TrapMap Backend Engineering Master Plan - Phase 4 Validation Rollout And Doc Backfill

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define the rollout gates, validation matrix, documentation backfill rules, and archival mechanics that close the backend engineering master plan safely.

**Architecture:** This phase does not add new backend capabilities. It makes prior phases executable and auditable by freezing the validation order, doc truth-source updates, and the rules for when old plans exit the active track.

**Tech Stack:** TypeScript monorepo, pnpm, Vitest, eval smoke, docs drift guard, structure guard.

---

## 目标

- 定义每阶段的验证门槛。
- 定义文档回写和事实源更新顺序。
- 定义旧计划退出活跃轨道的条件。
- 定义最终 closeout 规则。

## 当前事实

- 仓库已经有明确的结构守卫和文档漂移守卫。
- 根 `plan.md` 与 `docs/plans/README.md` 已被视为活跃计划入口。
- 旧的活跃计划目录仍被部分文档引用，因此退出必须显式、可追踪。
- `eval:smoke` 已被项目约定为涉及检索/治理/异步相关改动时的最低回归之一。

## 范围

- `plan.md`
- `docs/plans/backend-engineering-masterplan/README.md`
- `docs/plans/README.md`
- `docs/operations/TESTING.md`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- `docs/reference/REPO_STRUCTURE.md`
- 必要时 `README.md`

## 主要修改文件

- `plan.md`
- `docs/plans/README.md`
- `docs/operations/TESTING.md`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- `docs/reference/REPO_STRUCTURE.md`

## 要做的变更

- [x] 为每个阶段定义最小可接受验证命令。
- [x] 定义何时勾选根 `plan.md` 中的阶段复选框。
- [x] 定义哪些旧计划在何时降级为 historical reference 或归档到 `docs/archived/archived-plans/`。
- [x] 定义文档回写优先级：
  - 先 facts / truth sources
  - 再 operations / testing
  - 再 README / overview
- [x] 定义完成 closeout 时必须确认的内容：
  - 计划入口唯一
  - 文档引用一致
  - 验证矩阵执行完成

## Non-Goals

- 不新增产品能力。
- 不单独扩展测试框架。
- 不为 archive 动作引入新的目录规则。

## 文档更新

- [x] 更新 `docs/plans/README.md`，把本执行包标记为当前根计划引用的 active-reference。
- [x] 更新 `docs/operations/TESTING.md`，把后端工程化阶段回归矩阵写清。
- [x] 更新 `docs/reference/SYSTEM_TRUTH_SOURCES.md`，确保根计划和新索引被记录为当前事实源之一。
- [x] `README.md` 本轮判定为无需更新；其文档入口已指向 `docs/README.md`，不承担后端工程化执行入口角色。

## 测试 / Eval 更新

- [x] 统一最终验证矩阵：
  - `rtk pnpm typecheck`
  - `rtk pnpm test`
  - `rtk pnpm eval:smoke`
  - `rtk pnpm check:docs-drift`
  - `rtk pnpm check:structure`
- [x] 对每阶段要求至少标明其聚焦测试入口。

## 必要示例

### 根计划勾选示例

- 当 Phase 2 的代码、测试、文档回写全部完成后：
  - 将 `plan.md` 中 `Phase 2 异步运行时与失败语义完成` 勾选为完成。
  - 在对应阶段文件中补最终验证结果与残余风险。

### 旧计划退出示例

- 当 `backend-engineering-roadmap/` 中某条旧阶段计划已被本执行包完全吸收且不再被当前文档引用时：
  - 降级为 historical reference，或移动到 `docs/archived/archived-plans/`
  - 在 `docs/plans/README.md` 删除其 active-reference 角色

## 完成标准

- 后端工程化的验证、回写、归档和 closeout 已有统一规则。
- 执行者知道每个阶段完成后必须更新哪些文档、跑哪些命令、何时勾选根计划。
- 活跃计划与历史计划的边界不再含糊。

## Assumptions / Open Questions

- assumption：阶段勾选应以“代码 + 测试 + 文档 +验证矩阵”全部完成为标准，而不是仅以代码合入为标准。

## 本阶段结论

当前事实：

- `Phase 0` 到 `Phase 3` 的代码与文档事实已经落在现有权威面：`packages/contracts`、`packages/server/src/routes/operations/status.ts`、`packages/server/src/routes/operations/stats.ts`、`packages/server/src/config.ts` 以及相关事实源文档。
- `docs/plans/backend-engineering-masterplan/` 已经成为根 `plan.md` 唯一指向的后端工程化正式执行包。
- `docs/plans/backend-engineering-roadmap/`、`runtime-recomposition/`、`deployment-flexibility/` 仍然被当前文档引用，因此在本轮 closeout 中只能降级为 historical-reference/secondary-reference 角色，不能直接归档删除。

本轮要做的变更：

- 把每阶段的最小验证入口、勾选条件、文档回写顺序和 closeout 规则写入正式事实源。
- 把 `docs/plans/README.md` 中的计划角色收紧为：
  - `backend-engineering-masterplan/`：active-execution
  - 仍被当前文档引用的旧目录：historical-reference
- 关闭 Phase 3 遗留 open question，并把“关闭理由 + 权威落点”回写到 Phase 3/4 文档与正式事实源。
- 明确关闭 `README.md` 条件项：当前根 README 已稳定充当仓库总览与文档入口，不需要额外提升为后端工程化执行入口。

Non-Goals：

- 本阶段不新增后端产品能力。
- 本阶段不把仍被引用的旧目录强制迁移到 `docs/archived/archived-plans/`。
- 本阶段不把 `databasePool.maxConnections` 扩写成新的 runtime/driver introspection contract。

验证矩阵规则：

- 每个阶段勾选前至少满足：
  - 相关代码 / schema 已落地
  - 聚焦测试入口已通过
  - facts / truth sources 已回写
  - `pnpm check:docs-drift` 与 `pnpm check:structure` 已通过
- 根 `plan.md` 的阶段复选框只在上述条件全部满足后勾选；不能仅以“代码已存在”作为完成判据。

旧计划退出 / 降级规则：

- 当旧计划仍被当前文档直接引用时：
  - 保留在 `docs/plans/`
  - 在 `docs/plans/README.md` 标记为 `historical-reference`
  - 不再承担默认执行入口角色
- 当旧计划已被新执行包完全吸收且不再被当前文档引用时：
  - 移动到 `docs/archived/archived-plans/`，或在活跃索引中移除

文档回写优先级：

1. `plan.md`、`docs/reference/SYSTEM_TRUTH_SOURCES.md`、阶段计划结论
2. `docs/operations/TESTING.md`、`docs/operations/ENVIRONMENT.md`、`docs/reference/api-surface.md`、`docs/reference/PERFORMANCE.md`
3. `docs/plans/README.md`、`docs/todos/backend-engineering-optimization-plan.md`、架构总览

`README.md` 条件项 closeout：

- 结论：`not applicable / already closed`。
- 关闭理由：仓库根 README 当前已把文档入口收敛到 `docs/README.md` 等总览文档，且没有把自己声明为后端工程化执行入口；本轮执行入口的唯一收口点已经是 `plan.md` + `docs/plans/backend-engineering-masterplan/README.md`。
- 处理结果：不再为本阶段追加 README 改动，也不把该条件项继续保留为未勾选待办。

Phase 3 遗留 open question closeout：

- `capacityModel.databasePool.maxConnections`
  - 结论：关闭。当前仓库不把它提升为正式 runtime contract，只保留为 capacity summary 的扩展位。
  - 关闭理由：现有实现没有稳定、跨 transport/runtime mode 一致的连接池 introspection 面；若强行上升为正式 contract，会把 Phase 4 closeout 扩成新的运行时设计线。
  - 权威落点：`packages/contracts/src/domain/operations.ts`、`packages/server/src/routes/operations/status-phase3.ts`、`docs/reference/PERFORMANCE.md`、`docs/architecture/ARCHITECTURE.md`。
- 热点 `team/query/artifact`
  - 结论：关闭。默认 operator surface 明确保持非热点明细化，只保留 backlog / latency / cache pressure 高层摘要；热点分析属于后续 deep drill-down。
  - 关闭理由：默认首页已经有稳定的 operator 摘要分组；把热点明细放进默认 surface 会扩大返回面和频率负担，但当前仓库没有同等稳定的热点数据 contract。
  - 权威落点：`packages/server/src/routes/operations/status-phase3.ts`、`docs/reference/PERFORMANCE.md`、`docs/reference/api-surface.md`、`docs/plans/backend-engineering-masterplan/03-operator-config-capacity-and-cache-ops.md`。

是否阻塞 closeout：

- 以上两项 open question 均已关闭。
- 当前不存在阻塞后端工程化总计划收尾的剩余 open question。
