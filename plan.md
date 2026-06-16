# TrapMap 后端工程化总规约

> 根 `plan.md` 现在是后端工程化总索引。详细计划见 `docs/plans/backend-engineering-roadmap/`。

**目标：** 将 TrapMap 演进为低耦合、以 PostgreSQL 为主的模块化单体，并为独立 worker、读写分离以及后续服务拆分预留清晰边界。

**架构：** 继续复用现有 `repos` 边界、应用服务、`task_queue`、`domain_event_outbox`、运行时模式、workflow run 和检索读模型。先做边界收敛和异步/运行时规范，再做读侧分离和可观测性，MQ 与微服务放在有指标支撑之后。

**技术栈：** TypeScript、Fastify、Zod、Vitest、PostgreSQL、Drizzle、现有 repository 层、queue/outbox worker、检索缓存/读模型。

---

## 为什么要做这版计划

TrapMap 现在已经具备后端工程化的基础：

- 核心域已经是 PostgreSQL 优先写入
- 已经有 durable queue 和 outbox
- 已经有独立 worker 入口和运行时模式
- 已经形成应用服务和 repository 的雏形
- 已经有 workflow 和 operator 可观测面

当前主要瓶颈不是“缺少分布式组件”，而是：

- 路由、store、repo、lifecycle 在少数热路径里仍然耦合
- 部分业务流程还依赖兼容存储
- 读侧刷新和缓存失效还没有完全标准化
- 服务边界还不够稳定，不适合过早拆服务

## 约束原则

- [ ] Stage 1 和 Stage 2 期间保持模块化单体。
- [ ] 默认只通过 `repos` 和 application service 走业务路径。
- [ ] 重活、可重试工作交给 durable worker，不放在请求链路里。
- [ ] 写模型与检索/Operator 读模型分开。
- [ ] 先收敛耦合，再考虑部署拆分。
- [ ] MQ 和微服务只作为有指标支撑后的后续选项。

## 路线索引

### Stage 1：基础与边界

目标：硬化 bounded context、瘦化路由、扩大应用服务职责，并减少业务路径对兼容存储的依赖。

计划：
- [`./docs/plans/backend-engineering-roadmap/stage-1-foundation-and-boundaries.md`](./docs/plans/backend-engineering-roadmap/stage-1-foundation-and-boundaries.md)

下一步执行包：
- 第一优先级：[`./docs/plans/backend-engineering-roadmap/stage-1-review-and-decay-write-path-convergence.md`](./docs/plans/backend-engineering-roadmap/stage-1-review-and-decay-write-path-convergence.md)
- 第二优先级：[`./docs/plans/backend-engineering-roadmap/stage-1-operations-read-model-and-compat-boundary.md`](./docs/plans/backend-engineering-roadmap/stage-1-operations-read-model-and-compat-boundary.md)

Stage 1 读侧 ownership 补充：
- operator status、feedback admin、artifact export、audit inspection、badcase/remediation inspection 属于派生读侧，不是写事实源 owner。
- 这类读路径默认通过 repository + 显式 projection/helper 组装；compatibility snapshot 只允许作为命名过的 projection exception 或 diagnostic/admin mutation 边界存在。

状态：
- [x] 已完成
- [x] Stage 1A：bounded context、route/application/repository 规则已冻结到架构文档与 truth source
- [x] Stage 1B：`review` / `decay` 写密集 route 已收口到 application service seam
- [x] Stage 1C：operator 读侧与 compatibility seam 已收口到显式 projection/helper 边界

### Stage 2：异步运行时与读写分离

目标：强化异步执行、workflow 可见性、投影归属和 worker/API 运行时分离，但不拆成过多服务。

计划：
- [`./docs/plans/backend-engineering-roadmap/stage-2-async-and-read-write-separation.md`](./docs/plans/backend-engineering-roadmap/stage-2-async-and-read-write-separation.md)

下一步执行包：
- [`./docs/plans/backend-engineering-roadmap/stage-2-async-runtime-contracts-and-projection-ownership.md`](./docs/plans/backend-engineering-roadmap/stage-2-async-runtime-contracts-and-projection-ownership.md)

状态：
- [x] 已完成

### 横切：耦合度降低

目标：降低 route-to-domain、domain-to-runtime、read-model-to-compatibility 的耦合，让 Stage 1 和 Stage 2 能稳定落地。

计划：
- [`./docs/plans/backend-engineering-roadmap/coupling-reduction-plan.md`](./docs/plans/backend-engineering-roadmap/coupling-reduction-plan.md)

当前落点：
- 写路径收口：`stage-1-review-and-decay-write-path-convergence.md`
- 读侧与兼容层隔离：`stage-1-operations-read-model-and-compat-boundary.md`
- async/runtime 合约标准化：`stage-2-async-runtime-contracts-and-projection-ownership.md`

状态：
- [ ] 未开始

## 决策门槛

- PostgreSQL queue/outbox 只要 backlog、重试和 dead-letter 仍可运维，就继续使用。
- 在写路径边界、读模型归属和 async 合约稳定之前，不拆服务。
- 只有当某类异步负载确实需要独立 consumer group、强回放或更高吞吐时，才考虑 Kafka、RabbitMQ 或 NATS。

## 参考

- 事实源映射：[`docs/reference/SYSTEM_TRUTH_SOURCES.md`](./docs/reference/SYSTEM_TRUTH_SOURCES.md)
- 数据与迁移状态：[`docs/reference/DATA_MODEL.md`](./docs/reference/DATA_MODEL.md)
- 包职责：[`docs/PACKAGES.md`](./docs/PACKAGES.md)
- 后端优化背景：[`docs/todos/backend-engineering-optimization-plan.md`](./docs/todos/backend-engineering-optimization-plan.md)

## 归档说明

旧的根执行计划已归档到：

- [`docs/archived/archived-plans/plan-2026-06-16-async-reliability-and-workflow-runtime-archived.md`](./docs/archived/archived-plans/plan-2026-06-16-async-reliability-and-workflow-runtime-archived.md)
