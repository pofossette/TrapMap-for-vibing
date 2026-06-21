# 投稿指南

感谢你对 TrapMap 的贡献！本文档说明代码规范、提交流程和审核注意事项。

## 开发环境

详细搭建步骤请参阅 [GETTING_STARTED.md](./GETTING_STARTED.md)。

```bash
# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 运行测试
pnpm test

# 类型检查
pnpm typecheck

# 代码风格检查
pnpm lint
```

## 分支管理

- `main` — 主分支，所有功能合并至此
- 功能开发在独立分支进行，命名格式：`feat/<功能名>` 或 `fix/<问题描述>`

## 提交规范

### 格式

```
<类型>(<范围>): <简短描述>

[可选的详细正文]

[可选的脚注]
```

### 类型前缀

| 前缀 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | 错误修复 |
| `docs` | 文档变更 |
| `chore` | 构建/工具变更 |
| `refactor` | 重构（不修复问题也不加功能） |
| `test` | 测试相关 |
| `perf` | 性能优化 |

### 示例

```
feat(retrieval): add graph-assisted retrieval mode

Implement hybrid semantic + keyword + graph expansion pipeline.
Add Hit@K, MRR, nDCG metrics computation.

Closes #123
```

```
fix(eval): add graphIndexDocuments to scenario schema

Without this field, the CI eval was failing on v3-graph-plan
cases because the graph index wasn't populated.
```

## 代码规范

### TypeScript

- 所有新代码使用 TypeScript
- 严格模式（`strict: true`）
- 避免使用 `any`，优先使用 `unknown` + 类型守卫
- 导出类型而非接口（`type` vs `interface`）

### Schema 定义

- 使用 `packages/contracts` 中的 Zod Schema
- 不要在业务代码中直接使用原始对象，使用 Schema 验证
- Schema 变更需要向后兼容

### 测试

- 核心业务逻辑必须有测试覆盖
- 使用 Vitest 作为测试框架
- 测试文件与源文件在同一目录下，命名 `*.test.ts`

## 数据库迁移

数据库表结构通过 Drizzle ORM 管理，所有 DDL 变更必须通过迁移文件交付：

```bash
# 生成迁移（修改 packages/server/src/lib/persistence/schema.ts 后）
pnpm --filter @trapmap/server db:generate

# 手动运行迁移
pnpm --filter @trapmap/server db:migrate
```

- 迁移文件位于 `packages/server/drizzle/`
- 服务器启动时会通过 migration runner 自动运行迁移
- 禁止在 repository 中通过 `ensureSchema()` 等运行时方法建表

## Gitignore 与构建产物

仓库根目录的 `.gitignore` 已配置忽略以下目录和文件：

| 类别 | 忽略项 |
|------|--------|
| 构建输出 | `dist/`、`build/`、`*.tsbuildinfo` |
| 依赖 | `node_modules/` |
| 测试覆盖率 | `coverage/`、`*.lcov`、`.nyc_output/` |
| 环境变量 | `.env`、`.env.*`（保留 `.env.example`） |
| 运行时数据 | `data/`、`.data/`、`logs/` |

**注意事项：**

- `pnpm build` 生成的 `dist/` 目录不得提交到版本控制
- 提交前运行 `git status` 确认无构建产物被暂存
- 如需添加新的忽略规则，修改根目录 `.gitignore`（而非各包内的 `.gitignore`）
- AI 工具目录（`.claude/`、`.agent/` 等）大部分已忽略，仅保留 `workflow-with-trapmap` 与 `trapmap-cli-usage-guide` Skill 文件

## Pull Request 流程

1. **创建分支**：`git checkout -b feat/my-feature`
2. **开发并测试**：确保 `pnpm test` 和 `pnpm typecheck` 通过
3. **提交**：遵循提交规范
4. **Push**：`git push origin feat/my-feature`
5. **创建 PR**：描述变更内容和动机
6. **审核**：至少一名维护者审核后合并

## 评审注意事项

### 需要审核的变更

- 任何 Schema 变更（`packages/contracts`）
- API 端点变更
- 认证/权限逻辑变更
- 数据存储变更

### 评估相关变更

- 评估用例添加/修改后，运行 `pnpm eval:smoke` 验证
- CI 评估变更需确保 `pnpm eval:ci` 通过

### 评测质量门

PR 修改以下路径时，`eval.yml` 的 smoke tier 会自动触发：

- `packages/contracts/src/domain/evals/**`
- `evals/**`
- `packages/server/src/**`

评测结果会以 PR 评论形式展示。若检测到回归（regression），PR 合并前需确认回归是否可接受。

详见 [`docs/operations/CI_CD.md`](../operations/CI_CD.md)。

## 文档贡献

- 新功能需同步更新相关文档
- 文档位于 `docs/` 目录
- 保持文档语言一致性（简体中文）

## 文档影响检查清单

如果你的变更涉及以下任何一项，你**必须**检查并更新相关文档：

- [ ] **持久化架构**：检查 `docs/reference/DOCS_TRUTH_MATRIX.md` 中的持久化相关行
- [ ] **启动流程或命令**：更新 `docs/README.md` 和 `docs/guides/GETTING_STARTED.md` 中的命令示例
- [ ] **CI/CD 流水线**：更新 `docs/operations/CI_CD.md` 和 `docs/operations/TESTING.md`
- [ ] **数据库 Schema**：更新 `docs/reference/DATABASE_SCHEMA.md` 中的表计数
- [ ] **部署配置**：更新 `docs/architecture/DEPLOYMENT.md`

### 验证命令

```bash
# 检查文档漂移守卫
pnpm check:docs-drift

# 检查 Mermaid 图语法
pnpm check:mermaid

# 检查复杂度预算
pnpm check:complexity

# 增量 fallow 守卫（按当前分支相对 main 的新增问题）
pnpm exec fallow audit --base origin/main --gate new-only --ci --fail-on-issues

# 运行文档真理性测试
pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts
```

详见 [`docs/reference/DOCS_TRUTH_MATRIX.md`](../reference/DOCS_TRUTH_MATRIX.md) 和 [`docs/reference/SYSTEM_TRUTH_SOURCES.md`](../reference/SYSTEM_TRUTH_SOURCES.md)。

## 相关链接

- [项目文档索引](../../README.md#-文档)
- [API 文档](../architecture/API.md)
- [数据模型](../reference/DATA_MODEL.md)
- [评估系统](../../evals/README.md)
