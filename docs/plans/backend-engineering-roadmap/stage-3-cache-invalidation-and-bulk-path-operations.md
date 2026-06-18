# TrapMap Stage 3 执行包：Cache / Distributed Invalidation / Bulk Path Operations

> **给 agentic workers：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，按任务逐步执行。步骤使用 checkbox（`- [ ]`）跟踪。

**目标：** 把 retrieval-side cache、distributed invalidation 和 bulk ingestion / rebuild / backfill 的运行语义从局部实现推进为统一可观测的运维能力。

**架构：** 保持本地 LRU/TTL cache、outbox/shared job、workflow run、batch commit 和现有 rebuild 入口，补 distributed invalidation contract、remote cache fallback 语义和 bulk path runtime 语义。

**技术栈：** TypeScript、Fastify、Vitest、RetrievalCache、workflow runs、task queue、PostgreSQL。

---

## 为什么先做这个

- runtime recomposition 已经明确了缓存分层和 bulk ingestion 设计原则。
- `docs/operations/ENVIRONMENT.md` 已经补入 planned config surface，但还需要配套执行计划。
- 当前已有 retrieval read-model cache、intent cache、capsule rebuild、candidate transaction、batch operations，这些是收口的基础。

## 范围

- retrieval-side cache 分层
- distributed invalidation contract
- remote cache fallback 语义
- bulk ingestion / rebuild / backfill 的 batch contract、retry、resume、observe

## 任务 1：标准化 cache namespace 与 invalidation ownership

**重点文件**

- 修改：`packages/server/src/lib/cache/*`
- 修改：相关 read-model / retrieval wiring

- [ ] 统一 retrieval-side cache namespace。
- [ ] 固化 invalidation owner、reason、trigger 命名。
- [ ] 区分 process-local compute cache、result cache、revision object cache。

## 任务 2：distributed invalidation contract

**重点文件**

- 修改：cache invalidation / outbox / shared job 相关模块
- 修改：operator/status 相关视图

- [ ] 把 invalidation 从进程内 listener 扩展为 distributed-friendly contract。
- [ ] 定义 fail-open / lag budget / pending invalidation 语义。
- [ ] 为 remote cache 不可用时的 fallback 给出一致语义。

## 任务 3：bulk path runtime contract

**重点文件**

- 修改：candidate / rebuild / batch operation / workflow run 相关模块
- 修改：ENV / docs 中的 bulk config 对应实现入口

- [ ] 统一 batch size、max rows per tx、retry、resume、checkpoint 语义。
- [ ] 明确 online path 与 bulk path 的边界。
- [ ] 让 rebuild/backfill/import 共享一套 runtime contract。

## 任务 4：验证与回写

- [ ] 跑 cache/bulk/workflow 聚焦测试。
- [ ] 更新 `docs/operations/ENVIRONMENT.md`、`docs/architecture/PRECOMPUTATION.md`、必要时更新 `docs/operations/TESTING.md`。

**验收结果**

- 缓存、distributed invalidation 和 bulk path 进入统一运维语义，而不是零散局部能力。

