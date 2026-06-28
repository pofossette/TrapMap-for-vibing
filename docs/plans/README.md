# 历史计划参考

本目录保存仍被当前文档引用的长期设计计划与历史设计参考。

规则：

1. 根 `plan.md` 与 `docs/todos/trapmap-architecture-remediation-plan.md` 是当前仓库级执行轨道的唯一 active execution surface。
2. `docs/plans/` 只用于仍被当前文档引用的长期设计计划与历史主线参考；除非未来某个新的根计划显式重新链接，否则本目录默认不承担当前执行面。
3. 过时的执行计划必须移动到 `docs/archived/archived-plans/`。
4. 过时的报告必须移动到 `docs/archived/reports/`。
5. 新计划应优先使用 `_templates/` 里的模板，以保持结构一致。

## 模板

| 模板 | 使用场景 |
|----------|------------|
| [`_templates/implementation-phase.md`](./_templates/implementation-phase.md) | 分阶段交付的增量特性实现 |
| [`_templates/backend-stabilization.md`](./_templates/backend-stabilization.md) | 在增强前先稳定现有后端能力 |

## 当前文件

| 文件 | 状态 | 保留原因 |
|---|---|---|
| `backend-engineering-masterplan/` | historical-reference | 保留后端工程化阶段收口历史与事实来源背景，不再是当前根 `plan.md` 的默认执行包 |
| `deployment-flexibility/` | historical-reference | 仍提供 deployment profile、gateway-only CLI 接入与 distributed 约束背景，但不再是默认执行入口 |
| `runtime-recomposition/` | historical-reference | 仍提供 backend-core / host-local / host-distributed 的迁移背景，但不再承担当前阶段执行入口 |
| `backend-engineering-roadmap/` | historical-reference | 保留 Stage 1/2/3 的历史收敛事实与旧细化计划，供引用，不再承担主执行入口 |
| `fm-agent-scan/` | historical-reference | FM-agent 原始报告整改计划、source pack 和 live-gap matrix，现仅作背景引用 |
| `capsule-contextual-enrichment-plan.md` | historical-reference | 检索/capsule 设计上下文，现仅作背景引用 |
| `round4-cross-table-consistency-plan.md` | historical-reference | package 文档引用的 artifact 结构化事实源，现仅作背景引用 |
| `v2-multi-recall-plan.md` | historical-reference | 检索设计上下文，现仅作背景引用 |

## 后端工程化阶段总结

后端工程化三段主线已经完成并留存在本目录：Stage 1「基础与边界」、Stage 2「异步运行时与读写分离」、以及横切「耦合度降低」。这些成果仍然有效，但当前根 `plan.md` 已切换到 TrapMap 架构整改计划索引，不再把本目录作为默认执行入口。

这些历史成果仍然为三种 deployment profile 提供背景：

- `local-agent`
- `team-monolith`
- `distributed`

对应的脚本、compose profile、环境变量与测试矩阵已分别收敛到根 `package.json`、`docker-compose.yml`、环境模板和部署/测试文档中；新增长期计划时，不应再回到只用 `monolith` / `split-pg` / `split-rabbitmq` 讲产品形态。

当前仓库仍然优先复用模块化单体时期沉淀下来的 `repos`、application service、shared job / outbox worker、runtime seams 与显式 projection seam；这不再意味着“排除分布式目标形态”，而是意味着 `distributed` 的第一阶段仍需建立在共享 contracts、共享 PostgreSQL 与现有 runtime ownership 之上，而不是平行重写第二套后端。

## 当前主入口补充

当前根 [`plan.md`](../../plan.md) 与 [`docs/todos/trapmap-architecture-remediation-plan.md`](../todos/trapmap-architecture-remediation-plan.md) 共同构成当前唯一 active execution surface。默认阅读顺序应为：

1. 根 `plan.md`
2. `docs/todos/trapmap-architecture-remediation-plan.md`
3. 本目录中的 historical-reference 计划

本目录的角色现在是：

- 为当前迁移路线提供历史背景和已完成收口事实
- 继续作为被现有文档引用的长期参考
- 在不再被引用后，移动到 `docs/archived/archived-plans/`
