# TrapMap 异步模型

本文是当前 TrapMap 异步模型的详细说明，覆盖 authoritative write、outbox、task queue、worker modes、shared jobs、workflow snapshots、cache invalidation 与 badcase export。

## 总览

```mermaid
flowchart TB
    subgraph WritePath["1. Authoritative Write Path"]
        Api["Fastify Route / Service"]
        Tx["PostgreSQL Transaction"]
        Biz["Authoritative Tables / Repos"]
        OutboxReg["domain_event_outbox registration"]
        QueueReg["task_queue registration"]
    end

    subgraph AsyncSubstrate["2. Async Substrate"]
        Outbox["domain_event_outbox"]
        Queue["task_queue"]
        Workflow["workflow_runs"]
    end

    subgraph Workers["3. Workers"]
        OutboxWorker["Outbox Worker"]
        TaskWorker["Task Worker"]
    end

    subgraph DerivedWork["4. Derived Work"]
        Lifecycle["Lifecycle subscribers"]
        Candidate["candidate-processing"]
        SharedJobs["shared jobs\nknowledge.index-follow-up\nfeedback.remediation-reactivation\nfeedback.badcase-export-draft"]
    end

    subgraph ReadSide["5. Read Side"]
        ReadModel["retrieval read-model cache"]
        Intent["intent cache"]
        Retrieval["retrieval routes / orchestrators"]
    end

    subgraph Operators["6. Operator Surfaces"]
        AsyncStatus["/v1/operations/status/async"]
        Stats["/v1/operations/stats/summary"]
        Badcase["/v1/operations/badcases/:feedbackId/export"]
        Script["scripts/export-badcase-to-eval.ts"]
    end

    Api --> Tx
    Tx --> Biz
    Tx --> OutboxReg
    Tx --> QueueReg
    OutboxReg --> Outbox
    QueueReg --> Queue
    Outbox --> OutboxWorker
    Queue --> TaskWorker
    OutboxWorker --> Lifecycle
    TaskWorker --> Candidate
    TaskWorker --> SharedJobs
    Candidate --> Workflow
    SharedJobs --> Workflow
    Lifecycle --> ReadModel
    SharedJobs --> ReadModel
    SharedJobs --> Intent
    ReadModel --> Retrieval
    Intent --> Retrieval
    Queue --> AsyncStatus
    Outbox --> AsyncStatus
    Workflow --> AsyncStatus
    ReadModel --> AsyncStatus
    Intent --> AsyncStatus
    Queue --> Stats
    Workflow --> Stats
    Badcase --> Script
```

## 1. Authoritative write 与异步注册

### 1.1 Candidate 提交

```mermaid
sequenceDiagram
    participant Route as /v1/candidates
    participant Store as PostgresStore.transactWithPgClient
    participant Candidate as candidate repo
    participant Queue as task_queue

    Route->>Store: begin tx
    Store->>Candidate: insert candidate
    Store->>Candidate: set initial status
    Store->>Queue: enqueue candidate_processing
    Store-->>Route: commit
```

当前 candidate 提交已经满足“authoritative write + queue registration”同事务。

### 1.2 Lifecycle transition

```mermaid
sequenceDiagram
    participant Route as review/knowledge/decay/traps
    participant Repo as authoritative write
    participant Emit as emitLifecycleTransition()
    participant Outbox as domain_event_outbox

    Route->>Repo: write lifecycle state
    Repo-->>Route: commit
    Route->>Emit: enqueue lifecycle event
    Emit->>Outbox: register event
```

说明：

- `emitLifecycleTransition()` 已统一为 lifecycle event 唯一出口
- 但仍有若干调用点在事务提交后才调用该函数
- 因此“所有 lifecycle write 均与 outbox registration 原子同事务”仍是仓库剩余差距

## 2. Queue / Outbox 模型

```mermaid
flowchart LR
    Pending["pending"] --> Running["running / processing"]
    Running --> Completed["completed"]
    Running --> Retry["pending (retry with backoff)"]
    Running --> Dead["dead / failed"]
    Lease["leaseUntil < now"] --> Reclaim["reclaim to pending"]
    Reclaim --> Pending
```

### Queue

- 表：`task_queue`
- 关键能力：
  - `SKIP LOCKED`
  - dedupe key
  - retry/backoff
  - dead-letter
  - lease/reclaim

### Outbox

- 表：`domain_event_outbox`
- 关键能力：
  - async subscriber fanout
  - retry/backoff
  - failed-event visibility
  - lease/reclaim

## 3. Worker runtime modes

```mermaid
flowchart LR
    API["runtimeMode=api"] -->|"ownsWork=false"| Health1["ready if API runtime healthy"]
    Task["runtimeMode=task-worker"] -->|"task worker only"| Health2["ready if task worker healthy"]
    Outbox["runtimeMode=outbox-worker"] -->|"outbox worker only"| Health3["ready if outbox worker healthy"]
    Combined["runtimeMode=combined"] -->|"both workers"| Health4["ready if both workers healthy"]
```

当前支持：

- `api`
- `task-worker`
- `outbox-worker`
- `combined`

## 4. Shared jobs

```mermaid
flowchart TB
    Event["lifecycle event / feedback write"] --> Queue["task_queue"]
    Queue --> Worker["task worker"]
    Worker --> K["knowledge.index-follow-up"]
    Worker --> R["feedback.remediation-reactivation"]
    Worker --> B["feedback.badcase-export-draft"]
    K --> WF1["workflow_runs"]
    R --> WF2["workflow_runs"]
    B --> WF3["workflow_runs"]
```

### 当前 shared jobs

- `knowledge.index-follow-up`
- `skill.index-follow-up`
- `feedback.remediation-reactivation`
- `feedback.badcase-export-draft`

这些任务都：

- 有 typed payload
- 先在 shared contract registry 中声明 owner、幂等键、`maxAttempts`、dead-letter 语义和 workflow binding
- 走同一 `task_queue`
- 写入 `workflow_runs`
- 通过 operator surface 可见

详细契约见 [`ASYNC_SHARED_JOB_CONTRACTS.md`](./ASYNC_SHARED_JOB_CONTRACTS.md)。

## 5. Cache invalidation 模型

```mermaid
flowchart LR
    Trigger["approval / deactivation / remediation-suppressed / remediation-reactivated"]
    Trigger --> Emit["emitCacheInvalidation()"]
    Emit --> RM["retrieval read-model cache"]
    Emit --> IC["intent cache"]
    RM --> Retrieval["retrieval routes"]
    IC --> Retrieval
```

### 失效原因

- `approved`
- `deactivated`
- `remediation-suppressed`
- `remediation-reactivated`

### 归属与触发

- `knowledge-lifecycle-projection`
  - trigger: `outbox-subscriber` 或 `shared-job`
  - owner scope: retrieval read-model 与 trap 可见性派生面
- `skill-lifecycle-projection`
  - trigger: `shared-job`
  - owner scope: skill graph / retrieval 可见性派生面
- `feedback-remediation-projection`
  - trigger: `shared-job` 或 `write-through-fallback`
  - owner scope: remediation suppression / reactivation 对 retrieval 可见性的派生面

### Freshness 语义

- authoritative write 成功不等于读侧投影立即可见
- 标准语义是 `eventual-consistency`
- 允许短暂的 “write succeeded, projection still catching up”
- 观察入口：
  - `workflow_runs`
  - `GET /v1/operations/status/async`
  - retrieval cache invalidation metrics

### 受控缓存

- `retrieval-read-model`
- `intent`

### 边界

- 它们都是 process-local derived caches
- 不能成为事实源
- operator 通过 `/v1/operations/status/async` 查看 hit/miss/eviction/invalidation

## 6. Workflow snapshots

```mermaid
flowchart TB
    Task["task / worker step"] --> Upsert["workflowRepo.upsertRun()"]
    Upsert --> Update["workflowRepo.updateRun()"]
    Update --> Status["/v1/operations/status/async"]
```

当前 `workflowType`：

- `candidate-processing`
- `capsule-index-rebuild`
- `knowledge-index-follow-up`
- `skill-index-follow-up`
- `feedback-remediation-reactivation`
- `badcase-export-draft`

## 7. Badcase export

```mermaid
sequenceDiagram
    participant Retrieval as retrieval route
    participant Feedback as /v1/feedback
    participant Trace as retrieval_badcase_traces
    participant Export as /v1/operations/badcases/:feedbackId/export
    participant Script as export-badcase-to-eval.ts

    Retrieval-->>Feedback: queryId + selected result
    Feedback->>Trace: persist badcase trace
    Export->>Trace: read trace
    Export-->>Script: deterministic draft JSON
```

当前导出第一版：

- route 返回 JSON draft
- script 写 JSON draft
- 正式提升为 eval fixture 仍保留人工审核

## 8. Operator surfaces

### `/v1/operations/status/async`

暴露：

- queue snapshot
- outbox snapshot
- workflow snapshots
- cache stats

### `/v1/operations/stats/summary`

暴露：

- usage summary
- `asyncArchitecture`
  - `queueBacklogByType`
  - `deadLetterByType`
  - `retryRateByType`
  - `avgHandlerLatencyMsByType`
  - `cacheHitRateByNamespace`
  - `badcaseExportCount`
  - `retrievalFailureDistribution`
  - `thresholds`

## 9. 仍存在的已知差距

```mermaid
flowchart TB
    Gap1["Lifecycle write 与 outbox registration 仍非全量事务内"]
    Gap2["部分 JSON compatibility 路径仍依赖 snapshot assembly"]
    Gap3["badcase draft -> 正式 eval fixture 仍需人工审核"]
```

这些差距是当前模型的已知边界，不影响已有 async substrate 的运转，但决定了最终 acceptance 是否能全部勾选。
