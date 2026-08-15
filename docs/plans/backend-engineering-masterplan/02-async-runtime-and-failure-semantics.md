# TrapMap Backend Engineering Master Plan - Phase 2 Async Runtime And Failure Semantics

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify async runtime behavior, freshness, idempotency, retry, resume, reclaim, and failure semantics into explicit contracts across API, worker, and bulk paths.

**Architecture:** Build directly on the existing task queue, outbox, workflow runs, cache invalidation, operator status routes, and runtime metadata. The work is contract convergence, not a new scheduler or broker.

**Tech Stack:** TypeScript, Fastify, Zod, PostgreSQL, Drizzle, task_queue, domain_event_outbox, workflow_runs, retrieval caches, Vitest.

---

## 目标

- 统一 async runtime contract。
- 统一 freshness / projection lag 解释。
- 统一 idempotency / retry / resume / dead-letter / reclaim 语义。
- 统一 operator 面对失败的可见性。

## 当前事实

- `packages/server/src/lib/queue/task-queue.ts` 和 `packages/server/src/lib/lifecycle/outbox.ts` 已经提供 durable substrate。
- `packages/server/src/lib/workflows/**` 已经承载长任务 snapshot。
- `packages/server/src/lib/cache/invalidation.ts`、`retrieval-read-model-cache.ts`、`intent-cache.ts` 已存在。
- `packages/server/src/routes/operations/status.ts` 和 `packages/server/src/lib/runtime/runtime-metadata.ts` 已经暴露部分 runtime / async 状态。
- 现有 stage 2 和 stage 3 文档已分别覆盖 async/read-write separation 与 idempotency/failure semantics，但仍是分散入口。
- `packages/contracts/src/domain/async.ts` 已经冻结 async event/shared job 的 idempotency key、retry policy、dead-letter 语义与 operator action catalog。
- `packages/server/src/lib/operations/read-model.ts` 已专项核查：除 artifact revision payload hydration 外，不再存在其他 operator 读侧 repo capability gap / projection exception；Phase 1 遗留 open question 已在本阶段关闭。

## 范围

- `packages/server/src/lib/queue/task-queue.ts`
- `packages/server/src/lib/lifecycle/outbox.ts`
- `packages/server/src/lib/workflows/**`
- `packages/server/src/lib/cache/invalidation.ts`
- `packages/server/src/lib/cache/retrieval-read-model-cache.ts`
- `packages/server/src/lib/retrieval/capsules/intent-cache.ts`
- `packages/server/src/lib/runtime/runtime-metadata.ts`
- `packages/server/src/routes/operations/status.ts`
- `packages/contracts/src/domain/**` 中涉及 async/status/operator 的 schema
- `docs/architecture/components/ASYNC_MODEL.md`
- `docs/architecture/components/ASYNC_SHARED_JOB_CONTRACTS.md`

## 主要修改文件

- `packages/server/src/lib/queue/task-queue.ts`
- `packages/server/src/lib/lifecycle/outbox.ts`
- `packages/server/src/lib/workflows/types.ts`
- `packages/server/src/lib/workflows/repository.ts`
- `packages/server/src/lib/cache/invalidation.ts`
- `packages/server/src/lib/runtime/runtime-metadata.ts`
- `packages/server/src/routes/operations/status.ts`
- `docs/operations/TESTING.md`
- `docs/operations/ENVIRONMENT.md`

## 要做的变更

- [x] 定义统一 failure taxonomy，至少覆盖：
  - user error
  - auth / policy error
  - dependency error
  - timeout
  - stale projection
  - retryable async failure
  - permanent failure
- [x] 统一 sync command、async task、bulk/rebuild job 的 idempotency key 规则。
- [x] 明确 retry limit、backoff、dead-letter、reclaim、resume / checkpoint 语义。
- [x] 把 freshness / projection lag 从隐式行为提升为显式 contract，并暴露到 operator status。
- [x] 明确 `api`、`task-worker`、`outbox-worker`、`combined` 模式的期望 worker state 与 degraded 语义。

当前事实：

- `task_queue` 和 `domain_event_outbox` 已经提供 retry/backoff、dead-letter、lease/reclaim 计数与 operator 可见的 recent failures/dead letters。
- `workflow_runs.stats` 已经是现有长任务 checkpoint/resume 的唯一持久化 surface。
- cache freshness 已可通过 `getCacheMetricsSnapshot()` 汇总 pending invalidation、stale recovery 与最近恢复时间。

本轮要做的变更：

- 把 runtime contract、idempotency contract、retry/resume contract、freshness contract 和 failure taxonomy 统一暴露到 `GET /v1/operations/status/async`。
- 让 Phase 2 的 operator 视图直接解释 backlog、projection lag、cache pending invalidation 和 manual replay / requeue 语义。
- 回写异步模型、环境变量、测试指南、架构文档与 truth-source 文档，使这些 contract 成为显式仓库事实。

Non-Goals：

- 不新增新的 broker、scheduler 或第二套异步 substrate。
- 不把 RabbitMQ 升级为默认 task transport。
- 不在本阶段扩展 Phase 3 的 config governance、capacity modeling、distributed invalidation 控制面。

Assumptions / Open Questions：

- assumption：bulk path 仍以现有环境变量和 workflow stats 承载 resume/checkpoint 语义，本阶段只冻结 contract，不新增完整 bulk operator API。
- open question：无阻塞 Phase 3 的剩余 Phase 2 open question；后续只需在 Phase 3 中继续放大 operator/config/capacity surface。

## Non-Goals

- 不引入新的 broker。
- 不把 RabbitMQ 设为默认 transport。
- 不引入第二套异步调度系统。
- 不以本阶段为名重做 read model 本身的业务逻辑。

## 文档更新

- [x] 更新 `docs/architecture/components/ASYNC_MODEL.md`。
- [x] 更新 `docs/architecture/components/ASYNC_SHARED_JOB_CONTRACTS.md`。
- [x] 更新 `docs/operations/TESTING.md` 中的 async/runtime 回归说明。
- [x] 更新 `docs/operations/ENVIRONMENT.md` 中的 task transport / runtime contract 说明。

## 测试 / Eval 更新

- [x] 聚焦回归：
  - `packages/server/src/lib/queue/task-queue.test.ts`
  - `packages/server/src/lib/lifecycle/outbox.test.ts`
  - `packages/server/src/lib/runtime/runtime-metadata.test.ts`
  - `packages/server/src/routes/operations/status.test.ts`
- [x] 如涉及 retrieval freshness contract 变化，至少运行 `pnpm eval:smoke`。
- [x] 为 workflow/dead-letter/resume 增补针对性测试。

## 必要示例

### Idempotency Key 示例

- sync command：`teamId + commandName + clientRequestId`
- async task：`ownerType + aggregateId + taskKind + revision`
- bulk job：`jobId + batchId + resumeFromOffset`

### Failure Surface 示例

- 当前事实：operator 可能看到 dead、failed、degraded，但语义不完全统一。
- 要做变更：为每种失败状态映射统一 taxonomy，并给出 operator 可执行动作。

### Freshness 示例

- authoritative write 成功后，`/v1/operations/status/async` 应能解释：
  - authoritative write committed
  - projection pending / catching up
  - cache invalidated but not yet rewarmed

## 完成标准

- API、worker、bulk path 的失败与恢复语义已经可以用同一套术语解释。
- operator 不再只能看到零散状态字符串，而是能理解失败类别和处理动作。
- freshness / projection lag 已成为显式 contract，而不是隐式实现副作用。

## Assumptions / Open Questions

- assumption：如 `packages/contracts` 中尚无单独 async contract 文件，执行时可在现有 contracts 域文件上扩展，但必须在实现前先固定落点。
- resolved：bulk path 的统一 contract 在本阶段先挂在 `operations/status` + `workflow_runs.stats` + `docs/operations/ENVIRONMENT.md` 的共享 runtime 语义上；具体 operator surface 扩张推迟到 Phase 3。

## 本阶段结论

当前事实：

- `packages/contracts/src/domain/operations.ts` 与 `packages/server/src/routes/operations/status.ts` 现在共同定义并输出统一的 runtime/freshness/idempotency/retry/failure contract。
- `docs/architecture/components/ASYNC_MODEL.md`、`ASYNC_SHARED_JOB_CONTRACTS.md`、`docs/operations/TESTING.md`、`docs/operations/ENVIRONMENT.md` 已回写同一套术语。
- Phase 1 遗留的 operator 读侧 repo capability gap open question 已解决：`lib/operations/read-model.ts` 当前只保留 artifact revision payload hydration 这一项命名 projection exception。

要做的变更：

- 下一轮应进入 Phase 3，围绕 operator/config/capacity/cache-ops 做能力加厚；不应回退到重新定义 Phase 2 contract。

Non-Goals：

- 本阶段不展开 Phase 3 的设计或实现，不勾选 Phase 3。

Assumptions / Open Questions：

- 当前无阻塞 Phase 3 的剩余 open question；若后续发现新的 bulk/operator 细节缺口，应在 Phase 3 范围内处理。
