# TrapMap Stage 1 执行包 A：Review 与 Decay 写路径收口

> **给 agentic workers：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，按任务逐步执行。步骤使用 checkbox（`- [ ]`）跟踪。

**目标：** 将 `review` 与 `decay` 两条高频写路径收口到稳定的 application service + repository seam，减少 route 直接承担编排、兼容层访问和 side effect 协调。

**架构：** 继续保持 Fastify route 作为 transport adapter，`knowledge` context 作为 authoritative write owner。把 review decision、decay batch command、lifecycle 变迁、shadow sync、audit 与 cache/lifecycle side effect 收敛到 application service，route 只做校验、鉴权、actor 解析和响应映射。

**技术栈：** TypeScript、Fastify、Zod、Vitest、PostgreSQL、Drizzle、`repos`、现有 `knowledge` application service、lifecycle/event bus。

---

## 为什么先做这个

- [packages/server/src/routes/review.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/routes/review.ts:1) 仍然同时负责 repo 查询、compat snapshot fallback、decision apply、shadow sync、audit 和 lifecycle/cache side effect。
- [packages/server/src/routes/decay.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/routes/decay.ts:1) 已部分 repo 化，但 dry-run 与 execute 仍混有 `store.snapshot()` / `store.transact()`。
- 这两条路径都属于 `知识治理` bounded context，适合先用同一套 application command 模式收口。
- 如果这一步不先做，Stage 2 的 async/job/read-model 归属会继续建立在不稳定的写路径上。

## 范围

- 包含 `review` 写路径与 `decay` batch 写路径。
- 包含对应的 application service、repository 能力补齐、route 瘦身和测试迁移。
- 不包含 retrieval 算法调整。
- 不包含 artifact 生命周期重构。
- 不在本执行包内引入新的外部异步基础设施。

## 目标边界

- route 只负责：
  - request parse / schema validate
  - auth / permission / actor resolve
  - 调用 service
  - response serialize
- application service 负责：
  - 聚合加载
  - 命令不变量校验
  - 多步持久化编排
  - lifecycle / shadow / audit / invalidation 的一致性触发
- repository 负责：
  - authoritative aggregate 读写
  - transaction 边界内的持久化能力
  - 必要的兼容层封装

## 任务 1：建立 review command service

**重点文件**

- 新增：`packages/server/src/lib/knowledge/review-application-service.ts`
- 修改：`packages/server/src/routes/review.ts`
- 参考：`packages/server/src/lib/knowledge/application-service.ts`

- [x] 定义 `ReviewApplicationService`，至少暴露 `applyDecision()` 命令入口。
- [x] 命令入参统一包含 `actorId`、`entryId`、`decision`、`notes`、可选 `boundary`、可选 `evidence`、权限上下文。
- [x] 将当前 route 中的 entry 加载、review decision apply、lifecycle 写入、shadow sync、audit 记录搬入 service。
- [x] 保持 route 中的 team access / level gate 行为不变，但让实际的多步业务编排由 service 承担。
- [x] 若 repository 能力不足以支撑当前流程，优先补 repository 方法，不新增 route-local snapshot 读取。

**完成标准**

- `review.ts` 不再直接协调多步持久化。
- service 可以脱离 HTTP 细节被测试。
- review 相关 side effect 归属到显式 service，而不是 route。

## 任务 2：建立 decay batch command service

**重点文件**

- 新增：`packages/server/src/lib/decay/application-service.ts`
- 修改：`packages/server/src/routes/decay.ts`
- 参考：`packages/server/src/lib/decay/batch.ts`

- [x] 定义 `DecayBatchApplicationService`，至少拆分 `previewBatch()` 与 `executeBatch()`。
- [x] `previewBatch()` 允许以显式只读输入组装 dry-run 结果，但其兼容读取必须集中在 service 或专用 helper，不留在 route。
- [x] `executeBatch()` 负责 authoritative write、必要 transaction 和 lifecycle follow-up。
- [x] 对 `extend`、`mark-review`、`deactivate`、`supersede` 这四类动作逐一确认归属，避免继续在 route 内联分支编排。
- [x] 对 `supersede` 明确记录：若仍依赖 `store.transact()`，必须作为迁移债务点名，而不是隐式保留。

**完成标准**

- dry-run 与 execute 的依赖边界清晰分开。
- decay route 不再承担业务编排中心角色。
- 执行路径中的兼容层使用点被局部化并文档化。

## 任务 3：补齐 `knowledge` repository / compatibility seam

**重点文件**

- 修改：`packages/server/src/lib/knowledge/repository.ts`
- 修改：`packages/server/src/__tests__/snapshot-usage-guard.test.ts`
- 参考：`packages/server/src/lib/knowledge/application-service.ts`

- [x] 盘点 review/decay 为了获取 current aggregate state 仍回退到 `store.snapshot()` 的调用点。
- [x] 为 repository 增补缺失能力，优先支持：
  - 单 entry 带完整治理状态读取
  - review decision 所需的 lifecycle / history / boundary 持久化
  - decay batch 所需的批量 entry 读取和 mutation 支持
- [x] 对暂时无法消除的 compatibility 访问写清 allowlist 原因。
- [x] 更新 snapshot usage guard，让新的允许项更少且更集中。

**完成标准**

- route 与 application service 默认不再直接读取 compatibility snapshot。
- repository 成为 review/decay 的默认事实源入口。
- 剩余例外是命名过的迁移债务，而不是偶发做法。

## 任务 4：验证与文档回写

**重点文件**

- 修改：`docs/plans/backend-engineering-roadmap/stage-1-foundation-and-boundaries.md`
- 修改：`docs/plans/backend-engineering-roadmap/coupling-reduction-plan.md`

- [x] 跑 review/decay 聚焦测试。
- [x] 跑 `rtk pnpm test -- --run packages/server/src/routes/review.test.ts packages/server/src/routes/decay.test.ts packages/server/src/__tests__/snapshot-usage-guard.test.ts`。
- [x] 跑 `rtk pnpm typecheck`。
- [x] 完成后在 Stage 1 与耦合计划里勾选对应检查点。

**验收结果**

- `review` 与 `decay` 的写路径已经建立清晰的 service seam。
- route-to-service 与 service-to-store 的耦合显著下降。
- Stage 2 不再需要继承这两条热路径的 ownership 歧义。
