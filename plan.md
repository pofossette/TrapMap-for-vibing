# TrapMap 执行计划索引

根 `plan.md` 只作为当前主线的目录索引：说明目标、总体要求和验收边界；执行步骤、复选框、证据和回写记录统一维护在链接的主细则中，不承载 tranche checklist 或实施细节。

## 当前主线

- **主题**：可观测性与可追溯性闭环
- **目标**：让一次业务操作能够通过统一关联上下文，在请求日志、分布式 trace、指标、异步处理和持久化审计之间可靠联查。
- **状态**：`进行中`
- **主细则**：[可观测性与可追溯性闭环计划](docs/todos/observability-traceability-closure.md)

## 总体要求

- 根索引只保留一个 active mainline，不承载 tranche checklist 或实现细节。
- 关联字段、日志 schema、健康 contract 与 API shape 必须优先由 `packages/contracts` 和既有权威源码定义，不在宿主中另建同义模型。
- 不得把 request ID、trace ID、用户 ID、实体 ID 等动态值作为 Prometheus 标签；路由指标必须使用参数化 route family。
- 审计、日志与遥测必须做最小必要数据记录，并遵循既有安全、权限与脱敏要求。
- 每个完成的 tranche 必须勾选细则中的实现、测试、文档回写与验证项；已完成主线归档到 `docs/archived/archived-plans/`。

## 验收边界

- 外部请求和内部/异步后续动作可共享或显式关联 `requestId`、W3C `traceparent`、`operationId` 与因果关系。
- 日志、trace 与审计事件可通过稳定字段联查；审计记录仍独立于运行日志保存。
- 指标命名、单位和标签符合低基数规则，健康、队列与遥测导出失败具有可诊断信号。
- 文档、测试与运维告警配置反映已落地事实，不把外部 LGTM 基础设施描述为仓库内默认部署资产。

## 历史入口

- [已归档的上一版无 active mainline 索引](docs/archived/archived-plans/plan-2026-07-11-no-active-mainline-index-archived.md)
- [历史归档总表](docs/archived/README.md)
