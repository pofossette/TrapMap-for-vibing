# 投稿指南

> 状态：Active。你照这页走，PR 能一次过守卫。

## 开发环境

搭建步骤见 `docs/guides/GETTING_STARTED.md`。日常命令都在仓库根跑：

```bash
pnpm install

pnpm build

pnpm test

pnpm typecheck

pnpm lint
```

## 分支管理

- `main` 是主分支，功能合入这里
- 功能分支命名：`feat/<功能名>` 或 `fix/<问题描述>`

## 提交规范

格式：

```text
<类型>(<范围>): <简短描述>

[可选的详细正文]

[可选的脚注]
```

类型前缀取 `feat`、`fix`、`docs`、`chore`、`refactor`、`test`、`perf` 之一。

## 代码规范

### TypeScript

- 新代码一律 TypeScript，`strict: true`
- 少用 `any`，先用 `unknown` 加类型守卫
- 导出类型用 `type`，不用 `interface`

### Schema 定义

- 用 `packages/contracts` 里的 Zod Schema
- 业务代码不直接造裸对象，先过 Schema 验证
- Schema 变更保持向后兼容

### 测试

- 核心业务逻辑必须有测试覆盖
- 测试框架是 Vitest，文件与源码同目录，命名 `*.test.ts`
- 跑单文件用 `pnpm test:file -- <仓库根相对路径>`，它把路径映射到唯一 project，避免跨 project 误命中

## 数据库迁移

表结构变更走迁移文件交付，不在 repository 里运行时建表。迁移基线按 service owner 划分（约定路径 `packages/service-*/drizzle/`，该目录布局未在此轮核对，落点以 `docs/reference/DATABASE_SCHEMA.md` 为准），distributed host 在启动时按依赖顺序执行。迁移只支持空库，已有开发数据库需重建。

`packages/server/` 兼容壳已于 2026-07-31 删除，任何 `pnpm --filter @trapmap/server db:*` 写法都已失效，不要再写进文档或脚本。

## Gitignore 与构建产物

根 `.gitignore` 忽略 `dist/`、`build/`、`*.tsbuildinfo`、`node_modules/`、`coverage/`、`*.lcov`、`.nyc_output/`、`.env` 与 `.env.*`（保留 `.env.example`）、运行时数据目录。新忽略规则改根 `.gitignore`，不进各包。

## Pull Request 流程

1. 建分支：`git checkout -b feat/my-feature`
2. 开发并验证：`pnpm test` 与 `pnpm typecheck` 通过
3. 按提交规范提交
4. Push 并开 PR，写清变更内容与动机
5. 至少一名维护者审核后合并

### 需要审核的变更

Schema（`packages/contracts`）、API 端点、认证与权限逻辑、数据存储，四类必须有人看。

### 评估相关变更

- 用例增改后跑 `pnpm --filter @trapmap/evals eval:smoke` 验证
- CI 评估变更保证 `pnpm --filter @trapmap/evals eval:ci` 通过
- PR 改动 `packages/contracts/src/domain/evals/**`、`evals/**`、`packages/service-*/src/**` 时，`eval.yml` 的 smoke tier 自动触发，结果以 PR 评论呈现

## 文档贡献

- 新功能同步更新相关文档，语言用简体中文
- 分层、回写触发、badcase 沉淀规则见 `docs/guides/DOCUMENTATION_GOVERNANCE.md`

## 复发性问题沉淀规则

真实问题同时满足可复现或可稳定描述、未来可能再犯、影响结果正确性或治理安全或流程稳定时，你必须判断沉淀去向：测试用例、文档规则、Skill 或 Trap 条目、badcase 或 eval case。不沉淀也在 PR 描述里写原因。

## 文档影响检查清单

变更涉及对应项时，你同步更新对应文档：

- [ ] 持久化架构：`docs/reference/DOCS_TRUTH_MATRIX.md` 相关行
- [ ] 启动或命令：`docs/README.md` 与 `docs/guides/GETTING_STARTED.md` 的命令示例
- [ ] 入口职责：`README.md`、`AGENTS.md`、`CLAUDE.md`、`docs/guides/DOCUMENTATION_GOVERNANCE.md`
- [ ] CI 或测试：`docs/operations/CI_CD.md`、`docs/operations/TESTING.md`
- [ ] 数据库 Schema：`docs/reference/DATABASE_SCHEMA.md` 的表计数
- [ ] 部署配置：`docs/architecture/DEPLOYMENT.md`

### 验证命令

```bash
pnpm check:docs

pnpm check:complexity

pnpm duplication

pnpm check:fallow
```

## 相关链接

- [TrapMap](../../README.md#--documentation)
- [TrapMap API 参考](../archived/architecture/API.md)
- [数据模型](../reference/DATA_MODEL.md)
- [TrapMap 评测工作区](../../evals/README.md)
