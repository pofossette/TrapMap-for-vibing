# TrapMap 后端工程化 Stage 1 计划

> **给 agentic workers：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，按任务逐步执行。步骤使用 checkbox（`- [ ]`）跟踪。

**目标：** 硬化 TrapMap 的模块化单体边界，让业务写入稳定地经过 domain / application / repository 三层，不再持续增加新的耦合债务。

**架构：** 保持现有 Fastify + `repos` + PostgreSQL 结构，但把它收紧为 bounded context、瘦路由、更明确的应用服务职责、更窄的 runtime/bootstrap 责任，以及明确的兼容层清理路径。

**技术栈：** TypeScript、Fastify、Zod、Vitest、PostgreSQL、Drizzle、repository 层、现有 bootstrap/runtime 模式。

---

## 当前基线

- `packages/server` 已经有 `knowledge`、`feedback`、`duplicates`、`lineage`、`teams`、`users` 等领域子目录。
- 核心写路径已经优先使用 `app.skillShareer.repos`，并且这条规则已经写进 `docs/reference/SYSTEM_TRUTH_SOURCES.md`。
- `knowledge` 和 `traps` 已经共享一个 application service，说明这个模式是可行的。
- 启动序列已经集中在 `bootstrap/run-startup-sequence.ts`，适合作为隔离 bootstrap 责任的基础。
- 现有债务主要集中在兼容层读、跨模块 reach-through，以及仍然混合 route / application / persistence 的热路径。

## 包含内容

- 为当前 server 域明确 bounded context。
- 扩大那些仍在 route 或兼容 helper 里编排的写流程的 application-service 归属。
- 将 route 的职责统一为校验、鉴权、actor 解析和转发。
- 减少业务路径对 `store.snapshot()` 和 `store.transact()` 的依赖。
- 明确 domain / application / repository / runtime-bootstrap / worker 各层职责。

## 不包含内容

- 不引入外部 MQ。
- 不拆成独立部署服务。
- 不做 `packages/server` 之外的大规模包重组。
- 不在这一阶段重做检索算法或 artifact 语义。

## 执行顺序

本阶段先按两个执行包推进，避免继续把细节堆回单一 Stage 文件：

1. [`./stage-1-review-and-decay-write-path-convergence.md`](./stage-1-review-and-decay-write-path-convergence.md)
2. [`./stage-1-operations-read-model-and-compat-boundary.md`](./stage-1-operations-read-model-and-compat-boundary.md)

顺序约束：

- 先收口 `review` / `decay` 写路径，再处理 operator / diagnostic 读侧。
- 如果某个 repository 能力缺口同时影响两个执行包，优先在执行包 A 中补齐基础能力，再在执行包 B 中复用。

## 目标 Bounded Context

- `身份与访问`
  - auth、session、access key、team、membership、user
- `知识治理`
  - knowledge、traps、review、decay、evidence、knowledge 生命周期相关维护规则
- `工件生命周期`
  - artifact 导入/导出、激活、生命周期、profile、capsule、manifest
- `候选摄取`
  - candidates、duplicates、lineage、pre-review、异步 candidate 处理
- `检索读侧`
  - retrieval read model、capsule recall、graph query adapter、retrieval cache
- `反馈与修复`
  - feedback、remediation、badcase 持久化、reactivation hook
- `运维与运行时`
  - operator 端点、stats、migration/admin 流程、runtime/status

## Stage 1A：冻结边界规则

- [x] 更新架构相关文档，明确以上七个 bounded context 是当前 server 的工作切分模型。
- [x] 说明 route 只是 transport adapter，不能自己承担多步业务编排。
- [x] 说明 repository 是业务路径的默认持久化入口，兼容 store 只算债务，不是并行一等公民路径。
- [x] 记录仍然需要兼容存储的已知例外，确保它们被显式跟踪。

**完成标准**

- 上述 context 名称在 `plan.md`、本文件和被改动的包/参考文档中保持一致。
- 新工作可以无歧义地归类到某个 context。
- 仓库中有明确规则定义什么算可接受的兼容层使用。

## Stage 1B：扩大应用服务职责

- [x] 盘点那些仍把 transport 和编排混在一起的写密集 route。
- [x] 把多步写流程迁移到 application service，尤其是 route 里直接协调持久化、生命周期变化或后续 side effect 的地方。
- [x] 统一 application-service 入参：actor 身份、目标聚合、命令 payload、boundary/security 上下文。
- [x] 确保 route 在校验和鉴权后只做 delegate，不再内联拼装持久化逻辑。

**完成标准**

- 每个主要写流程都有明确的 application-service 入口，或者有清晰理由说明为何仍然直接处理。
- route 文件保持瘦，不再演化成编排中心。
- 业务不变量可以不依赖 HTTP 细节被强制执行。

## Stage 1C：收紧 repository 与兼容层边界

- [x] 移除或隔离那些本该通过 `repos.*` 访问、却仍依赖 `store.snapshot()` 的业务路径读取。
- [ ] 收敛 application-level business workflow 中仍在使用的 `store.transact()`，让 repo-backed transaction 成为主路径。
- [x] 兼容访问只保留在明确允许的类别里：bootstrap、migration/backfill、repository 内部、受控 admin/diagnostic 流程，以及已记录的迁移债务。
- [x] 记录那些迫使调用方回退到兼容数据访问的 repository 能力缺口。

当前收口状态：

- `lib/knowledge/review-application-service.ts` 已移除聚合读取上的 snapshot 回退，review 写流程先通过 `repos.knowledge` 读取当前状态。
- `lib/knowledge/review-application-service.ts` 仍保留局部 `store.transact()`，仅用于 legacy audit 兼容写入；knowledge shadow persist 已下沉到 `repos.knowledge.save()`.
- `lib/decay/application-service.ts` 已移除 current aggregate state 上的 snapshot 依赖；`supersede` 仍保留命名化 `store.transact()` 迁移债务。
- `lib/operations/read-model.ts` 已成为 Stage 1 operator 读侧 seam：`operations/status`、`feedback-admin`、`operations/audit` 默认经由 repo/read helper 读取；剩余 snapshot 仅限 artifact revision payload hydration 这一项 projection exception。

**完成标准**

- 默认情况下，没有新的 route 或 application-service 逻辑从兼容 snapshot 读取聚合状态。
- 剩余例外都被命名、局部化并说明原因。
- repository 边界足够可信，可以支撑后续读写分离。

## Stage 1D：按层级明确 ownership

- [x] 用当前 server 结构定义 `domain`、`application`、`infrastructure`、`interfaces/http`、`interfaces/worker` 的职责。
- [x] 先在耦合最重的上下文里应用这个模型：knowledge、candidate ingestion、feedback/remediation、operations/runtime。
- [x] 让 runtime/bootstrap 责任留在基础设施层，不进入 domain/application 模块。
- [x] 让 read-model 组装留在读侧，不进入写侧 application service，除非这种耦合是刻意且文档化的。

已在以下文档落地：

- `packages/server/README.md`
- `packages/server/src/lib/README.md`
- `packages/server/src/routes/README.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`

Stage 1 operator/read-side ownership 补充：

- operator status、feedback admin、artifact export、audit inspection、badcase/remediation inspection 都属于派生读侧消费者，不是 authoritative write owner。
- 这些流程可以读取 `知识治理`、`工件生命周期`、`反馈与修复` 的事实源并做展示拼装，但 projection 组装必须留在显式读侧 seam（例如 `lib/operations/read-model.ts`），不能回退成 route-local snapshot。
- 如果 operator 读侧仍需要 compatibility snapshot，必须以 projection exception 命名，并同时记录缺失的 repository capability。

**完成标准**

- 新增代码时不再需要猜测它应该放在 routes、lib、bootstrap 还是 compatibility helper。
- 业务模块不再依赖启动或进程 ownership 细节。
- 这些层级职责足够稳定，可以承接 Stage 2 的 worker/read-model 强化。

## 验证与收尾

- [x] 对被改动的 context 跑聚焦测试。
- [x] 跑 `rtk pnpm test -- --run packages/server/src/__tests__/snapshot-usage-guard.test.ts packages/server/src/bootstrap/startup.test.ts`。
- [x] 跑 `rtk pnpm typecheck`。
- [x] 跑 `rtk pnpm check:structure`。
- [x] 更新 `plan.md` 和本文件，标记 Stage 1 已完成的检查点。

已记录但未在本次收口中完成的读侧债务：

- `routes/review.ts` 的 review-queue 投影仍是 route-local query assembly，属于 `知识治理` 读侧债务。
- `routes/decay.ts` 的 entries/search 仍在 route 内完成筛选与投影，属于 `运维与运行时` 读侧债务。

**完成标准**

- 业务路径的持久化边界已经被文档化并落到实现。
- 主要写流程的 application-service 归属清晰。
- Stage 2 可以在不继承 route/store/repo 歧义的前提下继续推进。

## 关键参考

- `packages/server/src/bootstrap/run-startup-sequence.ts`
- `packages/server/src/lib/knowledge/application-service.ts`
- `packages/server/src/lib/repos/index.ts`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- `docs/reference/DATA_MODEL.md`
