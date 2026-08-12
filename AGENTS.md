# TrapMap 智能体入口

本文件只服务 agent 执行，不承载完整项目介绍。人类先看 [`README.md`](README.md)，文档总索引看 [`docs/README.md`](docs/README.md)。

## 入口规则

- 人类说明、项目背景、快速开始：看 [`README.md`](README.md)
- agent 任务路由、最小验证、回写要求：看本文件
- 架构/命令/目录等事实冲突时：以 [`docs/reference/SYSTEM_TRUTH_SOURCES.md`](docs/reference/SYSTEM_TRUTH_SOURCES.md) 为准
- 目录归属和允许的文档落点：以 [`docs/reference/REPO_STRUCTURE.md`](docs/reference/REPO_STRUCTURE.md) 为准
- 什么时候必须更新文档、索引、测试或 badcase：看 [`docs/guides/DOCUMENTATION_GOVERNANCE.md`](docs/guides/DOCUMENTATION_GOVERNANCE.md)
- 在本仓库执行 shell 命令时按本地约定加 `rtk` 前缀，例如 `rtk pnpm test:file -- packages/host-local/src/nest/app.test.ts`

## 计划与待办目录规则

- `plan.md`（根）：只做索引，链接当前活跃细则，不承载执行细节
- `docs/todos/`：只保留当前 active mainline detail 与其内联承载的 debt/backlog/deferred 信息；已完成或只剩参考价值的文档归档至 `docs/archived/archived-plans/`
- 当前只有根 `plan.md` 显式链接的主细则属于 active execution surface；已归档 closeout 文档只作历史参考，详见 `docs/todos/README.md`
- 新增问题优先进入当前活跃细则的问题池或其显式声明的 deferred 落点，不回写已归档文档
- 归档操作：`git mv` 到 `docs/archived/archived-plans/`，同步更新 `docs/archived/README.md` 归档表和 `docs/todos/README.md` 索引

## 通用执行约束

- 共享类型、Schema、API shape 以 [`packages/contracts/src/index.ts`](packages/contracts/src/index.ts) 和 [`packages/contracts/src/domain/`](packages/contracts/src/domain/) 为准
- 修改后优先运行“与改动直接相关的最小验证集合”，只有确实需要时才跑根级全量 `pnpm test`
- 涉及检索、摘要、治理、feedback、fixtures、eval runner 的改动，至少补跑 `pnpm eval:smoke`
- 新增枚举、字面量联合、共享接口/类型别名时，默认放到就近 `enum-types/` 目录并通过 `index.ts` 聚合导出
- 涉及跨包导入路径变更或新增包时，必须通过 `rtk pnpm exec fallow audit --base main` 验证架构边界合规；zone 规则和已知例外详见 [`docs/architecture/BOUNDARIES.md`](docs/architecture/BOUNDARIES.md)
- 通用工具函数（`nowIso`/`timestamp`/`formatDate`/`timeout`/`truncate`/`normalizeLabel`/`uniq`/`uniqBy`/`chunk`/`asRecord`/`prefixedId`/`sha256` 等）统一从 `@trapmap/lib` 导入，禁止在各包内重复实现已有工具；新增通用函数时：多包消费的放入 `@trapmap/lib` 并补单元测试，单包专用留在包内；重复问题的分析报告见 [`docs/archived/reports/TECH_DEBT_UTILS_TYPES_2026-08-08.md`](docs/archived/reports/TECH_DEBT_UTILS_TYPES_2026-08-08.md) 与 [`docs/archived/reports/TECH_DEBT_UTILS_FACTORY_2026-08-09.md`](docs/archived/reports/TECH_DEBT_UTILS_FACTORY_2026-08-09.md)
- 通用第三方依赖（如 lodash）声明在 `@trapmap/lib` 内由各包经其消费，禁止各包直接散落声明
- 类型断言规则：禁止新增 `@ts-ignore`/`@ts-expect-error`；禁止用裸 `as never`/`as unknown as` 桥接适配器类型——优先用 [`packages/contracts`](packages/contracts/src/index.ts) 的 Zod schema 运行时校验或显式窄化 helper；确因第三方库类型缺陷必须断言时，加 `// lib type gap:` 同行注释说明；能用类型收窄/type guard 解决的不用断言。该禁令已由 `rtk pnpm check:asserts` 在 CI 与 pre-commit 拦截（豁免清单 [`docs/todos/assert-exemptions.md`](docs/todos/assert-exemptions.md) 已清零，新增裸断言视为回归）

## Vitest 使用要求

- 根目录 `pnpm test` 会读取根 [`vitest.config.ts`](vitest.config.ts)，按 multi-project workspace 同时加载 `scripts`、`contracts`、`backend-core`、`client-core`、`cli`、`evals`、各 `service-*`、`host-local`、`host-distributed` 测试；不要把它当成轻量失败筛选命令
- 默认 `pnpm test` 是一次性执行；需要 watch 时必须显式调用 `pnpm exec vitest`
- 禁止使用根级全量测试再接 `grep`、`tail`、`head` 的方式查看失败列表，例如 `rtk pnpm test 2>&1 | tail ...`
- 单文件测试优先使用 `rtk pnpm test:file -- <repo-root-relative-test-path>`
- 只跑某个包时，使用包级命令，例如 `rtk pnpm --filter @trapmap/service-knowledge-write test --run src/pg-ports.test.ts`

## 任务分流

### CLI 变更

- 先读：[`packages/cli/src/index.ts`](packages/cli/src/index.ts)、[`packages/cli/src/commands/`](packages/cli/src/commands/)、[`packages/cli/README.md`](packages/cli/README.md)
- 权威事实：[`package.json`](package.json) 中根脚本、[`docs/reference/SYSTEM_TRUTH_SOURCES.md`](docs/reference/SYSTEM_TRUTH_SOURCES.md) 的 startup/root command 条目
- 最小验证：`rtk pnpm --filter @trapmap/cli test --run <test-path>`；必要时补 `rtk pnpm test:deployment-smoke`
- 必须同步：命令入口、CLI 使用方式、网关接入模型变化时，更新 [`README.md`](README.md)、[`docs/architecture/CLI.md`](docs/architecture/CLI.md)、相关 guide/README

### Server / API 变更

- 先读：[`packages/backend-core/src/http/route-contract.ts`](packages/backend-core/src/http/route-contract.ts)、各 `packages/service-*/src/routes.ts`（`create<X>RouteDefs(deps)` 工厂）、`packages/host-local/src/nest/`、`packages/host-distributed/src/gateway/`
- 权威事实：[`packages/backend-core/src/http/route-contract.ts`](packages/backend-core/src/http/route-contract.ts)（HTTP 路由契约）、[`docs/reference/SYSTEM_TRUTH_SOURCES.md`](docs/reference/SYSTEM_TRUTH_SOURCES.md)、各 service owner 的 config/routes/schema 源码
- 最小验证：按改动范围运行对应包级测试；涉及 runtime/profile/route surface 时补 `rtk pnpm test:deployment-smoke` 或 `rtk pnpm test:runtime-foundations`
- 必须同步：API surface、运行时默认值、健康检查、部署行为变化时，更新对应 `reference/`、`architecture/`、`operations/` 文档
- 涉及 service zone 内部模块之间的跨包导入重构时，运行 `rtk pnpm exec fallow list --boundaries` 确认当前 zone 覆盖范围
- **新领域规则落点：** 新领域规则必须落在 [`packages/backend-core/src/<context>/domain/`](packages/backend-core/src/knowledge-write/domain/lifecycle.ts)（纯函数，零框架、零 DB 依赖），由 context 的 `index.ts` 聚合导出；infrastructure 层（pg-ports、宿主装配、http adapter）禁止新增业务判断
- **新 HTTP 路由必须走 RouteDef 工厂：** 新路由必须在对应 service 包以 `create<X>RouteDefs(deps)` 声明为 [`RouteDef`](packages/backend-core/src/http/route-contract.ts)，由 `createNestAdapter`/`createFastifyAdapter` 消费；host-local Nest 与 host-distributed gateway 均经 adapter 消费同一 RouteDef，禁止在任一宿主手写重复路由实现

### Contracts / 共享类型变更

- 先读：[`packages/contracts/src/index.ts`](packages/contracts/src/index.ts)、[`packages/contracts/src/domain/`](packages/contracts/src/domain/)、相关消费方测试
- 权威事实：`packages/contracts` 源码本身；必要时参考 [`docs/reference/api-surface.md`](docs/reference/api-surface.md)、[`docs/reference/DATA_MODEL.md`](docs/reference/DATA_MODEL.md)
- 最小验证：`rtk pnpm --filter @trapmap/contracts test --run <test-path>`；再跑受影响包的最小测试与 `rtk pnpm typecheck`
- 必须同步：共享契约、状态枚举、数据结构对外语义变化时，更新 `reference/`、相关 `README`、受影响 guide

### 检索 / 摘要 / Eval 变更

- 先读：[`docs/operations/TESTING.md`](docs/operations/TESTING.md)、[`evals/retrieval/README.md`](evals/retrieval/README.md)、[`evals/summary/README.md`](evals/summary/README.md)
- 权威事实：相关 eval runner、dataset、scenario 与 [`package.json`](package.json) 中 eval 脚本
- 最小验证：相关包/文件测试 + `rtk pnpm eval:smoke`；只改单一 eval 子系统时先跑对应子命令
- 必须同步：评测入口、tier、判定标准、dataset 组织方式变化时，更新 `TESTING.md`、对应 eval README、必要的入口索引

### 安全 / 权限 / 配置变更

- 先读：[`docs/operations/SECURITY.md`](docs/operations/SECURITY.md)、[`docs/operations/ENVIRONMENT.md`](docs/operations/ENVIRONMENT.md)、[`docs/architecture/components/GOVERNANCE.md`](docs/architecture/components/GOVERNANCE.md)
- 权威事实：[`packages/host-local/src/nest/config/config.ts`](packages/host-local/src/nest/config/config.ts)、[`packages/host-distributed/src/config/service-config.ts`](packages/host-distributed/src/config/service-config.ts)、权限/治理相关 contract 与 route 源码、[`docs/reference/SYSTEM_TRUTH_SOURCES.md`](docs/reference/SYSTEM_TRUTH_SOURCES.md)
- 最小验证：受影响测试 + `rtk pnpm typecheck`；涉及 runtime/env surface 时补 `rtk pnpm test:deployment-smoke`
- 必须同步：环境变量、权限模型、安全级别、治理流程变化时，更新 `operations/`、`reference/` 与必要的 `README`

### Skill 工作流变更

- 先读：[`packages/skills/workflow-with-trapmap/SKILL.md`](packages/skills/workflow-with-trapmap/SKILL.md)、[`packages/skills/trapmap-cli-usage-guide/SKILL.md`](packages/skills/trapmap-cli-usage-guide/SKILL.md)、[`packages/skills/README.md`](packages/skills/README.md)
- 权威事实：Skill artifact 相关 contract、server route、CLI activate/download 路径源码
- 最小验证：相关包测试；涉及导入导出时补 `rtk pnpm test:import-export`；涉及检索命中/激活链路时补 `rtk pnpm eval:smoke`
- 必须同步：Skill 目录结构、激活流程、客户端接入方式变化时，更新 skill README、[`docs/guides/CLIENT_INTEGRATION.md`](docs/guides/CLIENT_INTEGRATION.md) 与相关入口索引

### 文档 / 目录规则变更

- 先读：[`docs/guides/DOCUMENTATION_GOVERNANCE.md`](docs/guides/DOCUMENTATION_GOVERNANCE.md)、[`docs/reference/SYSTEM_TRUTH_SOURCES.md`](docs/reference/SYSTEM_TRUTH_SOURCES.md)、[`docs/reference/REPO_STRUCTURE.md`](docs/reference/REPO_STRUCTURE.md)
- 权威事实：`reference/` 下权威页、[`package.json`](package.json) 的守卫脚本、相关 CI workflow
- 最小验证：`rtk pnpm check:docs`、`rtk pnpm check:structure`；必要时补对应 truth smoke
- 必须同步：新增规则时优先更新权威页，再回写入口索引；如果同类漂移可能复发，补充 doc-drift 规则或贡献约定

### 可观测性 / 健康检查 / 服务发现变更

- 先读：[`docs/architecture/OBSERVABILITY.md`](docs/architecture/OBSERVABILITY.md)、[`docs/architecture/SERVICE-DISCOVERY.md`](docs/architecture/SERVICE-DISCOVERY.md)、[`docs/operations/OBSERVABILITY-OPERATIONS.md`](docs/operations/OBSERVABILITY-OPERATIONS.md)
- 权威事实：健康契约 [`packages/contracts/src/domain/health.ts`](packages/contracts/src/domain/health.ts)、遥测端口 [`packages/backend-core/src/ports/telemetry-ports.ts`](packages/backend-core/src/ports/telemetry-ports.ts)
- 最小验证：`rtk pnpm test:observability-closeout`、`rtk pnpm test:discovery-closeout`；涉及 distributed hop 补 `rtk pnpm test:distributed-closeout`；涉及部署配置时补 `rtk pnpm test:deployment-smoke` 与 `rtk pnpm test:runtime-foundations`
- 回归命令参考：[`docs/operations/REGRESSION-COMMANDS.md`](docs/operations/REGRESSION-COMMANDS.md)
- 必须同步：指标暴露、健康端点语义、采样策略、服务发现配置变化时，更新对应 `architecture/`、`operations/` 文档
