# TrapMap 执行计划索引

根 `plan.md` 只作为当前主线的目录索引：说明目标、总体要求和验收边界；执行步骤、复选框、证据和回写记录统一维护在链接的主细则中，不承载 tranche checklist 或实施细节。

## 当前主线

- **主题**：可观测性、共享 PG 治理与分布式成熟度闭环
- **目标**：让一次业务操作能在日志、分布式 trace、指标、异步处理与审计间可靠联查，并将共享 PostgreSQL 的表 owner、迁移、投影、连接预算和服务级运维面推进为可验证的 `Level 2 -> Level 3` 成熟度证据。
- **状态**：`进行中`
- **主细则**：[可观测性、共享 PG 治理与分布式成熟度计划](docs/todos/observability-traceability-closure.md)

## 总体要求

- 根索引只保留一个 active mainline，不承载 tranche checklist 或实现细节。
- 关联字段、日志 schema、健康 contract 与 API shape 必须优先由 `packages/contracts` 和既有权威源码定义，不在宿主中另建同义模型。
- 不得把 request ID、trace ID、用户 ID、实体 ID 等动态值作为 Prometheus 标签；路由指标必须使用参数化 route family。
- 审计、日志与遥测必须做最小必要数据记录，并遵循既有安全、权限与脱敏要求。
- 共享 PostgreSQL 只允许“共享实例 + 明确 schema/table owner”；每个权威表只有一个写 owner，跨服务一致性使用本地事务 outbox，不引入跨服务事务或两阶段提交。
- `knowledge-read` 的读侧状态是可重建投影；不得把 direct authoritative read、`store_snapshot` 或 shared DB access 扩展为新的默认业务路径。
- 每个服务必须拥有可解释的 health/readiness/ownership；异步 follow-up 必须可按业务 owner 与 `job-runtime` 的 runtime owner 分别定位。
- 每个完成的 tranche 必须勾选细则中的实现、测试、文档回写与验证项；已完成主线归档到 `docs/archived/archived-plans/`。

## 验收边界

- 外部请求和内部/异步后续动作可共享或显式关联 `requestId`、W3C `traceparent`、`operationId` 与因果关系。
- 日志、trace 与审计事件可通过稳定字段联查；审计记录仍独立于运行日志保存。
- 指标命名、单位和标签符合低基数规则，健康、队列与遥测导出失败具有可诊断信号。
- 文档、测试与运维告警配置反映已落地事实，不把外部 LGTM 基础设施描述为仓库内默认部署资产。
- shared PG 不再构成共享写权限或模糊的真相边界；迁移、连接池、投影 freshness/lag 和跨服务失败语义均有源码、测试与文档证据。
- `knowledge-write + governance-review` 服务样板具备服务级 health/readiness/ownership、队列/outbox 诊断和 acceptance closeout；未满足所有条件前，distributed 保持 `Level 2 / transitional-microservice`。

## 长期债务登记

- [长期 open debt 与触发条件](docs/todos/open-debt-and-compromises.md)：记录不属于当前交付范围的兼容层退役、工程维护信号、平台化、物理数据隔离和待验证安全候选。它不构成第二条 active mainline；只有满足其中记录的进入条件时，才新建细则并替换当前主线。

## 历史入口

- [已归档的上一版无 active mainline 索引](docs/archived/archived-plans/plan-2026-07-11-no-active-mainline-index-archived.md)
- [历史归档总表](docs/archived/README.md)
