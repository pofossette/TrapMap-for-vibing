# 待办文档

本目录只保留明确承担当前执行责任的 active 文档。这里的“活跃”不等于“仍有参考价值”，而是指当前 owner 正在回写、推进、验收的执行面。

## 活跃索引

| 文件 | 主题 | 状态 |
|---|---|---|
| `open-debt-and-compromises.md` | engineering debt and platform maturity closeout 的唯一主细则，含当前 tranche、queued tranche、deferred 决策与 issue intake 规则 | 唯一 active mainline detail |

## 目录规则

- 未被当前根 `plan.md` 明确链接、且不承担当前 owner 执行职责的文档，不属于 active surface
- 已完成主线、空白清单、历史 closeout 证据和背景输入统一转入 `docs/archived/` 或 `docs/archived/archived-plans/`
- 需要重启某个归档主题时，新建新的 active 细则，不直接把归档文档重新当 checklist 使用
- 如果某份 todo 文档只剩“仍可参考”而不再承担执行责任，应优先归档，而不是继续留在本目录
- 若未来新增辅助清单，只有在根 `plan.md` 或当前主细则显式赋予执行责任时才能留在本目录；否则应直接进入归档或背景目录

## 当前状态说明

当前 `docs/todos/` 只保留真正承担执行责任的文档：

- `open-debt-and-compromises.md`：唯一 active mainline detail，同时内联承载 backlog、deferred 与 frozen decision reference
- 其余只剩历史证据、冻结决策或背景价值的材料，应通过 `docs/archived/` 查找，不继续占用 active 目录

完整归档表见 [`../archived/README.md`](../archived/README.md)。
