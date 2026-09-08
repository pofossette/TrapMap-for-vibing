# Shared Async Job Contracts

> 本页是 shared async jobs 的契约表。模型（queue / outbox / workflow、lease、operator）见 [异步模型](ASYNC_MODEL.md)，本页只收录逐任务契约。状态：Active。

## 统一规则

- 你新增 shared job 时先声明 `taskType`、payload shape、owner context、idempotency key、`maxAttempts`、dead-letter 语义与 workflow binding，再让 `job-runtime` 的 typed handler 接入 worker（handler 落点 `packages/service-job-runtime/src/handlers/`，实测有 `experience-gene.ts`、`experience-gene-outbox.ts`、`governance-conflict.ts`、`governance-feedback.ts`）。
- `subjectId` 表业务归属对象，供 operator 按 entry / feedback 定位问题。
- `runId` 表任务实例绑定，至少与该任务的幂等单元同粒度。
- authoritative write 仍在命令事务内完成；这些 jobs 只做 derived / retryable follow-up。
- `workflow_runs.stats` 是 checkpoint / resume 面；需恢复的进度写这里，不依赖进程内状态。

payload 的 Zod 真源在 `packages/contracts/src/domain/async.ts`：`candidateProcessingPayloadSchema`、`remediationReactivationPayloadSchema`、`badcaseExportDraftPayloadSchema`、`governanceConflictDetectionPayloadSchema`（同文件第 13-47 行）。`knowledge.index-follow-up` 与 `skill.index-follow-up` 的 payload schema 未在该文件中出现，标未知/待确认（2026-09-08）。

## `candidate_processing`

- Owner context：`candidate-submission`；Subject：`candidate:<candidateId>`
- Payload：`candidateId`、`retryCount`；幂等键 `candidate_processing:<candidateId>`（同一 candidate 在 pending / running 期只保留一个 durable work item）
- Max attempts：`3`；`workflowType = candidate-processing`，`runId` 绑 `candidateId`
- Dead-letter：duplicate analysis / review-ready 转换重试未完成，candidate 停错误态；你查 candidate workflow run 与 queue dead letter，修复后按需 requeue

## `knowledge.index-follow-up`

- Owner context：`knowledge-entry`；Subject：`trap:<entryId>`
- Payload：`entryId`、`previousState`、`nextState`、`reason`（schema 未知/待确认（2026-09-08））；幂等键 `knowledge.index-follow-up:<entryId>:<previousState>:<nextState>:<reason>`
- Max attempts：`3`；`workflowType = knowledge-index-follow-up`，`runId` 绑 `<entryId>:<previousState>:<nextState>:<reason>`
- Dead-letter：索引同步重试未完成，workflow 标 failed；你查 workflow run 与 dead letter，修复索引错误后按需 requeue

## `skill.index-follow-up`

- Owner context：`skill-artifact`；Subject：`skill:<artifactId>`
- Payload：`artifactId`、`previousState`、`nextState`、`reason`（schema 未知/待确认（2026-09-08））；幂等键 `skill.index-follow-up:<artifactId>:<previousState>:<nextState>:<reason>`
- Max attempts：`3`；`workflowType = skill-index-follow-up`，`runId` 绑同粒度
- Dead-letter：skill projection 刷新未完成，读侧可能返回旧索引；你修复 skill indexing 错误后按需 requeue

## `feedback.remediation-reactivation`

- Owner context：`governance-review`；Subject：`<entryType>:<entryId>`
- Payload：`entryId`、`entryType`、`feedbackIds`、`resolvedAt`、`resolvedByUserId`、`notes`；幂等键 `feedback.remediation-reactivation:<entryId>:<resolvedAt>`
- Max attempts：`5`；`workflowType = feedback-remediation-reactivation`，`runId` 绑 `<entryId>:<resolvedAt>`
- Dead-letter：remediation 已完成但重激活 / 重索引未完成，读侧可能陈旧；你确认 entry 存在后修复索引按需 requeue

## `feedback.badcase-export-draft`

- Owner context：`governance-review`；Subject：`feedback:<feedbackId>`
- Payload：`feedbackId`、`entryId`、`entryType`、`queryId`；幂等键 `feedback.badcase-export-draft:<feedbackId>`
- Max attempts：`3`；`workflowType = badcase-export-draft`，`runId` 绑 `feedbackId`
- Dead-letter：draft 导出未完成，反馈记录缺 async bookkeeping；你查 feedback trace 与 dead letter 后按需 requeue

## `governance.conflict-detection`

- Owner context：`governance-review`；Subject：`knowledge-entry:<entryId>`
- Payload：`entryId`、`sourceEventId`；幂等键 `governance.conflict-detection:<entryId>:<sourceEventId>`（同一 approved entry 与 source event 只保留一个 work item）
- Max attempts：`5`；`workflowType = governance-conflict-detection`，`runId` 绑 `entryId`；ordering `per-transition`
- Dead-letter：重试耗尽，conflict projection 可能陈旧；你查 governance workflow 与 dead letter，修复依赖后 replay task

## 常见用法

### 你列出 payload schema

前置条件：离线可跑。

```bash
grep -n "PayloadSchema" packages/contracts/src/domain/async.ts
```

真源行见本页「统一规则」节。

### 你核对 handler 接入

前置条件：离线可跑。

```bash
ls packages/service-job-runtime/src/handlers/
```

新增 shared job 时先声明契约再接入 worker，步骤见本页「统一规则」节。

### 你校验契约产物同步

前置条件：依赖已装；离线可跑。

```bash
pnpm generate:contracts:check
```
