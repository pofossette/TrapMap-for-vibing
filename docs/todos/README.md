# 待办文档

本目录只保留当前仍有 owner 的活跃索引入口，其他主题只作为配套或背景引用。
这里的 `当前活跃文档` 只指主线入口与 debt register。

## 活跃索引

| 文件 | 主题 | 状态 |
|---|---|---|
| `agent-eval-framework-evaluation-and-plan.md` | Agent Eval 平台长期执行主线，含阶段 checklist、文档/测试要求 | 活跃主线 |
| `open-debt-and-compromises.md` | 当前仍成立的阶段性妥协、占位实现与 deferred 事实 | 活跃 debt register |
| `doc-drift-fix-list.md` | 本轮文档漂移、事实偏差与中文化修复清单 | 活跃配套清单 |

## 目录规则

- 已完成内容、历史 closeout 证据、背景输入和 future proposal 不再保留在 `docs/todos/`
- 这类文档统一转入 `docs/archived/` 或 `docs/archived/archived-plans/`
- 需要重新启动某个归档主题时，新建活跃细则，不直接把归档文档重新当 checklist 使用

## 2026-07-05 归档更新

本轮从 `docs/todos/` 归档的文档：

- `agent-eval-framework-scorecard.md`：冻结评分卡，已整合入 eval 主线执行计划
- `agent-eval-platform-event-model.md`：Phase 0 冻结事件设计文档，已作为 Phase 1 输入完成使命

## 2026-07-06 归档更新

本轮从 `docs/todos/` 归档的文档：

- `active-closeout-and-followups.md`：集中审计后的收口细则，剩余事项已并入活跃主线或 debt register，不再保留并行执行入口

## 2026-07-03 批量归档摘要

本轮已从 `docs/todos/` 移出的内容包括：

- 服务发现 / 可观测性主线细则与本地 closeout checklist
- 轻重后端构建目标、Nest residual、六边形清理、静态分析审计、库替换评估
- Agent planning / label alignment / skill capsule eval 方案
- WebUI layout 重构指南与微服务架构背景盘点

完整归档表见 [`../archived/README.md`](../archived/README.md)。
