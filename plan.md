# TrapMap 执行计划索引

根 `plan.md` 只作为当前主线目录：说明任务背景、总体要求和验收边界；不承载 tranche checklist 或实施细节，执行步骤、复选框、证据和回写记录全部维护在链接的 active detail 中。

## 计划使用方式

- 根索引只允许链接一个 active mainline；当前主线的任务顺序、owner、证据和回写记录以主细则为准。
- 主细则中的复选框只有在代码或文档变更、focused test、事实守卫和必要的 closeout 都有证据后才能勾选；根索引不复制这些复选框。
- 新发现的问题先进入主细则的问题池或 [长期债务登记册](docs/todos/open-debt-and-compromises.md)，不得因为"仍有参考价值"而创建第二条并行主线。
- 主线范围、入口或验收边界发生变化时，先更新主细则，再同步本索引；所有阶段完成并留存证据后才归档主细则。

## 当前主线

- **主题：** 统一优雅组装中心（assembly）Phase 1 地基
- **目标：** packages/assembly 建包 + cordis 内核 + 核心 API（createAssembly / defineNode / defineContract / startupChecks / createShutdownController）+ 单测 + 守卫接入，现有宿主零改动。
- **状态：** `进行中`
- **主细则：** [Unified Assembly Center Phase 1](docs/todos/assembly-phase1.md)
- **设计规格：** [《TrapMap 统一优雅组装中心设计》](docs/superpowers/specs/2026-08-16-unified-assembly-center-design.md)
- **状态口径：** `进行中` 只表示该主细则仍是 active execution surface；任务完成度、阻塞项和证据以主细则复选框与 closeout 记录为准。

## 上一主线

- **Dead Code and Architecture Order Cleanup 主线已提交（2026-08-16）：** 主细则 [Dead Code and Architecture Order Cleanup](docs/todos/dead-code-and-architecture-order-cleanup.md) 的实现已提交；其 closeout（Task 11-13，包括 debt register 回写与归档）延后，见 [长期 open debt 与触发条件](docs/todos/open-debt-and-compromises.md) 登记。

## 执行路线图

| 阶段 | 主细则任务 | 阶段交付 | 放行条件 |
|---|---|---|---|
| 1. 建包 | T1 | packages/assembly 建包 + cordis 依赖 + 锁文件 | 包可解析、typecheck 全绿 |
| 2. 内核 API | T2-T3 | createAssembly / defineNode / defineContract / startupChecks / createShutdownController + 单测 | 核心 API 单测全绿（组合语义 / inject 顺序与无环 / 拓扑合法性 / 契约校验 / dispose 顺序 / 退出控制） |
| 3. 根级接线与守卫 | T4-T5 | tsconfig paths/references/vitest project/.fallowrc.json assembly zone（平行分支）；BOUNDARIES/REPO_STRUCTURE/SYSTEM_TRUTH_SOURCES/open-debt 文档同步 | check:fallow 无 assembly 相关 issue；文档守卫全绿 |
| 4. 回归与 closeout | T6 | 全量 typecheck + assembly 测试 + check:imports/asserts/docs/structure/deps + fallow audit | 证据齐全后归档并切换下一主线 |

阶段必须按顺序推进；任一阶段未通过放行条件，不得用后续阶段的实现掩盖前置事实或守卫失败。具体步骤和证据位置见[主细则](docs/todos/assembly-phase1.md)。

## 任务背景

2026-08-16 用户 goal 激活"统一优雅组装中心（assembly）"主线：承接设计文档 D6 Phase 1 阶段——新增 `packages/assembly`（`@trapmap/assembly`，cordis 编程式装配内核），建立 `createAssembly` / `defineNode` / `defineContract` / `startupChecks` / `createShutdownController` 与配套类型，用单测锁定组合语义、inject 顺序与无环、拓扑合法性、契约校验、dispose 顺序与退出控制。平行分支 `feat/assembly-core` 负责 Phase 1 代码（含 `.fallowrc.json` 的 assembly zone 变更）；现有宿主保持零改动。profiles / 形态 builders、宿主改造与判断类节点契约属 Phase 2+，本主线不纳入。

## 范围边界

**Phase 1 纳入：** packages/assembly 建包 + cordis 内核 + 核心 API + 单测 + 根级接线（tsconfig/vitest/.fallowrc.json assembly zone 由平行分支实现）+ 守卫与文档同步。

**Phase 1 不纳入：** profiles/形态 builders（localAgentAssembly 等）、宿主改造（host-local/host-distributed 改由 assembly boot）、判断类节点契约（intent-recognition / dedup-strategy 等）——全部 Phase 2+；零 yml/json 装配；现有宿主零改动。

## 验证门禁

- **行为不变是硬约束：** Phase 1 不改变任何现有运行时语义；`host-local` / `host-distributed` / `apps/*` 保持零源码改动。
- 每任务至少运行相关包 focused tests 与 `pnpm typecheck`。
- 跨包导入或边界变化必须运行 `pnpm exec fallow audit --base main`。
- 文档变化至少运行 `pnpm check:docs` 和 `pnpm check:structure`。
- 守卫接入后运行 `pnpm exec check:fallow`（含 assembly zone）。

## 验收边界

- `packages/assembly` 单测全绿（组合语义 / inject 顺序与无环 / 拓扑合法性 / 契约校验 / dispose 顺序 / 退出控制均有测试覆盖）。
- `check:fallow` 无 assembly 相关 issue（需 `.fallowrc.json` assembly zone 接入，由 `feat/assembly-core` 平行分支负责）。
- `pnpm typecheck` 全绿。
- 现有宿主零改动 diff 为空：`host-local`、`host-distributed`、`apps/*` 在 Phase 1 内无源码变更（文档除外）。
- 文档守卫全绿：`pnpm check:docs`、`pnpm check:structure`、`pnpm check:imports`、`pnpm check:asserts` 通过。

完成主线还必须满足：所有 active detail completion gates 均有命令输出或测试证据，CI 中的文档守卫为 blocking，未完成事项已在主细则或长期债务登记册中标明后续落点。

## 长期债务与历史入口

- [长期 open debt 与触发条件](docs/todos/open-debt-and-compromises.md)：不构成第二条 active mainline。
- [Dead Code and Architecture Order Cleanup 主线](docs/todos/dead-code-and-architecture-order-cleanup.md)：上一主线，实现已提交 2026-08-16，closeout（Task 11-13）延后，见 open-debt 登记。
- [已归档 Documentation Validation and Observability Platform 主线](docs/archived/archived-plans/documentation-validation-and-observability-platform-archived.md)：更早完成主线的历史证据。
- [历史归档总表](docs/archived/README.md)。
