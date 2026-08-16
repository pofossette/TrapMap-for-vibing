# 待办文档

本目录只保留明确承担当前执行责任的 active 文档。这里的“活跃”不等于“仍有参考价值”，而是指当前 owner 正在回写、推进、验收的执行面。

## 活跃索引

| 文件 | 主题 | 状态 |
|---|---|---|
| [judgment-node-contracts-d8.md](../archived/archived-plans/judgment-node-contracts-d8-archived.md)（已归档） | 判断类节点契约（D8）收编（契约优先：6 个判断类节点契约三件套 + rule 实现 + assembly 挂载） | 已完成（2026-08-16），已归档 |
| [assembly-phase4.md](../archived/archived-plans/unified-assembly-center-phase4-archived.md)（已归档） | 统一优雅组装中心（assembly）Phase 4 收尾（双实现收敛 + direct-run seam 退役 + 别名对齐 + 集群化验证） | 已完成（2026-08-16），已归档 |
| [assembly-phase1.md](../archived/archived-plans/unified-assembly-center-phase1-archived.md)（已归档） | 统一优雅组装中心（assembly）Phase 1 地基 | 已完成（2026-08-16），已归档 |
| [assembly-phase2.md](../archived/archived-plans/unified-assembly-center-phase2-pilot-archived.md)（已归档） | 统一优雅组装中心（assembly）Phase 2 试点（host-local 改由 assembly boot） | 已完成（2026-08-16），已归档 |
| [assembly-phase3.md](../archived/archived-plans/unified-assembly-center-phase3-archived.md)（已归档） | 统一优雅组装中心（assembly）Phase 3 收敛（host-distributed 改 `distributedAssembly`） | 已完成（2026-08-16），已归档 |
| [dead-code-and-architecture-order-cleanup.md](dead-code-and-architecture-order-cleanup.md) | 死代码清理与架构秩序守卫 | 挂起（实现已提交 2026-08-16；closeout 延后） |
| [assert-exemptions.md](assert-exemptions.md) | 裸类型断言豁免清单（Wave 6 清理积压） | 由 `pnpm check:asserts` 门禁追踪；非 active mainline |
| [open-debt-and-compromises.md](open-debt-and-compromises.md) | 长期工程债务与平台成熟度登记 | 受根索引管理；非第二条 active mainline |
## 目录规则

- 未被当前根 `plan.md` 明确链接、且不承担当前 owner 执行职责的文档，不属于 active surface
- 已完成主线、空白清单、历史 closeout 证据和背景输入统一转入 `docs/archived/` 或 `docs/archived/archived-plans/`
- 需要重启某个归档主题时，新建新的 active 细则，不直接把归档文档重新当 checklist 使用
- 如果某份 todo 文档只剩“仍可参考”而不再承担执行责任，应优先归档，而不是继续留在本目录
- 若未来新增辅助清单，只有在根 `plan.md` 或当前主细则显式赋予执行责任时才能留在本目录；否则应直接进入归档或背景目录

## 当前状态说明

“判断类节点契约（D8）收编”主线已完成并归档（2026-08-16，细则见 [judgment-node-contracts-d8-archived.md](../archived/archived-plans/judgment-node-contracts-d8-archived.md)），当前无 active mainline。“统一优雅组装中心（assembly）”主线四阶段已全部完成（2026-08-16）并归档。[assembly Phase 3](../archived/archived-plans/unified-assembly-center-phase3-archived.md) 已完成（2026-08-16）并归档至 [unified-assembly-center-phase3-archived.md](../archived/archived-plans/unified-assembly-center-phase3-archived.md)；更早的 [assembly Phase 2](../archived/archived-plans/unified-assembly-center-phase2-pilot-archived.md) 与 [assembly Phase 1](../archived/archived-plans/unified-assembly-center-phase1-archived.md) 均已完成（2026-08-16）并归档。[Dead Code and Architecture Order Cleanup](dead-code-and-architecture-order-cleanup.md) 作为上一主线：实现已提交（2026-08-16），其 closeout（Task 11-13）延后，登记在 `open-debt-and-compromises.md`。已归档的 Documentation Validation and Observability Platform、compatibility-shell retirement、可观测性、shared PG 治理与分布式成熟度主线仅保留历史证据。`open-debt-and-compromises.md` 仅承担长期问题的来源、影响、触发条件和后续落点登记；它不允许形成并行 tranche。平台化与其余历史证据、冻结决策或背景材料应通过 `docs/archived/` 查找，只有根 `plan.md` 显式切换后才能成为新的执行面。

完整归档表见 [`../archived/README.md`](../archived/README.md)。
