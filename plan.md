# TrapMap 执行计划索引

根 `plan.md` 只作为当前主线索引和状态页；不承载 tranche checklist 或实施细节，执行步骤、复选框、证据和回写记录全部维护在由本页显式链接的 active detail 中。

## 计划使用方式

- 根索引只允许链接一个 active mainline；当前主线的任务顺序、owner、证据和回写记录以主细则为准。
- 主细则中的复选框只有在代码或文档变更、focused test、事实守卫和必要的 closeout 都有证据后才能勾选；根索引不复制这些复选框。
- 新发现的问题先进入主细则的问题池或 [长期债务登记册](docs/todos/open-debt-and-compromises.md)，不得因为“仍有参考价值”而创建第二条并行主线。
- 主线范围、入口或验收边界发生变化时，先更新主细则，再同步本索引；所有阶段完成并留存证据后才归档主细则。
- 长期执行原则保持不变：运行时语义不变是硬约束（检索行为升级除外）。

## 当前主线

- 当前主线是 [Web Panel 功能补全与 UI 美化优化](docs/todos/web-panel-feature-and-ui-optimization.md)，已于 2026-08-23 启动 Phase 0 / 3 / 5 交叉实施；阶段顺序、验收证据和剩余范围以主细则为准。

## 下一候选

- 当前无额外下一候选；新问题优先进入当前主细则或长期债务登记册。

## 历史主线与入口

- **Skill Lookup 契约漂移修复已完成并归档（2026-08-22）：** 集成验证与 deferred 问题处置记录见 [skill-lookup-surface-mainline-archived.md](docs/archived/archived-plans/skill-lookup-surface-mainline-archived.md)。
- **债务全量派发 + Agent MCP 接入 + 微服务平台化已完成并归档（2026-08-22）：** 见 [历史归档总表](docs/archived/README.md) 中 `debt-mcp-platformization-mainline-archived.md` 行；残余项以长期登记册为准。
- **判断类节点契约（D8）收编已完成并归档（2026-08-16）：** 细则见 [judgment-node-contracts-d8-archived.md](docs/archived/archived-plans/judgment-node-contracts-d8-archived.md)；llm/hybrid 生产变体收编保留在 [长期债务登记册](docs/todos/open-debt-and-compromises.md)。
- **Unity Assembly Center Phase 4 收尾已完成并归档（2026-08-16）：** 细则见 [unified-assembly-center-phase4-archived.md](docs/archived/archived-plans/unified-assembly-center-phase4-archived.md)。
- **Unity Assembly Center Phase 3 收敛已完成并归档（2026-08-16）：** 细则见 [unified-assembly-center-phase3-archived.md](docs/archived/archived-plans/unified-assembly-center-phase3-archived.md)。
- **Unity Assembly Center Phase 2 试点已完成并归档（2026-08-16）：** 细则见 [unified-assembly-center-phase2-pilot-archived.md](docs/archived/archived-plans/unified-assembly-center-phase2-pilot-archived.md)。
- **Unity Assembly Center Phase 1 地基已完成并归档（2026-08-16）：** 细则见 [unified-assembly-center-phase1-archived.md](docs/archived/archived-plans/unified-assembly-center-phase1-archived.md)。
- **Documentation Validation and Observability Platform 已完成并归档：** 历史证据见 [documentation-validation-and-observability-platform-archived.md](docs/archived/archived-plans/documentation-validation-and-observability-platform-archived.md)。
- **Dead Code and Architecture Order Cleanup 实现已提交（2026-08-16）：** 挂起的历史实现细节见 [dead-code-and-architecture-order-cleanup.md](docs/todos/dead-code-and-architecture-order-cleanup.md)；Task 11-13 closeout 与归档延后，登记在 [长期 open debt 与触发条件](docs/todos/open-debt-and-compromises.md)。
- 更多历史材料见 [历史归档总表](docs/archived/README.md)。
