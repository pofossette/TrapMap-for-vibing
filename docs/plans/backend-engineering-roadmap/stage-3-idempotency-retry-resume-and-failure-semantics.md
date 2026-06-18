# TrapMap Stage 3 执行包：Idempotency、Retry、Resume 与失败语义

> **给 agentic workers：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，按任务逐步执行。步骤使用 checkbox（`- [ ]`）跟踪。

**目标：** 统一 sync command、async worker、bulk ingestion / rebuild 三条路径的幂等、重试、恢复与失败分类语义，降低重复写、脏 side effect 和不可解释的重试行为。

**架构：** 保持 authoritative transaction、task queue、outbox、workflow run 与现有 bulk/rebuild 入口，新增统一 contract，而不是引入新调度系统。

**技术栈：** TypeScript、Fastify、Vitest、PostgreSQL、task queue、outbox、workflow runs、bulk jobs。

---

## 为什么先做这个

- 当前仓库已经有 authoritative write + queue/outbox registration 的事务边界，但 idempotency / retry / resume 仍未统一成一个显式 contract。
- `docs/todos/backend-engineering-optimization-plan.md` 已明确把这条主线列为最高优先级之一。
- runtime recomposition 已补 internal port 与 bulk ingestion 配置预留，需要这份计划把运行语义真正收口。

## 范围

- 包含 sync command path。
- 包含 async worker path。
- 包含 bulk ingestion / rebuild / backfill path。
- 包含失败分类与 operator 可见性。
- 不引入新的 broker。

## 目标边界

- 每类 command/task/job 都有 idempotency 规则。
- retryable / non-retryable / permanent failure 有统一分类。
- bulk path 支持 resume/checkpoint。

## 任务 1：统一失败分类

**重点文件**

- 修改：`packages/contracts/src/domain/async.ts`
- 修改：相关 error/helper 模块
- 修改：`packages/server/src/routes/operations/status.ts`

- [ ] 统一至少以下失败分类：
  - `user-error`
  - `auth-policy-error`
  - `dependency-error`
  - `timeout`
  - `stale-projection`
  - `retryable-async-failure`
  - `permanent-failure`
- [ ] 约束 API、worker、bulk job 都能映射到这套 taxonomy。

**完成标准**

- operator 和日志不再只看到零散字符串错误。

## 任务 2：统一 idempotency contract

**重点文件**

- 修改：command/bulk/async contract 定义文件
- 修改：task/job scheduler 入口
- 修改：相关 repository / application service 注释与 helper

- [ ] 为 sync command 定义 idempotency key 规则。
- [ ] 为 async task 定义重复消费语义。
- [ ] 为 bulk job 定义 `jobId / batchId / idempotencyKey / resumeFromOffset` 规则。

**完成标准**

- 重试不会悄悄制造额外业务副作用。

## 任务 3：统一 retry / resume / dead-letter 语义

**重点文件**

- 修改：`packages/server/src/lib/queue/*`
- 修改：`packages/server/src/lib/workflows/*`
- 修改：bulk/rebuild 入口相关模块

- [ ] 明确 retry limit、backoff、dead-letter 进入条件。
- [ ] 明确 bulk/rebuild 的 checkpoint 和 resume 语义。
- [ ] 让 operator 能看到 dead-letter 后可以做什么。

**完成标准**

- async path 与 bulk path 的恢复策略可解释、可操作。

## 任务 4：验证与回写

- [ ] 跑 queue/workflow/bulk 聚焦测试。
- [ ] 更新 `docs/operations/TESTING.md`、`docs/operations/ENVIRONMENT.md` 中的 retry/resume 说明。
- [ ] 更新 `docs/todos/backend-engineering-optimization-plan.md` 的对应 TODO 状态。

**验收结果**

- TrapMap 的重试和恢复语义从实现细节升级为显式运行 contract。

