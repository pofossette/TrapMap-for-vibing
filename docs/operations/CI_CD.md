# CI/CD 流水线

## 概述

TrapMap 使用 GitHub Actions 运行两条独立流水线：

| 流水线 | 文件 | 触发条件 | 用途 |
|--------|------|----------|------|
| CI | `.github/workflows/ci.yml` | PR / push to main | 类型检查、check、测试、覆盖率 |
| Evaluation | `.github/workflows/eval.yml` | PR（路径匹配）/ 周调度 / 手动 | 检索质量评测 |

本地命令表面以 `pnpm run ci`、`pnpm eval:smoke`、`pnpm eval:ci`、`pnpm eval:ci:core` 为准。

---

## CI 流水线（ci.yml）

当前 job 集合以 `.github/workflows/ci.yml` 中定义为准；截至 2026-07-07，该 workflow 包含以下 job，其中 `fallow-push-audit` 在 push 和 pull_request 事件均触发、且无依赖关系：

| Job | 命令 | 说明 |
|-----|------|------|
| `fallow-push-audit` | push: `pnpm exec fallow audit --base <previous-push-sha> --gate new-only --ci --fail-on-issues --health-baseline reports/baselines/fallow-health-baseline.json --dead-code-baseline reports/baselines/fallow-dead-code-baseline.json`<br>PR: `pnpm exec fallow audit --base origin/main --gate new-only --ci --fail-on-issues` | push 增量静态质量门（含基线对比），PR 增量静态质量门（对比 main） |
| `typecheck` | `pnpm typecheck` | TypeScript 类型检查 |
| `check` | `pnpm check` | Biome 代码检查（lint + format） |
| `test` | `pnpm test` | 全量单元测试 |
| `coverage` | `pnpm test:coverage` | 测试覆盖率（当前 workflow 未显式设置 artifact 保留期） |
| `postgres-integration` | PG 集成测试 | 真实 PostgreSQL/pgvector 校验（任务队列、outbox subscriber） |
| `doc-guardrails` | `pnpm check:docs-drift` + `pnpm check:arch-freeze` + `pnpm check:deps` + `pnpm check:mermaid` + `pnpm check:structure` + `pnpm check:complexity` + `pnpm check:md-lint` + `pnpm check:links` + `fallow dead-code --boundary-violations --ci --fail-on-issues` + `fallow dead-code --unused-deps --ci --fail-on-issues` | 文档漂移、架构冻结、依赖分析、Mermaid、仓库结构、复杂度预算、Markdown lint、链接守卫、架构边界守卫与未使用依赖守卫 |

`postgres-integration` job 使用 `pgvector/pgvector:pg16` 作为 service container，运行需要真实数据库的集成测试。确保异步基础设施（TaskQueue、OutboxWorker、Lifecycle subscribers）在 PostgreSQL 环境下正确工作。

Runtime foundations 相关改动主要依赖以下 job 组合形成质量门：

- `fallow-push-audit`: changed-files 级别的静态质量回归守卫（dead code / dupes / circular deps / health audit）
- `typecheck`: runtime config / shared resilience 类型面
- `test`: request context、runtime snapshot、shared resilience 单测
- `postgres-integration`: queue + outbox + lifecycle subscriber 真实 PG 可靠性链路
- `doc-guardrails`: runtime 文档契约、架构冻结、依赖分析、复杂度与文档结构守卫

`fallow-push-audit` 在 `push` 和 `pull_request` 事件均运行：

- **Push 事件**：以上次 push 的 commit SHA 为参照，执行增量审计 + 回归防护。回归基线存储在 `reports/baselines/` 下，CI 会在质量评分退化或死代码增加时阻断合并。
- **PR 事件**：以 `origin/main` 为参照，执行增量审计，只阻断 PR 相对 main 新增的问题。

两种场景均只检查 changed-files 范围内的新问题，不因历史存量问题直接阻断。适合作为 `typecheck` / `test` / `check` 之外的补位守卫，补充未使用导出/文件、重复代码、循环依赖和变更面健康审计。当前没有用它替代 `pnpm check:complexity` 或文档守卫；这些仓库定制规则仍由现有 jobs 负责。

`doc-guardrails` job 运行文档漂移守卫（`pnpm check:docs-drift`）、架构冻结守卫（`pnpm check:arch-freeze`）、依赖分析守卫（`pnpm check:deps`）、Mermaid 守卫（`pnpm check:mermaid`）、仓库结构守卫（`pnpm check:structure`）、复杂度预算守卫（`pnpm check:complexity`）、Markdown lint 守卫（`pnpm check:md-lint`）、链接守卫（`pnpm check:links`）、架构边界守卫（`fallow dead-code --boundary-violations --ci --fail-on-issues`）和未使用依赖守卫（`fallow dead-code --unused-deps --ci --fail-on-issues`），确保关键文档不含过时内容、架构边界未被违反且违规会阻断构建、依赖关系无循环、图示可解析、仓库结构完整、热点文件未超出行数预算、Markdown 格式一致且链接有效。漂移规则覆盖以下类别：

- **命令范围漂移**：包级 DB 命令（`pnpm --filter @trapmap/server db:migrate`）和 JSON 回退路径（`.data/skill-shareer.json`）
- **环境默认值漂移**：`ARCHITECTURE.md` 中的 `HOST`（`127.0.0.1`）和 `AI_CHAT_MODEL`（`gpt-4o-mini`）默认值
- **深层架构参考漂移**：`PERSISTENCE.md` 表总览若写死数量、`ENVIRONMENT.md` 数据文件路径
- **PostgreSQL-first 姿态漂移**：禁止过时的 JSON 存储描述和旧表计数
- **评测命令表面漂移**：`EVALUATION.md` 和 `TESTING.md` 中的 eval 入口命令（`pnpm eval:smoke`、`pnpm eval:ci`、`pnpm eval:ci:core`）
- **当前 remediation 入口漂移**：active root execution surface、todos/archived index truth、以及 deferred landing spot 口径
- **贡献指南命令漂移**：`CONTRIBUTING.md` 中的 DB 迁移命令格式（必须使用 `pnpm --filter @trapmap/server`）
- **部署默认值漂移**：`DEPLOYMENT.md` 中的 chat model（`gpt-4o-mini`）和 JSON 回退路径（`.data/skill-shareer.json`）

详见 `docs/reference/SYSTEM_TRUTH_SOURCES.md`。

`ci.yml` 中所有 job 使用 Node.js 24 + pnpm 10.33.0；独立的 `eval.yml` 当前仍使用 Node.js 20，并为评测产物显式设置了 7/30/90 天保留期。

### Fallow 质量基线

回归基线存储在 `reports/baselines/` 目录下，由 fallow 子命令的 `--save-baseline` 生成。Push 审计使用 `--health-baseline` 和 `--dead-code-baseline` 标志对比此基线，防止质量评分退化和死代码增加。基线包含：

- **健康评分**：当前分数和等级（`fallow-health-baseline.json`）
- **死代码统计**：未使用文件、导出、类型、依赖数量（`fallow-dead-code-baseline.json`）
- **回归基线数据**：逐文件的 finding counts，供回归对比使用

更新基线：

```bash
pnpm exec fallow health --save-baseline reports/baselines/fallow-health-baseline.json
pnpm exec fallow dead-code --save-baseline reports/baselines/fallow-dead-code-baseline.json
```

> 源码：`.github/workflows/ci.yml`

---

## Evaluation 流水线（eval.yml）

### 触发条件

- **PR smoke**：当 PR 修改以下路径时自动触发：
  - `packages/contracts/src/domain/evals/**`
  - `evals/**`
  - `packages/server/src/**`
- **周调度 core**：每周一 UTC 06:00 运行 core tier
- **手动触发**：`workflow_dispatch`，可选 smoke 或 core tier

### eval-smoke job

1. 下载最新 baseline（如有）
2. 运行 `pnpm eval:ci`（默认 smoke tier，带 baseline 对比）
3. 上传评测报告（保留 7 天）
4. 在 PR 上评论回归摘要

**PR 评论内容**：
```markdown
## Evaluation Results

- **Regressions detected**: ✅ No / ⚠️ Yes
- **Regressed slices**: N
- **Improved slices**: N

View full report →
```

**GitHub Actions 输出变量**：
- `has_regressions`: 是否检测到回归（`true` / `false`）
- `regressed_count`: 回归切片数
- `improved_count`: 改善切片数

### eval-core-scheduled job

仅在周调度或手动选择 core tier 时运行：

1. 运行 `pnpm eval:ci:core`
2. 上传评测报告（保留 30 天）
3. 上传 baseline（保留 90 天）

> 源码：`.github/workflows/eval.yml`、`evals/scripts/eval-ci.ts`

---

## Baseline 回归检测机制

评测系统通过 baseline 对比检测质量回归：

1. **Baseline 存储**：以 GitHub Actions artifact 形式存储（`baseline-smoke` / `baseline-core`）
2. **对比逻辑**：`eval-ci.ts` 读取 `BASELINE_PATH` 环境变量指向的 baseline 文件，与当前运行结果逐切片对比
3. **回归判定**：当某个切片的指标低于 baseline 阈值时标记为回归
4. **Baseline 更新**：core tier 周调度运行后自动上传新 baseline（`WRITE_BASELINE=true`）

---

## 本地运行评测

```bash
# 冒烟测试（快速验证）
pnpm eval:smoke

# CI smoke tier（baseline-aware）
pnpm eval:ci

# 完整评测
pnpm eval:core

# CI 模式（带 baseline 对比）
BASELINE_PATH=reports/baselines/baseline-smoke.json pnpm eval:ci

# CI core tier
pnpm eval:ci:core

# 仓库聚合 CI 本地脚本
pnpm run ci
```

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NODE_ENV` | 运行环境 | `test` |
| `BASELINE_PATH` | Baseline 文件路径 | 无 |
| `WRITE_BASELINE` | 是否写入新 baseline | `false` |
