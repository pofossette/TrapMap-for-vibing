# TrapMap Backend Engineering Master Plan - Phase 3 Operator Config Capacity And Cache Ops

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the backend operationally manageable by strengthening operator surfaces, config governance, capacity modeling, cache/invalidation visibility, and bulk-path operations.

**Architecture:** Extend the existing operator routes, runtime metadata, cache metrics, and batch helpers instead of introducing a second operations plane. This phase turns current operational hints into explicit, measurable capabilities.

**Tech Stack:** TypeScript, Fastify, Vitest, PostgreSQL, workflow runs, task queue, runtime metadata, cache metrics, batch helpers.

---

## 目标

- 做厚 operator surface。
- 建立 config governance。
- 建立容量与成本建模入口。
- 把 cache invalidation 与 bulk path operations 变成显式运维能力。

## 当前事实

- `packages/server/src/routes/operations/status.ts`、`stats.ts`、`badcases.ts`、`capsule-index.ts` 已形成分散 operator 面。
- `packages/server/src/config.ts` 已定义 deployment 与 task transport 的 schema，但还缺少更完整的 config governance 叙事。
- `packages/server/src/lib/cache/metrics.ts` 已存在基础缓存指标。
- maintenance/decay bulk writes now use knowledge-write owner commands; unconsumed compatibility batch helpers were retired.
- Stage 3 现有细化计划已覆盖 operator、config/capacity、cache/bulk 主线，但仍分散在旧目录。

## 范围

- `packages/server/src/config.ts`
- `packages/server/src/routes/operations/status.ts`
- `packages/server/src/routes/operations/stats.ts`
- `packages/server/src/lib/runtime/runtime-metadata.ts`
- `packages/server/src/lib/cache/metrics.ts`
- `packages/server/src/lib/cache/invalidation.ts`
- `packages/service-knowledge-write/src/pg-ports.ts`
- `packages/server/src/lib/retrieval/read-model.ts`
- `packages/server/src/lib/operations/read-model.ts`
- `docs/operations/ENVIRONMENT.md`
- `docs/reference/PERFORMANCE.md`

## 主要修改文件

- `packages/server/src/config.ts`
- `packages/server/src/routes/operations/status.ts`
- `packages/server/src/routes/operations/stats.ts`
- `packages/server/src/lib/runtime/runtime-metadata.ts`
- `packages/server/src/lib/cache/metrics.ts`
- `packages/server/src/lib/cache/invalidation.ts`
- `packages/service-knowledge-write/src/pg-ports.ts`
- `docs/reference/api-surface.md`
- `docs/operations/TESTING.md`
- `docs/reference/PERFORMANCE.md`

## 要做的变更

- [x] 统一 operator 首页的信息分组：
  - health
  - status
  - freshness
  - capacity
  - job control
- [x] 为 queue、cache、projection、bulk job 增加 drill-down 视角。
- [x] 暴露 config fingerprint、deprecated env、冲突配置检测与 profile-aware capability 概览。
- [x] 为 PostgreSQL 连接池、热点团队/查询/工件、handler latency、backlog 与成本建立观测入口。
- [x] 统一 batch/rebuild/backfill 的 checkpoint、resume、failure sample 和 operator visible progress。
- [x] 明确 distributed invalidation、cache freshness、remote fallback 的可见性与运维语义。

## Non-Goals

- 不把 MQ 设为默认。
- 不引入分布式缓存作为首要交付。
- 不在本阶段引入新的 UI 面板协议。

## 文档更新

- [x] 更新 `docs/operations/ENVIRONMENT.md` 的 config governance 章节。
- [x] 更新 `docs/reference/PERFORMANCE.md` 的容量和热点建模说明。
- [x] 更新 `docs/reference/api-surface.md` 的 operator surface 说明。
- [x] 必要时补充 `docs/architecture/API.md` 与 `docs/architecture/CACHING.md`。

## 测试 / Eval 更新

- [x] 聚焦以下测试面：
  - `packages/server/src/routes/operations/status.test.ts`
  - `packages/server/src/routes/operations/stats.test.ts`
  - `packages/server/src/lib/cache/retrieval-cache.test.ts`
  - `packages/service-knowledge-write/src/pg-ports.test.ts`
- [x] 若涉及 cache freshness contract 变化，补 retrieval 相关 smoke 回归。

## 必要示例

### Config Fingerprint 示例

- 返回当前 deployment profile、runtime mode、task transport、关键 feature toggles 和 fingerprint hash。

### Bulk Job 示例

- operator 可看到：
  - `jobId`
  - 当前 checkpoint
  - 最近失败样本
  - 是否允许 resume

### Cache Drill-Down 示例

- namespace 级命中率
- invalidation 次数
- stale-read recovery 次数
- remote fallback 是否发生

## 完成标准

- operator 可以从统一 surface 理解运行状态，而不必直接查表或读日志。
- 配置治理和容量建模进入正式工程化轨道，而不是零散规则。
- cache 与 bulk path 不再只是内部实现细节，而是可观测、可运维的能力。

## Assumptions / Open Questions

- assumption：现有 operator routes 足够承载本阶段增强，不需要新建第二套运维协议。
- open question：哪些 capacity 指标应进入默认 status surface，哪些只应保留在更深 drill-down，需要执行时按返回体大小和 operator 频率权衡。

## 本阶段结论

当前事实：

- `GET /v1/operations/status/async` 现在在 Phase 2 contract 之外，额外暴露 `operatorHome`、`configGovernance`、`capacityModel` 与 `bulkOperations`，把 operator 首页分组、config fingerprint、capacity summary 与 workflow/bulk drill-down 收敛到同一 truth surface。
- `packages/server/src/config.ts` 现在提供可复用的 config governance summary：fingerprint、deprecated env、conflict warnings 与 profile-aware capability summary。
- `GET /v1/operations/stats/summary` 现在额外暴露 `cacheInvalidationByNamespace` 与 `cachePendingInvalidationByNamespace`，让 cache invalidation/capacity 进入系统级 summary。

本轮要做的变更：

- 本阶段只回写已经落地的 operator/config/capacity/cache-ops 事实源，并在根 `plan.md` 勾选 Phase 3 完成。

Non-Goals：

- 本阶段不展开 Phase 4 的验证矩阵归档、旧计划退出或最终 closeout。
- 本阶段不把 PostgreSQL 连接池上升为新的 runtime contract 字段；当前仅暴露 `configured/maxConnections=null` 的保守容量入口。

Assumptions / Open Questions：

- assumption：`workflow_runs.stats` 继续作为 bulk/rebuild/backfill checkpoint/resume 的唯一持久化 surface，Phase 3 只把它做厚为 operator-visible summary。

Phase 4 closeout 对本阶段遗留问题的结论：

- `capacityModel.databasePool.maxConnections`
  - 结论：关闭为 deferred detail，不升级为新的 runtime contract。
  - 关闭理由：当前仓库只保证 operator 可看到“是否配置数据库池”以及保守的扩展位 shape；没有稳定的驱动层 introspection 契约，不应在 closeout 阶段引入新的 runtime truth surface。
  - 权威落点：`packages/contracts/src/domain/operations.ts`、`packages/server/src/routes/operations/status-phase3.ts`、`docs/reference/PERFORMANCE.md`。
- 热点 `team/query/artifact`
  - 结论：关闭为 non-default deep drill-down，不进入默认 operator surface。
  - 关闭理由：默认 operator 首页的目标是高频排障摘要，不是热点分析报表；当前代码与 contract 也只稳定提供 backlog、latency、cache invalidation、workflow progress 这类高层容量信号。
  - 权威落点：`packages/server/src/routes/operations/status-phase3.ts`、`docs/reference/PERFORMANCE.md`、`docs/reference/api-surface.md`。

是否阻塞 closeout：

- 否。两项问题都不再阻塞 Phase 4；默认 surface 与 capacity contract 的边界已经明确。
