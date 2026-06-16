# TrapMap Stage 2 执行包：Async 合约、运行时语义与投影归属标准化

> **给 agentic workers：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，按任务逐步执行。步骤使用 checkbox（`- [ ]`）跟踪。

**目标：** 将现有 queue/outbox/worker/runtime/status 能力从“已有实现”推进为“有统一任务合约、投影刷新归属与 operator 语义”的后端运行时标准。

**架构：** 保持 `task_queue`、`domain_event_outbox`、worker mode、workflow run 和现有 status 面，优先标准化 shared job contract、cache/projection invalidation ownership、worker runtime visibility，而不是增加新的基础设施。

**技术栈：** TypeScript、Fastify、Vitest、PostgreSQL、Drizzle、task queue、outbox、workflow runs、runtime metadata。

---

## 为什么先做这个

- [packages/server/src/bootstrap/bootstrap-workers.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/bootstrap/bootstrap-workers.ts:1) 已承载 candidate processing 与 shared jobs，但 handler contract 仍偏分散。
- [packages/server/src/bootstrap/bootstrap-lifecycle.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/bootstrap/bootstrap-lifecycle.ts:1) 已拥有 outbox worker，但 composite handler、失败语义和投影 ownership 还没有统一抽象。
- [packages/server/src/lib/cache/invalidation.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/cache/invalidation.ts:1) 仍是进程内 listener，尚不足以作为 Stage 2 的显式 invalidation 合约。
- [packages/server/src/routes/operations/status.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/routes/operations/status.ts:1) 与 [packages/server/src/lib/runtime/runtime-metadata.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/runtime/runtime-metadata.ts:1) 已具备 runtime 可见性基础，适合统一 worker ownership 语义。

## 范围

- 包含 shared async jobs、outbox handlers、cache invalidation、projection freshness、runtime status 的标准化。
- 包含 worker ownership 与 operator status 语义对齐。
- 不引入外部 broker。
- 不拆分服务部署。

## 目标边界

- authoritative write 在 command transaction 内完成。
- retryable / heavy / derived work 通过 task queue 或 outbox 驱动。
- projection refresh 与 cache invalidation 由显式事件或 job 触发。
- runtime mode 只是基础设施策略，不改变 domain/application 行为。

## 任务 1：统一 shared async task contract

**重点文件**

- 修改：`packages/server/src/lib/jobs/types.ts`
- 修改：`packages/server/src/lib/jobs/index.ts`
- 修改：`packages/server/src/bootstrap/bootstrap-workers.ts`

- [x] 为 shared jobs 明确统一元数据：task type、owner context、idempotency key、max attempts、dead-letter 语义。
- [x] 对 `knowledge-index-follow-up`、`remediation-reactivation`、`badcase-export-draft` 三类现有任务逐一补齐 contract 文档。
- [x] 约束后续新增任务必须先声明 payload shape 与 owner，再接入 worker。
- [x] 若 workflow run 需要关联任务进度，明确 runId / subjectId 的绑定规则。

**完成标准**

- shared jobs 不再只是“能跑”，而是有统一 contract。
- operator 可以从 task type 推断 owner、重试和失败处理语义。

## 任务 2：统一 outbox / projection / cache invalidation 归属

**重点文件**

- 修改：`packages/server/src/bootstrap/bootstrap-lifecycle.ts`
- 修改：`packages/server/src/lib/cache/invalidation.ts`
- 修改：相关 projection 或 subscriber 模块

- [x] 将当前由 route、本地 listener、subscriber 零散触发的 invalidation 归并为显式事件或 job 驱动。
- [x] 明确哪些投影由 outbox subscriber 刷新，哪些由 task queue follow-up 刷新。
- [x] 为 retrieval read-model cache、intent cache 及未来 operator 派生 cache 统一失效原因命名。
- [x] 记录“写成功但读侧短暂滞后”是可接受语义，并给出 freshness/lag 观察入口。

**完成标准**

- invalidation 来源可追溯。
- projection ownership 与 cache ownership 不再散落在 route/helper 中。
- Stage 2 的读写分离有清晰的派生链路定义。

## 任务 3：对齐 runtime metadata 与 operator status 语义

**重点文件**

- 修改：`packages/server/src/lib/runtime/runtime-metadata.ts`
- 修改：`packages/server/src/routes/operations/status.ts`
- 参考：`packages/server/src/bootstrap/runtime-mode.ts`

- [x] 统一 `api`、`task-worker`、`outbox-worker`、`combined` 四种模式下的 queue/outbox ownership 语义。
- [x] 明确 `running`、`remote`、`degraded`、`not-configured` 的判定标准，并让 runtime metadata 与 async status 返回值保持一致。
- [x] 保证 API-only 进程不会因为不拥有本地 worker 而被错误标成不健康。
- [x] 将 workflow、backlog、reclaim、dead-letter、projection lag 视图纳入同一 operator 叙事。

**完成标准**

- API 与 worker 的健康状态可独立解释。
- runtime status 与 async status 不会给出互相矛盾的结论。

## 任务 4：验证与回写

- [x] 跑 async/runtime 聚焦测试。
- [x] 跑 `rtk pnpm test -- --run packages/server/src/routes/operations/status.test.ts packages/server/src/bootstrap/startup.test.ts packages/server/src/lib/runtime/runtime-metadata.test.ts`。
- [x] 跑 `rtk pnpm typecheck`。
- [x] 回写 Stage 2 与耦合计划中的对应检查点。

**验收结果**

- TrapMap 的 async substrate 拥有统一任务合约。
- projection refresh 与 cache invalidation 的 ownership 明确。
- runtime/operator 面可以支撑后续是否独立扩 worker 的真实决策。
- Stage 2 执行包已完成。
