# TrapMap Backend Engineering Master Plan - Phase 1 Boundaries And Compat Convergence

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converge route, application, repository, runtime, and compatibility boundaries so future backend work no longer depends on ambiguous ownership.

**Architecture:** Build on the Stage 1 roadmap and current server layering, but rewrite the work as one explicit convergence phase: thin routes, named application services, repo-first business persistence, and compatibility access isolated as tracked debt.

**Tech Stack:** TypeScript, Fastify, Zod, Vitest, PostgreSQL, Drizzle, repository ports, backend-core ports, lifecycle publisher seams.

---

## 目标

- 收敛 route / application / repository / runtime / compatibility 边界。
- 缩小 `store.snapshot()` 与 `store.transact()` 在业务主路径中的存在感。
- 为 Phase 2 的 async contract 和 failure semantics 清理前提。

## 当前事实

- `packages/server/src/routes/` 以薄路由为目标，但部分读写路径仍存在 route-near assembly 或兼容访问残留。
- `packages/server/src/lib/knowledge/application-service.ts`、`review-application-service.ts`、`decay/application-service.ts` 已经说明 application service 模式成立。
- `packages/server/src/lib/lifecycle/publisher.ts` 与 `emit-transition.ts` 已形成统一入口雏形。
- `packages/backend-core/src/use-cases/**` 和 `packages/backend-core/src/ports/**` 已存在，但与 server 主路径的承接关系仍需继续文档化和执行化。
- `packages/server/src/routes/README.md` 与 `packages/server/src/lib/README.md` 已把 route 仅做 transport delegate、`lib/` 内部按 `domain` / `application` / `infrastructure` 分层的规则写成显式边界说明。
- `packages/server/src/__tests__/snapshot-usage-guard.test.ts` 已把 `store.snapshot()` / `store.transact()` 的允许类别编码成守卫测试；当前剩余 compat seam 已被收口为命名 allowlist，而不是默认可扩散路径。
- `packages/host-local/src/http/gateway.ts` 已明确声明 host-local 的 HTTP gateway 只是把请求映射到 `backend-core` port；`packages/host-distributed/src/shared/ports.ts` 已明确 distributed host 通过 concrete port wiring 连接 `backend-core` 与 PostgreSQL。
- `packages/backend-core/src/use-cases/command-handling.ts` 已冻结“command use-case + port”模式，说明 `backend-core` 当前是收敛目标的内核层，而不是另一套与 `packages/server` 并行竞争的业务真相源。

## 范围

- `packages/server/src/routes/**`
- `packages/server/src/lib/knowledge/application-service.ts`
- `packages/server/src/lib/knowledge/review-application-service.ts`
- `packages/server/src/lib/decay/application-service.ts`
- `packages/server/src/lib/lifecycle/publisher.ts`
- `packages/server/src/lib/lifecycle/emit-transition.ts`
- `packages/server/src/lib/operations/read-model.ts`
- `packages/backend-core/src/use-cases/**`
- `packages/backend-core/src/ports/**`

## 主要修改文件

- `packages/server/src/routes/review.ts`
- `packages/server/src/routes/decay.ts`
- `packages/server/src/routes/knowledge.ts`
- `packages/server/src/routes/traps.ts`
- `packages/server/src/lib/knowledge/application-service.ts`
- `packages/server/src/lib/knowledge/review-application-service.ts`
- `packages/server/src/lib/decay/application-service.ts`
- `packages/server/src/lib/lifecycle/publisher.ts`
- `packages/server/src/lib/lifecycle/emit-transition.ts`
- `docs/architecture/ARCHITECTURE.md`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`

## 要做的变更

- [x] 明确哪些 route 仍可保留 read-side projection assembly，哪些必须进一步下沉到显式 read-model seam。
  当前事实：`routes/review.ts`、`routes/decay.ts`、`routes/operations/status.ts`、`routes/operations/audit.ts` 的 read-side assembly 规则已通过 `lib/operations/read-model.ts` 等显式 seam 命名；`routes/README.md` 已明确 route 不拥有 write-side workflow 的 read-model assembly。
  要做的变更：把这条规则回写到 Phase 1 文档、架构文档和 truth-source 文档，确保执行者不再从 route 细节推断。
- [x] 统一多步写路径的 application-service 入口，输入至少包含 actor、payload、team/security context、target aggregate。
  当前事实：`knowledge` / `traps` 共用 `lib/knowledge/application-service.ts`，`review` 与 `decay` 也已有命名 application service；Stage 1 历史结论已确认这些服务按 actor、payload、aggregate 与 boundary context 收口。
  要做的变更：把“已成立的 application-service seam”写成 Phase 1 的完成事实，而不是继续描述为待设计项。
- [x] 让 lifecycle transition publish 的入口保持唯一，不再新增 route-local 或 service-local 变体。
  当前事实：`lib/lifecycle/publisher.ts` + `emit-transition.ts` 已是统一入口，Phase 1 本轮只把这条 ownership 固化到文档事实源。
- [x] 记录剩余 compatibility debt，并把允许使用兼容层的类别限定为：
  - bootstrap
  - migration / backfill
  - repository internals
  - 受控 admin / diagnostic 流程
  - 已命名的迁移债务
  当前事实：`snapshot-usage-guard.test.ts` 已将 allowlist 收敛到 repository internals、bootstrap、migration/backfill、lifecycle subscribers、candidate processing、diagnostic/admin、projection exceptions 和已命名 compatibility debt。
  Non-goal：本阶段不继续缩减 allowlist 范围到 Phase 2 议题，例如 freshness/failure 语义。
- [x] 在计划中把 `backend-core` / `host-*` 明确标记为后续收敛目标，而非平行实现面。
  当前事实：`backend-core` 已定义 command/use-case/port 模式，`host-local` / `host-distributed` 已承担宿主装配和 concrete port wiring；但 `packages/server` 仍是当前权威实现、测试与兼容壳层。
  要做的变更：在计划与架构文档里明确它们的关系是“server 当前承载权威实现，backend-core/host-* 作为后续收敛承接面”，不是允许两套主路径自由生长。

## Non-Goals

- 不做按服务拆库。
- 不引入新的 RPC 或 broker。
- 不把 CLI 改成多服务直连。
- 不重做 retrieval 算法和 artifact 语义。

## 文档更新

- [x] 更新 `docs/architecture/ARCHITECTURE.md` 的层级 ownership 叙述。
- [x] 更新 `docs/reference/SYSTEM_TRUTH_SOURCES.md` 中关于 route、application service、repo 和 compat seam 的规则。
- [x] 确认 `packages/server/src/routes/README.md` 与 `packages/server/src/lib/README.md` 已覆盖本阶段边界说明，无需额外补文件。

## 测试 / Eval 更新

- [x] 维护以下边界守卫测试的文档事实映射：
  - `packages/server/src/__tests__/service-boundary-guard.test.ts`
  - `packages/server/src/__tests__/routes-architecture-guard.test.ts`
  - `packages/server/src/__tests__/snapshot-usage-guard.test.ts`
- [x] 保持关键回归测试入口记录：
  - `packages/server/src/routes/review.test.ts`
  - `packages/server/src/routes/decay.test.ts`
  - `packages/server/src/routes/knowledge.test.ts`
  - `packages/server/src/routes/traps.test.ts`

当前事实：

- 本轮 Phase 1 只做边界与兼容收敛文档回写，不新增或重写测试。
- `snapshot-usage-guard.test.ts` 已是当前 compat seam allowlist 的最直接自动化守卫。

Non-goals：

- 本轮不扩展 Phase 2 的 freshness、retry、resume 或 failure semantics 测试。

## 必要示例

### Route 收敛示例

- 当前事实：route 里直接协调 repo、lifecycle publish、operator projection helper。
- 要做变更：route 仅负责 parse/auth/delegate；application service 负责 authoritative write 与 side effect 触发。
- non-goal：不要求把所有 read-side mapping 都塞进同一个 service。

### Lifecycle 统一入口示例

- 当前事实：`publisher.ts` + `emit-transition.ts` 已存在。
- 要做变更：新增写路径必须走这条 seam，不得在 route 或 adhoc helper 里直接写 outbox registration。

## 完成标准

- 主要写路径的 ownership 不再依赖执行者自己阅读 route 细节来推断。
- compatibility debt 已被命名和局部化，不再作为默认路径扩散。
- 后续 Phase 2 可以在明确边界上统一 async/failure contracts。

## Assumptions / Open Questions

- assumption：现有 Stage 1 文件中的已完成内容仍然有效，本阶段主要任务是把它们纳入新的总控轨道，而不是推翻重写。
- open question：哪些 operator 读侧仍然必须临时依赖 projection exception，需要在执行时按 repo 能力缺口逐项确认。

## 本阶段结论

当前事实：

- Phase 0 冻结的 gap matrix 中，属于 Phase 1 的边界与 compat 收敛项已经在当前仓库中形成可引用事实：thin routes、命名 application services、repo-first 业务持久化、唯一 lifecycle publish seam、显式 compat allowlist、以及 `backend-core` / `host-*` 的承接角色。
- `packages/server` 仍是当前权威实现、测试与兼容壳层；`backend-core` / `host-*` 是后续收敛与装配目标，不是本阶段允许继续平行扩张的第二主实现面。

要做的变更：

- 本阶段通过回写 `plan.md`、本文件、`docs/architecture/ARCHITECTURE.md`、`docs/reference/SYSTEM_TRUTH_SOURCES.md` 和索引文档，把这些已成立事实冻结为 Phase 1 的正式完成状态。

Non-Goals：

- 本阶段不启动 Phase 2 的 async runtime、freshness、retry、resume、failure semantics 设计。
- 本阶段不新增服务拆分、RPC、broker 或新的部署面。

Assumptions / Open Questions：

- assumption：Stage 1 历史执行中已落地的 route/application/repo 收敛代码仍然有效，本轮只做总控轨道回写。
- open question：`lib/operations/read-model.ts` 中 artifact revision payload hydration 这类 projection exception 仍是受控 compat seam，但 Phase 2 之前是否还有其他 operator 读侧 repo 能力缺口，需要在后续执行时逐项核实。
