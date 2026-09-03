# TrapMap 执行计划索引

根 `plan.md` 只作为当前主线索引和状态页；不承载 tranche checklist 或实施细节，执行步骤、复选框、证据和回写记录全部维护在由本页显式链接的 active detail 中。

## 计划使用方式

- 根索引只允许链接一个 active mainline；当前主线的任务顺序、owner、证据和回写记录以主细则为准。
- 主细则中的复选框只有在代码或文档变更、focused test、事实守卫和必要的 closeout 都有证据后才能勾选；根索引不复制这些复选框。
- 新发现的问题先进入主细则的问题池或 [长期债务登记册](docs/todos/open-debt-and-compromises.md)，不得因为“仍有参考价值”而创建第二条并行主线。
- 主线范围、入口或验收边界发生变化时，先更新主细则，再同步本索引；所有阶段完成并留存证据后才归档主细则。
- 长期执行原则保持不变：运行时语义不变是硬约束（检索行为升级除外）。

## 当前主线

- **Experience Gene Infrastructure and Pipeline 已于 2026-09-03 完成 closeout 并归档。** 归档证据见 [experience-gene-program-mainline-archived.md](docs/archived/archived-plans/experience-gene-program-mainline-archived.md) 与 5 个 delegated phase 归档（`experience-gene-*.md`）。关键活证据：`pnpm typecheck` / `pnpm check:docs`(blocking tiers green) / `pnpm check:structure` PASS，`pnpm exec fallow audit --base HEAD --no-cache` 本机 `6 changed files vs HEAD / ✓ No issues in 6 changed files`（activation-commit `5cbb2f93`），`pnpm eval:experience-gene --tier smoke --mode shadow` `total 3/selected 1/precision 1.0/safety 0` 与 `--tier core --mode serve` `total 10/selected 9/precision 1.0/safety 0/promotionEligible true`（2026-09-03 复测），`evals/experience-gene/lib/governance-review.test.ts` 4 tests + rollback tri-state tests 均绿；`pnpm eval:smoke` / live baseline/shadow/serve comparison 因 Docker/DB 门控登记为 CI 必跑（见 [open-debt-and-compromises.md](docs/todos/open-debt-and-compromises.md) 与 `experience-gene-infrastructure-foundation.md` 第四检查点）。架构灵感回写已完成：`docs/architecture/ARCHITECTURE.md` + `RETRIEVAL.md/ARTIFACTS.md/EVALUATION.md` 均已标注两篇论文（2604.15097v2 + 2604.17870）。
- **下一 active mainline 切为 [Web Panel 功能补全与 UI 美化优化](docs/plans/web-panel-feature-and-ui-optimization-paused.md)。** 它自 2026-08-25 起为 paused successor，现恢复为 active execution surface；执行前需按 [文档治理指南](docs/guides/DOCUMENTATION_GOVERNANCE.md) 将细则迁回 `docs/todos/` 或基于其最新状态创建新的 active 細則，再由本索引显式链接。

## 历史主线与入口

- **Experience Gene Infrastructure and Pipeline 已完成并归档（2026-09-03）：** 5 阶段串行（infra → contracts/storage → derivation → retrieval/activation → governance/evaluation/rollout）全部完成，deterministic offline precision 1.0 / promotionEligible true，20-Gene 治理抽样与 rollback 验证均绿，架构已标注两篇论文灵感。归档见 [experience-gene-program-mainline-archived.md](docs/archived/archived-plans/experience-gene-program-mainline-archived.md) 及其 5 个 delegated phase 归档，验证命令见主细则 `Execution record` 与第四检查点。
- **Skill Lookup 契约漂移修复已完成并归档（2026-08-22）：** 集成验证与 deferred 问题处置记录见 [skill-lookup-surface-mainline-archived.md](docs/archived/archived-plans/skill-lookup-surface-mainline-archived.md)。
- **债务全量派发 + Agent MCP 接入 + 微服务平台化已完成并归档（2026-08-22）：** 见 [历史归档总表](docs/archived/README.md) 中 `debt-mcp-platformization-mainline-archived.md` 行；残余项以长期登记册为准。
- **判断类节点契约（D8）收编已完成并归档（2026-08-16）：** 细则见 [judgment-node-contracts-d8-archived.md](docs/archived/archived-plans/judgment-node-contracts-d8-archived.md)；llm/hybrid 生产变体收编保留在 [长期债务登记册](docs/todos/open-debt-and-compromises.md)。
- **Unity Assembly Center Phase 4 收尾已完成并归档（2026-08-16）：** 细则见 [unified-assembly-center-phase4-archived.md](docs/archived/archived-plans/unified-assembly-center-phase4-archived.md)。
- **Unity Assembly Center Phase 3 收敛已完成并归档（2026-08-16）：** 细则见 [unified-assembly-center-phase3-archived.md](docs/archived/archived-plans/unified-assembly-center-phase3-archived.md)。
- **Unity Assembly Center Phase 2 试点已完成并归档（2026-08-16）：** 细则见 [unified-assembly-center-phase2-pilot-archived.md](docs/archived/archived-plans/unified-assembly-center-phase2-pilot-archived.md)。
- **Unity Assembly Center Phase 1 地基已完成并归档（2026-08-16）：** 细则见 [unified-assembly-center-phase1-archived.md](docs/archived/archived-plans/unified-assembly-center-phase1-archived.md)。
- **Documentation Validation and Observability Platform 已完成并归档：** 历史证据见 [documentation-validation-and-observability-platform-archived.md](docs/archived/archived-plans/documentation-validation-and-observability-platform-archived.md)。
- **Dead Code and Architecture Order Cleanup 实现已提交（2026-08-16）：** 挂起的历史实现细节见 [dead-code-and-architecture-order-cleanup-archived.md](docs/archived/archived-plans/dead-code-and-architecture-order-cleanup-archived.md)；Task 11-13 closeout 与归档延后，登记在 [长期 open debt 与触发条件](docs/todos/open-debt-and-compromises.md)。
- 更多历史材料见 [历史归档总表](docs/archived/README.md)。
