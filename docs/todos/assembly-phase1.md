# Unity Assembly Center (assembly) Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **状态：** active
> **根入口：** [`../../plan.md`](../../plan.md)
> **设计规格：** [`../superpowers/specs/2026-08-16-unified-assembly-center-design.md`](../superpowers/specs/2026-08-16-unified-assembly-center-design.md)

**Goal:（Phase 1 地基 per D6）** packages/assembly 建包 + cordis 引入 + createAssembly / defineNode / startupChecks / createShutdownController + 单测；现有宿主零改动。

**Architecture:** 按设计 D6 四阶段迁移的第一阶段：新增 `packages/assembly`（`@trapmap/assembly`，cordis-backed assembly kernel），建立编程式装配内核（`new Context()` + `ctx.plugin()`，不引入 loader/patch 配置文件），暴露核心 API（createAssembly / defineNode / defineContract / startupChecks / createShutdownController + CapabilityNode / ContractDescriptor / StartupIssue 等类型），并用单测锁定组合语义、inject 顺序与无环、拓扑合法性、契约校验、dispose 顺序与退出控制。本阶段不改造任何宿主、不新增形态 builders、不引入判断类节点契约；只打地基，现有宿主保持零改动。

**Tech Stack:** TypeScript, `@deepseek-ai/cordis` (^4.0.1), zod, Vitest, Biome, fallow, pnpm.

## 任务背景

根 [`../../plan.md`](../../plan.md) 已切换为 assembly Phase 1 主线：用户 goal（2026-08-16）激活"统一优雅组装中心（assembly）"主线，承接设计文档 D6 Phase 1 阶段。平行分支 `feat/assembly-core` 正在实施 Phase 1 代码（建包、cordis 引入、核心 API、单测、根级接线与 .fallowrc.json 的 assembly zone 变更）。本细则承载 Phase 1 的执行清单、界面、验证命令与 closeout 责任。

## 全局约束

- **现有宿主零改动：** Phase 1 只建包 + 内核 API + 单测，`host-local` / `host-distributed` 及其 `apps/*` 组装中心不做任何修改。
- **行为不变是硬约束：** 本阶段不改变任何现有运行时语义；assembly 内核新增但未被宿主消费。
- **编程式装配，无配置文件：** 只采用 cordis 编程式 `new Context()` / `ctx.plugin()`；禁止新增 yml/json 装配文件、loader 或 patch 层（设计 D1 全局约束）。
- **只依赖 backend-core / contracts / lib：** assembly zone 的依赖规则（由 `feat/assembly-core` 分支写入 `.fallowrc.json`，本细则不触碰 .fallowrc.json）；assembly 不依赖任何 service 包、宿主包或 apps。
- **禁止断言：** 不新增 `@ts-ignore` / `@ts-expect-error` / 裸 `as`；契约校验用结构类型 + 启动期断言，不使用断言豁免。
- **验证门禁：** 每任务 focused test + `pnpm typecheck`；文档变化跑 `pnpm check:docs` 与 `pnpm check:structure`；边界接入后跑 `pnpm exec fallow audit --base main`。
- **提交粒度：** 每个任务一个或多个独立 commit，commit message 遵循仓库风格（`feat(assembly): ...` / `docs(assembly): ...` / `chore(assembly): ...`）。

## 工作流与依赖

```text
T1 建包（package.json / tsconfig / README / cordis 依赖 / pnpm install 锁文件）
  -> T2 核心 API 与类型（createAssembly / defineNode / defineContract / startupChecks / createShutdownController）
  -> T3 单测（组合语义 / inject 顺序与无环 / 拓扑合法性 / 契约校验 / dispose 顺序 / 退出控制）
  -> T4 根级接线（tsconfig.base.json paths / tsconfig.json references / vitest.config.ts project / .fallowrc.json entry+zone+rules+host allow）
  -> T5 守卫与文档同步（check:fallow +assembly zone / BOUNDARIES.md / REPO_STRUCTURE.md / SYSTEM_TRUTH_SOURCES.md / open-debt 回写）
  -> T6 回归与 closeout（typecheck / assembly 测试 / check:imports/asserts/docs/structure/deps / fallow audit --base main）
```

T1 建包后可并行开始 T2/T3 的 API 开发与单测；T4 依赖 T1-T3 的产物；T5 依赖 T4（.fallowrc.json 的 assembly zone 接入）并补齐文档；T6 为全量回归与 closeout，依赖 T1-T5 全部完成。

## 执行任务

### Task 1: packages/assembly 建包（package.json / tsconfig / README + @deepseek-ai/cordis 依赖 + pnpm install 锁文件）

**Files:**
- Create: `packages/assembly/package.json`（`@trapmap/assembly`，依赖 `@deepseek-ai/cordis` ^4.0.1、`@trapmap/contracts`、`@trapmap/backend-core`、`@trapmap/lib`、zod）
- Create: `packages/assembly/tsconfig.json`（`extends` 根 `tsconfig.base.json`，`references` 对应依赖包）
- Create: `packages/assembly/README.md`（包职责：统一组装中心 cordis 装配内核封装；Phase 1 只有内核，profiles 与节点包装在 Phase 2+）
- Modify: `pnpm-workspace.yaml`（若需要把 packages/assembly 纳入 `packages/*` 模式——默认已含 `packages/*` 则无需改动）
- Modify: 根 `pnpm-lock.yaml`（`pnpm install --lockfile-only` 更新锁文件，纳入 @deepseek-ai/cordis 与 @trapmap/assembly）

**Interfaces:**
- Consumes: 设计 D1（`@deepseek-ai/cordis` ^4.0.1 依赖落点）、根 `pnpm-workspace.yaml` 的包模式。
- Produces: 可解析、可安装的 `packages/assembly` workspace 包；锁文件含 cordis 依赖。

- [ ] **Step 1: 建包骨架**
  创建 `packages/assembly/` 目录、`package.json`、`tsconfig.json`、`README.md`；`package.json` 声明 `name: "@trapmap/assembly"` 与 cordis 依赖。
- [ ] **Step 2: 安装依赖**
  运行 `pnpm install --lockfile-only`（或 `pnpm install`）更新锁文件，确认 `@deepseek-ai/cordis` 被解析到 ^4.0.1。
- [ ] **Step 3: 验证**
  `pnpm --filter @trapmap/assembly exec node -e "require('@deepseek-ai/cordis')"`（或按包测试入口验证包解析）+ `pnpm typecheck`。
- [ ] **Step 4: Commit**
  `feat(assembly): scaffold @trapmap/assembly package with cordis dependency`

### Task 2: 核心 API 与类型（createAssembly / defineNode / defineContract / startupChecks / createShutdownController + CapabilityNode / ContractDescriptor / StartupIssue 等）

**Files:**
- Create: `packages/assembly/src/index.ts`（聚合导出面）
- Create: `packages/assembly/src/types.ts` 或 `types.ts`（CapabilityNode / ContractDescriptor / StartupIssue / AssemblyBuilder / defineNode 输入等类型）
- Create: `packages/assembly/src/create-assembly.ts`（createAssembly → AssemblyBuilder：`.add(node, config?) / .build() / .boot()`）
- Create: `packages/assembly/src/define-node.ts`（defineNode({ id, contract, apply, inject, configSchema, provides, topology?, children?, implements? })）
- Create: `packages/assembly/src/define-contract.ts`（defineContract：声明契约 id + 实现声明）
- Create: `packages/assembly/src/startup-checks.ts`（startupChecks(assembly)：inject 无环、重复 id、拓扑合法性、契约实现校验）
- Create: `packages/assembly/src/shutdown-controller.ts`（createShutdownController(dispose)：退出控制，反序 dispose）

**Interfaces:**
- Consumes: 设计 D1 导出面（createAssembly / defineNode / defineContract / startupChecks / createShutdownController）；cordis 的 `new Context()` / `ctx.plugin()` / `inject` / `ctx.effect`。
- Produces: 可被 Phase 2+ 宿主消费的内核 API 表面 + 类型（CapabilityNode / ContractDescriptor / StartupIssue）。

- [ ] **Step 1: 定义类型与契约接口**
  实现 CapabilityNode / ContractDescriptor / StartupIssue / AssemblyBuilder 类型与 defineNode / defineContract 声明。
- [ ] **Step 2: 实现 createAssembly**
  实现 createAssembly → AssemblyBuilder（`.add(node, config?) / .build() / .boot()`），内部经 cordis Context / plugin 装载有序 bundles。
- [ ] **Step 3: 实现 startupChecks**
  实现 startupChecks：inject 无环检测、重复节点 id、拓扑合法性校验、契约实现校验。
- [ ] **Step 4: 实现 createShutdownController**
  实现 createShutdownController(dispose)：创建关闭控制器，反序 dispose，提供 bounded shutdown。
- [ ] **Step 5: 导出面聚合**
  从 `index.ts` 聚合导出全部 API 与类型。
- [ ] **Step 6: 验证**
  `pnpm --filter @trapmap/assembly test --run`（配合 T3 单测）+ `pnpm typecheck`。
- [ ] **Step 7: Commit**
  `feat(assembly): implement cordis-backed assembly kernel core APIs`

### Task 3: 单测（组合语义 / inject 顺序与无环 / 拓扑合法性 / 契约校验 / dispose 顺序 / 退出控制）

**Files:**
- Create: `packages/assembly/src/__tests__/create-assembly.test.ts`（组合语义：add 顺序、boot、config 合并）
- Create: `packages/assembly/src/__tests__/inject-order.test.ts`（inject 顺序与无环：依赖图推导启动/停止顺序、循环依赖失败）
- Create: `packages/assembly/src/__tests__/topology.test.ts`（拓扑合法性：embedded/standalone/cluster、子 worker 挂载约束）
- Create: `packages/assembly/src/__tests__/contract.test.ts`（契约校验：implements 契约存在、结构兼容、启动期断言）
- Create: `packages/assembly/src/__tests__/dispose.test.ts`（dispose 顺序：反序清理、ctx.effect 自动回收）
- Create: `packages/assembly/src/__tests__/shutdown-controller.test.ts`（退出控制：createShutdownController dispose、bounded shutdown）

**Interfaces:**
- Consumes: T2 的核心 API（createAssembly / defineNode / defineContract / startupChecks / createShutdownController）。
- Produces: 设计文档"验证方式"要求的 assembly 单测：组合语义 / inject 无环 / 拓扑合法性 / 契约校验 / dispose / 退出控制。

- [ ] **Step 1: 组合语义测试**
  add 顺序 = 有序 bundles；boot 后节点依赖满足；config 按层合并语义正确。
- [ ] **Step 2: inject 顺序与无环测试**
  依赖图推导启动顺序符合声明 inject；循环依赖 fail-loud；停止顺序为启动反序。
- [ ] **Step 3: 拓扑合法性测试**
  standalone 节点独立满足 inject；cluster 节点不得为 embedded；子 worker 只挂 job-runtime 或独立 + workerTransport。
- [ ] **Step 4: 契约校验测试**
  implements 契约 id 存在且结构兼容；启动期 smoke 断言通过；未满足即 fail-loud。
- [ ] **Step 5: dispose 顺序测试**
  反序 dispose；ctx.effect 副作用自动回收；重复 dispose 幂等。
- [ ] **Step 6: 退出控制测试**
  createShutdownController 触发 dispose 按注册反序；bounded shutdown 超时行为正确。
- [ ] **Step 7: 验证**
  `pnpm --filter @trapmap/assembly test --run` 全绿 + `pnpm typecheck`。
- [ ] **Step 8: Commit**
  `test(assembly): cover composition, inject order, topology, contract, dispose, shutdown`

### Task 4: 根级接线（tsconfig.base.json paths / tsconfig.json references / vitest.config.ts project / .fallowrc.json entry+zone+rules+host allow）

**Files:**
- Modify: `tsconfig.base.json`（新增 `@trapmap/assembly` paths 映射）
- Modify: 根 `tsconfig.json`（新增 `packages/assembly` references）
- Modify: `vitest.config.ts`（新增 `packages/assembly` 为 multi-project workspace project）
- Modify: `.fallowrc.json`（zone "assembly"、patterns `packages/assembly/src/**`、rule assembly→[backend-core, contracts, lib]、host-local/host-distributed allow 列表加入 assembly、entry 加 `packages/assembly/src/index.ts`）——**由平行分支 `feat/assembly-core` 负责，本细则不触碰 .fallowrc.json**

> 注意：.fallowrc.json 的 assembly zone 变更由平行代码分支（`feat/assembly-core`）负责实现，本细则只登记该步骤的责任边界，不执行。

**Interfaces:**
- Consumes: T1-T3 的包与 API；根 `tsconfig.base.json` / `tsconfig.json` / `vitest.config.ts` / `.fallowrc.json`。
- Produces: 根级构建、测试与边界守卫能把 `packages/assembly` 解析、编译、测试并纳入架构边界。

- [ ] **Step 1: tsconfig paths**
  `tsconfig.base.json` 新增 `@trapmap/assembly` paths 映射，指向 `packages/assembly/src/index.ts`。
- [ ] **Step 2: tsconfig references**
  根 `tsconfig.json` 的 references 新增 `packages/assembly`。
- [ ] **Step 3: vitest project**
  `vitest.config.ts` 的 projects 新增 `packages/assembly`。
- [ ] **Step 4: fallow zone 接入（由平行分支）**
  确认 `.fallowrc.json` 的 entry + zone + rules + host allow 已加入 assembly（由 feat/assembly-core 落地，本步只验证）。
- [ ] **Step 5: 验证**
  `pnpm typecheck`、`pnpm --filter @trapmap/assembly test --run`、`pnpm exec fallow list --boundaries`（含 assembly zone）。
- [ ] **Step 6: Commit**
  `chore(assembly): wire package into root tsconfig, vitest, and fallow boundary`（由平行分支提交；本细则相应步骤若在其它分支不提交则同步证据到问题池）

### Task 5: 守卫与文档同步（check:fallow +assembly zone / BOUNDARIES.md / REPO_STRUCTURE.md / SYSTEM_TRUTH_SOURCES.md / open-debt 回写）

**Files:**
- Modify: 本细则（assembly-phase1.md，状态与复选框推进）
- Modify: `docs/architecture/BOUNDARIES.md`（Zone 定义表加 assembly 行；mermaid 依赖方向图加组装层 subgraph；关键约束加 assembly 项；注明 zone 由平行分支写入 .fallowrc.json）
- Modify: `docs/reference/REPO_STRUCTURE.md`（packages 列表加 `packages/assembly/`；如有包计数则更新）
- Modify: `docs/reference/SYSTEM_TRUTH_SOURCES.md`（assembly 术语映射；当前 active 主线措辞更新）
- Modify: `docs/todos/open-debt-and-compromises.md`（assembly 条目回写"实施状态"）

**Interfaces:**
- Consumes: T4 的 .fallowrc.json assembly zone（平行分支）、本细则 active 状态。
- Produces: 架构边界、目录结构、术语事实源与债务登记与 assembly 主线一致；check:fallow 无 assembly 相关 issue（需平行分支 zone 接入后）。

- [ ] **Step 1: BOUNDARIES.md**
  加 assembly 行到 Zone 定义表与关键约束；mermaid 加组装层 subgraph（assembly→backend-core/contracts/lib；host-local/host-distributed→assembly），保持 mermaid 合法。
- [ ] **Step 2: REPO_STRUCTURE.md**
  packages 列表加 `packages/assembly/`；如有包计数更新。
- [ ] **Step 3: SYSTEM_TRUTH_SOURCES.md**
  加 assembly 术语映射（能力节点 / 节点拓扑 / 统一组装中心 / 部署形态）；更新当前 active 主线措辞（若该处列 dead-code 主线）。
- [ ] **Step 4: open-debt 回写**
  assembly 条目加"实施状态：2026-08-16 由用户 goal 激活，Phase 1 实施中（见 assembly-phase1.md）"，保留 v4 设计要点原文。
- [ ] **Step 5: 验证**
  `pnpm check:docs`、`pnpm check:structure`、`pnpm exec check:fallow`（需 .fallowrc.json 已有 assembly zone；若平行分支尚未合入则记录为待补）。
- [ ] **Step 6: Commit**
  `docs(assembly): document assembly zone, package structure, and truth mappings for Phase 1`

### Task 6: 回归与 closeout（typecheck / assembly 测试 / check:imports/asserts/docs/structure/deps / fallow audit --base main；证据齐全后归档）

**Files:**
- Modify: 本细则（所有复选框打勾；closeout 记录）
- Modify: `docs/todos/README.md`、`plan.md`、`docs/README.md`（若主线完成后切换/更新）
- 全量验证输出记录在 closeout 小节

**Interfaces:**
- Consumes: T1-T5 全部产物与文档。
- Produces: Phase 1 closeout 证据；后续主线（Phase 2+）可在此基础上推进。

- [ ] **Step 1: 全量回归**
  运行 `pnpm typecheck`、`pnpm --filter @trapmap/assembly test --run`、`pnpm check:imports`、`pnpm check:asserts`、`pnpm check:docs`、`pnpm check:structure`、`pnpm check:deps`、`pnpm exec fallow audit --base main`。
- [ ] **Step 2: 边界与文档守卫确认**
  `pnpm exec check:fallow`（含 assembly zone）无 issue；`pnpm check:docs` / `pnpm check:structure` 全绿。
- [ ] **Step 3: Completion Gates 核对**
  确认下方 Completion Gates 全部满足（依赖 .fallowrc.json 的 assembly zone 已由平行分支接入）。
- [ ] **Step 4: 归档评估**
  仅当全部证据齐全且下一主线已激活时，才把本细则归档至 `docs/archived/archived-plans/` 并更新 todos/README.md 与 plan.md。
- [ ] **Step 5: Commit**
  `docs(assembly): closeout assembly Phase 1 foundation`（或由后续主线承接 closeout）

## 范围边界

**Phase 1 纳入：**

- `packages/assembly` 建包 + cordis 引入（`@deepseek-ai/cordis` ^4.0.1）与锁文件。
- 核心 API 与类型：`createAssembly` / `defineNode` / `defineContract` / `startupChecks` / `createShutdownController` + `CapabilityNode` / `ContractDescriptor` / `StartupIssue` 等。
- 单测：组合语义 / inject 顺序与无环 / 拓扑合法性 / 契约校验 / dispose 顺序 / 退出控制。
- 根级接线：tsconfig paths / references / vitest project / .fallowrc.json assembly zone（由平行分支 `feat/assembly-core` 负责实现 .fallowrc.json）。
- 守卫与文档同步：BOUNDARIES / REPO_STRUCTURE / SYSTEM_TRUTH_SOURCES / open-debt 回写。

**Phase 1 明确不做（Phase 2+）：**

- profiles / 形态 builders（localAgentAssembly / teamMonolithAssembly / distributedAssembly）——设计 D6 Phase 2/3。
- 宿主改造（host-local / host-distributed 改由 assembly boot、transport 插件化）——D6 Phase 2/3。
- 判断类节点契约（intent-recognition / dedup-strategy / conflict-trigger / artifact-derivation / label-alignment / channel-merge 等）——设计 D8，Phase 2+ 按契约优先逐个收编。
- 零 yml/json 装配：Phase 1 任何版本都不应新增 yml/json 装配文件或 cordis loader/patch 层。
- 现有宿主零改动：Phase 1 不修改 host-local / host-distributed / apps/* 的任何源码。

## Completion Gates

- [ ] `packages/assembly` 单测全绿（组合语义 / inject 顺序与无环 / 拓扑合法性 / 契约校验 / dispose 顺序 / 退出控制均有测试覆盖）。
- [ ] `check:fallow` 无 assembly 相关 issue（需 .fallowrc.json assembly zone 接入，由平行分支负责）。
- [ ] `pnpm typecheck` 全绿。
- [ ] 现有宿主零改动 diff 为空：`host-local`、`host-distributed`、`apps/*` 在 Phase 1 内无源码变更（文档除外）。
- [ ] 文档守卫全绿：`pnpm check:docs`、`pnpm check:structure`、`pnpm check:imports`、`pnpm check:asserts` 通过。

## 问题池

（空——初始无问题。若实现过程中发现 API 设计、cordis 行为或守卫差异，记录于此并注明解决路径或 deferred 落点。）
