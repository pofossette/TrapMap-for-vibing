# Packages JSON Restructure — dev:web / eval & stress/bench 归位

- **Date:** 2026-09-06
- **Status:** Approved (brainstorming 5/5 sections confirmed)
- **Scheme:** Hard Cut 集中式（方案 1）
- **Scope:** `package.json` 瘦身 + `pnpm-workspace.yaml` 认领 + `evals`/`benchmarks` 成为 workspace 脚本容器 + CI/文档一次性硬切
- **Branch intent:** `codex/packages-json-restructure`（或同类 `codex/` 前缀）

## 1. 背景与目标

### 现状
- 根 `package.json` scripts 129 条：`dev:17` / `eval:38` / `stress:16` / `bench:3` / 其余 `check/test/build`。
- `dev` 通过 `scripts/run-dev.ts` + `scripts/backend-target-registry.ts` 分发（light/heavy），`apps/web-panel`（`@trapmap/web-panel`，Vite 4173）无根别名。
- `evals/` 与 `benchmarks/` 均无 `package.json`，`pnpm-workspace.yaml` 仅含 `packages/*` + `apps/*`，`services/go-accelerator` 为纯 Go 模块（`go.mod`）。
- `eval:*` / `stress:*` / `bench:*` 均在根 `package.json` 定义，其实现分别指向 `scripts/run-eval.ts` / `evals/**/run.ts` / `services/go-accelerator/cmd/stress` / `benchmarks/harness/run-bench.ts`。

### 目标
- 根不再污染 `eval/stress/bench` 命名空间；`dev` 补齐 `dev:web`。
- `eval` 相关全部归 `evals/package.json`（`@trapmap/evals`），`stress`+`bench` 全部归 `benchmarks/package.json`（`@trapmap/benchmarks`），`services/go-accelerator` 保持纯 Go。
- `pnpm-workspace.yaml` 认领新包，CI/文档一次性硬切，不留薄代理（breaking，但一次性干净）。

### 非目标
- 不改 `scripts/run-eval.ts` / `benchmarks/harness/run-bench.ts` / `services/go-accelerator/cmd/stress` 的业务逻辑，仅调脚本路径。
- 不给 `dev:web` 加 `server.proxy`，不新增 `dev:web:preview/e2e` 等衍生别名。
- 不引入 `services/go-accelerator/package.json` 的 Node 包装。

## 2. 设计

### 2.1 dev:web（极简别名）
- 根 `package.json` 新增：
  ```json
  "dev:web": "pnpm --filter @trapmap/web-panel dev"
  ```
  与 `dev:host-local` / `dev:host-distributed` 同级，不进 `backend-target-registry.ts`（web 非 backend target）。
- `apps/web-panel/vite.config.ts` 保持 `server.port: 4173` / `preview.port: 4173` 不变，不加 proxy。
- 文档：根 `README.md` 与 `docs/architecture/DEPLOYMENT.md` 的 `dev:*` 表增一行 `dev:web`。

### 2.2 evals 包（`@trapmap/evals`，硬切）
- 新建 `evals/package.json`：
  ```json
  {
    "name": "@trapmap/evals",
    "private": true,
    "type": "module",
    "scripts": {
      "eval": "pnpm exec tsx --tsconfig ../tsconfig.base.json ../scripts/run-eval.ts",
      "eval:retrieval": "pnpm run eval -- retrieval",
      "eval:retrieval:smoke": "pnpm run eval -- retrieval --tier smoke",
      "eval:retrieval:core": "pnpm run eval -- retrieval --tier core",
      "...": "...（共 38 条，见附录）"
    }
  }
  ```
  - **路径修正规则**：`scripts/*` → `../scripts/*`；`evals/*` 去前缀（如 `evals/graph-extraction/conflict-eval.ts` → `graph-extraction/conflict-eval.ts`，`evals/scripts/eval-ci.ts` → `scripts/eval-ci.ts`）；`pnpm run eval -- ...` 的自引用保持不变。
  - 不额外声明依赖，复用根 `tsx`（`pnpm exec` 提升解析），必要时兜底加 `devDependencies: { "tsx": "workspace:*" }`。
- 根删除全部 38 条 `eval:*`（含 `eval` 自身：`eval` / `eval:retrieval*` / `eval:summary*` / `eval:agent-planning*` / `eval:label-alignment*` / `eval:graph-extraction*` / `eval:ingestion*` / `eval:experience-gene` / `eval:dedup/conflict*` / `eval:ci*` / `eval:smoke/all/snapshots/...`）。
- 调用：`pnpm --filter @trapmap/evals eval:retrieval:smoke` 等。

### 2.3 benchmarks 包（`@trapmap/benchmarks`，stress+bench 集中）
- 新建 `benchmarks/package.json`：
  ```json
  {
    "name": "@trapmap/benchmarks",
    "private": true,
    "type": "module",
    "scripts": {
      "bench": "pnpm run bench:compute",
      "bench:compute": "cd .. && pnpm exec tsx benchmarks/harness/run-bench.ts --compute",
      "bench:compare": "cd .. && pnpm exec tsx benchmarks/harness/run-bench.ts --compare",
      "stress:batch-cosine": "cd ../services/go-accelerator && go run ./cmd/stress -scenario batch-cosine",
      "stress:ranking": "cd ../services/go-accelerator && go run ./cmd/stress -scenario ranking-batch",
      "stress:dedup": "cd ../services/go-accelerator && go run ./cmd/stress -scenario dedup-flood",
      "stress:gene-derive": "cd ../services/go-accelerator && go run ./cmd/stress -scenario gene-derive",
      "stress:all": "cd ../services/go-accelerator && go run ./cmd/stress -scenario all",
      "stress:go": "cd ../services/go-accelerator && go run ./cmd/stress",
      "stress:go:batch-cosine": "cd ../services/go-accelerator && go run ./cmd/stress -scenario batch-cosine",
      "stress:go:ranking": "cd ../services/go-accelerator && go run ./cmd/stress -scenario ranking-batch",
      "stress:go:dedup": "cd ../services/go-accelerator && go run ./cmd/stress -scenario dedup-flood",
      "stress:go:gene-derive": "cd ../services/go-accelerator && go run ./cmd/stress -scenario gene-derive",
      "stress:go:all": "cd ../services/go-accelerator && go run ./cmd/stress -scenario all",
      "stress:list": "cd ../services/go-accelerator && go run ./cmd/stress -list",
      "stress:batch-cosine:legacy": "cd .. && node benchmarks/stress/autocannon-batch-cosine.js",
      "stress:ranking:legacy": "cd .. && node --loader ts-node/esm benchmarks/stress/k6/ranking-batch.js 2>&1 | head -n 20; echo 'use k6 run benchmarks/stress/k6/ranking-batch.js'",
      "stress:dedup:legacy": "cd .. && node benchmarks/stress/k6/dedup-flood.js 2>&1 | head -n 20; echo 'use k6 run benchmarks/stress/k6/dedup-flood.js'",
      "stress:gene-derive:legacy": "cd .. && node benchmarks/stress/k6/gene-derive.js 2>&1 | head -n 20; echo 'use k6 run benchmarks/stress/k6/gene-derive.js'"
    }
  }
  ```
  - `bench:*` 需 `cd .. &&` 保证 `cwd=repo root`（harness 内 `mkdirSync('benchmarks/results')` 与 `vitest --config benchmarks/harness/...` 的硬编码相对路径）。
  - `stress:*` 从 `benchmarks/` 直跳 `../services/go-accelerator`。
  - `services/go-accelerator` 不加入 workspace，保持纯 Go。
- 根删除 19 条（`bench` 3 + `stress` 16）。

### 2.4 workspace 与根收口
- `pnpm-workspace.yaml`：
  ```yaml
  packages:
    - packages/*
    - apps/*
    - evals
    - benchmarks
  ```
- 根瘦身：129 → ~73 条（新增 1 `dev:web`，删除 57），`eval/stress/bench` 命名空间在根清零。
- `fallow` 边界：`evals`/`benchmarks` 仅作脚本容器，不导入 `packages/*` 源码，审计应零违规。

### 2.5 文档 & CI & 验证
- **文档**：`docs/architecture/components/EVALUATION.md`、`docs/architecture/performance/PERF_STRESS_INFRA.md`、`evals/README.md`、`benchmarks/harness/README.md`、`benchmarks/stress/README.md`、`docs/operations/REGRESSION-COMMANDS.md`、`docs/operations/TESTING.md`、`docs/architecture/DEPLOYMENT.md`、根 `README.md`、`docs/reference/SYSTEM_TRUTH_SOURCES.md` 全量替换。
- **CI**：`.github/workflows/*` 中 `pnpm eval:smoke` → `pnpm --filter @trapmap/evals eval:smoke`，`pnpm eval:ci` → `pnpm --filter @trapmap/evals eval:ci`，`pnpm bench:*` / `pnpm stress:*` → `pnpm --filter @trapmap/benchmarks ...`。
- **验证**：
  - `pnpm install`
  - `pnpm --filter @trapmap/evals eval --help`；`pnpm --filter @trapmap/evals eval:retrieval:dry-run`（dry-run 无需 DB）
  - `pnpm --filter @trapmap/benchmarks bench:compare`
  - `pnpm dev:web --help`（可选 30s 起服冒烟）
  - `pnpm check:docs` / `pnpm check:structure` / `pnpm typecheck` / `pnpm exec fallow audit --base main`
  - `grep -rn "pnpm eval:smoke\|pnpm eval:retrieval\|pnpm stress:\|pnpm bench:" --include="*.md" --include="*.yml" | grep -v "docs/archived" | wc -l` == 0

## 3. 备选与取舍
- **薄代理软迁移**：根保留 `eval/stress/bench` 转发 + deprecation，兼容但持续污染根，已否决（用户明确硬切）。
- **去前缀重命名**：新包内 `retrieval:smoke` 等更干净但改动面最大，已否决。
- **Go 服务单建 Node 包**：`services/go-accelerator/package.json` 归 `stress:*`，语义正但引入 Go/Node 双身份，已否决（集中 `benchmarks` 更简）。

## 4. 风险与缓解
- **遗漏替换**：`grep` 全量扫 + `check:docs` 拦截历史引用；`docs/archived/` 豁免。
- **harness cwd 漂移**：`benchmarks` 包内 `bench:*` 强制 `cd .. &&`，保持根 cwd。
- **workspace 解析失败**：`pnpm install` 后验证 `pnpm --filter`；必要时给子包补 `tsx` devDep。
- **破坏性变更**：PR 标题标注 Breaking，描述列迁移对照表。

## 5. 发布与回滚
- 单 PR 落地（根瘦身 + 两新包 + workspace + 文档/CI），`git mv` 无，仅新增与删除。
- 回滚：`git revert` 单 commit 即可（脚本定义与 workspace 同步回退）。

## 6. 附录 — 根待删除清单（38+19）
- `eval` 系 38：`eval` / `eval:retrieval` / `eval:retrieval:smoke/core/dry-run/live/live:compare/live:smoke` / `eval:summary*` / `eval:agent-planning*` / `eval:label-alignment*` / `eval:graph-extraction*` / `eval:ingestion*` / `eval:experience-gene` / `eval:dedup/dedup:dry-run` / `eval:conflict/conflict:dry-run` / `eval:ci/ci:core` / `eval:smoke/core/all/all:json/snapshots` 等。
- `bench` 3：`bench` / `bench:compute` / `bench:compare`。
- `stress` 16：`stress:batch-cosine/ranking/dedup/gene-derive/all/list/go/go:batch-cosine/go:ranking/go:dedup/go:gene-derive/go:all/batch-cosine:legacy/ranking:legacy/dedup:legacy/gene-derive:legacy`。

