# @trapmap/service-governance-review

用于 host 组装的共享治理审查服务模块。

## 边界归属

`governance-review` 拥有治理命令管线：审查决策、反馈、修复以及维护/衰减工作台流程。它**不**拥有最终知识聚合体的变更操作。

- **数据归属**: `review-queue`, `feedback-record`, `remediation-workbench`, `maintenance-decay-workbench`, `governance-audit`
- **投影归属**: `review-queue-projection`, `feedback-operator-projection`, `maintenance-decay-operator-projection`
- **不归属**: `knowledge-aggregate-final-mutation`, `knowledge-lifecycle-authoritative-tables`, `retrieval-read-projection`

### 同步边界

`governance-review` 仅拥有治理命令接收、资格检查、流程解释和审计日志。任何最终知识聚合体变更必须通过 `KnowledgeWritePort` 委托执行。**不允许**本地回退直接写入知识聚合体。

### 异步边界

批准/拒绝/维护/衰减之后的后续操作（检索投影刷新、制品跟进、修复草案、坏用例导出草案）进入 outbox/queue/workflow 作为异步后续处理，不再返回同步命令路径。`job-runtime` 拥有队列/outbox/workflow 的传输、租约、回收和死信运行时。

## 命令接口

## Runtime boundary

本服务可读取 job-runtime queue/outbox operator snapshot，但不具备 enqueue、claim、retry 或 dead-letter capability。对 knowledge aggregate 的最终写入始终委托给 remote `knowledge-write`；局部 `knowledge-write` 重启后重试相同幂等命令，不使用 local direct-write fallback。

`governance-review` 对 `knowledge-write` 调用的冻结委托命令接口：

- `approve` -> `KnowledgeWritePort.approveReviewDecision`
- `reject` -> `KnowledgeWritePort.rejectReviewDecision`
- `applyMaintenance` -> `KnowledgeWritePort.applyMaintenanceDecision`
- `applyDecay` -> `KnowledgeWritePort.applyDecayDecision`
- `reviewArtifact`（本地制品审查）
- `submitFeedback`（本地反馈记录创建）

候选发布由 `candidate-ingestion` 拥有，但也通过 `KnowledgeWritePort.publishCandidateResult` 流转；`governance-review` 不拥有此路径。

## 故障语义

`governance-review` 和 `knowledge-write` 共享统一的 `InvocationError` 分类体系。HTTP 状态码在 gateway、governance-review 和 knowledge-write 之间保持一致映射：

- `403 forbidden` - 行为主体缺乏治理资格或该命令的权限
- `404 not-found` - 目标条目/候选/制品不存在，或归属方无法定位规范聚合体
- `409 conflict` - 状态冲突、重复应用或生命周期前置条件未满足
- `503 unavailable` - 归属服务或关键依赖当前不可用；保持 `unavailable` 语义
- `504 timeout` - 跨归属方调用超时；保持 `timeout` 语义
- `401` 仍属于 gateway/认证传输层关注点，不进入跨归属方故障分类

幂等键使用 `teamId + commandName + clientRequestId`（或等效的规范键）。重放操作重复相同的命令契约而不重写业务负载。死信操作员的动作只能是重新排队/重放或声明事件过期；不允许"重试并祈祷"。

## 健康检查 / 就绪性 / 归属端点

- `GET /internal/health` - 带归属声明的基本存活检查
- `GET /internal/readiness` - 依赖可达性（可选检查委托目标），报告 `finalAggregateMutation: 'delegated-to-knowledge-write'` 和 `followUpDisposition: 'outbox-queue-workflow-async'`
- `GET /internal/live` / `GET /internal/ready` - 分别用于不检查依赖的 liveness 与检查 database/knowledge-write 的 readiness
- `GET /internal/ownership` - 完整的静态归属声明（数据/投影归属、doesNotOwn 列表、命令接口、delegateTo 目标）
- `GET /internal/operator-status` - database、delegated owner、job-runtime queue/outbox、timeout 与 idempotency 诊断

操作员可见性目标：

- **命令已收到但最终应用未完成**: 通过 governance-review 就绪性接口和 governance-audit 日志可见
- **最终应用已完成但后续未收敛**: 通过 knowledge-write 就绪性接口和 job-runtime 队列/outbox 快照可见

## 兼容性 / 委托例外

- **共享 PostgreSQL（过渡期）**: 继续与 `knowledge-write` 和其他服务共享 PostgreSQL 实例，但使用显式的 schema/表归属方。`governance-review` 不将知识聚合体表视为其默认写入表面。
- **命名查询接缝**: 如果 `governance-review` 读取知识摘要，仅通过文档化的查询接缝或只读投影进行。

## 验证

- `rtk pnpm test:distributed-acceptance` - 验证多进程委托、错误映射和请求/链路传播
- `rtk pnpm --filter @trapmap/service-governance-review test --run` - 路由级治理和故障语义
- `rtk pnpm typecheck`

## 相关文档

- 试点计划: [`docs/archived/archived-plans/nestjs-service-evolution-knowledge-write-governance-review-pilot.md`](../../docs/archived/archived-plans/nestjs-service-evolution-knowledge-write-governance-review-pilot.md)
- 迁移任务清单: [`docs/archived/archived-plans/nestjs-service-evolution-knowledge-write-governance-review-migration-tasklist.md`](../../docs/archived/archived-plans/nestjs-service-evolution-knowledge-write-governance-review-migration-tasklist.md)
- 成熟度评估: [`docs/archived/archived-plans/nestjs-service-evolution-distributed-maturity-assessment.md`](../../docs/archived/archived-plans/nestjs-service-evolution-distributed-maturity-assessment.md)
- 真相源: [`docs/reference/SYSTEM_TRUTH_SOURCES.md`](../../docs/reference/SYSTEM_TRUTH_SOURCES.md)
