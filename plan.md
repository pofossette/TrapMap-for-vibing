# TrapMap 执行计划索引

根 `plan.md` 只作为当前主线目录：说明任务背景、总体要求和验收边界；不承载 tranche checklist 或实施细节，执行步骤、复选框、证据和回写记录全部维护在链接的 active detail 中。

## 计划使用方式

- 根索引只允许链接一个 active mainline；当前主线的任务顺序、owner、证据和回写记录以主细则为准。
- 主细则中的复选框只有在代码或文档变更、focused test、事实守卫和必要的 closeout 都有证据后才能勾选；根索引不复制这些复选框。
- 新发现的问题先进入主细则的问题池或 [长期债务登记册](docs/todos/open-debt-and-compromises.md)，不得因为"仍有参考价值"而创建第二条并行主线。
- 主线范围、入口或验收边界发生变化时，先更新主细则，再同步本索引；所有阶段完成并留存证据后才归档主细则。

## 当前主线

- **主题：** 统一优雅组装中心（assembly）Phase 3 收敛
- **目标：** host-distributed 改由 `distributedAssembly(name)` boot（覆盖 gateway 与各服务进程 + worker 子节点整体/拆分形态）；删除 8 个 `start<X>Service` 样板；`shared/ports.ts` 简化版退役（完整 async-runtime 为唯一实现）。现有行为不变为硬约束。
- **状态：** `进行中`
- **主细则：** [Unified Assembly Center Phase 3](docs/todos/assembly-phase3.md)
- **设计规格：** [《TrapMap 统一优雅组装中心设计》](docs/superpowers/specs/2026-08-16-unified-assembly-center-design.md)
- **状态口径：** `进行中` 只表示该主细则仍是 active execution surface；任务完成度、阻塞项和证据以主细则复选框与 closeout 记录为准。

## 上一主线

- **Unity Assembly Center Phase 2 试点已完成并归档（2026-08-16）：** 提交 63c26029 / 26964daf / fc114c35 + 合并 dbf1461a；细则见 [docs/archived/archived-plans/unified-assembly-center-phase2-pilot-archived.md](docs/archived/archived-plans/unified-assembly-center-phase2-pilot-archived.md)，closeout 证据在该文档 Closeout 记录。
- **Unity Assembly Center Phase 1 已完成并归档（2026-08-16）：** 提交 fd0f8ee0 / 1f18d745 / 61dd0cbb / bae2c813 + 合并 d70a1cd6 / e6be1581；细则见 [docs/archived/archived-plans/unified-assembly-center-phase1-archived.md](docs/archived/archived-plans/unified-assembly-center-phase1-archived.md)，closeout 证据在该文档 Closeout 记录。
- **Dead Code and Architecture Order Cleanup 主线已提交（2026-08-16）：** 主细则 [Dead Code and Architecture Order Cleanup](docs/todos/dead-code-and-architecture-order-cleanup.md) 的实现已提交；其 closeout（Task 11-13，包括 debt register 回写与归档）延后，见 [长期 open debt 与触发条件](docs/todos/open-debt-and-compromises.md) 登记。

## 执行路线图

| 阶段 | 主细则任务 | 阶段交付 | 放行条件 |
|---|---|---|---|
| 1. distributedAssembly profile | T1 | `distributedAssembly(name)` 按设计 D3 的 service switch 组合 gateway / 各服务进程 / worker；host-distributed-owned nodes 落点（沿用 Phase 2 偏差记录结论） | profile 可装载、拓扑断言通过、typecheck/fallow 全绿 |
| 2. starter 收敛 | T2 | 8 个 `start<X>Service` 改薄调用并删除重复样板；`--service` 分发经 `distributedAssembly` | host-distributed 启动经薄调用、deployment-smoke 全绿 |
| 3. shared/ports.ts 退役 | T3 | 简化版（queue/outbox/检索 ILIKE）移除，完整 async-runtime / owner 端口实现为唯一语义 | distributed-closeout / acceptance / deployment-smoke 全绿 |
| 4. worker 子节点形态 | T4 | job-runtime 容器整体承载与 `*-worker` 拆分独立进程两形态打通 | 拓扑断言测试通过、deployment/runtime 全绿 |
| 5. golden 回归 | T5 | distributed-closeout / distributed-acceptance / deployment-smoke / runtime-foundations / host-distributed 包测试；行为不变 diff 核验 | golden 全绿、行为不变 |
| 6. closeout | T6 | 守卫 + 文档回写 + 归档评估 | 证据齐全后归档并切换下一主线（Phase 4） |

阶段必须按顺序推进；任一阶段未通过放行条件，不得用后续阶段的实现掩盖前置事实或守卫失败。具体步骤和证据位置见[主细则](docs/todos/assembly-phase3.md)。

## 任务背景

2026-08-16 用户 goal 激活"统一优雅组装中心（assembly）"主线。Phase 1（packages/assembly 内核 + cordis + 测试 + 根级接线 + 文档）已完成并归档（见 [docs/archived/archived-plans/unified-assembly-center-phase1-archived.md](docs/archived/archived-plans/unified-assembly-center-phase1-archived.md)），Phase 2（host-local 试点）已完成并归档（见 [docs/archived/archived-plans/unified-assembly-center-phase2-pilot-archived.md](docs/archived/archived-plans/unified-assembly-center-phase2-pilot-archived.md)）。本期承接设计文档 D6 Phase 3 收敛：host-distributed 改由 `distributedAssembly(name)` boot（覆盖 gateway 与各服务进程），删除 `start<X>Service` 样板，`shared/ports.ts` 简化版退役（D5），worker 子节点整体/拆分形态打通。平行分支 `feat/phase3-core`（另一 worktree）实现 `distributedAssembly` profiles、starter 收敛与 `shared/ports.ts` 退休。现有行为不变为硬约束。判断类节点契约、OTel/Consul 收敛、集群化验证与 yml/json 装配均不在本阶段。

## 范围边界

**Phase 3 纳入：** `distributedAssembly(name)` profile（按设计 D3 的 service switch 组合 gateway / 各服务进程 / worker；host-distributed-owned nodes 落点沿用 Phase 2 偏差记录结论）；starter 收敛（8 个 `start<X>Service` 改薄调用 + 删除重复样板；`--service` 分发经 `distributedAssembly`）；`shared/ports.ts` 简化版退役（D5：完整 `async-runtime.ts` / owner 端口实现为唯一语义）；worker 子节点整体（job-runtime 容器）与拆分（`*-worker` 独立进程）两形态打通；golden 回归（distributed-closeout / distributed-acceptance / deployment-smoke / runtime-foundations / host-distributed 包测试；行为不变 diff 核验）。

**Phase 3 不纳入：** 判断类节点契约（intent-recognition / dedup-strategy 等，D8 后续独立收编）、OTel/Consul 双份接线收敛（Phase 4）、集群化验证与 direct-run seam 退役 / 别名对齐（Phase 4）、任何 yml/json 装配。

## 验证门禁

- **行为不变是硬约束：** Phase 3 不改变任何现有运行时语义；golden 回归（distributed-closeout / distributed-acceptance / deployment-smoke / runtime-foundations / host-distributed 包测试）必须全绿，diff 核验 host-distributed 行为不变。
- 每任务至少运行相关包 focused tests 与 `pnpm typecheck`。
- 跨包导入或边界变化必须运行 `pnpm exec fallow audit --base main`。
- 文档变化至少运行 `pnpm check:docs` 和 `pnpm check:structure`。
- 边界接入后运行 `pnpm exec check:fallow`（含 assembly zone）。

## 验收边界

- `distributedAssembly(name)` 覆盖 gateway 与各服务进程；host-distributed-owned nodes 落点沿用 Phase 2 偏差记录结论；现有行为不变。
- 8 个 `start<X>Service` 样板收敛为薄调用并删除重复样板；`--service` 分发经 `distributedAssembly(name)`。
- `shared/ports.ts` 简化版（queue / outbox / 检索 ILIKE）退役；完整 `async-runtime.ts` / owner 端口实现为唯一语义。
- worker 子节点整体（job-runtime 容器）与拆分（`*-worker` 独立进程）两形态可启动，拓扑断言通过。
- golden 回归全绿：`distributed-closeout` / `distributed-acceptance` / `pnpm test:deployment-smoke` / `pnpm test:runtime-foundations` / host-distributed 包测试；行为不变 diff 核验通过。
- `pnpm typecheck` 全绿；`check:fallow`（含 assembly zone）无 issue；文档守卫（check:docs / check:structure）全绿；无新增 yml/json 装配文件。

完成主线还必须满足：所有 active detail completion gates 均有命令输出或测试证据，CI 中的文档守卫为 blocking，未完成事项已在主细则或长期债务登记册中标明后续落点。

## 长期债务与历史入口

- [长期 open debt 与触发条件](docs/todos/open-debt-and-compromises.md)：不构成第二条 active mainline。
- [已归档 Unity Assembly Center Phase 2](docs/archived/archived-plans/unified-assembly-center-phase2-pilot-archived.md)：assembly Phase 2 试点已完成并归档（2026-08-16）。
- [已归档 Unity Assembly Center Phase 1](docs/archived/archived-plans/unified-assembly-center-phase1-archived.md)：assembly Phase 1 地基已完成并归档（2026-08-16）。
- [Dead Code and Architecture Order Cleanup 主线](docs/todos/dead-code-and-architecture-order-cleanup.md)：更早上一主线，实现已提交 2026-08-16，closeout（Task 11-13）延后，见 open-debt 登记。
- [已归档 Documentation Validation and Observability Platform 主线](docs/archived/archived-plans/documentation-validation-and-observability-platform-archived.md)：更早完成主线的历史证据。
- [历史归档总表](docs/archived/README.md)。
