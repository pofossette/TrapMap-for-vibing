# Light / Heavy 后端构建目标与客户端选择实施计划

> **状态：** archived  
> **归档日期：** 2026-07-11  
> **归档原因：** 实施与文档收口已完成；仅剩的 `runtime-closeout` 需要已配置的 distributed gateway 与 `TRAPMAP_SYSTEM_ADMIN_KEY`，属于部署级 operator 验收前置条件，不再占用 active execution surface。

## 目标

将当前散落在 `scripts/run-dev.ts`、根 `package.json`、host 包、CLI 配置和文档中的运行形态信息收敛为一个可消费、可测试的两档后端构建目标模型：

- `light`：`local-agent`、`team-monolith`，由 `@trapmap/host-local` 的 Nest 主线承载；
- `heavy`：`distributed`，由 `@trapmap/host-distributed` 的 gateway 与 worker/service-unit 拓扑承载。

客户端新增（并迁移已有 CLI 实现到）统一的 `backendTarget` 配置项。它只表达目标形态偏好，默认 `light`；缺省和非法旧值回退到 `light`，且不改变唯一 `gatewayUrl`、认证或内部服务发现。

## 架构决策与边界

- deployment profile 仍是运行时 capability 模型：`local-agent | team-monolith | distributed`；build target 是面向构建、启动、验证和客户端提示的上层归类，二者不可互相替代。
- 在 `packages/contracts/src/enum-types/` 定义 `BackendTarget`、`backendTargetSchema` 与 profile-to-target 映射的共享读取 API；禁止 CLI、host 或脚本重新声明 `'light' | 'heavy'`。
- 创建 repository-owned target registry，集中声明每个 target 的 profile、宿主包、dev/build 启动入口、验证集合与 capability posture。`scripts/run-dev.ts`、根脚本和后续 operator tooling 从该 registry 派生，不保留平行 target map。
- `client-core` 维持 transport-only；`backendTarget` 位于其上层的 CLI/Web client 配置，不把分布式内部 URL 或 service-discovery 暴露给客户端。
- 不在本主线承诺 shared PostgreSQL 的物理隔离、独立服务 identity、Kubernetes 编排、第二套控制面或 light/heavy capability parity；这些仍是 deferred platform topics。

## 全局完成条件

- [x] `light`/`heavy`、三档 profile、host ownership 和 gateway-only 语义在 contracts、registry、CLI、文档中一致。
- [x] 每个 target 都能由命名入口启动/构建，并有不依赖人工解释的 focused test 和 closeout 命令。
- [x] CLI 旧配置保持可读，新配置只写 canonical `gatewayUrl` 与 `backendTarget`。
- [x] 所有阶段的 required docs、测试和验证记录均已回写；`rtk pnpm typecheck`、`rtk pnpm check:docs-drift`、`rtk pnpm check:structure` 通过。

## Phase 0：冻结基线与迁移契约

**代码与测试：**

- Inspect: `scripts/run-dev.ts`、`package.json`、`packages/cli/src/lib/config.ts`、`packages/host-local/src/nest/config/config.ts`、`packages/host-distributed/src/config/service-config.ts`
- Test: `scripts/__tests__/run-dev.test.ts`、`packages/cli/src/lib/config.test.ts`

**文档：**

- Update: `docs/architecture/components/CLIENT.md`、`docs/architecture/ARCHITECTURE.md`、`docs/operations/TESTING.md`

- [x] 记录当前 `local-agent`、`team-monolith`、`distributed` profile 到 host、gateway/worker 入口的映射，以及其当前 light/heavy posture。
- [x] 明确 canonical client contract：`backendTarget: 'light' | 'heavy'`、默认和非法值回退为 `light`、唯一 `gatewayUrl`；列出旧配置兼容规则。
- [x] 写入 target registry 的最小字段契约：`id`、`profiles`、`hostPackage`、`devTargets`、`buildCommand`、`verificationCommands`、`clientDefault`。
- [x] 在上述架构与测试文档中同步 current-vs-deferred 边界；不得把 heavy 写成已经具备物理数据隔离或完整服务自治。
- [x] Run: `rtk pnpm test:file -- scripts/__tests__/run-dev.test.ts`。
- [x] Run: `rtk pnpm --filter @trapmap/cli test --run src/lib/config.test.ts`。
- [x] 回写命令输出、发现的兼容别名和任何阻塞项到本阶段下方的执行记录。

**执行记录（2026-07-11）：** 已确认并文档化：`local-agent` / `team-monolith` 由 `@trapmap/host-local` 承载并归入 `light`；`distributed` 由 `@trapmap/host-distributed` gateway/worker 拓扑承载并归入 `heavy`。canonical CLI contract 是单一 `gatewayUrl` 加 `backendTarget`，旧 `serverUrl` 仅读兼容；缺省/非法 target 回退 `light`。registry field contract 由 `scripts/backend-target-registry.ts` 实现。`run-dev.test.ts`（1 file / 7 tests）和 CLI config test（包含在 2 files / 39 tests）均通过；详情见 Phase 1 和 Phase 3 执行记录。

## Phase 1：建立共享 target contract 与 registry

**代码与测试：**

- Create: `packages/contracts/src/enum-types/backend-target.ts`
- Modify: `packages/contracts/src/enum-types/index.ts`、`packages/contracts/src/index.ts`
- Create: `packages/contracts/src/enum-types/backend-target.test.ts`
- Create: `scripts/backend-target-registry.ts`
- Create: `scripts/__tests__/backend-target-registry.test.ts`
- Modify: `scripts/run-dev.ts`、`scripts/__tests__/run-dev.test.ts`

**文档：**

- Update: `docs/reference/SYSTEM_TRUTH_SOURCES.md`、`docs/architecture/components/CLIENT.md`、`docs/operations/TESTING.md`

- [x] 先为两个有效 target、未知值回退、三个 profile 到 target 的映射写 failing contract tests。
- [x] 在 `backend-target.ts` 使用既有 enum-types 模式导出 `BackendTarget`、Zod schema、`normalizeBackendTarget()` 与 `resolveBackendTargetForProfile()`；只接受 `light`/`heavy`。
- [x] 建立 `scripts/backend-target-registry.ts`，让其成为 dev target、host package、build/verification command 的唯一脚本级事实源；保留现有 `distributed:*` 别名作为兼容输入，不增加新 profile。
- [x] 让 `run-dev.ts` 从 registry 解析 target/profile；测试 normal、compatibility alias、help text 与未知 target 失败语义。
- [x] 在 truth-source、client architecture 和 testing docs 中标出 registry、contracts 与脚本的 owner 关系。
- [x] Run: `rtk pnpm --filter @trapmap/contracts test --run src/enum-types/backend-target.test.ts`。
- [x] Run: `rtk pnpm test:file -- scripts/__tests__/backend-target-registry.test.ts`。
- [x] Run: `rtk pnpm test:file -- scripts/__tests__/run-dev.test.ts`。
- [x] Run: `rtk pnpm typecheck`。

**执行记录（2026-07-11）：** `backend-target.test.ts` passed（1 file / 3 tests）；`backend-target-registry.test.ts` passed（1 file / 3 tests）；`run-dev.test.ts` passed（1 file / 7 tests）；`rtk pnpm typecheck` reported `TypeScript: No errors found`。详情见 `.superpowers/sdd/backend-target-task-1-report.md`。

## Phase 2：收敛两种构建与验证入口

**代码与测试：**

- Modify: `package.json`、`scripts/backend-target-registry.ts`
- Modify or create: `scripts/__tests__/backend-target-build.test.ts`
- Inspect: `packages/host-local/package.json`、`packages/host-distributed/package.json`、`scripts/runtime-closeout.ts`

**文档：**

- Update: `README.md`、`docs/architecture/CLI.md`、`docs/operations/TESTING.md`、`docs/operations/ENVIRONMENT.md`

- [x] 增加两个明确的 root build target commands（`build:light`、`build:heavy`）；它们由 registry 映射到现有 host build surface，不复制 TypeScript build logic。
- [x] 增加两个明确的 target verification commands（`test:light-target`、`test:heavy-target`），分别聚合现有 host-local 最小证明及 distributed/discovery/runtime closeout 证明；避免把根级全量 `pnpm test` 当成 target check。
- [x] 为命令映射写测试，验证 light 不启动 distributed worker、heavy 不把 CLI 指向内部 service，且失败 target 不被静默接受。
- [x] 更新 README、CLI architecture、environment 与 testing：写清何时选 light/heavy、每档入口、必需环境、验证范围与 distributed 的 gateway-only 限制。
- [x] Run: `rtk pnpm test:file -- scripts/__tests__/backend-target-build.test.ts`。
- [x] Run: `rtk pnpm test:deployment-smoke`。
- [x] Run: `rtk pnpm test:runtime-foundations`。
- [x] Run: `rtk pnpm test:distributed-closeout`。

**执行记录（2026-07-11）：** `backend-target-build.test.ts` passed（inherited-key regression fix 后最终重跑：1 file / 11 tests）；`deployment-smoke` passed（8 files / 170 tests / 4 skipped）；`runtime-foundations` passed（10 files / 174 tests / 10 skipped；existing graph-extraction invalid-edge stderr was expected）；`distributed-closeout` passed（5 files / 30 tests）；`build:light` and `build:heavy` both passed. Details: `.superpowers/sdd/backend-target-task-2-report.md`.

## Phase 3：迁移客户端 `backendTarget` 配置

**代码与测试：**

- Modify: `packages/cli/src/lib/config.ts`、`packages/cli/src/lib/config.test.ts`
- Inspect and update as applicable: `packages/web-panel/src/**`、`packages/client-core/README.md`
- Test: `packages/cli/src/lib/http.test.ts`、受影响 Web client configuration test

**文档：**

- Update: `packages/cli/README.md`、`packages/client-core/README.md`、`docs/architecture/components/CLIENT.md`、`docs/guides/CLIENT_INTEGRATION.md`

- [x] 将 CLI 的本地 `BackendTarget` 定义迁移为 contracts 导出；保持 `backendTarget` 默认 `light`、旧配置缺省/未知值回退 `light`。
- [x] 如 web-panel 或其他外部 client 有持久化连接配置，将同一字段、schema 和 fallback 接入其配置层；没有此类配置时，明确记录“不新增 UI selector”的理由与 CLI 作为当前唯一持久化 client 的事实。
- [x] 确认 `backendTarget` 仅影响诊断、提示和由 registry 定义的默认行为；HTTP client 一律继续从唯一 `gatewayUrl` 建立连接。
- [x] 为旧配置 migration、显式 `heavy` 保留、未知值归一化、gateway URL 未分叉写测试；为 web client 的接入或不接入决定增加对应测试/断言。
- [x] 更新四份 client 文档，给出 JSON 配置示例、两个值的 profile 映射、兼容规则和 gateway-only 非目标。
- [x] Run: `rtk pnpm --filter @trapmap/cli test --run src/lib/config.test.ts src/lib/http.test.ts`。
- [x] Run: `rtk pnpm typecheck`。

**执行记录（2026-07-11）：** CLI config/http focused suite passed（2 files / 39 tests）；`rtk pnpm typecheck` reported `TypeScript: No errors found`。web-panel has no persisted connection configuration, so no selector or additional configuration test was added; this is now documented as the explicit no-op decision. Details: `.superpowers/sdd/backend-target-task-3-report.md`.

## Phase 4：跨包边界、文档与发布关闭

**代码与测试：**

- Inspect: 所有从 contracts、registry 与客户端配置新增/修改的 imports
- Test: Phase 1-3 的 focused tests

**文档：**

- Update: `docs/reference/SYSTEM_TRUTH_SOURCES.md`、`docs/reference/api-surface.md`（若 shared schema 对外导出）、`docs/operations/TESTING.md`、`docs/operations/ENVIRONMENT.md`、`README.md`、各 package README

- [x] 检查没有在 host、CLI、web-panel 或脚本中遗留重复的 `light | heavy` union、profile 映射或平行启动命令表。
- [x] 审核所有跨包 imports；若新增路径或包依赖，更新 `docs/architecture/BOUNDARIES.md` 的例外（仅当确有边界变化）并运行 architecture audit。
- [x] 将实际命令、target owner、client migration 和 deferred platform boundary 同步到权威 reference 后，再更新 README/guide 等二级文档。
- [x] Run: `rtk pnpm exec fallow audit --base main`（仅在新增跨包 import 或 package dependency 时）。
- [x] Run: `rtk pnpm typecheck`。
- [x] Run: `rtk pnpm check:docs-drift`。
- [x] Run: `rtk pnpm check:structure`。
- [x] `rtk pnpm eval:smoke` 不适用：本主线未触及检索、摘要、治理、feedback、fixtures 或 eval runner。
- [x] 实施、文档与可在本地执行的验证结果均已记录；部署级 `runtime-closeout` 前置条件转为归档证据，不再作为 active owner blocker。

**执行记录（2026-07-11，closeout and archive）：** Earlier focused validation is recorded above. This documentation task updated authority-first reference pages and the required secondary pages. `rtk pnpm check:docs-drift` passed (`All 46 doc rule(s) passed`) and `rtk pnpm check:structure` passed (`All checks passed`). `rtk pnpm exec fallow audit --base main` completed without architecture-boundary findings; it reported existing quality metrics (2 complexity findings and 42 duplicate clone groups), which are outside this target/documentation scope. Final controller verification: `rtk pnpm test:discovery-closeout` passed (4 files / 30 tests) and `rtk pnpm typecheck` reported `TypeScript: No errors found`. `rtk pnpm test:runtime-closeout` stopped at its required external preflight because `TRAPMAP_SYSTEM_ADMIN_KEY` is unset; no runtime closeout assertions ran. This is an operator/deployment prerequisite rather than an implementation blocker, so the completed plan is archived. A future operator run should use a configured distributed gateway and admin key, recording its result in the relevant deployment evidence rather than reopening this checklist.

## 非目标与问题回写

- 物理数据库拆分、MQ 产品化、Kubernetes、mTLS/service identity、完整 observability platform 和 heavy capability parity 继续是 deferred platform work，不得随本计划暗中实现。
- 新问题必须记录来源、影响、分类、证据和建议落点；与本计划直接相关的 blocker 写入对应 Phase 执行记录，其他问题写入下一任 active mainline 的 issue pool。
- 此计划替代而不删除历史 engineering debt register；历史审计依据保留在 [`open-debt-and-compromises-2026-07-11-archived.md`](open-debt-and-compromises-2026-07-11-archived.md)。
