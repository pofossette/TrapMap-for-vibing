# 待办文档

本目录只保留明确承担当前执行责任、长期登记职责或受守卫追踪的文件。这里的“活跃”不等于“仍有参考价值”，而是指当前 owner 正在回写、推进、验收的执行面。

## 活跃索引

当前没有 active mainline 行。授权待办、长期登记与受控文件如下：

| 文件 | 角色 | 状态 |
|---|---|---|
| [web-panel-feature-and-ui-optimization.md](web-panel-feature-and-ui-optimization.md) | Web Panel 功能补全与 UI 美化优化的分阶段计划 | 已授权待办；未开始实现 |
| [open-debt-and-compromises.md](open-debt-and-compromises.md) | 长期工程债务与平台成熟度登记 | 长期登记册；受根索引管理，非第二条 active mainline |
| [assert-exemptions.md](assert-exemptions.md) | 裸类型断言豁免清单 | 由 `pnpm check:asserts` 门禁追踪；非 active mainline |
| [dead-code-and-architecture-order-cleanup.md](dead-code-and-architecture-order-cleanup.md) | Dead Code and Architecture Order Cleanup：死代码清理与架构秩序守卫 | 挂起的历史实现细节；实现已提交 2026-08-16，Task 11-13 closeout 延后并登记在长期登记册 |

## 归档主线索引

以下文件只提供已完成或历史主题的证据入口，不是 active execution files。

| 文件 | 主题 | 状态 |
|---|---|---|
| [skill-lookup-surface-mainline-archived.md](../archived/archived-plans/skill-lookup-surface-mainline-archived.md) | Skill Lookup 契约漂移修复 | 已完成（2026-08-22），已归档 |
| [debt-mcp-platformization-mainline-archived.md](../archived/archived-plans/debt-mcp-platformization-mainline-archived.md) | 债务全量派发 + Agent MCP 接入 + 微服务平台化 | 已完成（2026-08-22），已归档 |
| [judgment-node-contracts-d8-archived.md](../archived/archived-plans/judgment-node-contracts-d8-archived.md) | 判断类节点契约（D8）收编 | 已完成（2026-08-16），已归档 |
| [unified-assembly-center-phase4-archived.md](../archived/archived-plans/unified-assembly-center-phase4-archived.md) | 统一优雅组装中心（assembly）Phase 4 收尾 | 已完成（2026-08-16），已归档 |
| [unified-assembly-center-phase3-archived.md](../archived/archived-plans/unified-assembly-center-phase3-archived.md) | 统一优雅组装中心（assembly）Phase 3 收敛 | 已完成（2026-08-16），已归档 |
| [unified-assembly-center-phase2-pilot-archived.md](../archived/archived-plans/unified-assembly-center-phase2-pilot-archived.md) | 统一优雅组装中心（assembly）Phase 2 试点 | 已完成（2026-08-16），已归档 |
| [unified-assembly-center-phase1-archived.md](../archived/archived-plans/unified-assembly-center-phase1-archived.md) | 统一优雅组装中心（assembly）Phase 1 地基 | 已完成（2026-08-16），已归档 |

## 目录规则

- 未被当前根 `plan.md` 明确链接、且不承担当前 owner 执行职责的文档，不属于 active surface。
- 已完成主线、空白清单、历史 closeout 证据和背景输入统一转入 `docs/archived/` 或 `docs/archived/archived-plans/`。
- 需要重启某个归档主题时，新建新的 active 细则，不直接把归档文档重新当 checklist 使用。
- 如果某份 todo 文档只剩“仍可参考”而不再承担执行责任，应优先归档，而不是继续留在本目录。
- 若未来新增辅助清单，只有在根 `plan.md` 或当前主细则显式赋予执行责任时才能留在本目录；否则应直接进入归档或背景目录。

## 当前状态说明

**当前无 active mainline。** 最新完成的 Skill Lookup 契约漂移修复已于 2026-08-22 closeout 归档（细则见 [skill-lookup-surface-mainline-archived.md](../archived/archived-plans/skill-lookup-surface-mainline-archived.md)）。[web-panel-feature-and-ui-optimization.md](web-panel-feature-and-ui-optimization.md) 是已授权的下一候选，在实现被启动前不属于 active mainline。[open-debt-and-compromises.md](open-debt-and-compromises.md) 是唯一长期问题登记册；[assert-exemptions.md](assert-exemptions.md) 由断言守卫追踪；[dead-code-and-architecture-order-cleanup.md](dead-code-and-architecture-order-cleanup.md) 是挂起的历史实现细节，其 Task 11-13 closeout 延后并登记在长期登记册中。其余主线均只能作为历史证据查找，只有根 `plan.md` 显式链接新的 active detail 后才能重新成为执行面。

完整归档表见 [`../archived/README.md`](../archived/README.md)。
