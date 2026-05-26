# CI/CD 流水线

## 概述

TrapMap 使用 GitHub Actions 运行两条独立流水线：

| 流水线 | 文件 | 触发条件 | 用途 |
|--------|------|----------|------|
| CI | `.github/workflows/ci.yml` | PR / push to main | 类型检查、check、测试、覆盖率 |
| Evaluation | `.github/workflows/eval.yml` | PR（路径匹配）/ 周调度 / 手动 | 检索质量评测 |

---

## CI 流水线（ci.yml）

六个并行 job，无依赖关系：

| Job | 命令 | 说明 |
|-----|------|------|
| `typecheck` | `pnpm typecheck` | TypeScript 类型检查 |
| `check` | `pnpm check` | Biome 代码检查（lint + format） |
| `test` | `pnpm test` | 全量单元测试 |
| `coverage` | `pnpm test:coverage` | 测试覆盖率（产物上传 7 天） |
| `postgres-integration` | PG 集成测试 | 真实 PostgreSQL/pgvector 校验（任务队列、outbox subscriber） |
| `architecture-guardrails` | `pnpm check:docs-drift` + `pnpm check:complexity` | 文档漂移检查与复杂度预算守卫 |

`postgres-integration` job 使用 `pgvector/pgvector:pg16` 作为 service container，运行需要真实数据库的集成测试。确保异步基础设施（TaskQueue、OutboxWorker、Lifecycle subscribers）在 PostgreSQL 环境下正确工作。

`architecture-guardrails` job 运行文档漂移守卫（`pnpm check:docs-drift`）和复杂度预算守卫（`pnpm check:complexity`），确保关键文档不含过时内容且热点文件未超出行数预算。详见 `docs/reference/SYSTEM_TRUTH_SOURCES.md`。

所有 job 使用 Node.js 20 + pnpm 10.33.0。

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
2. 运行 `pnpm eval:ci`
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

# 完整评测
pnpm eval:core

# CI 模式（带 baseline 对比）
BASELINE_PATH=reports/baselines/baseline-smoke.json pnpm eval:ci
```

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NODE_ENV` | 运行环境 | `test` |
| `BASELINE_PATH` | Baseline 文件路径 | 无 |
| `WRITE_BASELINE` | 是否写入新 baseline | `false` |
