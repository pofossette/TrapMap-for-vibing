# TrapMap 耦合度降低计划

> **给 agentic workers：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，按任务逐步执行。步骤使用 checkbox（`- [ ]`）跟踪。

**目标：** 降低 TrapMap 内部的服务和模块耦合，让 Stage 1 和 Stage 2 能落在稳定 seam 上，而不是不断搬移隐藏依赖。

**架构：** 把耦合度降低视为现有单体中的横切工程程序。优先收紧 route-to-service、service-to-repo、runtime/bootstrap 和 derived-read 的边界，不要因为想“更像微服务”就提前拆部署单元。

**技术栈：** TypeScript、Fastify、Zod、Vitest、PostgreSQL、Drizzle、repository 层、runtime/bootstrap 模块、queue/outbox worker。

---

## 当前基线

- 仓库已经偏向 `packages/server/src/lib/` 这种领域化子目录。
- `repos.*` 是默认的业务路径访问边界，但仍存在兼容和编排债务。
- 启动和运行时 ownership 已经集中，但业务代码仍可能间接依赖 bootstrap 时代的假设。
- 检索和 operator 读侧更偏派生，但有些组装逻辑仍然会回伸到 legacy 或混合 ownership 路径。

## 耦合目标

- route 与 application service 的耦合
- application service 与 repository / compatibility store 的耦合
- domain workflow 与 runtime/bootstrap 的耦合
- retrieval/read-model 与 compatibility state 的耦合
- 跨 context 对共享可变状态的 reach-through

## 当前执行映射

- 工作流 A、B 的首个落点：
  - [`./stage-1-review-and-decay-write-path-convergence.md`](./stage-1-review-and-decay-write-path-convergence.md)
- 工作流 B、D 的首个落点：
  - [`./stage-1-operations-read-model-and-compat-boundary.md`](./stage-1-operations-read-model-and-compat-boundary.md)
  - 当前 operator seam：`lib/operations/read-model.ts` 统一承接 compatibility status、artifact display lookup、audit actor lookup 和 artifact export payload hydration
- 工作流 C、D 的首个落点：
  - [`./stage-2-async-runtime-contracts-and-projection-ownership.md`](./stage-2-async-runtime-contracts-and-projection-ownership.md)

使用规则：

- 新发现的耦合热点，先判断是否能落入这三个执行包之一。
- 只有当热点明显超出当前三个执行包边界时，才新增新的子计划文件。

## 工作流 A：Route 与 Application 边界

- [x] 让 route 只负责请求校验、鉴权、actor 解析和响应映射。
- [x] 当 route 里已经在串多步持久化或生命周期操作时，把编排移到 application service。
- [x] 统一命令型 service 接口，避免 route 了解内部持久化细节。
- [x] 不要把 runtime/bootstrap 工具引入 route 或 application 代码，除非它确实属于基础设施且是显式依赖。

**完成标准**

- route 文件不再充当编排中心。
- application service 形成稳定 seam，后续 worker 或 CLI 流程也可以复用。

## 工作流 B：Repository 与兼容层隔离

- [x] 让 repository 成为业务逻辑获取 current aggregate state 的唯一默认来源。
- [x] 把兼容存储使用收进显式 adapter、迁移 helper 或文档化例外里。
- [x] 增补 repository 能力，而不是让 application code 因为省事就回退到 `store.snapshot()`。
- [x] 对 operator/diagnostic 读侧，把 compatibility snapshot 限制在命名的 projection exception，而不是 route-local query assembly。
- [x] 把 transaction 归属保持在 authoritative write repository 和 outbox/queue 注册点附近。

**完成标准**

- 兼容读取被隔离并被命名。
- 业务模块可以在不知道 snapshot 存储细节的情况下继续演进。

## 工作流 C：Runtime 与 Bootstrap 解耦

- [x] 让 startup sequence、worker ownership 和 lifecycle bootstrap 保持在 runtime 模块，不进入 domain 模块。
- [x] 防止 domain/application 逻辑依赖进程是 `api`、`task-worker`、`outbox-worker` 还是 `combined`。
- [x] 把 runtime mode 视为基础设施策略，而不是业务行为。
- [x] 让 shared jobs 和 outbox subscriber 依赖显式合约，而不是隐式 app-wide mutable state。

**完成标准**

- 业务行为不因 runtime mode 而变化。
- runtime ownership 变化不会反过来逼业务模块重构。

## 工作流 D：检索与派生读隔离

- [x] 保持 retrieval read model、cache、graph query adapter 和 operator projection 为派生消费者，并明确它们的 source input。
- [x] 移除那种既重建 truth 又在 route 中临时施加派生策略的混合 ownership。
- [x] 让 badcase、remediation 和 operator inspection 流程都落在明确的派生模型上，而不是隐藏的 route-local snapshot。
- [x] 把 read-model freshness 和 invalidation 视为显式合约，而不是偶然行为。

**完成标准**

- retrieval 和 operator 代码可以作为纯读侧模块被理解。
- 派生策略不会反向污染写模型事实源。

## 暂不做

- [ ] 不要把 Kafka、RabbitMQ 或 NATS 当成耦合问题的快捷修复。
- [ ] 不要先把 auth / team / identity 拆成独立服务。
- [ ] 不要在内部 seam 尚未稳定前就把 `packages/server` 拆成很多包。
- [ ] 不要为了模仿微服务而把本来边界清楚的 in-process 抽象换成网络调用。

## 验证与收尾

- [x] 对每个被改动的边界跑聚焦测试。
- [x] 跑 `pnpm test -- --run packages/server/src/__tests__/snapshot-usage-guard.test.ts packages/server/src/bootstrap/startup.test.ts`。
- [x] 跑 `pnpm typecheck`。
- [x] 跑 `pnpm check:structure`。
- [x] 当耦合热点被解决或重划范围后，更新 Stage 1 和 Stage 2。

**完成标准**

- 耦合度下降可以从模块 ownership 上看出来，而不只是写在文档里。
- Stage 1 和 Stage 2 可以继续推进，而不会重复打开同一个边界争议。

## 关键参考

- `packages/server/src/lib/repos/index.ts`
- `packages/server/src/lib/actors/lookup.ts`
- `packages/server/src/bootstrap/run-startup-sequence.ts`
- `packages/server/src/bootstrap/run-worker-sequence.ts`
- `packages/server/src/lib/cache/invalidation.ts`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
