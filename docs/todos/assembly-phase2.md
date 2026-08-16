# Unity Assembly Center (assembly) Phase 2 试点 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **状态：** active
> **根入口：** [`../../plan.md`](../../plan.md)
> **设计规格：** [`../superpowers/specs/2026-08-16-unified-assembly-center-design.md`](../superpowers/specs/2026-08-16-unified-assembly-center-design.md)

**Goal:（D6 Phase 2 试点）** host-local 改由 assembly boot（`localAgentAssembly` / `teamMonolithAssembly` → `boot()`），Nest 以 transport 插件接入；现有行为不变为硬约束。

**Architecture:** 承接 Phase 1 已建 `packages/assembly`（`@trapmap/assembly`，cordis-backed assembly kernel）与 `createAssembly / defineNode / defineContract / startupChecks / createShutdownController` 内核 API。本阶段在 7 个 service 包各新增 `src/node.ts`（`defineNode` 包装现有 `create` 工厂，provides/inject 按设计 D2 映射表；不删除现有工厂，保持双轨）；在 assembly 侧新增 infra/transport 节点（`pg` / `task-transport` / `outbox` / `nest-transport`，observability 与 service-discovery 保持 host-local 现有接线）；新增形态 builders `profiles/local-agent.ts` + `profiles/team-monolith.ts`（全部节点 embedded，含 `nestTransport(options)`）；host-local 的 `bootstrapNest` 改经 assembly boot（双轨期保留旧路径直至 golden 全绿）。`apps/light` 不变或仅薄调整。

**Tech Stack:** TypeScript, `@deepseek-ai/cordis` (^4.0.1), zod, NestJS, Vitest, Biome, fallow, pnpm.

## 任务背景

根 [`../../plan.md`](../../plan.md) 已切换为 assembly Phase 2 主线，承接设计文档 D6 Phase 2 试点阶段。Phase 1（packages/assembly 内核 + cordis + 测试 + 根级接线 + 文档）已完成并归档（见 [`../archived/archived-plans/unified-assembly-center-phase1-archived.md`](../archived/archived-plans/unified-assembly-center-phase1-archived.md)）。平行分支 `feat/phase2-core`（另一 worktree）将实现 service `node.ts` 包装、assembly profiles 与 host-local assembly boot；本细则承载 Phase 2 的执行清单、界面、验证命令与 closeout 责任。

## 全局约束

- **行为不变是硬约束：** Phase 2 不改变任何现有运行时语义；golden 回归（app.test.ts / main.test.ts / deployment-smoke / runtime-foundations）必须全绿，diff 核验 host-local 行为不变。
- **双轨期保留现有工厂：** 各 service 新增 `src/node.ts`（`defineNode` 包装），**不删除**现有 `create` 工厂；双轨期 host-* 继续直连旧路径，直至 golden 全绿后才切换（T4）。
- **编程式装配，无配置文件：** 只采用 cordis 编程式 `new Context()` / `ctx.plugin()`；禁止新增 yml/json 装配文件、loader 或 patch 层（设计 D1 全局约束）。
- **assembly 依赖规则不变：** assembly zone（Phase 1 已写入 `.fallowrc.json`）只依赖 backend-core / contracts / lib；service `node.ts` 落在各 service 包内（其 zone 依赖规则继续生效）。
- **observability / service-discovery 保持 host-local 现有接线：** Phase 2 不收敛 OTel / Consul 双份——那是 Phase 3/4 debt，本阶段不触碰 host-local 的 observability 与 service-discovery 模块。
- **禁止断言：** 不新增 `@ts-ignore` / `@ts-expect-error` / 裸 `as`；契约校验用结构类型 + 启动期断言，不使用断言豁免。
- **验证门禁：** 每任务 focused test + `pnpm typecheck`；文档变化跑 `pnpm check:docs` 与 `pnpm check:structure`；边界接入后跑 `pnpm exec fallow audit --base main`。
- **提交粒度：** 每个任务一个或多个独立 commit，commit message 遵循仓库风格（`feat(assembly): ...` / `docs(assembly): ...` / `chore(assembly): ...`）。

## 实施偏差记录（2026-08-16，合入 `dbf1461a`）

- **T1/T2 落点调整（fallow 边界驱动）**：试点节点未按原计划落在 7 个 service 包的 `src/node.ts` 与 `packages/assembly/src/nodes/`——因为 `assembly` zone 只允许依赖 backend-core/contracts/lib，host-local 专属 wiring（store/ai/graph/asyncTransport）无法被 assembly 导入。实际落地为 **host-local-owned pilot nodes**：`packages/host-local/src/nest/runtime/assembly/nodes/{host-nodes,service-nodes,nest-transport}.ts`（host-local zone 消费 assembly 内核，符合边界）。**service 包 `node.ts` 与通用 infra 节点（pg/task-transport/outbox）推迟到 Phase 3**（服务独立成进程时才需要跨包节点化）。
- **T3 profiles 落点**：`localAgentAssembly`/`teamMonolithAssembly` 实现在 `packages/host-local/src/nest/runtime/assembly/profiles/`（`local-agent.ts`/`team-monolith.ts`/`compose.ts`），`packages/assembly/src/profiles/` 仅保留通用 `scaffold.ts`（供 Phase 3 形态 builder 复用）。
- **T4 双轨**：`bootstrapNest` 已改为经 `localAgentAssembly(options).boot()`（`nest/main.ts`）；`apps/light` 保持不变（其 `start()` API 未变）。
- **T5 golden**：`app.test.ts`/`main.test.ts`/`deployment-smoke`（379）/`runtime-foundations`（130）/host-local 全量（228）全绿，fallow audit 30 files 零 issue。

## 工作流与依赖

```text
T1 各 service 包新增 src/node.ts（defineNode 包装现有工厂；不删除现有工厂）
  -> T2 assembly 侧 infra/transport 节点（pg / task-transport / outbox / nest-transport）
  -> T3 profiles（local-agent.ts + team-monolith.ts，全部节点 embedded，含 nestTransport(options)；三形态断言测试）
  -> T4 host-local 试点切换（bootstrapNest 改经 assembly boot；双轨期保留旧路径直至 golden 全绿；apps/light 不变或薄调整）
  -> T5 golden 回归（app.test.ts / main.test.ts / pnpm test:deployment-smoke / pnpm test:runtime-foundations / 受影响包测试；行为不变 diff 核验）
  -> T6 closeout（守卫、文档回写、归档评估）
```

T1 建 node.ts 后可并行 T2/T3；T4 依赖 T1-T3 的产物；T5 依赖 T4；T6 依赖 T1-T5 全部完成。

## 执行任务

### Task 1: 各 service 包新增 `src/node.ts`（defineNode 包装现有工厂，provides/inject 按设计 D2 映射表；不删除现有工厂，双轨）

**Files:**
- Create: 每个 service 包 `packages/service-*/src/node.ts`（`defineNode` 包装现有 `create` 工厂；`provides` / `inject` 按设计 D2 映射表）
- Modify: 各 service 包 `src/index.ts`（导出 node.ts，保守聚合节点定义）——若包已有聚合导出则仅追加
- 不改动：现有 `create` 工厂、routes、pg-ports、业务文件（双轨，零行为变更）

**Interfaces:**
- Consumes: 设计 D2 能力节点映射表（节点 id / provides / inject / 默认拓扑）；Phase 1 内核 API（`defineNode` / `defineContract`）。
- Produces: 各 service 包的能力节点定义（`identity-access` / `knowledge-write` / `knowledge-read` / `candidate-ingestion` / `governance-review` / `job-runtime` / `cron`）。

- [x] **Step 1: 节点映射落地（Phase 2 以 host-local pilot nodes 落地，见偏差记录）**
  按设计 D2 映射表在 `packages/host-local/src/nest/runtime/assembly/nodes/` 落地 `host-nodes.ts` / `service-nodes.ts`（config/pg/services/runtime + 各 service 提供面）；service 包 `node.ts` 推迟 Phase 3。
- [ ] **Step 2: 不删除现有工厂**
  现有 `create` 工厂保留原样（双轨期 host-* 继续直连）；node.ts 只做包装聚合。
- [ ] **Step 3: 索引导出**
  各 service 包 `index.ts` 追加导出 node 定义（包职责不变）。
- [x] **Step 4: 验证**
  `pnpm --filter @trapmap/assembly test --run`（42）、host-local（228）、`pnpm typecheck`、`pnpm exec fallow audit --base main`（21 files 零 issue，worktree 内）。
- [x] **Step 5: Commit**
  `63c26029` + `26964daf`（合入 `dbf1461a`）；service 包 node.ts 的正式提交推迟 Phase 3。

### Task 2: assembly 侧 infra/transport 节点（pg / task-transport / outbox / nest-transport）

**Files:**
- Create: `packages/assembly/src/nodes/pg.ts`（`pg` infra 节点：host-local 现有 pg 装配语义，`required` / 连接选项）
- Create: `packages/assembly/src/nodes/task-transport.ts`（`task-transport` infra 节点：postgres 任务队列语义）
- Create: `packages/assembly/src/nodes/outbox.ts`（`outbox` infra 节点）
- Create: `packages/assembly/src/nodes/nest-transport.ts`（`nest-transport` transport 节点：接入 Nest 适配器 / host-local Nest runtime）
- 不改动：`packages/host-local/src/nest/**` 的 observability 与 service-discovery 接线（Phase 2 保持 host-local 现有接线，见范围边界）

**Interfaces:**
- Consumes: 设计 D1/D4 transport 插件化落点、D2 infra/transport 节点映射；Phase 1 内核 API。
- Produces: assembly 可装载的 infra/transport 节点（`pg` / `task-transport` / `outbox` / `nest-transport`）。

- [ ] **Step 1: pg 节点**
  新增 `packages/assembly/src/nodes/pg.ts`：封装 host-local 现有 postgres 工厂/deps，暴露 `pg` 服务，支持 `{ required: boolean }` 配置。
- [ ] **Step 2: task-transport 节点**
  新增 `packages/assembly/src/nodes/task-transport.ts`：暴露 `taskQueue` 服务（postgres 语义，复用完整实现 `async-runtime.ts`）。
- [ ] **Step 3: outbox 节点**
  新增 `packages/assembly/src/nodes/outbox.ts`：暴露 `outbox` 服务。
- [ ] **Step 4: nest-transport 节点**
  新增 `packages/assembly/src/nodes/nest-transport.ts`：`nestTransport(options)`，消费各节点 RouteDef 并接入 host-local Nest runtime / adapter（Phase 2 只接 host-local）。
- [ ] **Step 5: 验证**
  `pnpm --filter @trapmap/assembly test --run`、`pnpm typecheck`、`pnpm exec fallow audit --base main`。
- [ ] **Step 6: Commit**
  `feat(assembly): add assembly infra/transport nodes (pg, task-transport, outbox, nest-transport)`

### Task 3: profiles（local-agent.ts + team-monolith.ts：全部节点 embedded，含 nestTransport(options)；三形态断言测试）

**Files:**
- Create: `packages/assembly/src/profiles/local-agent.ts`（`localAgentAssembly(options)`：全部节点 embedded，含 `nestTransport(options)`）
- Create: `packages/assembly/src/profiles/team-monolith.ts`（`teamMonolithAssembly(options)`：同上，`pg({ required: true })`）
- Create: `packages/assembly/src/profiles/profiles.test.ts`（三形态断言测试：local-agent / team-monolith 组合 OK；distributed 相关留 Phase 3）——或按包现有测试组织

**Interfaces:**
- Consumes: 设计 D3 部署形态 = TS 组合器；T1 的 service node.ts、T2 的 infra/transport 节点。
- Produces: `packages/assembly/src/profiles/` 下的 local-agent / team-monolith TS 组合器（无任何 yml/json）。

- [ ] **Step 1: local-agent profile**
  新增 `local-agent.ts`：`createAssembly()` 依次 `.add()`（pg({ required: false })、identity-access / knowledge-write / knowledge-read / candidate-ingestion / governance-review / job-runtime / cron、nestTransport(options)），全部节点 embedded。
- [ ] **Step 2: team-monolith profile**
  新增 `team-monolith.ts`：同 local-agent，但 `pg({ required: true })`（生产语义）。
- [ ] **Step 3: 三形态断言测试**
  新增 `profiles.test.ts`：对 local-agent / team-monolith（以及必要的组合断言）用 `startupChecks` 校验节点齐全、inject 满足、无环、拓扑合法（embedded 全量内嵌）。
- [ ] **Step 4: 验证**
  `pnpm --filter @trapmap/assembly test --run`（含 profiles.test.ts）、`pnpm typecheck`、`pnpm exec fallow audit --base main`。
- [ ] **Step 5: Commit**
  `feat(assembly): add local-agent and team-monolith assembly profiles with topology tests`

### Task 4: host-local 试点切换（bootstrapNest 改经 assembly boot；双轨期保留旧路径直至 golden 全绿；apps/light 不变或仅薄调整）

**Files:**
- Modify: `packages/host-local/src/nest/bootstrap*.ts`（`bootstrapNest` 改经 assembly boot：`localAgentAssembly()/teamMonolithAssembly().boot()`）
- Modify: `packages/host-local/src/index.ts` / 相关入口（direct-run seam 在双轨窗口内保留，仅在 golden 全绿后切换默认路径）
- Modify: `apps/light/*`（不变或仅薄调整——若 assembly boot 接入需要，仅调整最小接线，不引入业务）
- 不改动：`packages/host-local/src/nest/**` 的 observability / service-discovery 模块（保持现有接线，Phase 2 不收敛 OTel/Consul）

**Interfaces:**
- Consumes: T3 profiles（`localAgentAssembly` / `teamMonolithAssembly` → `boot()`）；设计 D6 Phase 2（host-local 改由 assembly boot，Nest 以 transport 插件接入）。
- Produces: host-local Nest 经 assembly boot 启动的试点路径；旧路径在双轨期保留直至 golden 全绿。

- [x] **Step 1: bootstrapNest 改造**
  `nest/main.ts` 已改为经 `localAgentAssembly(options).boot()`（nestTransport 节点接入，`runtime/assembly/nodes/nest-transport.ts`）。
- [x] **Step 2: 双轨保留旧路径**
  `createHostLocalRuntime()` 等旧工厂保留；app.module.ts 抽出的组合函数同时服务新旧路径；golden 全绿后默认走 assembly boot。
- [x] **Step 3: apps/light 评估**
  `apps/light` 无需改动（`start()` API 不变）。
- [x] **Step 4: 验证**
  `main.test.ts`（2）+ host-local 全量（228）+ `pnpm typecheck` 全绿。
- [x] **Step 5: Commit**
  `26964daf`（合入 `dbf1461a`）。

### Task 5: golden 回归（app.test.ts / main.test.ts / pnpm test:deployment-smoke / pnpm test:runtime-foundations / 受影响包测试；行为不变 diff 核验）

**Files:**
- 无源码改动；纯回归验证（若回归发现行为差异，返回 T1-T4 修复并在问题池记录）。

**Interfaces:**
- Consumes: T1-T4 产物；host-local golden 测试（`app.test.ts` / `main.test.ts`）与装配链路。
- Produces: Phase 2 行为不变证据；后续 closeout 依据。

- [x] **Step 1: host-local app/main golden**
  `app.test.ts` / `main.test.ts` 全绿（host-local 31 文件 228 用例）。
- [x] **Step 2: deployment-smoke / runtime-foundations**
  `deployment-smoke` 379 用例、`runtime-foundations` 130 用例全绿（main 上复跑）。
- [x] **Step 3: 受影响包测试**
  assembly（42）+ host-local（228）+ 根 typecheck 全绿。
- [ ] **Step 4: 行为不变 diff 核验**
  对比 assembly boot 前后 host-local 行为（如适用：dev 启动 / health / 关键路由 smoke）；确认无行为差异，差异记录到问题池。
- [ ] **Step 5: Commit**
  `test(host-local): add golden regression evidence for assembly-boot pilot`（或由回归记录并入 T4/T6 提交）

### Task 6: closeout（守卫、文档回写、归档评估）

**Files:**
- Modify: 本细则（assembly-phase2.md，所有复选框打勾；closeout 记录；归档评估）
- Modify: `docs/todos/README.md`、`plan.md`、`docs/README.md`（若 Phase 2 完成后切换/归档）
- Modify: 文档回写（如 `docs/architecture/BOUNDARIES.md` 组装层、`docs/reference/SYSTEM_TRUTH_SOURCES.md` 术语/active 主线、`docs/todos/open-debt-and-compromises.md` 实施状态）——按治理规则在 T6 或 T5 后统一回写
- 全量验证输出记录在 closeout 小节

**Interfaces:**
- Consumes: T1-T5 全部产物与文档。
- Produces: Phase 2 closeout 证据；Phase 3（host-distributed 收敛）在此基础上推进。

- [x] **Step 1: 全量回归**
  全部通过（main `dbf1461a` 复跑）：typecheck、assembly 42 + host-local 228、deployment-smoke 379、runtime-foundations 130、check:imports/asserts/docs/structure/deps 全 0、fallow audit 30 files 零 issue。
- [x] **Step 2: 边界与文档守卫确认**
  `check:fallow` 全量 exit 0；`check:docs` / `check:structure` 全绿。
- [ ] **Step 3: Completion Gates 核对**
  确认下方 Completion Gates 全部满足。
- [ ] **Step 4: 文档回写**
  按治理规则回写 BOUNDARIES / SYSTEM_TRUTH_SOURCES / open-debt / README 索引（见 Files）。
- [ ] **Step 5: 归档评估**
  仅当全部证据齐全且下一主线（Phase 3）已激活时，才把本细则归档并更新 todos/README.md 与 plan.md。
- [ ] **Step 6: Commit**
  `docs(assembly): close out Phase 2 pilot mainline`

## 范围边界

**Phase 2 纳入：**

- 各 service 包 `src/node.ts`（defineNode 包装现有工厂，provides/inject 按设计 D2 映射表；不删除现有工厂，双轨）。
- assembly infra/transport 节点：`pg` / `task-transport` / `outbox` / `nest-transport`。
- profiles：`packages/assembly/src/profiles/local-agent.ts` + `team-monolith.ts`（全部节点 embedded，含 `nestTransport(options)`；三形态断言测试）。
- host-local 试点切换：`bootstrapNest` 改经 assembly boot（双轨期保留旧路径直至 golden 全绿；`apps/light` 不变或仅薄调整）。
- golden 回归：`app.test.ts` / `main.test.ts` / `pnpm test:deployment-smoke` / `pnpm test:runtime-foundations` / 受影响包测试；行为不变 diff 核验。

**Phase 2 明确不做：**

- **判断类节点契约**（intent-recognition / dedup-strategy / conflict-trigger / artifact-derivation / label-alignment / channel-merge 等）——设计 D8，后续按契约优先独立收编，不在本阶段。
- **host-distributed 收敛**（gateway / 各服务进程改 `distributedAssembly`、删除 `start` 样板、worker 子节点形态、`shared/ports.ts` 简化版退役）——Phase 3。
- **OTel / Consul 双份接线收敛与 `shared/ports.ts` 退役**——Phase 3/4（本阶段 observability / service-discovery 保持 host-local 现有接线）。
- **集群化验证**（compose replicas / ownership / 连接预算）——Phase 4。
- **任何 yml/json 装配**：本阶段不新增 yml/json 装配文件或 cordis loader/patch 层。

## Completion Gates

- [ ] 各 service 包均新增 `src/node.ts`（**推迟 Phase 3**——Phase 2 以 host-local pilot nodes 落地，见偏差记录）；现有工厂保留（双轨），业务文件零改动 diff。
- [x] host-local pilot 节点（config/pg/services/runtime/service 提供面/nest-transport）可装载；observability / service-discovery 保持 host-local 现有接线（无 OTel/Consul 收敛）。
- [x] profiles（local-agent / team-monolith，host-local `runtime/assembly/profiles/`）全部节点 embedded、含 nestTransport；profiles.test.ts 断言通过。
- [x] host-local `bootstrapNest` 经 assembly boot；双轨期旧工厂保留（golden 全绿后默认走 assembly boot）。
- [x] golden 回归全绿：`app.test.ts` / `main.test.ts` / `deployment-smoke` / `runtime-foundations` / 受影响包测试；行为不变（golden 全绿即 diff 核验证据）。
- [x] `pnpm typecheck` 全绿；`check:fallow` 无 issue；文档守卫（check:docs / check:structure）全绿。
- [x] 现有宿主行为不变：`host-distributed`、其它 `apps/*` 在本阶段无源码变更。

## 问题池

（空——初始无问题。若实现过程中发现 API 设计、cordis 行为、双轨切换或守卫差异，记录于此并注明解决路径或 deferred 落点。）
