# CI/CD 流水线

> 状态：Active。job 集合以 `.github/workflows/` 实测为准，你改流水线时同步改本页。

`packages/server/` 兼容壳已于 2026-07-31 删除（提交 `a66d94e6`）。旧文档里指向它的路径只做概念参考，不再可执行，细节见 `docs/archived/archived-plans/compatibility-shell-retirement-runtime-infra-ownership.md`。

## 概述

TrapMap 跑两条独立流水线：

| 流水线 | 文件 | 触发条件 | 用途 |
|--------|------|----------|------|
| CI | `.github/workflows/ci.yml` | PR 与 push 到 main | 类型检查、check、测试、覆盖率 |
| Evaluation | `.github/workflows/eval.yml` | PR（路径匹配）、周调度、手动 | 检索质量评测 |

本地命令表面以 `pnpm run ci`、`pnpm --filter @trapmap/evals eval:smoke`、`pnpm --filter @trapmap/evals eval:ci`、`pnpm --filter @trapmap/evals eval:ci:core` 为准。

## CI 流水线（ci.yml）

两条 workflow 全部 job 都用 Node.js 24 + pnpm 10.33.0。`ci.yml` 的 job 如下：

| Job | 命令 | 说明 |
|-----|------|------|
| `fallow-push-audit` | `pnpm check:fallow` | 全仓静态质量门，push 与 PR 都触发，无依赖 |
| `typecheck` | `pnpm typecheck` | TypeScript 类型检查 |
| `check` | `pnpm check` | Biome 检查 |
| `test` | `pnpm test` | 全量单元测试 |
| `coverage` | `pnpm test:coverage` | 覆盖率，artifact 未显式设保留期 |
| `postgres-integration` | PG 集成测试 | `pgvector/pgvector:pg16` service container，校验任务队列与 outbox |
| `go-accelerator` | `go vet` 加 `go test` | `services/go-accelerator` |
| `type-alignment` | 生成物对齐检查 | contracts JSON schema、OpenAPI、Go 绑定三方 diff |
| `doc-guardrails` | 见下表 | 文档、结构、表清单、导入边界、依赖、复杂度守卫 |
| `e2e` | web-panel e2e | Playwright Chromium 构建并测 `@trapmap/web-panel` |

`doc-guardrails` | `pnpm check:docs` + `pnpm check:structure` + `pnpm check:asserts` + `pnpm check:table-schema` + `pnpm check:pgtable-single-source` + `pnpm check:eval-imports` + `pnpm check:eval-only` + `pnpm check:deps` + `pnpm check:complexity`

守卫全命令（含 `pnpm check:skills` 与 `pnpm check:imports`）见上表，`doc-guardrails` job 按该表顺序执行。

`check:docs` 内部独立定位失败：doc-drift、mermaid、md-lint 是阻断层，doc-truth、doc-references、links 是可见非阻断层。`check:structure` 含 structure、arch-freeze、stale-package-refs 三个子检查。表清单守卫以 `packages/db/src/schema/` 的 42 张 `pgTable` 为权威，`store_snapshot` 是迁移 SQL 历史残留，不在守卫范围。pgTable 单源守卫要求 service 包只 re-export `@trapmap/db`。eval import 边界守卫只放行 `@trapmap/*` 包名、`packages/contracts/**`、host-local allowlist、`@eval-only` 模块。架构边界与未使用依赖由 `fallow-push-audit` 覆盖，不在 `doc-guardrails` 里重复。

漂移规则覆盖命令范围、环境默认值、深层架构引用、PostgreSQL-first 姿态、评测命令表面、remediation 入口、贡献指南 DB 命令格式、部署默认值，规则源码见 `docs/reference/SYSTEM_TRUTH_SOURCES.md`。

Runtime foundations 相关改动走这组 job：`fallow-push-audit`（静态面）、`typecheck`（类型面）、`test`（单测面）、`postgres-integration`（queue 加 outbox 加 lifecycle 真实 PG 链路）、`doc-guardrails`（文档契约与复杂度面）。

### Fallow 质量门

开发与 CI 统一跑：

```bash
pnpm check:fallow
```

规则与阈值在 `.fallowrc.json`。该命令不用回归基线，死代码、重复、复杂度、循环依赖、架构边界、失效抑制任一问题都阻断构建。保留 API 与动态加载符号用带理由的行级抑制，理由失效时 `stale-suppressions` 阻断。

> 源码：`.github/workflows/ci.yml`

## Evaluation 流水线（eval.yml）

### 触发条件

- **PR smoke**：PR 改动 `packages/contracts/src/domain/evals/**`、`evals/**`、`packages/service-*/src/**` 时触发
- **周调度 core**：每周一 UTC 06:00 跑 core tier
- **手动触发**：`workflow_dispatch`，选 smoke 或 core

### eval-smoke job

1. 下载 baseline 产物（缺失时跳过）
2. 自检 eval 帮助面：`pnpm --filter @trapmap/evals eval -- smoke --help`
3. 构建 candidate-worker 与 outbox-worker 镜像，校验 `replicas: 2` closeout 接线
4. 跑 `pnpm --filter @trapmap/evals eval:ci`（默认 smoke tier，带 baseline 对比）
5. 跑 PG 协调的 `pnpm --filter @trapmap/evals eval:smoke`（需要 Docker）
6. 跑 experience-gene smoke（shadow）与 core（serve）两道门
7. 上传评测报告（保留 7 天），PR 上评论回归摘要

**PR 评论内容**：

```markdown
## Evaluation Results

- **Regressions detected**: ✅ No / ⚠️ Yes
- **Regressed slices**: N
- **Improved slices**: N

View full report →
```

**输出变量**：`has_regressions`、`regressed_count`、`improved_count`。

### eval-core-scheduled job

周调度或手动选 core 时跑：

1. 构建 worker 镜像并校验 replicas 接线
2. 跑 `pnpm --filter @trapmap/evals eval:ci:core`（`WRITE_BASELINE=true`）
3. 跑 experience-gene core（serve）与 smoke（shadow）
4. 上传评测报告（保留 30 天）与 baseline（保留 90 天）

### eval-parity job（快照 parity，blocking）

`evals/**` 相关 PR 全部阻断：起 `pgvector/pgvector:pg16` service（只有 retrieval parity 需要向量扩展），跑六个 `evals/promptfoo/parity-*.test.ts`，重跑各 suite bridge 并与 `evals/promptfoo/snapshots/*-smoke.json` 逐 case 比对。不需要 API key，漂移即失败。

> 源码：`.github/workflows/eval.yml`、`evals/promptfoo/parity-*.test.ts`、`evals/promptfoo/snapshots/`

## Baseline 回归检测机制

1. Baseline 以 GitHub Actions artifact 存（`baseline-smoke`、`baseline-core`）
2. `eval-ci.ts` 读 `BASELINE_PATH` 指向的 baseline，与当前结果逐切片对比
3. 某切片指标低于 baseline 阈值即标回归
4. core 周调度跑完自动上传新 baseline（`WRITE_BASELINE=true`）

## 本地运行评测

```bash
# 冒烟（PG 协调，需要 Docker）
pnpm --filter @trapmap/evals eval:smoke

# CI smoke tier（baseline-aware）
pnpm --filter @trapmap/evals eval:ci

# CI core tier
pnpm --filter @trapmap/evals eval:ci:core

# 带 baseline 对比
BASELINE_PATH=reports/baselines/baseline-smoke.json pnpm --filter @trapmap/evals eval:ci

# 仓库聚合 CI 本地脚本
pnpm run ci
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NODE_ENV` | 运行环境 | `test` |
| `BASELINE_PATH` | Baseline 文件路径 | 无 |
| `WRITE_BASELINE` | 是否写新 baseline | `false` |
