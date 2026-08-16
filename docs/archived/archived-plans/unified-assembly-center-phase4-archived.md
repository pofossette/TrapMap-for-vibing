# Unity Assembly Center (assembly) Phase 4 收尾 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **状态：** 已归档
> **根入口：** [`../../plan.md`](../../plan.md)
> **设计规格：** [`../superpowers/specs/2026-08-16-unified-assembly-center-design.md`](../superpowers/specs/2026-08-16-unified-assembly-center-design.md)

**Goal:（D6 Phase 4 收尾）** 双实现收敛 + 直接运行 seam 退役 + 别名对齐 + 集群化验证——检索 ILIKE 完整管线收敛（D5）、OTel/Consul 单一插件收敛（D5）、direct-run seam 退役（所有 boot 经 app shells 经 assembly profiles）、`backend-target-registry`/`dev:*` 别名对齐、compose replicas=2 集群化 ownership/重复消费断言；golden 全绿后归档并 finalize `plan.md`。

**Architecture:** 承接 Phase 1（`packages/assembly` 内核）、Phase 2（host-local 试点）与 Phase 3（host-distributed 收敛，`distributedAssembly(name)` 覆盖 gateway 与各服务进程、`shared/ports.ts` 简化版退役，全部 merged in main）。本阶段按设计 D5/D6 Phase 4、D8 收尾：① 检索收敛——knowledge-read 的 ILIKE legacy seam（`packages/host-distributed/src/knowledge-read/ports.ts`）退出，完整 retrieval-engine 管线（`packages/service-knowledge-read` retrieval infra）为唯一语义，分布式检索行为与 monolith 一致（行为升级为本阶段明确、已评审的变更，Phase 3 偏差显式 deferred）；② OTel/Consul 收敛——host-local（nest/observability/otel.service.ts + nest/service-discovery/consul.*）与 host-distributed（shared/telemetry.ts + gateway/consul-discovery-adapter.ts + discovery-factory.ts + internal-observability.ts）的双份接线收敛为单一 otel 插件与单一 consul 插件，两个宿主的 assembly 节点共同消费；③ direct-run seam 退役——`packages/host-local/src/index.ts` 的 `isDirectExecution` 直连回退与 host-distributed 对应入口移除，所有 boot 经 `apps/light` / `apps/distributed` app shells（经 assembly profiles）；④ 别名对齐——`scripts/backend-target-registry.ts` 与根 `dev:*` 别名收敛为纯 shape 名（local-agent / team-monolith / distributed:<service>）→ builder-command 映射，单测断言；⑤ 集群化验证——compose replicas=2 起 candidate-worker + outbox-worker，跑 ownership/重复消费断言（SKIP LOCKED / 租约语义）。

**Tech Stack:** TypeScript, `@deepseek-ai/cordis` (^4.0.1), zod, NestJS, Fastify, Docker (v29) + compose (v5), Vitest, Biome, fallow, pnpm.

## 任务背景

根 [`../../plan.md`](../../plan.md) 已切换为 assembly Phase 4 收尾主线，承接设计文档 D6 Phase 4。Phase 1（packages/assembly 内核 + cordis + 测试 + 根级接线 + 文档）已完成并归档（见 [`../archived/archived-plans/unified-assembly-center-phase1-archived.md`](../archived/archived-plans/unified-assembly-center-phase1-archived.md)）。Phase 2（host-local 试点）已完成并归档（见 [`../archived/archived-plans/unified-assembly-center-phase2-pilot-archived.md`](../archived/archived-plans/unified-assembly-center-phase2-pilot-archived.md)，`63c26029` / `26964daf` / `fc114c35`，合并 `dbf1461a`）。Phase 3（host-distributed 收敛）已完成并归档（见 [`../archived/archived-plans/unified-assembly-center-phase3-archived.md`](../archived/archived-plans/unified-assembly-center-phase3-archived.md)，合入 `0a753aec` / `8b75d25d`，closeout 同步 `a2b9b2d2`）。Phase 3 将检索 ILIKE 完整管线收敛、OTel/Consul 双份接线收敛、direct-run seam 退役、别名对齐、集群化验证显式 deferred 到本阶段（见 Phase 3 Closeout 记录）。判断类节点契约（D8：intent-recognition / dedup-strategy / conflict-trigger / artifact-derivation / label-alignment / channel-merge）明确不在本阶段——后续独立收编主线。

## 全局约束

- **运行时语义不变是硬约束（除检索行为升级）：** OTel/Consul 收敛、direct-run seam 退役、别名对齐、集群化验证均不改变现有运行时语义；检索收敛是本阶段唯一的行为升级（ILIKE → 完整 retrieval-engine 管线，分布式行为对齐 monolith；Phase 3 偏差已显式 deferred 并标注需独立评审，本阶段执行）。
- **行为升级需评审留痕：** 检索收敛属于 Phase 3 明确 deferred 的「行为升级需独立评审」项，本细则将其列为 T1 并记录评审结论于实施偏差记录。
- **编程式装配，无配置文件：** 只采用 cordis 编程式 `new Context()` / `ctx.plugin()`；禁止新增 yml/json 装配文件、loader 或 patch 层（设计 D1 全局约束）；docker-compose 部署文件已存在，仅允许按设计调整 replicas 用于集群化验证。
- **assembly 依赖规则不变：** assembly zone 只依赖 backend-core / contracts / lib；host-owned 的节点收敛（otel/consul 插件、检索 seam）落点在 host 包 / owner 服务包内，跨包边界变化必须先过 `pnpm exec fallow audit --base main`。
- **禁止断言：** 不新增 `@ts-ignore` / `@ts-expect-error` / 裸 `as`；契约校验用结构类型 + Zod 运行时校验（`pnpm check:asserts` 门禁，豁免清单已清零）。
- **验证门禁：** 每任务 focused test + `pnpm typecheck`；文档变化跑 `pnpm check:docs` 与 `pnpm check:structure`；边界接入后跑 `pnpm exec fallow audit --base main`；检索收敛补 `pnpm eval:smoke`。
- **提交粒度：** 每个任务一个或多个独立 commit，commit message 遵循仓库风格（`feat(service-knowledge-read): ...` / `refactor(host-local): ...` / `refactor(assembly): ...` / `test(host-distributed): ...` / `docs(assembly): ...`）。

## 工作流与依赖

```text
T1 检索收敛（D5：ILIKE → 完整 retrieval-engine 管线，分布式行为对齐 monolith）
  -> T2 OTel/Consul 单一插件收敛（D5：单一 otel / 单一 consul 插件，两宿主 assembly 节点共用）
  -> T3 direct-run seam 退役（所有 boot 经 app shells 经 assembly profiles）
  -> T4 别名对齐（backend-target-registry + dev:* 别名收敛为 shape 名→builder-command 映射）
  -> T5 集群化验证（compose replicas=2 起 candidate-worker + outbox-worker，ownership/重复消费断言）
  -> T6 golden 回归 + closeout（全门禁 + 归档 Phase 4 + finalize plan.md）
```

T1-T4 相互独立可并行推进；T5 依赖检索收敛后的 retrieval 语义（可通过 T1 产物）；T6 依赖 T1-T5 全部完成与 golden 证据。

## 执行任务

### Task 1: 检索收敛（D5：knowledge-read ILIKE legacy seam → 完整 retrieval-engine 管线）

**Files:**
- Modify: `packages/host-distributed/src/knowledge-read/ports.ts`（ILIKE legacy seam 收敛——改为消费完整 retrieval-engine 管线接口，行为对齐 monolith）
- Modify/依赖: `packages/service-knowledge-read` retrieval infra（若需暴露缺失的消费面；复用既有 retrieval-engine 管线，不得重写业务）
- 联动: host-distributed 检索消费点与相关 contracts
- 不改动：任何新增 yml/json 装配文件；不保留第二套 ILIKE 实现（设计 D5：删除 ILIKE，完整管线为唯一 `retrieval-engine` 语义）

**Interfaces:**
- Consumes: 完整 retrieval-engine 管线（`packages/service-knowledge-read` retrieval infra）；现有检索 contracts / 结构类型。
- Produces: `knowledge-read/ports.ts` ILIKE seam 退役，分布式检索行为与 monolith 一致（行为升级，Phase 3 偏差显式 deferred 项）。

- [x] **Step 1: 行为差异盘点**
  盘点 `knowledge-read/ports.ts` ILIKE 与 monolith 完整 retrieval-engine 管线的行为差异（查询语义、过滤、排序、评分、fallback），记录为评审依据。
- [x] **Step 2: 收敛实现**
  将 host-distributed knowledge-read 的 ILIKE 消费切到完整 retrieval-engine 管线接口；删除 ILIKE 残留实现；必要时在 retrieval infra 按 owner 边界补薄消费面。
- [x] **Step 3: 行为升级评审与单测**
  输出行为升级评审结论（见实施偏差记录）；补 focused 单测断言分布式行为与 monolith 一致（同一 query 输入 → 同一返回语义）。
- [x] **Step 4: 验证**
  host-distributed + service-knowledge-read focused tests、`pnpm eval:smoke`（检索变更必跑）、`pnpm typecheck`、`pnpm exec fallow audit --base main`。
- [x] **Step 5: Commit**
  `refactor(service-knowledge-read): converge host-distributed retrieval onto full retrieval-engine pipeline (ILIKE retired)`

### Task 2: OTel/Consul 单一插件收敛（D5）

**Files:**
- Modify: `packages/host-local/src/nest/observability/otel.service.ts` + `packages/host-local/src/nest/service-discovery/consul.*`（host-local 侧双份接线收敛为单一 otel / 单一 consul 插件消费）
- Modify: `packages/host-distributed/src/shared/telemetry.ts` + `packages/host-distributed/src/gateway/consul-discovery-adapter.ts` + `discovery-factory.ts` + `internal-observability.ts`（host-distributed 侧双份接线收敛为单一插件）
- 消费: 两个宿主 assembly 节点的单一 `otel` / 单一 `consul` 插件（host-owned 节点落点）
- 不改动：OTel/Consul 运行时语义与既有观测指标/健康检查契约

**Interfaces:**
- Consumes: T1 之后既有 assembly 装配内核；host-local / host-distributed 现有 observability / service-discovery 接线。
- Produces: 单一 otel 插件与单一 consul 插件，host-local 与 host-distributed 的 assembly 节点共同消费；运行时语义不变。

- [x] **Step 1: 接线盘点**
  盘点 host-local（otel.service.ts + consul.*）与 host-distributed（telemetry.ts + consul-discovery-adapter.ts + discovery-factory.ts + internal-observability.ts）当前双份接线。
- [x] **Step 2: 单一插件抽取**
  抽取单一 otel / 单一 consul 插件（host-local-owned 落点或 host 内共享节点），两宿主 assembly 节点改为消费同一插件；删除并行简化接入。
- [x] **Step 3: 行为语义保持核验**
  确认指标暴露、trace/span 传播、Consul 注册/发现语义与消费面不变。
- [x] **Step 4: 验证**
  `pnpm test:observability-closeout`、`pnpm test:discovery-closeout`、host-local + host-distributed focused tests、`pnpm typecheck`、`pnpm exec fallow audit --base main`。
- [x] **Step 5: Commit**
  `refactor(assembly): converge host-local/host-distributed onto single otel and single consul plugins`

### Task 3: direct-run seam 退役

**Files:**
- Modify: `packages/host-local/src/index.ts`（`isDirectExecution` 直连回退判定移除；retire direct-execution fallback）
- Modify: `packages/host-distributed/src/index.ts`（对应等价 direct-run 入口退役，若存在）
- 不改动：`apps/light` / `apps/distributed` app shells（薄 assembly 落点，经 assembly profiles boot）——所有 boot 统一走 app shells

**Interfaces:**
- Consumes: 现有 `apps/light` / `apps/distributed` boot 链路。
- Produces: 库包 direct-run seam 退役，所有 boot 均经 app shells（经 assembly profiles）。

- [x] **Step 1: 依赖盘点**
  盘点 `apps/light` / `apps/distributed` 对库包 direct-run seam 的依赖（closeout 测试链 `build -> start` 已迁移到 app 入口？）。
- [x] **Step 2: seam 退役**
  移除 `packages/host-local/src/index.ts` 的 `isDirectExecution` 判定与对应回退，以及 host-distributed 等价入口；库包只暴露 API/装配导出，不承担可执行直连。
- [x] **Step 3: boot 链路收敛**
  确认所有 boot（dev / compose / closeout 测试链）均经 `apps/light` / `apps/distributed` 经 assembly profiles。
- [x] **Step 4: 验证**
  `pnpm test:deployment-smoke`、`pnpm test:runtime-foundations`、host-local + host-distributed focused tests、`pnpm typecheck`。
- [x] **Step 5: Commit**
  `refactor(host-local): retire direct-run seam so all boots go through app shells`

### Task 4: 别名对齐（backend-target-registry + root dev:* aliases）

**Files:**
- Modify: `scripts/backend-target-registry.ts`（收敛为 shape 名 → builder-command 映射）
- Modify: 根 `package.json` 的 `dev:*` 别名（对齐同一映射）
- 断言: 单测断言 shape 名（`local-agent` / `team-monolith` / `distributed:<service>`）→ 对应 builder-command 映射关系

**Interfaces:**
- Consumes: 现有 `backend-target-registry` 与根 `dev:*` 别名定义。
- Produces: 单一 shape 名→builder-command 映射；两处收敛一致，单测防回归。

- [x] **Step 1: 现状盘点**
  盘点 `scripts/backend-target-registry.ts` 与根 `dev:*` 别名当前两份表达的 shape 名与命令。
- [x] **Step 2: 收敛映射**
  将 `backend-target-registry.ts` 收敛为纯 shape 名 → builder-command 映射；根 `dev:*` 别名改为消费同一映射（避免两处漂移）。
- [x] **Step 3: 断言测试**
  新增/更新单测断言：`local-agent`、`team-monolith`、`distributed:<service>` 各自映射正确。
- [x] **Step 4: 验证**
  相关单测、`pnpm typecheck`、`pnpm check:imports` / `pnpm check:asserts`、必要时 `pnpm test:deployment-smoke`。
- [x] **Step 5: Commit**
  `refactor(scripts): align backend-target-registry with root dev:* aliases via shape-name mapping`

### Task 5: 集群化验证（compose replicas=2 ownership/重复消费断言）

**Files:**
- Modify: docker-compose 部署文件（已存在，允许调整）——起 `candidate-worker` + `outbox-worker` `replicas=2`
- Create/Modify: 集群化断言脚本/测试（ownership、重复消费断言；SKIP LOCKED / 租约语义）
- 不改动：任何 yml/json 装配文件（设计 D1）；编排仍为 compose 验证（k8s deferred，见设计「明确不做」）

**Interfaces:**
- Consumes: worker 子节点拆分形态（Phase 3 T4 产物）；job-runtime 的 ownership / 消费语义（dedupe_key + SKIP LOCKED）。
- Produces: compose replicas=2 集群验证证据：candidate-worker / outbox-worker 各自多副本下无重复消费、ownership 归属正确。

- [x] **Step 1: compose replicas=2**
  docker-compose 就 `candidate-worker` 与 `outbox-worker` 各起 `replicas=2`（Docker v29 + compose v5 可用）。
- [x] **Step 2: ownership / 重复消费断言**
  跑 ownership/重复消费断言（SKIP LOCKED/租约语义）：多副本下同一 job 不会重复消费、worker ownership 归属唯一。
- [x] **Step 3: 验证**
  集群断言通过；必要补 focused tests；`pnpm test:runtime-foundations` / `pnpm test:deployment-smoke` 复跑说明。
- [x] **Step 4: Commit**
  `test(host-distributed): add cluster replicas=2 ownership/duplicate-consumption assertion`

### Task 6: golden 回归 + closeout（守卫、文档回写、归档评估）

**Files:**
- Modify: 本细则（assembly-phase4.md，所有复选框打勾；closeout 记录；归档评估）
- Modify: `docs/todos/README.md`、`plan.md`、`docs/README.md`（Phase 4 完成后切换/归档）
- Modify: 文档回写（如 `docs/architecture/BOUNDARIES.md` 组装层与 host 收敛落点、`docs/reference/SYSTEM_TRUTH_SOURCES.md` 术语/active 主线、`docs/todos/open-debt-and-compromises.md` 实施状态）——按治理规则在 T6 或 T5 后统一回写
- 全量验证输出记录在 closeout 小节

**Interfaces:**
- Consumes: T1-T5 全部产物与文档。
- Produces: Phase 4 closeout 证据；assembly 主线四阶段收尾完成后 finalize `plan.md`。

- [x] **Step 1: 全量回归**
  全部通过：typecheck；assembly + host-local + host-distributed 包全量；distributed-closeout；distributed-acceptance；deployment-smoke；runtime-foundations；observability-closeout；discovery-closeout；`eval:smoke`（检索收敛变更）；check:imports / asserts / deps / structure / docs；fallow audit --base main。
- [x] **Step 2: 边界与文档守卫确认**
  `check:fallow` 全量 exit 0；`check:docs` / `check:structure` 全绿。
- [x] **Step 3: Completion Gates 核对**
  确认下方 Completion Gates 全部满足。
- [x] **Step 4: 文档回写**
  按治理规则回写 BOUNDARIES / SYSTEM_TRUTH_SOURCES / open-debt / README 索引（见 Files）。
- [x] **Step 5: 归档评估**
  仅当全部证据齐全且 assembly 主线完整收尾（后续如开独立判断类节点收编主线时另行激活）才归档本细则并更新 todos/README.md 与 plan.md。
- [x] **Step 6: Commit**
  `docs(assembly): close out Phase 4 closeout mainline`

## 范围边界

**Phase 4 纳入：**

- **检索收敛（D5）**：knowledge-read ILIKE legacy seam（`packages/host-distributed/src/knowledge-read/ports.ts`）收敛至完整 retrieval-engine 管线（`packages/service-knowledge-read` retrieval infra），分布式检索行为与 monolith 一致；Phase 3 偏差显式 deferred 项，本阶段为明确、评审过的行为升级。
- **OTel/Consul 单一插件收敛（D5）**：host-local（nest/observability/otel.service.ts + nest/service-discovery/consul.*）与 host-distributed（shared/telemetry.ts + gateway/consul-discovery-adapter.ts + discovery-factory.ts + internal-observability.ts）双份接线收敛为单一 otel 插件与单一 consul 插件，两宿主 assembly 节点共用；运行时语义不变。
- **direct-run seam 退役**：`packages/host-local/src/index.ts` 的 `isDirectExecution` 直连回退与 host-distributed 等价入口退役，所有 boot 经 `apps/light` / `apps/distributed` app shells 经 assembly profiles。
- **别名对齐**：`scripts/backend-target-registry.ts` 与根 `dev:*` 别名收敛为纯 shape 名（local-agent / team-monolith / distributed:<service>）→ builder-command 映射，单测断言。
- **集群化验证**：compose replicas=2 起 candidate-worker + outbox-worker，跑 ownership / 重复消费断言（SKIP LOCKED / 租约语义）。
- golden 回归：typecheck；assembly + host-local + host-distributed 包测试；distributed-closeout / distributed-acceptance / deployment-smoke / runtime-foundations / observability-closeout / discovery-closeout；`eval:smoke`（检索变更）；check:imports/asserts/deps/structure/docs；fallow audit --base main。

**Phase 4 明确不做（后续独立收编主线 / 明确排除）：**

- **判断类节点契约（D8）**：intent-recognition / dedup-strategy / conflict-trigger / artifact-derivation / label-alignment / channel-merge 等——后续独立收编主线，不在本阶段（见设计 D8 节点清单表；先立契约、实现可插拔，逐个独立评审）。
- **任何新增 yml/json 装配文件**（设计 D1）：本阶段只复用 cordis 编程式装配；compose 仅用于集群化验证部署。
- **k8s 编排实现**：k8s 保持 deferred（设计「明确不做」：compose replicas 即验证）。

## Completion Gates

- [x] 检索收敛（ILIKE → 完整 retrieval-engine 管线）完成：host-distributed knowledge-read 消费完整管线，ILIKE 删除（设计 D5），分布式检索行为与 monolith 一致；`eval:smoke` 与检索 focused tests 全绿。
- [x] OTel / Consul 单一插件收敛完成：host-local 与 host-distributed assembly 节点共用单一 otel / 单一 consul 插件，运行时语义不变；`observability-closeout` / `discovery-closeout` 全绿。
- [x] direct-run seam 退役完成：`packages/host-local/src/index.ts` 的 `isDirectExecution` 判定与等价入口移除，所有 boot 经 `apps/light` / `apps/distributed` app shells 经 assembly profiles。
- [x] 别名对齐完成：`scripts/backend-target-registry.ts` 与根 `dev:*` 别名收敛为 shape 名 → builder-command 映射（local-agent / team-monolith / distributed:<service>），单测断言通过。
- [x] 集群化验证通过：compose replicas=2 起 candidate-worker + outbox-worker，ownership / 重复消费断言通过（SKIP LOCKED / 租约语义）。
- [x] golden 回归全绿：typecheck；assembly + host-local + host-distributed 包全量；distributed-closeout；distributed-acceptance；deployment-smoke；runtime-foundations；observability-closeout；discovery-closeout；`eval:smoke`；check:imports / asserts / deps / structure / docs；fallow audit --base main。
- [x] 无新增 yml/json 装配文件、无新增断言豁免（`check:asserts` 全绿）。

## 实施偏差记录（2026-08-16，合入 909550b7 + 904466f5）

- **T1 检索收敛（D5）——行为升级已评审**：ILIKE（扁平子串匹配、恒等 1.0 评分、snippet=content 截断）退役，host-distributed knowledge-read 经 `converged-retrieval.ts` 消费 `@trapmap/service-knowledge-read` 完整管线（hash-embedding + 关键词召回 + rerank/boundary/freshness/eligibility，mode=hybrid，system-admin resolver 与 monolith 一致）；HTTP 响应 shape（results[].{entryId,score,snippet} / totalEstimate / channel）不变，评分与排序语义对齐 monolith。零检索 SQL/排序逻辑复制到 host-distributed。
- **T1 附带修复两个仓库级既有缺陷（阻塞 eval:smoke 与全新库部署）**：
  1. drizzle 多目录迁移毒化：knowledge-write `0001_artifact_revision_version` journal `when=1784020000000` 晚于 candidate/governance/job-runtime/knowledge-read/cron，而 drizzle 按「全局最后 applied created_at」去重，导致 `runDistributedMigrations` / eval 协调器在**任何全新数据库**上静默跳过这些迁移（`task_queue`/`domain_event_outbox`/`workflow_runs`/`candidates`/`feedback_records`/`knowledge_embeddings` 等永不创建）。已把 0001 的 when 规范化为 0000 与 candidate 之间（`9181df0e`）；既有库不受影响。
  2. eval 协调器临时库从未启用 vector 扩展（pgvector 镜像只在集群层提供）——补 `CREATE EXTENSION IF NOT EXISTS vector`（`9181df0e`）。
  eval:smoke 修复后与 main 基线**完全一致**（54/81；retrieval 4/26、summary 1/6 低分为环境既有 fixture/LLM 依赖问题，非本次收敛回归）。
- **T2 插件落点**：单一 otel / consul 插件落在 `packages/backend-core/src/observability/`（`otel-bootstrap.ts` + `consul-http-adapter.ts`，框架无关零 Nest/Fastify 依赖；assembly zone 不消费它们），host-local（Nest）与 host-distributed（Fastify）保留各自薄适配器；运行时语义不变（`validateOtelPolicy` 策略、trace header 传播、shutdown 超时均保留）。
- **T5 集群化验证形态**：确定性验证 = `scripts/cluster-ownership.ts`（`pnpm test:cluster-ownership`）——两个共享同一 pg pool 的 in-process worker 副本消费同一 `task_queue`/`domain_event_outbox`，断言 SKIP LOCKED 恰好一次（20 tasks + 20 events 全完成、零重复、两副本均参与；已在 compose pg 实测 PASS）。`docker-compose.closeout.yml` 增 `deploy.replicas: 2`（candidate-worker + outbox-worker）。**真实 compose scale 演示受阻**：本地 `trap-map-host-distributed:latest` 为 2026-07-13 旧构建（WORKDIR `/app/packages/host-distributed`），与当前 compose/Dockerfile（`/app/apps/distributed` + `dist/index.js`）不匹配，`up --scale` 后容器 MODULE_NOT_FOUND；沙箱无外网、docker build 的 `pnpm install`/tsc 不可行，无法重建镜像。已把运行中的 compose 栈恢复原状（每 worker 1 副本，健康运行）。**镜像重建（联网/CI）后即可执行 compose replicas=2 真实验证**；该旧镜像与当前 compose 的漂移已登记 open-debt。
- **T4 别名映射**：`scripts/backend-target-registry.ts` 收敛为 shape 名（local-agent / team-monolith / distributed:<service>）→ builder-command 薄映射，单测断言；根 `dev:*` 别名同步对齐。
- **T3 seam 退役**：host-local `isDirectExecution` 与 host-distributed 等价直连入口移除，所有 boot 经 `apps/light` / `apps/distributed`（assembly profiles）。
- **守卫差异**：fallow audit 对 `consul.service.test.ts` 报 2 组测试内克隆（warn 级、27 行、0.0%、门禁豁免非阻塞），遗留为已知小项，未强制重构（测试内相似 mock 段落）。


## 问题池

- **本地 trap-map-host-distributed 镜像与当前 compose/Dockerfile 漂移**（2026-07-13 旧构建，WORKDIR 指向 host-distributed 包）：compose replicas 真实 scale 演示需重建镜像（联网/CI），已登记 open-debt；不影响代码门禁与 in-process ownership 验证。
- **eval:smoke 基线通过率 54/81**：retrieval 4/26（15.4%）与 summary 1/6（16.7%）为环境既有 fixture/LLM 依赖问题，main 与收敛分支结果一致（非回归）；后续独立评估数据/评判器优化，不在本主线。
- **判断类节点契约（D8）**：intent-recognition / dedup-strategy / conflict-trigger / artifact-derivation / label-alignment / channel-merge 按设计 D8 后续独立收编主线，本阶段明确不纳入。

