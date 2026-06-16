# TrapMap 后端工程化 Stage 2 计划

> **给 agentic workers：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，按任务逐步执行。步骤使用 checkbox（`- [ ]`）跟踪。

**目标：** 强化 TrapMap 的异步运行时和读写分离，让重活、投影刷新和 operator 可观测性不再依赖请求链路或松散归属的读侧状态。

**架构：** 建立在现有 queue、outbox、worker 模式、workflow run、检索读模型和缓存之上。仍保持一个模块化单体，但把 API 节点、worker 节点和派生读侧职责明确出来，为后续扩容决策提供真实运行数据。

**技术栈：** TypeScript、Fastify、Zod、Vitest、PostgreSQL、Drizzle、queue/outbox worker、workflow run、检索缓存/读模型。

---

## 当前基线

- `task_queue` 和 `domain_event_outbox` 已经是 durable async substrate。
- worker 运行时模式已经存在：`api`、`task-worker`、`outbox-worker`、`combined`。
- workflow-run snapshot 已经存在，用于长任务。
- 检索已经使用 read-model 和 cache 层，但 refresh 和 invalidation 的 ownership 仍然混在 route、job 和 lifecycle 路径里。
- operator status 面已经存在，可以继续扩展而不是重做。

## 包含内容

- 把 task/outbox 作为重活和可重试工作的默认承载。
- 更明确地区分 authoritative write model 和 retrieval/operator read model。
- 统一事件驱动或 job 驱动的 invalidation 和 projection refresh。
- 提升 operator 对 queue、workflow、stale work 和 projection freshness 的可见性。
- 让 API 实例和 worker 实例在运行时层面可以独立扩缩。

## 不包含内容

- 不引入外部 broker。
- 不按 Kafka 语义重做事件流。
- 不在这一阶段拆出独立服务部署。
- 不尝试把所有 in-process cache 都替换成分布式缓存。

## 执行顺序

本阶段先落一个统一执行包，集中处理 async contract、projection ownership 和 runtime 语义：

1. [`./stage-2-async-runtime-contracts-and-projection-ownership.md`](./stage-2-async-runtime-contracts-and-projection-ownership.md)

顺序约束：

- 必须建立在 Stage 1 已经收口主要写路径和 operator 读侧边界的前提下推进。
- 如果 Stage 1 的 repository / compatibility seam 仍然松散，优先回补 Stage 1，再推进本阶段的 invalidation 与 projection 标准化。

## Stage 2A：完成请求链路与异步链路的分离

- [x] 找出仍在请求处理器或 route 邻近 helper 中执行的重活。
- [x] 确保 indexing follow-up、remediation follow-up、export drafting、rebuild work 等重试型任务都走 durable worker。
- [x] 保持 authoritative write 在 command transaction 中完成，只把 derived 或 retryable work 放入 async substrate。
- [x] 为每个新增标准化的后台任务明确幂等、重试和 dead-letter 行为。

**完成标准**

- 请求延迟不再被可以延后执行的派生工作主导。
- 每个新 async task 都有 typed payload、owner、retry 语义和 operator 可见性。
- 派生工作不再悄悄嵌在 route 逻辑里。

## Stage 2B：明确读模型归属

- [x] 定义哪些模块负责 authoritative writes，哪些模块负责 retrieval、operator status 和 badcase reconstruction 的派生投影。
- [x] 让 retrieval read model 从 repository-backed truth + 明确的派生表组装，不再依赖兼容 snapshot 的临时读取。
- [x] 为 retrieval 输入、cache 条目、workflow/operator status、badcase trace 写清 freshness 预期。
- [x] 优先通过明确的 repository 或 projection 模块做派生读取，不要在跨模块临时拼装。

**完成标准**

- Retrieval、operator 和 remediation 读路径都有明确 owner。
- 投影输入可以追溯到 authoritative write source。
- freshness / lag 预期足够清晰，能被测量和排障。

## Stage 2C：统一缓存失效与投影刷新

- [x] 让 cache invalidation 由 lifecycle event、job 或 projection refresh 触发，而不是 route 内部随手清缓存。
- [x] 为 retrieval read-model cache、intent cache，以及未来的派生 cache 统一 invalidation 合约。
- [x] 对命中、未命中、失效和 stale-read recovery 记录相关指标。
- [x] 让 invalidation 尽量局部化，不要因为缓存操作而阻塞写路径成功。

**完成标准**

- 缓存清理可以追溯到明确事件或 job。
- projection refresh 和 cache invalidation 在各个 retrieval 影响流程里保持一致。
- operator 能区分 cache 抖动和真正的 read-model lag。

## Stage 2D：强化 worker 与 operator 运行时面

- [x] 保持 `api`、`task-worker`、`outbox-worker`、`combined` 的 runtime ownership 显式可见。
- [x] 扩展 operator status 面，显示 backlog、reclaim、dead-letter、workflow 进度和 projection 健康状况。
- [x] 让 worker degraded 可见，但不要让 API-only 进程被错误标成不健康。
- [x] 让共享 bootstrap 继续集中管理，避免 worker 进程各自复制一套架构规则。

**完成标准**

- API 和 worker 进程可以被独立理解。
- worker 健康和 backlog 问题可以通过 operator 面看到，而不必直接查表。
- runtime ownership 语义与权威启动文件保持一致。

## 验证与收尾

- [x] 对被改动的 async/runtime 模块跑聚焦测试。
- [x] 跑 `rtk pnpm test -- --run packages/server/src/routes/operations/status.test.ts packages/server/src/bootstrap/startup.test.ts packages/server/src/lib/runtime/runtime-metadata.test.ts`。
- [x] 跑 `rtk pnpm typecheck`。
- [x] 跑 `rtk pnpm check:structure`。
- [x] 更新 `plan.md` 和本文件，标记 Stage 2 已完成的检查点。

**完成标准**

- 重派生工作已经离开请求路径。
- 读模型归属和失效规则已经明确。
- API 和 worker 运行时可以独立扩缩，而不会隐藏请求路径耦合。

## 关键参考

- `packages/server/src/lib/queue/task-queue.ts`
- `packages/server/src/lib/lifecycle/outbox.ts`
- `packages/server/src/lib/workflows/`
- `packages/server/src/lib/cache/invalidation.ts`
- `packages/server/src/lib/runtime/runtime-metadata.ts`
- `docs/reference/DATA_MODEL.md`
