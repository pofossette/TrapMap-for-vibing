# Shared Async Job Contracts

本页是 Stage 2 对 shared async jobs 的统一契约说明。权威实现位于 `packages/server/src/lib/jobs/types.ts`，本页提供 operator / 架构层可读语义。

## 统一规则

- 所有 shared job 必须先在 `sharedJobContracts` 中声明 `taskType`、payload shape、owner context、idempotency key、`maxAttempts`、dead-letter 语义和 workflow binding，再通过 `createSharedJobHandlers()` 接入 worker。
- `subjectId` 表示业务归属对象，用于 operator 视角按 entry / feedback 定位问题。
- `runId` 表示任务实例绑定，必须至少与该任务的幂等单元同粒度，避免多个合法 follow-up 覆盖同一 workflow run。
- authoritative write 仍在命令事务内完成；这些 jobs 只负责 derived / retryable follow-up。
- 组合层通过 `asyncTransport.queue` 注入窄 queue port；调度器和业务服务本身不应直接构造 `TaskQueue`。
- `workflow_runs.stats` 是 shared job 的 checkpoint / resume surface；需要恢复的进度必须写入这里，而不是依赖进程内状态。
- Phase 2 之后，operator 必须通过 `/v1/operations/status/async` 的统一 failure taxonomy 和 freshness contract 理解 shared job 故障，而不是只看 task status 字符串。

## `candidate_processing`

- Owner context: `candidate-submission`
- Subject: `candidate:<candidateId>`
- Payload:
  - `candidateId`
  - `retryCount`
- Idempotency key:
  - Format: `candidate_processing:<candidateId>`
  - Meaning: 同一 candidate 在 pending/running 期间只保留一个 durable processing work item；重试复用同一业务主键
- Max attempts: `3`
- Workflow binding:
  - `workflowType = candidate-processing`
  - `subjectId = candidateId`
  - `runId` 绑定到 `candidateId`
- Ownership:
  - bounded context: `candidate-ingestion`
  - service boundary: candidate route/service 通过窄 `candidateQueue` 端口提交，不直接构造 queue
- Dead-letter:
  - Step: `dead-letter`
  - Meaning: duplicate analysis / review-ready 转换未能在重试内完成，candidate 会停留在错误态
  - Operator action: 检查 candidate workflow run 与 queue dead letter，修复处理错误后按需 requeue

## `knowledge.index-follow-up`

- Owner context: `knowledge-entry`
- Subject: `trap:<entryId>`
- Payload:
  - `entryId`
  - `previousState`
  - `nextState`
  - `reason`
- Idempotency key:
  - Format: `knowledge.index-follow-up:<entryId>:<previousState>:<nextState>:<reason>`
  - Meaning: 同一知识条目、同一生命周期迁移与原因，在 pending/running 期间只保留一个 follow-up
- Max attempts: `3`
- Workflow binding:
  - `workflowType = knowledge-index-follow-up`
  - `subjectId = entryId`
  - `runId` 绑定到 `<entryId>:<previousState>:<nextState>:<reason>` 粒度
- Projection ownership:
  - owner: `knowledge-lifecycle-projection`
  - refreshes: retrieval trap visibility and related derived read-model inputs
- Cache invalidation trigger:
  - `shared-job` in PostgreSQL mode
  - `write-through-fallback` in JSON store mode

## `skill.index-follow-up`

- Owner context: `skill-artifact`
- Subject: `skill:<artifactId>`
- Payload:
  - `artifactId`
  - `previousState`
  - `nextState`
  - `reason`
- Idempotency key:
  - Format: `skill.index-follow-up:<artifactId>:<previousState>:<nextState>:<reason>`
  - Meaning: 同一 skill artifact、同一生命周期迁移与原因，在 pending/running 期间只保留一个 follow-up
- Max attempts: `3`
- Workflow binding:
  - `workflowType = skill-index-follow-up`
  - `subjectId = artifactId`
  - `runId` 绑定到 `<artifactId>:<previousState>:<nextState>:<reason>` 粒度
- Projection ownership:
  - owner: `skill-lifecycle-projection`
  - refreshes: skill graph / retrieval visibility projections
- Cache invalidation trigger:
  - `shared-job` in PostgreSQL mode
  - `write-through-fallback` in JSON store mode
- Dead-letter:
  - Step: `dead-letter`
  - Meaning: skill projection refresh 未能完成，读侧可能继续返回旧索引结果
  - Operator action: 修复 skill indexing 错误后按需 requeue
- Dead-letter:
  - Step: `dead-letter`
  - Meaning: 索引同步在所有重试后仍未完成，workflow 会标记为 failed
  - Operator action: 查看 workflow run 和 queue dead letter，修复索引错误后按需 requeue

## `feedback.remediation-reactivation`

- Owner context: `feedback-remediation`
- Subject: `<entryType>:<entryId>`
- Payload:
  - `entryId`
  - `entryType`
  - `feedbackIds`
  - `resolvedAt`
  - `resolvedByUserId`
  - `notes`
- Idempotency key:
  - Format: `feedback.remediation-reactivation:<entryId>:<resolvedAt>`
  - Meaning: 同一 entry 在同一次 remediation complete 时间戳下，只保留一个重激活 follow-up
- Max attempts: `5`
- Workflow binding:
  - `workflowType = feedback-remediation-reactivation`
  - `subjectId = entryId`
  - `runId` 绑定到 `<entryId>:<resolvedAt>` 粒度
- Projection ownership:
  - owner: `feedback-remediation-projection`
  - refreshes: remediation 解除后的 retrieval visibility
- Cache invalidation trigger:
  - `shared-job` for reactivation
  - `write-through-fallback` for suppression writes
- Dead-letter:
  - Step: `dead-letter`
  - Meaning: remediation 已标记完成，但重激活/重索引始终未完成，读侧可能继续陈旧
  - Operator action: 检查 entry 是否仍存在，修复索引问题后按需 requeue

## `feedback.badcase-export-draft`

- Owner context: `feedback-badcase`
- Subject: `feedback:<feedbackId>`
- Payload:
  - `feedbackId`
  - `entryId`
  - `entryType`
  - `queryId`
- Idempotency key:
  - Format: `feedback.badcase-export-draft:<feedbackId>`
  - Meaning: 同一 feedback 在 pending/running 期间只保留一个 badcase draft follow-up
- Max attempts: `3`
- Workflow binding:
  - `workflowType = badcase-export-draft`
  - `subjectId = feedbackId`
  - `runId` 绑定到 `feedbackId`
- Dead-letter:
  - Step: `dead-letter`
  - Meaning: badcase draft 导出未能完成，反馈记录缺少最终 async bookkeeping
  - Operator action: 检查相关 feedback trace 与队列 dead letter，修复导出/存储问题后按需 requeue
