# 待办文档

本目录只保留当前仍有 owner 的活跃索引入口，其他主题只作为配套或背景引用。
这里的 `当前活跃文档` 语义现在只指主线入口与 debt register，不再扩展为完整 owner 清单。

## 活跃索引

| 文件 | 主题 | 状态 |
|---|---|---|
| `agent-eval-framework-evaluation-and-plan.md` | Agent Eval 平台长期执行主线，含阶段 checklist、文档/测试要求 | 活跃主线 |
| `open-debt-and-compromises.md` | 当前仍成立的阶段性妥协、占位实现与 deferred 事实 | 活跃 debt register |

## 相关入口

- [`agent-eval-platform-event-model.md`](agent-eval-platform-event-model.md)：Phase 0 冻结输入，作为 Phase 1 的唯一事件设计来源。
- [`agent-eval-framework-scorecard.md`](agent-eval-framework-scorecard.md)：主线配套评分卡，不是单独的 owner 清单。
- [`active-closeout-and-followups.md`](active-closeout-and-followups.md)：既有 follow-up 记录，仅作背景索引。

## 目录规则

- 已完成内容、历史 closeout 证据、背景输入和 future proposal 不再保留在 `docs/todos/`
- 这类文档统一转入 `docs/archived/` 或 `docs/archived/archived-plans/`
- 需要重新启动某个归档主题时，新建活跃细则，不直接把归档文档重新当 checklist 使用

## 2026-07-03 批量归档摘要

本轮已从 `docs/todos/` 移出的内容包括：

- 服务发现 / 可观测性主线细则与本地 closeout checklist
- 轻重后端构建目标、Nest residual、六边形清理、静态分析审计、库替换评估
- Agent planning / label alignment / skill capsule eval 方案
- WebUI layout 重构指南与微服务架构背景盘点

完整归档表见 [`../archived/README.md`](../archived/README.md)。
