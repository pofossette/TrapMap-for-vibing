# Unity Assembly Center (assembly) Phase 3 收敛 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **状态：** active
> **根入口：** [`../../plan.md`](../../plan.md)
> **设计规格：** [`../superpowers/specs/2026-08-16-unified-assembly-center-design.md`](../superpowers/specs/2026-08-16-unified-assembly-center-design.md)

**Goal:（D6 Phase 3 收敛）** host-distributed 收敛——`distributedAssembly(name)` 覆盖 gateway 与各服务进程，删除 `start<X>Service` 样板，`shared/ports.ts` 简化版退役，worker 子节点整体/拆分形态打通；现有行为不变为硬约束。

**Architecture:** 承接 Phase 1（`packages/assembly` 内核）与 Phase 2（host-local 试点：host-local-owned pilot nodes + local/team profiles + nest-transport，经 assembly boot）。本阶段把同一装配内核推广到 host-distributed：`packages/host-distributed` 的启动改为 `distributedAssembly(name)`（按设计 D3 的 `service` switch 组合 gateway / 各服务进程 / worker 子节点形态）；8 个 `start<X>Service()` 样板收敛为对 `distributedAssembly(name).boot()` 的薄调用并删除重复样板；`shared/ports.ts` 的简化版（queue/outbox/检索 ILIKE）退役、完整 `async-runtime.ts` 为唯一实现（设计 D5）；worker 子节点（candidate-processing / governance-feedback / conflict-detection / outbox-dispatch 等）按整体（job-runtime 容器，nginx 类比）或拆分（独立子 worker 进程）两种形态在装配层打通。`distributedAssembly` 沿用 Phase 2 偏差记录结论：通用服务 `node.ts` 与跨包 infra 节点落点在 host-distributed-owned nodes（host-local 消费 assembly 内核、分布式进程在本阶段收敛到同一内核装配）。

**Tech Stack:** TypeScript, `@deepseek-ai/cordis` (^4.0.1), zod, NestJS, Fastify, Vitest, Biome, fallow, pnpm.

## 任务背景

根 [`../../plan.md`](../../plan.md) 已切换为 assembly Phase 3 收敛主线，承接设计文档 D6 Phase 3。Phase 1（packages/assembly 内核 + cordis + 测试 + 根级接线 + 文档）已完成并归档（见 [`../archived/archived-plans/unified-assembly-center-phase1-archived.md`](../archived/archived-plans/unified-assembly-center-phase1-archived.md)）。Phase 2（host-local 试点）已完成并归档（见 [`../archived/archived-plans/unified-assembly-center-phase2-pilot-archived.md`](../archived/archived-plans/unified-assembly-center-phase2-pilot-archived.md)，`63c26029` / `26964daf` / `fc114c35`，合并 `dbf1461a`）。平行分支 `feat/phase3-core`（另一 worktree）实现 `distributedAssembly` profiles、starter 收敛与 `shared/ports.ts` 退休；本细则承载 Phase 3 的执行清单、界面、验证命令与 closeout 责任。

## 全局约束

- **行为不变是硬约束：** Phase 3 不改变任何现有运行时语义；golden 回归（distributed-closeout / distributed-acceptance / deployment-smoke / runtime-foundations / host-distributed 包测试）必须全绿，diff 核验 host-distributed 行为不变。
- **双轨期保留现有 start<X>Service：** 各 `start<X>Service()` 工厂与 `--service` 手写 switch 保留至新路径 golden 全绿后才切默认（T2 收敛）；双轨窗口内 host-distributed 继续直连旧路径。
- **编程式装配，无配置文件：** 只采用 cordis 编程式 `new Context()` / `ctx.plugin()`；禁止新增 yml/json 装配文件、loader 或 patch 层（设计 D1 全局约束）。
- **assembly 依赖规则不变：** assembly zone（Phase 1 已写入 `.fallowrc.json`）只依赖 backend-core / contracts / lib；host-distributed-owned nodes 落在 `packages/host-distributed/` 内（其 zone 依赖规则继续生效），沿用 Phase 2 偏差记录结论。
- **完整实现为唯一语义：** `shared/ports.ts` 简化版（queue / outbox / 检索 ILIKE）退役、完整 `async-runtime.ts` 为唯一 `task-transport` 实现（设计 D5）；不并行保留第二套简化实现。
- **禁止断言：** 不新增 `@ts-ignore` / `@ts-expect-error` / 裸 `as`；契约校验用结构类型 + 启动期断言，不使用断言豁免。
- **验证门禁：** 每任务 focused test + `pnpm typecheck`；文档变化跑 `pnpm check:docs` 与 `pnpm check:structure`；边界接入后跑 `pnpm exec fallow audit --base main`。
- **提交粒度：** 每个任务一个或多个独立 commit，commit message 遵循仓库风格（`feat(assembly): ...` / `docs(assembly): ...` / `chore(assembly): ...`）。

## 实施偏差记录（2026-08-16，合入 `0a753aec`）

- **节点落点**：沿用 Phase 2 结论——distributed 试点节点落在 `packages/host-distributed/src/assembly/`（host-distributed zone 可消费 assembly 内核），`assembly` zone 不导入宿主。
- **D3 的 pg+transport+service 细分近似**：`distributedAssembly(name)` 组合 config 节点 + database(pg) 节点（gateway 除外）+ 每服务 server 节点（含 transport/telemetry）——因为现有宿主适配器 `createServer(config, db)` 已构建完整 Fastify 面（含遥测/指标），强行拆分会改变装配行为（行为不变硬约束）。
- **worker 形态**：job-runtime 节点声明 D7 worker children（candidate-processing/governance-feedback/conflict-detection/outbox-dispatch）；现有 8 个 starter 均无独立 worker 进程入口，故未发明新行为。
- **shared/ports.ts 退役**：简化 taskQueue/outbox 已退役（job-runtime 全用 async-runtime）；knowledge-read 的 ILIKE 检索 seam 原样迁移至 `knowledge-read/ports.ts`，**完整管线收敛（D5）推迟 Phase 4**（涉及检索行为升级，需独立评审）。
- **T5 golden**：host-distributed 173、distributed-closeout 35、deployment-smoke 379、runtime-foundations 130 全绿；fallow audit 34 files 零 issue。

## 工作流与依赖

```text
T1 distributedAssembly profile（按设计 D3 的 service switch；host-distributed-owned nodes 落点）
  -> T2 starter 收敛（8 个 start<X>Service 改薄调用 + 删除重复样板）
  -> T3 shared/ports.ts 简化版退役（D5：完整 async-runtime 为唯一实现）
  -> T4 worker 子节点形态（job-runtime 容器 + 拆分）
  -> T5 golden 回归（distributed-closeout / distributed-acceptance / deployment-smoke / runtime-foundations / host-distributed 包测试）
  -> T6 closeout（守卫、文档回写、归档评估）
```

T1 建 profile 后 T2/T3/T4 可并行推进；T5 依赖 T1-T4 产物；T6 依赖 T1-T5 全部完成。

## 执行任务

### Task 1: `distributedAssembly` profile（按设计 D3 的 service switch；host-distributed-owned nodes 落点）

**Files:**
- Create: `packages/assembly/src/profiles/distributed.ts`（`distributedAssembly(name)`：`switch` 组合 gateway / 各服务进程 / worker 进程，按设计 D3 节点组合）
- Create: `packages/host-distributed/src/assembly/nodes/*.ts`（host-distributed-owned nodes：gateway / 各 service 进程 / worker 容器与子 worker 节点，host-local 消费 assembly 内核、分布式进程在本阶段收敛到同一内核装配）
- Modify: `packages/assembly/src/index.ts`（聚合导出 `distributedAssembly`）
- 不改动：任何 yml/json 装配文件、cordis loader/patch 层

**Interfaces:**
- Consumes: 设计 D3 `distributedAssembly(serviceName)` service switch；Phase 1 内核 API（`createAssembly` / `defineNode` / `startupChecks`）。沿用 Phase 2 偏差记录结论：通用 infra/服务 `node.ts` 不落在 `packages/assembly/`（zone 边界），而落在 host-distributed-owned nodes。
- Produces: `distributedAssembly(name)` TS 组合器；gateway / knowledge-read / candidate-ingestion / job-runtime / candidate-worker / governance-worker / cron-scheduler / knowledge-write / identity-access / governance-review 等进程形态。

- [ ] **Step 1: host-distributed-owned nodes 盘点**
  在 `packages/host-distributed/src/assembly/nodes/` 落地 gateway 与各服务进程、worker 容器与子 worker 的节点定义（复用现有工厂/接线，语义同现有 `start<X>Service` 示例，行为不变）。
- [ ] **Step 2: `distributedAssembly(name)` 组合器**
  新增 `packages/assembly/src/profiles/distributed.ts`：按设计 D3 的 `service` switch 组合对应进程（gateway、service `*`、job-runtime 整体承载子 worker、`*-worker` 拆分子 worker 独立进程）。
- [ ] **Step 3: 拓扑断言测试**
  对 `distributedAssembly` 各进程形态用 `startupChecks` 校验节点齐全、inject 满足、无环、拓扑合法（standalone 跨进程依赖走 transport 服务；每个 distributed 子组合含 pg + 对应 transport）。
- [ ] **Step 4: 验证**
  `pnpm --filter @trapmap/assembly test --run`、host-distributed focused tests、`pnpm typecheck`、`pnpm exec fallow audit --base main`。
- [ ] **Step 5: Commit**
  `feat(assembly): add distributedAssembly profile and host-distributed-owned nodes`

### Task 2: starter 收敛（8 个 start<X>Service 改薄调用 + 删除重复样板）

**Files:**
- Modify: `packages/host-distributed/src/gateway/*.ts` / 各 service 进程启动文件（`start<X>Service()` 改为对 `distributedAssembly(name).boot()` 的薄调用）
- Modify: `packages/host-distributed/src/index.ts`（`--service` 手写 switch 收敛为对 `distributedAssembly(name)` 分发）
- 不改动：`packages/host-distributed/src/*/domain`、ports、routes、业务文件（行为不变）。

**Interfaces:**
- Consumes: T1 `distributedAssembly(name)`；host-distributed 现有 `start<X>Service()` 启动序列。
- Produces: 去除 8 个 `start<X>Service` 重复样板后的薄启动路径；重复的「loadServiceConfig → createServiceDatabase → createIdentityAccessPgDeps → createServicePorts → create<X>Deps → create<X>Server → attachRuntimeTelemetry」样板消除。

- [ ] **Step 1: 薄调用改造**
  各 `start<X>Service()` 改为对 `distributedAssembly(name).boot()` 的薄调用（保留双轨期内旧路径直至 golden 全绿）。
- [ ] **Step 2: 重复样板删除**
  删除被 `distributedAssembly` 吸收的逐份样板（双轨切换完成后删旧路径）。
- [ ] **Step 3: 架构边界核验**
  `pnpm exec fallow audit --base main`、`pnpm exec check:fallow`（含 assembly zone）；确认无跨 zone 违规。
- [ ] **Step 4: 验证**
  host-distributed focused tests、`pnpm test:deployment-smoke`、`pnpm typecheck`。
- [ ] **Step 5: Commit**
  `refactor(assembly): converge host-distributed start services onto distributedAssembly`

### Task 3: `shared/ports.ts` 简化版退役（D5：完整 async-runtime 为唯一实现）

**Files:**
- Modify: `packages/host-distributed/src/shared/ports.ts`（queue / outbox / 检索 ILIKE 简化实现移除，只保留装配与组合所需薄接线）
- Modify: `packages/host-distributed/src/**` 消费点（改用完整 `async-runtime.ts` / 对应 owner 端口实现，语义等同现状）
- 改动后删除：被简化版替代的 host-distributed SQL 直写（设计 D5 与 debt「host-distributed shared/ports.ts 业务下沉」）

**Interfaces:**
- Consumes: 完整 `async-runtime.ts` 的 `task-transport` / `outbox` 语义；owner 包 pg-ports / backend-core 端口实现。
- Produces: `shared/ports.ts` 简化版 retired；完整异步运行时为唯一实现；host-distributed 不再宿主持有业务 SQL。

- [ ] **Step 1: 消费点切换**
  把 host-distributed 对 `shared/ports.ts` 简化版（queue / outbox / 检索 ILIKE）的消费切到完整 `async-runtime.ts` / owner 端口实现。
- [ ] **Step 2: 简化实现删除**
  从 `shared/ports.ts` 删除被完整实现替代的简化实现，只保留装配组合所需薄接线。
- [ ] **Step 3: 行为不变回归**
  `host-distributed` focused tests、`pnpm test:distributed-closeout`、`pnpm test:distributed-acceptance`、`pnpm test:deployment-smoke` 全绿。
- [ ] **Step 4: 验证**
  `pnpm typecheck`、`pnpm exec fallow audit --base main`。
- [ ] **Step 5: Commit**
  `refactor(assembly): retire shared/ports.ts simplified implementations in favor of async-runtime`

### Task 4: worker 子节点形态（job-runtime 容器 + 拆分）

**Files:**
- Create/Modify: `packages/host-distributed/src/assembly/nodes/worker*.ts`（job-runtime 容器整体承载子 worker（nginx 类比）与 `*-worker` 拆分独立进程两种形态）+ `distributedAssembly` 组合器对应分支
- Modify: `packages/assembly/src/profiles/distributed.ts`（job-runtime / candidate-worker / governance-worker / outbox-worker 形态分支）
- 不改动：子 worker typed handler 契约与实现（复用现有 handlers）。

**Interfaces:**
- Consumes: 设计 D5/R5 子 worker 节点语义（`children` 挂在 job-runtime 或独立 + workerTransport）；现有 typed handlers。
- Produces: 整体（job-runtime 容器承载多个子 worker）与拆分（子 worker 独立成进程）两种形态在装配层打通；`ownsWork` 语义由装配拓扑统一注入。

- [ ] **Step 1: job-runtime 容器整体形态**
  `distributedAssembly('job-runtime')` 整体承载子 worker（candidate-processing / governance-feedback / conflict-detection / outbox-dispatch 等，nginx master/worker 类比）。
- [ ] **Step 2: 子 worker 拆分形态**
  `distributedAssembly('candidate-worker' | 'governance-worker' | 'outbox-worker')` 拆分子 worker 独立成进程 + workerTransport。
- [ ] **Step 3: 拓扑断言测试**
  `startupChecks` 断言子 worker 只能挂在 job-runtime 下或独立 + workerTransport；整体/拆分形态均可启动。
- [ ] **Step 4: 验证**
  assembly + host-distributed focused tests、`pnpm test:deployment-smoke`、`pnpm test:runtime-foundations`、`pnpm typecheck`。
- [ ] **Step 5: Commit**
  `feat(assembly): support job-runtime container and split worker sub-node shapes`

### Task 5: golden 回归（distributed-closeout / distributed-acceptance / deployment-smoke / runtime-foundations / host-distributed 包测试）

**Files:**
- 无源码改动；纯回归验证（若回归发现行为差异，返回 T1-T4 修复并在问题池记录）。

**Interfaces:**
- Consumes: T1-T4 产物；host-distributed golden 测试（`distributed-closeout` / `distributed-acceptance`）与装配链路。
- Produces: Phase 3 行为不变证据；后续 closeout 依据。

- [ ] **Step 1: distributed-closeout / distributed-acceptance**
  `pnpm test:distributed-closeout`、`pnpm test:distributed-acceptance` 全绿。
- [ ] **Step 2: deployment-smoke / runtime-foundations**
  `pnpm test:deployment-smoke`、`pnpm test:runtime-foundations` 全绿。
- [ ] **Step 3: host-distributed 包测试**
  `host-distributed` focused tests、`assembly` 相关测试、根 `pnpm typecheck` 全绿。
- [ ] **Step 4: 行为不变 diff 核验**
  对比 `distributedAssembly` 收敛前后 host-distributed 行为（如适用：gateway health / 关键路由 / 内部 hop / worker 消费）；确认无行为差异，差异记录到问题池。
- [ ] **Step 5: Commit**
  `test(assembly): add golden regression evidence for distributedAssembly convergence`

### Task 6: closeout（守卫、文档回写、归档评估）

**Files:**
- Modify: 本细则（assembly-phase3.md，所有复选框打勾；closeout 记录；归档评估）
- Modify: `docs/todos/README.md`、`plan.md`、`docs/README.md`（若 Phase 3 完成后切换）
- Modify: 文档回写（如 `docs/architecture/BOUNDARIES.md` 组装层、`docs/reference/SYSTEM_TRUTH_SOURCES.md` 术语/active 主线、`docs/todos/open-debt-and-compromises.md` 实施状态）——按治理规则在 T6 或 T5 后统一回写
- 全量验证输出记录在 closeout 小节

**Interfaces:**
- Consumes: T1-T5 全部产物与文档。
- Produces: Phase 3 closeout 证据；Phase 4（双实现收敛 + direct-run seam 退役 + 别名对齐 + 集群化验证收尾）在此基础上推进。

- [ ] **Step 1: 全量回归**
  全部通过（distributedAssembly 收敛后复跑）：typecheck、assembly + host-distributed 全量、distributed-closeout / distributed-acceptance、deployment-smoke、runtime-foundations、check:imports/asserts/docs/structure/deps、fallow audit。
- [ ] **Step 2: 边界与文档守卫确认**
  `check:fallow` 全量 exit 0；`check:docs` / `check:structure` 全绿。
- [ ] **Step 3: Completion Gates 核对**
  确认下方 Completion Gates 全部满足。
- [ ] **Step 4: 文档回写**
  按治理规则回写 BOUNDARIES / SYSTEM_TRUTH_SOURCES / open-debt / README 索引（见 Files）。
- [ ] **Step 5: 归档评估**
  仅当全部证据齐全且下一主线（Phase 4）已激活时，才把本细则归档并更新 todos/README.md 与 plan.md。
- [ ] **Step 6: Commit**
  `docs(assembly): close out Phase 3 convergence mainline`

## 范围边界

**Phase 3 纳入：**

- `distributedAssembly(name)` profile：按设计 D3 的 `service` switch 组合 gateway / 各服务进程（knowledge-read / candidate-ingestion / knowledge-write / identity-access / governance-review / job-runtime / cron / 子 worker）。host-distributed-owned nodes 落点沿用 Phase 2 偏差记录结论（通用跨包节点不落在 `packages/assembly/`，host-distributed zone 内部收敛）。
- starter 收敛：8 个 `start<X>Service()` 改薄调用 + 删除重复样板；`--service` 手写 switch 收敛为对 `distributedAssembly(name)` 分发。
- `shared/ports.ts` 简化版退役（D5）：queue / outbox / 检索 ILIKE 简化实现移除，完整 `async-runtime.ts` / owner 端口实现为唯一语义。
- worker 子节点形态：job-runtime 容器整体承载（nginx 类比）与 `*-worker` 拆分子 worker 独立进程两种形态在装配层打通。
- golden 回归：`pnpm test:distributed-closeout` / `pnpm test:distributed-acceptance` / `pnpm test:deployment-smoke` / `pnpm test:runtime-foundations` / `host-distributed` 包测试；行为不变 diff 核验。

**Phase 3 明确不做（Phase 4 及以后）：**

- **判断类节点契约**（intent-recognition / dedup-strategy / conflict-trigger / artifact-derivation / label-alignment / channel-merge 等）——设计 D8，后续按契约优先独立收编，不在本阶段。
- **OTel / Consul 双份接线收敛**——Phase 4（本阶段 observability / service-discovery 保持 host-distributed 现有接线；`shared/ports.ts` 退役是独立于 OTel/Consul 的 D5 子项）。
- **集群化验证**（compose replicas / ownership / 连接预算 / direct-run seam 退役 / 别名对齐）——Phase 4。
- **任何 yml/json 装配**：本阶段不新增 yml/json 装配文件或 cordis loader/patch 层。

## Completion Gates

- [x] `distributedAssembly(name)` 覆盖 gateway 与各服务进程；host-distributed-owned nodes 落点沿用 Phase 2 偏差记录结论，行为不变。
- [x] 8 个 `start<X>Service()` 样板收敛为薄调用并删除重复样板；`--service` 分发经 `distributedAssembly(name)`。
- [x] `shared/ports.ts` 简化版（queue / outbox）退役；检索 ILIKE seam 已迁移至 knowledge-read/ports.ts，**完整管线收敛推迟 Phase 4**（见偏差记录）。
- [x] worker 子节点整体形态（job-runtime 容器 + D7 children 声明 + 拓扑断言）通过；拆分形态维持现状（现有 starter 无独立 worker 入口，未发明新行为）。
- [x] golden 回归全绿：`distributed-closeout`（35）/ `deployment-smoke`（379）/ `runtime-foundations`（130）/ `host-distributed`（173）；行为不变（多进程 closeout 端到端通过）。
- [x] `pnpm typecheck` 全绿；fallow audit 34 files 零 issue；文档守卫（check:docs / check:structure）全绿。
- [x] 现有宿主行为不变：host-distributed 对外 API 面与内部 hop 语义不变；无新增 yml/json 装配文件。

## 问题池

（空——初始无问题。若实现过程中发现 API 设计、cordis 行为、starter 收敛或守卫差异，记录于此并注明解决路径或 deferred 落点。）
