# 待办文档

本目录只保留明确承担当前执行责任的 active 文档。这里的“活跃”不等于“仍有参考价值”，而是指当前 owner 正在回写、推进、验收的执行面。

## 活跃索引

| 文件 | 主题 | 状态 |
|---|---|---|
| [documentation-validation-and-observability-platform.md](documentation-validation-and-observability-platform.md) | 文档校验与可观测性平台 | 进行中（唯一 active mainline） |
| [open-debt-and-compromises.md](open-debt-and-compromises.md) | 长期工程债务与平台成熟度登记 | 受根索引管理；非第二条 active mainline |

## 目录规则

- 未被当前根 `plan.md` 明确链接、且不承担当前 owner 执行职责的文档，不属于 active surface
- 已完成主线、空白清单、历史 closeout 证据和背景输入统一转入 `docs/archived/` 或 `docs/archived/archived-plans/`
- 需要重启某个归档主题时，新建新的 active 细则，不直接把归档文档重新当 checklist 使用
- 如果某份 todo 文档只剩“仍可参考”而不再承担执行责任，应优先归档，而不是继续留在本目录
- 若未来新增辅助清单，只有在根 `plan.md` 或当前主细则显式赋予执行责任时才能留在本目录；否则应直接进入归档或背景目录

## 当前状态说明

当前唯一 active mainline 是 [Documentation Validation and Observability Platform](documentation-validation-and-observability-platform.md)。它以长期可维护性优先，接受为消除事实漂移、重复 telemetry seam 和隐私风险而增加短期工作量。已归档的 compatibility-shell retirement、可观测性、shared PG 治理与分布式成熟度主线仅保留历史证据。`open-debt-and-compromises.md` 仅承担长期问题的来源、影响、触发条件和后续落点登记；它不允许形成并行 tranche。平台化与其余历史证据、冻结决策或背景材料应通过 `docs/archived/` 查找，只有根 `plan.md` 显式切换后才能成为新的执行面。

完整归档表见 [`../archived/README.md`](../archived/README.md)。
