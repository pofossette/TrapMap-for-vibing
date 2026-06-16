# 活跃计划

本目录保存仍在使用或仍被当前文档引用的长期设计计划。

规则：

1. 根 `plan.md` 是当前后端执行轨道的总规约与索引。
2. `docs/plans/` 用于仍被当前文档引用的长期设计计划，以及由根索引链接出去的细则计划目录。
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
| `backend-engineering-roadmap/` | active-reference | Stage 1、Stage 2、耦合度降低计划及其执行包目录，由根 `plan.md` 链接 |
| `fm-agent-scan/` | active-reference | FM-agent 原始报告整改计划、source pack 和 live-gap matrix |
| `capsule-contextual-enrichment-plan.md` | active-reference | 检索/capsule 设计上下文 |
| `round4-cross-table-consistency-plan.md` | active-reference | package 文档引用的 artifact 结构化事实源 |
| `v2-multi-recall-plan.md` | active-reference | 检索设计上下文 |
