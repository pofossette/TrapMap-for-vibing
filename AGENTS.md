# TrapMap 智能体入口

本文件只服务 agent 执行，不承载完整项目介绍。人类先看 [`README.md`](README.md)，文档总索引看 [`docs/README.md`](docs/README.md)。

## 入口规则

- 人类说明、项目背景、快速开始：看 [`README.md`](README.md)
- agent 任务路由、最小验证、回写要求：看本文件
- 架构/命令/目录等事实冲突时：以 [`docs/reference/SYSTEM_TRUTH_SOURCES.md`](docs/reference/SYSTEM_TRUTH_SOURCES.md) 为准
- 目录归属和允许的文档落点：以 [`docs/reference/REPO_STRUCTURE.md`](docs/reference/REPO_STRUCTURE.md) 为准
- 什么时候必须更新文档、索引、测试或 badcase：看 [`docs/guides/DOCUMENTATION_GOVERNANCE.md`](docs/guides/DOCUMENTATION_GOVERNANCE.md)
- 在本仓库执行 shell 命令时按本地约定加 `rtk` 前缀，例如 `rtk pnpm test:file -- packages/server/src/app.test.ts`

## 通用执行约束

- 共享类型、Schema、API shape 以 [`packages/contracts/src/index.ts`](packages/contracts/src/index.ts) 和 [`packages/contracts/src/domain/`](packages/contracts/src/domain/) 为准
- 修改后优先运行“与改动直接相关的最小验证集合”，只有确实需要时才跑根级全量 `pnpm test`
- 涉及检索、摘要、治理、feedback、fixtures、eval runner 的改动，至少补跑 `pnpm eval:smoke`
- 新增枚举、字面量联合、共享接口/类型别名时，默认放到就近 `enum-types/` 目录并通过 `index.ts` 聚合导出

## Vitest 使用要求

- 根目录 `pnpm test` 会读取根 [`vitest.config.ts`](vitest.config.ts)，按 multi-project workspace 同时加载 `scripts`、`contracts`、`server`、`backend-core`、`client-core`、`cli`、`evals` 测试；不要把它当成轻量失败筛选命令
- 默认 `pnpm test` 是一次性执行；需要 watch 时必须显式调用 `pnpm exec vitest`
- 禁止使用根级全量测试再接 `grep`、`tail`、`head` 的方式查看失败列表，例如 `rtk pnpm test 2>&1 | tail ...`
- 单文件测试优先使用 `rtk pnpm test:file -- <repo-root-relative-test-path>`
- 只跑某个包时，使用包级命令，例如 `rtk pnpm --filter @trapmap/server test --run src/lib/runtime/metrics.test.ts`

## 任务分流

### CLI 变更

- 先读：[`packages/cli/src/index.ts`](packages/cli/src/index.ts)、[`packages/cli/src/commands/`](packages/cli/src/commands/)、[`packages/cli/README.md`](packages/cli/README.md)
- 权威事实：[`package.json`](package.json) 中根脚本、[`docs/reference/SYSTEM_TRUTH_SOURCES.md`](docs/reference/SYSTEM_TRUTH_SOURCES.md) 的 startup/root command 条目
- 最小验证：`rtk pnpm --filter @trapmap/cli test --run <test-path>`；必要时补 `rtk pnpm test:deployment-smoke`
- 必须同步：命令入口、CLI 使用方式、网关接入模型变化时，更新 [`README.md`](README.md)、[`docs/architecture/CLI.md`](docs/architecture/CLI.md)、相关 guide/README

### Server / API 变更

- 先读：[`packages/server/src/app.ts`](packages/server/src/app.ts)、[`packages/server/src/routes/`](packages/server/src/routes/)、[`packages/server/src/lib/`](packages/server/src/lib/)
- 权威事实：[`docs/reference/SYSTEM_TRUTH_SOURCES.md`](docs/reference/SYSTEM_TRUTH_SOURCES.md)、[`packages/server/src/config.ts`](packages/server/src/config.ts)、相关 route/schema 源码
- 最小验证：按改动范围运行对应包级测试；涉及 runtime/profile/route surface 时补 `rtk pnpm test:deployment-smoke` 或 `rtk pnpm test:runtime-foundations`
- 必须同步：API surface、运行时默认值、健康检查、部署行为变化时，更新对应 `reference/`、`architecture/`、`operations/` 文档

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
- 权威事实：[`packages/server/src/config.ts`](packages/server/src/config.ts)、权限/治理相关 contract 与 route 源码、[`docs/reference/SYSTEM_TRUTH_SOURCES.md`](docs/reference/SYSTEM_TRUTH_SOURCES.md)
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
- 最小验证：`rtk pnpm check:docs-drift`、`rtk pnpm check:structure`；必要时补对应 truth smoke
- 必须同步：新增规则时优先更新权威页，再回写入口索引；如果同类漂移可能复发，补充 doc-drift 规则或贡献约定
