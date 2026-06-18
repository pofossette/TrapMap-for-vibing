# TrapMap Stage 3 执行包：Freshness 与 Projection Lag 合约

> **给 agentic workers：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，按任务逐步执行。步骤使用 checkbox（`- [ ]`）跟踪。

**目标：** 把 retrieval、governance、operator 与 cache invalidation 的“新鲜度”从隐式行为收敛为统一 contract，让 eventual consistency 可观测、可解释、可验证。

**架构：** 保持现有 read model、cache invalidation、workflow run 和 async status 面，新增 freshness snapshot、projection lag 语义与跨模块暴露约束，而不是引入新的读写基础设施。

**技术栈：** TypeScript、Fastify、Vitest、PostgreSQL、shared jobs、workflow runs、retrieval cache、operator status。

---

## 为什么先做这个

- `packages/server/src/lib/cache/invalidation.ts` 已经有 invalidation event/freshness snapshot 基础，但还没有上升到统一 read freshness contract。
- `packages/server/src/lib/cache/retrieval-read-model-cache.ts` 和 `packages/server/src/lib/retrieval/capsules/intent-cache.ts` 已经被视为 derived cache，但“当前是否 stale”还没有系统化暴露。
- `docs/todos/backend-engineering-optimization-plan.md` 已明确把 freshness / projection lag 列为当前最高优先级之一。

## 范围

- 包含 retrieval read model freshness、governance/remediation read freshness、cache invalidation lag、projection refresh 完成态。
- 包含 operator status 与 runtime metadata 的 freshness 暴露。
- 不引入新的外部缓存。
- 不改变 authoritative write path。

## 目标边界

- 所有 read-side freshness 都有统一字段和术语。
- operator 能解释“为什么现在读到的是旧结果”。
- distributed invalidation 和 projection refresh 具备可观测 lag。

## 任务 1：统一 freshness snapshot 类型

**重点文件**

- 修改：`packages/contracts/src/domain/async.ts`
- 修改：`packages/server/src/lib/cache/invalidation.ts`
- 修改：`packages/server/src/lib/runtime/runtime-metadata.ts`

- [ ] 为 cache freshness、projection freshness、workflow freshness 定义统一 snapshot 字段。
- [ ] 明确至少包含：
  - `pending`
  - `lastInvalidatedAt`
  - `lastRecoveredAt`
  - `lagMs`
  - `owner`
  - `source`
- [ ] 统一 eventual-consistency 的文案和 semantics。

**完成标准**

- freshness 不再是每个模块各自发明的状态结构。

## 任务 2：把 freshness 暴露到 retrieval / governance / operator

**重点文件**

- 修改：`packages/server/src/routes/operations/status.ts`
- 修改：`packages/server/src/routes/retrieval.ts`
- 修改：相关 governance/operator read-model 模块

- [ ] 在 operator status 中暴露 retrieval / governance / projection freshness。
- [ ] 为 retrieval 响应链路增加内部 trace/freshness 关联点，不要求 public API 大改。
- [ ] 明确 governance queue / remediation queue 的 freshness 来源。

**完成标准**

- operator 能看到“哪个读模型 stale、滞后多久、归谁负责”。

## 任务 3：统一 invalidation lag 与 stale recovery 指标

**重点文件**

- 修改：`packages/server/src/lib/cache/metrics.ts`
- 修改：`packages/server/src/routes/operations/stats.ts`
- 修改：相关 cache namespace wiring

- [ ] 将 invalidation lag、stale recovery、pending invalidation 纳入统一 metrics。
- [ ] 对 retrieval read-model、intent、未来 query result cache 保持 namespace 一致命名。
- [ ] 保证本地模式和 distributed 模式都能解释这些指标。

**完成标准**

- freshness 不仅有状态，也有趋势指标。

## 任务 4：验证与回写

- [ ] 跑 freshness / status / invalidation 聚焦测试。
- [ ] 更新 `docs/operations/TESTING.md`、`docs/PACKAGES.md` 中的 freshness 说明。
- [ ] 在 `docs/reference/DATA_MODEL.md` 或相关文档中补 freshness / projection ownership 描述。

**验收结果**

- freshness / projection lag 成为明确 contract，而不是隐式副作用。

