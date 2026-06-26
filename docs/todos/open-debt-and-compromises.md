# 未完成项与阶段性妥协清单

本文档记录当前仓库里仍未收口、仅作占位，或为了推进节奏而保留的明确妥协项。

与 [`docs/archived/reports/DEBT_AND_PLACEHOLDER_REPORT.md`](../archived/reports/DEBT_AND_PLACEHOLDER_REPORT.md) 的区别：

- 本文档只描述“当前仍成立”的事项
- 归档报告保留历史背景和阶段性快照

## 1. 仍是占位实现

### `packages/host-local/src/bootstrap/stubs.ts`

当前 `createStubSessionLookup()`、`createStubTeamLookup()`、`createStubPermissionCheck()`、`createStubAuditLog()`、`createStubRetrievalQuery()` 以及多组 `createStub*Repo()` 仍返回 `null`、空数组、空对象或 no-op。

这说明：

- `host-local` 可以在缺少外部依赖时完成启动
- 但不少 service port / repository port 还只是 scaffolding，不应被误判为完整实现

### `packages/host-local/src/runtime/worker.ts`

文件头已明确标注 `@stub`，并写明 real implementation deferred to Task 04/05。当前实现只是生命周期包装：

- 可以创建 consumer
- 可以暴露 `isRunning()` / `stop()`
- 但真实任务轮询、处理、graceful drain、metrics、retry 仍未收口

### `packages/host-local/src/runtime/outbox.ts`

文件头同样明确标注 `@stub`。当前 outbox dispatcher 具备最小循环骨架，但仍缺少文档中已承认的收口项：

- graceful drain
- metrics
- dead-letter handling

这意味着它更接近“可运行的过渡态”，而不是完整的生产硬化实现。

## 2. 明确还没完成的工程化事项

### `docs/todos/backend-engineering-optimization-plan.md`

当前仍未完成的条目只剩两项：

1. 为检索、摘要、治理失败补齐 `queryId`、结果快照和失败分类
2. 将高频异步任务从进程内副作用迁移到持久化任务队列

其中第 2 项和 `host-local` 的 worker/outbox 现状互相印证，说明异步治理仍在“已设计、未完全收口”的阶段。

### `docs/todos/badcase-feedback-loop.md`

badcase 回流链路的大部分能力已经落地，但还差一个统一事实层：

- badcase 分类标准仍未统一定义

当前文档列出的待定分类包括：

- 召回缺失
- 排序错误
- 摘要幻觉
- 治理泄漏
- 内容过时

## 3. 为推进节奏保留的结构性妥协

### 读侧仍允许阶段性例外

归档报告中已点名的几处妥协目前仍然有效：

- `docs/architecture/SERVICE_BOUNDARIES.md` 允许 temporary direct-backed projections
- `docs/architecture/DATABASE_OWNERSHIP.md` 允许 Phase 1/2 的临时直读例外
- `docs/architecture/RECOMPOSITION_SUMMARY.md` 承认 distributed 组件仍有 seams/stubs

这些都说明：

- 边界和命名已经更清晰
- 但读写彻底分离、distributed 侧完全硬化，还没有全部做完

### 深度细节被有意 deferred

`docs/todos/backend-engineering-optimization-plan.md` 还明确写了两类 closeout 方式：

- `capacityModel.databasePool.maxConnections` 被关闭为 deferred detail
- 热点 `team/query/artifact` drill-down 被关闭为 non-default deep drill-down

这不是 bug，而是范围控制后的有意妥协：先保证 operator surface 的主 contract，暂不把更深的驱动内部状态和热点细节提升为默认 truth surface。

## 4. 仍保留的显式开发退路

### `packages/web-panel/src/services/admin-panel-service-context.ts`

当前 web panel 默认走真实 API，但仍保留：

- `VITE_ADMIN_PANEL_API_MODE=mock` 的 mock 分支

这不是“默认假实现”，但仍然是明确保留的开发/演示退路。只要这个分支存在，就表示前端链路还允许绕开真实后端来推进局部开发。

## 5. 当前判断

按影响面排序，最值得优先继续收口的是：

1. `host-local` 的 worker / outbox 真实化
2. 高频异步任务迁移到持久化任务队列
3. badcase 分类标准统一
4. 读侧 temporary direct-backed / projection exception 继续压缩
5. 前端 mock 退路只保留在更明确的测试或开发场景

## 6. 证据入口

- [`packages/host-local/src/bootstrap/stubs.ts`](../../packages/host-local/src/bootstrap/stubs.ts)
- [`packages/host-local/src/runtime/worker.ts`](../../packages/host-local/src/runtime/worker.ts)
- [`packages/host-local/src/runtime/outbox.ts`](../../packages/host-local/src/runtime/outbox.ts)
- [`packages/web-panel/src/services/admin-panel-service-context.ts`](../../packages/web-panel/src/services/admin-panel-service-context.ts)
- [`docs/todos/backend-engineering-optimization-plan.md`](./backend-engineering-optimization-plan.md)
- [`docs/todos/badcase-feedback-loop.md`](./badcase-feedback-loop.md)
- [`docs/archived/reports/DEBT_AND_PLACEHOLDER_REPORT.md`](../archived/reports/DEBT_AND_PLACEHOLDER_REPORT.md)
