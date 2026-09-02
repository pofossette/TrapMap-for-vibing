# scripts — 工具脚本总览

> **创建时间**: 2026-04~09 渐进合入（最早 `deploy.sh` 2026-04-17，最晚 `check-route-surface` 2026-09-02）
> **上次有效运行**: 2026-09-02 全部 `pnpm check:*` / `pnpm typecheck` / `pnpm test` 绿（`58 budgets` / `42 tables` / `955 tests` / `mermaid 117`）
> **有效性**: 24 个活跃脚本全部被 `package.json` `scripts` 或 `.github/workflows` 引用，`archived/` 8+3 个仅历史参考

## 目录结构

```
scripts/
├── README.md                          # 本文件
├── check-*.ts / check-*.mjs           # 门禁 guard（12+2）
├── complexity-budgets.json             # 行数预算（58 文件）
├── arch-freeze-rules.json             # 架构冻结点
├── run-*.ts / run-*.sh / deploy.sh    # 运行时编排
├── backend-target-*.ts                # 轻量构建
├── cluster-ownership.ts               # 集群归属校验
├── observability-benchmark.ts         # 可观测性基准
├── verify-l3-platform.ts              # L3 验证
├── extract-doc-truth.ts               # 文档真源提取
├── batch-download-skills.ts           # Skill 数据集下载
├── testing/*                          # Vitest 多项目组合
├── lib/*                             # 共享 check 运行时
├── __tests__/*                       # 脚本自身单测（28）
└── archived/*                         # 已归档历史脚本（11）
```

## Guard 类 — `check-*.ts`（12+2，全部有效）

| 脚本 | 用途 | 创建 | 有效性证据 |
|------|------|------|------------|
| `check-docs.ts` | 聚合 `doc-drift`/`mermaid`/`md-lint` + `doc-truth`/`doc-references`/`links` + `route-surface` | 2026-08-26 | `pnpm check:docs 7/7` 绿, 被 `package.json:check:docs` 与 CI `doc-guardrails` 引用 |
| `check-complexity-budgets.ts` | 读 `complexity-budgets.json` 校验 58 文件 `≤400/300` | 2026-05-26 | `pnpm check:complexity 58/58` 绿 |
| `check-table-schema.ts` | 扫描 `packages/db/src/schema` 42 表 vs `DATABASE_SCHEMA.md` | 2026-08-10 | `pnpm check:table-schema 42/42` 绿 |
| `check-pgtable-single-source.ts` | 禁止 `service-*/schema.ts` 定义 `pgTable`，仅 `db` 可定义 | 2026-09-01 | `pnpm check:pgtable-single-source` 绿 |
| `check-route-surface.ts` | 校验 `gateway` 8 文件 `route-defs` vs `api-surface.md` | 2026-09-02 | `pnpm check:docs` 中 `route-surface PASS`，`REAL_ROUTE_FILES` 8 文件 |
| `check-arch-freeze.ts` + `arch-freeze-rules.json` | 校验宿主/DB 冻结点 | 2026-08-30 | `pnpm check:structure` 中 `arch-freeze PASS` |
| `check-mermaid.ts` | 校验 `117` 图可渲染 | 2026-06-02 | `pnpm check:docs` 中 `mermaid PASS` |
| `check-naked-asserts.ts` | 禁止裸 `as unknown as` 等断言 | 2026-07-26 | `pnpm check:asserts` 绿，豁免已清零 |
| `check-stale-package-refs.ts` | 校验 `package.json` 过期引用 | 2026-08-01 | `pnpm check:structure` 中 `stale-package-refs PASS` |
| `check-skills.ts` | 校验 Skill 目录结构 | 2026-08-01 | `pnpm check:skills` 绿 |
| `check-eval-imports.ts` / `check-eval-only.ts` | 校验 `evals` 导入边界 | 2026-08-15 | `pnpm check:eval-*` 绿 |
| `check-relative-imports.mjs` / `check-structure.mjs` | 跨目录导入与结构守卫 | 2026-08-01 | `pnpm check:imports` / `check:structure` 绿 |

> **有效性**: 全部被 `package.json` 与 `.github/workflows/*.yml` 引用，`__tests__/check-*.test.ts` 28 单测覆盖，上次 `pnpm check:docs` 绿。

## Runtime 类 — `run-*.ts` / `deploy.sh` / `backend-target`（全部有效）

| 脚本 | 用途 | 创建 | 有效性 |
|------|------|------|--------|
| `run-ci.ts` (320L) | CI 一键编排 | 2026-07 | `pnpm run ci` / CI `test` 绿 |
| `run-dev.ts` (64L) | 本地 dev 启动 | 2026-07 | `pnpm run dev` 绿 |
| `run-postgres-coordinated.ts` (200L) | PG 协调启动 + `evals` | 2026-07 | `pnpm run ci` 中 PG 绿 |
| `run-vitest-file.ts` (122L) | 单文件 `vitest` 执行 | 2026-08 | `pnpm test:file` 绿 |
| `run-backend-target.ts` + `backend-target-registry.ts` | `build:light` 轻量构建 | 2026-06 | `pnpm build:light` 绿 |
| `cluster-ownership.ts` (262L) | 集群归属校验 | 2026-08 | `pnpm check:structure` 绿 |
| `observability-benchmark.ts` (189L) | 可观测性基准 | 2026-07 | `pnpm test:observability-benchmark` 绿 |
| `verify-l3-platform.ts` (395L) | L3 平台验证 | 2026-07 | `pnpm verify:l3` 绿 |
| `runtime-closeout.ts` | 运行时收口校验 | 2026-06 | 被 `run-ci` 调用 |
| `testing/*` (4 文件) | Vitest 多项目 PG/服务组合 | 2026-08 | `vitest.config.ts` 引用 |
| `deploy.sh` (314L) | 一键部署（`docker compose`） | 2026-04-17 | `docs/operations/ENVIRONMENT.md` 引用 |
| `lib/spawn-pnpm.ts` | 共享 `pnpm`  spawn | 2026-08 | 被 `run-*.ts` 调用 |

> **清理**: `deploy-quick.sh` (62L, `deploy.sh --quick` 重复 80%) 已 `mv` 至 `archived/deploy-quick.sh`（2026-09-02 审阅）。

## Archived/Misc

| 脚本 | 用途 | 创建 | 有效性 |
|------|------|------|--------|
| `archived/*` 11 文件 | `backfill-labels` / `export-badcase-to-eval` / `rag-analyze` 等历史迁移 | 2026-08-13 | 0 引用，仅历史参考，保留 |
| `batch-download-skills.ts` (23K) | 批量下载 Skill 数据集 | 2026-04-23 | 被 `evals` 间接触发，有效 |
| `extract-doc-truth.ts` (11K) | 提取 `SYSTEM_TRUTH_SOURCES.md` 真源 | 2026-08-09 | 被 `check-doc-truth` 调用，有效 |
| `apply-readme-updates.py` | 批量更新 `README` | 2026-04 | 被 `docs` 流程引用，有效 |
| `archived/migrate-tests-to-test-dir.ts` (5.5K) | 一次性 `src` → `test/` 迁移，已完成 2026-09-01 | 2026-08-31 | 已归档，建议保留作记录 |
| `archived/codemods/relative-to-alias.cjs` | 相对路径转 `alias` 一次性 `codemod` | 2026-08-13 | 已执行，建议保留 |

## 使用

```bash
# 门禁（本地与 CI 同款）
pnpm check:docs          # 7/7（含 route-surface 8 文件）
pnpm check:complexity    # 58/58 ≤400/300
pnpm check:table-schema  # 42/42
pnpm check:structure     # 3/3
pnpm check:asserts       # 0 裸断言
pnpm typecheck           # tsc -b 0
pnpm exec fallow audit --base main  # dead 0 complexity 0

# 运行时
pnpm run ci              # 全量 CI
pnpm run dev             # 本地 dev
pnpm build:light         # 轻量构建
bash scripts/deploy.sh   # 一键部署
```

## 有效性判定

- **引用**: `grep -r "script名" --include="*.json" --include="*.ts" --include="*.md" --include="*.yml"` 在 `package.json` / `.github` / `scripts/__tests__` 中 ≥1 即有效
- **运行**: `pnpm check:*` / `pnpm test` / `pnpm run ci` 在 2026-09-02 均绿，有 `git log` 与 CI 记录
- **归档**: `archived/` 仅历史参考，不删除；一次性脚本完成即 `mv` 至 `archived/`

## 维护

- 新增 `check-*.ts` 时同步更新 `package.json` `scripts` 与 `scripts/__tests__` 单测，并在本 `README` 登记用途/创建时间
- 行数预算变更同步 `complexity-budgets.json` 与 `pnpm check:complexity`

