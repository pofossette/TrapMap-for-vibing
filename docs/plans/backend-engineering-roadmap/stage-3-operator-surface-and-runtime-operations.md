# TrapMap Stage 3 执行包：Operator Surface 与 Runtime Operations

> **给 agentic workers：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，按任务逐步执行。步骤使用 checkbox（`- [ ]`）跟踪。

**目标：** 把 queue、cache、projection、bulk job、config fingerprint、runtime capability 等运行信息收敛成更完整的 operator surface，使重后端具备真实可运维性。

**架构：** 基于现有 `/v1/operations/status`、stats、workflow runs、capsule-index operator 面扩展，不新增第二套运维协议。

**技术栈：** TypeScript、Fastify、Vitest、workflow runs、task queue、runtime metadata、operator routes。

---

## 为什么先做这个

- 当前已有 status、badcases、capsule-index 等 operator 面，但还偏分散。
- 随着 freshness、distributed invalidation、bulk ingestion 和重后端服务拆分推进，operator 面会直接决定系统可维护性。

## 范围

- queue backlog / retry / dead-letter drill-down
- cache freshness / invalidation lag
- bulk job progress / failure samples / resume control
- projection rebuild / repair visibility
- runtime capability / config fingerprint visibility

## 任务 1：统一 operator 信息架构

**重点文件**

- 修改：`packages/server/src/routes/operations/status.ts`
- 修改：`packages/server/src/routes/operations/stats.ts`
- 修改：相关 runtime metadata / workflow snapshot 模块

- [ ] 定义 operator 首页要展示的主视图分组。
- [ ] 区分 health、status、capacity、freshness、job control 五类信息。
- [ ] 保证 API-only、worker-only、distributed 模式都能解释这些视图。

## 任务 2：补 queue/cache/projection/bulk job drill-down

**重点文件**

- 修改：现有 operator routes
- 必要时新增：`packages/server/src/routes/operations/*`

- [ ] 为 queue 提供 backlog、retry、dead-letter drill-down。
- [ ] 为 cache 提供 namespace 级 freshness / hit/miss / invalidation lag 视图。
- [ ] 为 bulk job 提供进度、失败样本与 resume 线索。
- [ ] 为 projection rebuild 提供当前状态与 repair 入口。

## 任务 3：暴露 config fingerprint 与 runtime capability

**重点文件**

- 修改：config/runtime metadata 相关模块
- 修改：status/operator surface

- [ ] 暴露配置指纹和 profile-aware capability 概览。
- [ ] 让 operator 能看出当前进程启用了哪些关键 distributed/experimental 开关。

## 任务 4：验证与回写

- [ ] 跑 operations/status/stats/operator 聚焦测试。
- [ ] 回写 `docs/architecture/API.md`、`docs/reference/api-surface.md`、`docs/operations/TESTING.md`。

**验收结果**

- TrapMap 重后端具备可运维的统一 operator surface。

