# CI/CD 流水线

> **历史说明**：`packages/server（Wave-10 已删除）` 已于 Wave-10 删除（提交 `a66d94e6`）。本文档中的 `packages/server（Wave-10 已删除）` 路径指向已删除的实现，概念描述仍然适用但路径已不存在。详见 `docs/archived/archived-plans/compatibility-shell-retirement-runtime-infra-ownership.md`。

## 概述

TrapMap 使用 GitHub Actions 运行两条独立流水线：

| 流水线 | 文件 | 触发条件 | 用途 |
|--------|------|----------|------|
| CI | `.github/workflows/ci.yml` | PR / push to main | 类型检查、check、测试、覆盖率 |
| Evaluation | `.github/workflows/eval.yml` | PR（路径匹配）/ 周调度 / 手动 | 检索质量评测 |

本地命令表面以 `pnpm run ci`、`pnpm eval:smoke`、`pnpm eval:ci`、`pnpm eval:ci:core` 为准。

---

## CI 流水线（ci.yml）

当前 job 集合以 `.github/workflows/ci.yml` 中定义为准；截至 2026-07-10，该 workflow 包含以下 job，其中 `fallow-push-audit` 在 push 和 pull_request 事件均触发、且无依赖关系：

| Job | 命令 | 说明 |
|-----|------|------|
| `fallow-push-audit` | `pnpm check:fallow` | 全仓静态质量门：死代码、重复、复杂度、循环依赖、架构边界与失效抑制均须为零 |
| `typecheck` | `pnpm typecheck` | TypeScript 类型检查 |
| `check` | `pnpm check` | Biome 代码检查（lint + format） |
| `test` | `pnpm test` | 全量单元测试 |
| `coverage` | `pnpm test:coverage` | 测试覆盖率（当前 workflow 未显式设置 artifact 保留期） |
| `postgres-integration` | PG 集成测试 | 真实 PostgreSQL/pgvector 校验（任务队列、outbox subscriber） |
| `doc-guardrails` | `pnpm check:docs` + `pnpm check:structure` + `pnpm check:asserts` + `pnpm check:deps` + `pnpm check:complexity` | 文档守卫（doc-drift / mermaid / md-lint 阻断层 + doc-truth / doc-references / links 可见层）、结构守卫（structure / arch-freeze / stale-package-refs）、裸断言守卫、依赖分析、复杂度预算 |

`postgres-integration` job 使用 `pgvector/pgvector:pg16` 作为 service container，运行需要真实数据库的集成测试。确保异步基础设施（TaskQueue、OutboxWorker、Lifecycle subscribers）在 PostgreSQL 环境下正确工作。

Runtime foundations 相关改动主要依赖以下 job 组合形成质量门：

- `fallow-push-audit`: 全仓静态质量守卫（dead code / dupes / circular deps / health audit）
- `typecheck`: runtime config / shared resilience 类型面
- `test`: request context、runtime snapshot、shared resilience 单测
- `postgres-integration`: queue + outbox + lifecycle subscriber 真实 PG 可靠性链路
- `doc-guardrails`: runtime 文档契约、架构冻结、依赖分析、复杂度与文档结构守卫

`fallow-push-audit` 在 `push` 和 `pull_request` 事件均执行 `pnpm check:fallow`。该命令不使用回归基线；任何死代码、重复、复杂度、循环依赖、架构边界或失效抑制问题都会阻断构建。保留 API、框架入口或动态加载符号必须采用带 `-- <reason>` 的相邻行级抑制；`stale-suppressions` 会在理由不再适用时阻断构建。

`doc-guardrails` job 运行合并后的文档守卫（`pnpm check:docs`）、结构守卫（`pnpm check:structure`）、裸断言守卫（`pnpm check:asserts`）、依赖分析守卫（`pnpm check:deps`）和复杂度预算守卫（`pnpm check:complexity`），确保关键文档不含过时内容、仓库结构完整、热点文件未超出行数预算、无新增裸类型断言且依赖关系无循环。`check:docs` 内部保留独立失败定位：doc-drift / mermaid / md-lint 是阻断层，doc-truth / doc-references / links 是可见但非阻断层（保持历史 `|| true` 语义）；`check:structure` 内部包含 structure / arch-freeze / stale-package-refs 三个子检查。架构边界与未使用依赖守卫由 `fallow-push-audit` job 的 `pnpm check:fallow` 统一覆盖，不再在 `doc-guardrails` 中重复调用。漂移规则覆盖以下类别：

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

### Fallow 质量门

全仓 Fallow 不再维护历史豁免基线。开发与 CI 统一运行：

```bash
pnpm check:fallow
```

该命令的规则和阈值由 [`.fallowrc.json`](../../.fallowrc.json) 定义。

> 源码：`.github/workflows/ci.yml`

---

## Evaluation 流水线（eval.yml）

### 触发条件

- **PR smoke**：当 PR 修改以下路径时自动触发：
  - `packages/contracts/src/domain/evals/**`
  - `evals/**`
  - `packages/server（Wave-10 已删除）/src/**`
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

### eval-parity job（快照 parity，blocking）

对 `evals/**` 相关的 PR（含直接修改 `evals/**` 的 PR）阻断：

1. 启动 `pgvector/pgvector:pg16` postgres service（vector extension；仅 retrieval parity 需要）
2. 运行全部六个快照 parity 测试：
   `evals/promptfoo/parity-{agent-planning,graph-extraction,ingestion,label-alignment,summary,retrieval}.test.ts`
3. parity 测试重跑各 suite bridge（promptfoo 引擎），与提交的
   `evals/promptfoo/snapshots/*-smoke.json` 逐 case 比对（`caseId` + `passed` + 数值字段），
   **无需 API key**；判定漂移即失败。

> 源码：`.github/workflows/eval.yml`、`evals/promptfoo/parity-*.test.ts`、`evals/promptfoo/snapshots/`

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
