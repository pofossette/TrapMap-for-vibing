# TrapMap 智能体入口

本文件是智能体和贡献者的入口索引，不承载完整项目说明。需要细节时按链接逐步展开，避免在单个文件中复制过长内容。

## 基本情况

TrapMap 是 pnpm + TypeScript monorepo，用于团队工程知识、陷阱经验和 Skill 工件的提交、审核、索引与检索。主包位于 [`packages/`](packages/)：
[`packages/cli`](packages/cli/) 是 Commander CLI，[`packages/server`](packages/server/) 是 Fastify API，
[`packages/contracts`](packages/contracts/) 是共享 Zod schema 和类型，[`evals/`](evals/) 是检索与摘要评测。

## 推荐阅读顺序

- 项目总览和常用命令：[`README.md`](README.md)
- 文档索引：[`docs/README.md`](docs/README.md)
- 本地开发：[`docs/guides/GETTING_STARTED.md`](docs/guides/GETTING_STARTED.md)
- 代码阅读路径：[`docs/guides/CODE_GUIDE.md`](docs/guides/CODE_GUIDE.md)
- 包职责：[`docs/PACKAGES.md`](docs/PACKAGES.md)

## 按任务跳转

- 改 CLI：从 [`packages/cli/src/index.ts`](packages/cli/src/index.ts) 和 [`packages/cli/src/commands/`](packages/cli/src/commands/) 开始。
- 改 Server：从 [`packages/server/src/app.ts`](packages/server/src/app.ts)、[`packages/server/src/routes/`](packages/server/src/routes/) 和 [`packages/server/src/lib/`](packages/server/src/lib/) 开始。
- 改契约：先看 [`packages/contracts/src/index.ts`](packages/contracts/src/index.ts) 与 [`packages/contracts/src/domain/`](packages/contracts/src/domain/)。
- 改检索或摘要质量：先看 [`docs/operations/TESTING.md`](docs/operations/TESTING.md)、[`evals/retrieval/README.md`](evals/retrieval/README.md)、[`evals/summary/README.md`](evals/summary/README.md)。
- 改安全、权限或配置：先看 [`docs/operations/SECURITY.md`](docs/operations/SECURITY.md)、[`docs/operations/ENVIRONMENT.md`](docs/operations/ENVIRONMENT.md)、[`docs/architecture/components/GOVERNANCE.md`](docs/architecture/components/GOVERNANCE.md)。
- 改 Skill 工作流：先看 [`packages/skills/workflow-with-trapmap/SKILL.md`](packages/skills/workflow-with-trapmap/SKILL.md)；需要具体命令签名时再看 [`packages/skills/trapmap-cli-usage-guide/SKILL.md`](packages/skills/trapmap-cli-usage-guide/SKILL.md)。

## 常用命令

```bash
pnpm install
pnpm build
pnpm dev:server
pnpm dev:cli
pnpm test
pnpm typecheck
pnpm check
pnpm eval:smoke
```

Codex 在本仓库执行 shell 命令时应按本地约定加 `rtk` 前缀，例如 `rtk pnpm test`。

## 变更前检查

共享类型和 API 形状以 `packages/contracts` 为准。提交前优先运行与改动相关的最小验证；涉及检索、摘要、治理或 fixtures 时至少运行 `pnpm eval:smoke`。提交规范、PR 要求和测试命名见 [`docs/guides/CONTRIBUTING.md`](docs/guides/CONTRIBUTING.md) 与 [`docs/operations/TESTING.md`](docs/operations/TESTING.md)。

## 目录结构守护

仓库目录结构的权威规则见 [`docs/reference/REPO_STRUCTURE.md`](docs/reference/REPO_STRUCTURE.md)。CI 中的 `doc-rules` 任务会运行以下守护脚本，提交前可本地验证：

```bash
pnpm check:docs-drift   # 文档内容漂移检查
pnpm check:structure     # 目录结构守护（根文件白名单、docs 子目录白名单、包 README 检查）
```
