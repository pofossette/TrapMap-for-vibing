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

## Vitest 使用要求

- 根目录 `pnpm test` 会读取根 [`vitest.config.ts`](vitest.config.ts)，按 multi-project workspace 方式同时加载 `scripts`、`contracts`、`server`、`backend-core`、`client-core`、`cli`、`evals` 测试；不要把它当成“只看某几个失败用例”的轻量命令。
- 仓库内默认 `pnpm test` 是非 watch 的一次性执行；如果确实需要 watch，必须显式调用 `pnpm exec vitest`，不要把长驻 watch 作为默认测试入口。
- 禁止使用根级全量测试再接 `grep`、`tail`、`head` 的方式查看失败列表，例如 `rtk pnpm test 2>&1 | grep ...`、`rtk pnpm test 2>&1 | tail ...`。这类命令仍会先拉起整套 Vitest worker，容易触发大量 Node 进程与 OOM。
- 单文件测试必须优先使用 `rtk pnpm test:file -- <repo-root-relative-test-path>`。该脚本会把文件映射到唯一 project，并执行 `vitest run --project <name> <project-local-path>`。
- 只跑某个包时，必须使用包级命令，例如 `rtk pnpm --filter @trapmap/server test --run src/lib/runtime/metrics.test.ts`，不要在仓库根用模糊路径或 basename 过滤。
- 修改后验证应优先运行“与改动相关的最小测试集合”，只有在确实需要时才运行根级 `rtk pnpm test` 全量测试。

## 变更前检查

共享类型和 API 形状以 `packages/contracts` 为准。提交前优先运行与改动相关的最小验证；涉及检索、摘要、治理或 fixtures 时至少运行 `pnpm eval:smoke`。提交规范、PR 要求和测试命名见 [`docs/guides/CONTRIBUTING.md`](docs/guides/CONTRIBUTING.md) 与 [`docs/operations/TESTING.md`](docs/operations/TESTING.md)。

## 枚举与类型约定

- 项目的枚举、字面量联合类型、共享接口/类型别名，默认集中到就近的 `enum-types/` 文件夹，不再把这类定义散落在业务实现文件、store、route 或组件文件中。
- `enum-types/` 内部按领域拆分文件，例如 `lifecycle.ts`、`review.ts`、`runtime.ts`，避免继续维护单个超大 `types.ts`。
- 每个 `enum-types/` 文件夹必须提供 `index.ts` 作为唯一聚合出口；目录外优先从该 `index.ts` 导入，不直接深链到具体类型文件，除非是目录内部重组过程中的临时改造。
- 包级入口如 `packages/contracts/src/index.ts`、`packages/server/src/lib/types.ts`、`packages/web-panel/src/shared/index.ts` 若需要暴露这些定义，应继续只转发对应 `enum-types/index.ts`，不要重复拼接零散导出。
- 新增枚举时优先评估是否应建模为 `const` 字面量集合 + union type；只有在确实需要 TypeScript `enum` 语义时才使用 `enum`。无论采用哪种形式，仍然放在 `enum-types/` 下统一管理。
- 历史散落定义在改动触达时逐步迁移到 `enum-types/`，并同步清理重复导出、跨层直连导入和“定义/导出同处一文件”的混合写法。

## 目录结构守护

仓库目录结构的权威规则见 [`docs/reference/REPO_STRUCTURE.md`](docs/reference/REPO_STRUCTURE.md)。CI 中的 `doc-rules` 任务会运行以下守护脚本，提交前可本地验证：

```bash
pnpm check:docs-drift   # 文档内容漂移检查
pnpm check:structure     # 目录结构守护（根文件白名单、docs 子目录白名单、包 README 检查）
```
