# TrapMap 未完成项与阶段性妥协记录

> 记录范围：仓库中已经确认的占位实现、未接入业务流程的实现，以及为推进进度保留的明显折中方案。  
> 说明：这里写的是“现状”，不是计划；文档里的 Phase/TODO 仅作为证据，不代表它们已经完成。

## 1. 仍是占位实现

| 位置 | 现状 | 风险 |
|---|---|---|
| `packages/host-local/src/runtime/worker.ts` | 任务 worker 仍是 `@stub`，只保留运行态壳，未做真实轮询、处理、drain、retry。 | 本地/单体形态下的异步任务能力不完整，容易让“已支持 worker”产生误解。 |
| `packages/host-local/src/runtime/outbox.ts` | outbox dispatcher 仍是 `@stub`，只保留生命周期接口，未做完整事件消费链路。 | 事件出队、失败重试、死信处理都不是真实业务流。 |
| `packages/host-local/src/bootstrap/stubs.ts` | 大量 `createStub*` 端口实现返回空值、空数组或 no-op。 | 启动可用，但很多能力只是 scaffold，不是生产路径。 |

## 2. 已实现但仍未真正接入业务闭环

| 位置 | 现状 | 风险 |
|---|---|---|
| `packages/web-panel/src/services/admin-panel-service-context.ts` | 开发环境和 SSR 默认切到 `createMockAdminPanelApi()`。 | 前端页面可跑，但默认不走真实后端链路，容易掩盖集成问题。 |
| `packages/service-knowledge-read/src/deps.ts` | `knowledge-entry:getById`、`listMine`、`maintenance-entries` 仍标为 `temporary-direct-backed-*`。 | 读侧还依赖共享 authoritative 表，不是独立派生读模型。 |
| `packages/service-knowledge-read/src/routes.ts` | 路由已经接上服务模块，但服务模块本身仍是 direct-backed projection。 | “有接口”不等于“业务流程已完成收口”。 |
| `packages/host-distributed/README.md` | 文档明确写出 read-side Phase 2 maturity 仍未完成。 | 分布式拆分的业务闭环还没完全独立化。 |

## 3. 为进度保留的明确妥协

| 位置 | 妥协内容 | 影响 |
|---|---|---|
| `docs/architecture/SERVICE_BOUNDARIES.md` | Phase 2 仍允许 temporary direct-backed projections。 | 边界清晰了，但读写彻底分离还没完成。 |
| `docs/architecture/DATABASE_OWNERSHIP.md` | 明确允许 Phase 1/2 的临时直读例外。 | 这是可控债务，但仍是债务。 |
| `docs/architecture/RECOMPOSITION_SUMMARY.md` | 明确承认 distributed 组件里仍有 seams/stubs。 | 说明拆分后的宿主还未完全生产硬化。 |
| `docs/plans/backend-engineering-masterplan/00-current-state-and-gap-baseline.md` | 仍列出 freshness、retry/resume、config governance、capacity modeling 等 gap。 | 表明这些不是误报，而是已识别未收口项。 |

## 4. 建议的清理顺序

1. 先把 `host-local` 的 `worker/outbox` 从 stub 变成真实任务循环，再去收口对应测试。
2. 再把 `service-knowledge-read` 的 temporary direct-backed projection 迁移为真正的派生读模型。
3. 最后移除前端和宿主里的 mock 默认路径，只保留显式测试/开发开关。

## 5. 备注

这份记录不是问题全量清单，只覆盖我这次已确认、且确实影响业务闭环或给人“已完成”错觉的部分。后续如果新增类似折中，建议继续追加到这里，而不是散落在计划文档里。
