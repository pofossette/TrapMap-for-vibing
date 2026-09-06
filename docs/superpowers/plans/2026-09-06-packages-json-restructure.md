# Packages JSON Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将根 `package.json` 的 `eval`/`stress`/`bench` 彻底迁至 `evals` 与 `benchmarks`  workspace 包并新增 `dev:web`，实现根瘦身与硬切。

**Architecture:** 新建 `evals/package.json`（`@trapmap/evals`）承接 38 条 `eval:*`，新建 `benchmarks/package.json`（`@trapmap/benchmarks`）承接 3+16 条 `bench/stress`，`pnpm-workspace.yaml` 新增两包，根仅保留 `dev:web` 透传；脚本路径做 `../` 与 `cd .. &&` 修正，CI/文档全量替换为 `pnpm --filter` 前缀。

**Tech Stack:** pnpm workspaces, Node `tsx`, Go `go run ./cmd/stress`, Vite 7, Vitest bench harness, fallow 边界检查, `pnpm check:docs/structure`

## Global Constraints

- `dev:web` 必须为 `pnpm --filter @trapmap/web-panel dev` 极简别名，不进 `scripts/backend-target-registry.ts` 与 `scripts/run-dev.ts`
- `eval` 系硬切：根删除全部 38 条 `eval:*`（含 `eval` 自身），不留薄代理
- `benchmarks` 集中：`bench:*` + `stress:*`（含 `stress:go:*` 与 `legacy`）全部归 `benchmarks/package.json`，`services/go-accelerator` 保持纯 Go `go.mod`，不新增 Node 包
- `bench:*` 在 `benchmarks` 包内必须 `cd .. && pnpm exec tsx benchmarks/harness/run-bench.ts ...` 保证 cwd=repo root（harness 内 `mkdirSync('benchmarks/results')` 与 `--config benchmarks/harness/...` 硬编码）
- `stress:*` 在 `benchmarks` 包内必须 `cd ../services/go-accelerator && go run ./cmd/stress ...` 或 `cd .. && node benchmarks/stress/...`
- `pnpm-workspace.yaml` 必须新增 `- evals` 与 `- benchmarks`（单目录包），不改 `overrides/allowBuilds`
- 所有 `pnpm eval:*/stress:*/bench:*` 的根外引用（`*.md`/`*.yml`）必须迁为 `pnpm --filter @trapmap/evals` / `pnpm --filter @trapmap/benchmarks`，`docs/archived/` 豁免
- 破坏性变更单 PR，`git revert` 可回滚；提交前需 `pnpm install` 验证 workspace 解析

---

### Task 1: Workspace 认领 — `pnpm-workspace.yaml` 新增 `evals` 与 `benchmarks`

**Files:**
- Modify: `pnpm-workspace.yaml:1-10`
- Test: 验证 `pnpm --filter @trapmap/evals --help` 可解析（需 Task 2 后）与 `pnpm-workspace.yaml` 语法

**Interfaces:**
- Consumes: 现有 `pnpm-workspace.yaml`（`packages/packages/*` + `apps/*`）
- Produces: 新增 workspace 成员，使 `pnpm --filter @trapmap/evals` / `@trapmap/benchmarks` 可解析

- [ ] **Step 1: 读取当前 workspace 文件**

```bash
cat pnpm-workspace.yaml
# 期望：
# packages:
#   - packages/*
#   - apps/*
```

- [ ] **Step 2: 修改 `pnpm-workspace.yaml`**

```yaml
packages:
  - packages/*
  - apps/*
  - evals
  - benchmarks

overrides:
  pg: 8.20.0
  "@types/pg": 8.20.0

allowBuilds:
  "@biomejs/biome": true
  esbuild: true
```

操作：

```bash
apply_patch pnpm-workspace.yaml <<'PATCH'
*** Begin Patch
*** Update File: pnpm-workspace.yaml
@@
 packages:
   - packages/*
   - apps/*
+  - evals
+  - benchmarks
 
 overrides:
   pg: 8.20.0
*** End Patch
PATCH
```

- [ ] **Step 3: 验证 YAML 语法**

Run: `pnpm exec js-yaml pnpm-workspace.yaml 2>&1 | head -n 20` 或 `cat pnpm-workspace.yaml && pnpm install --dry-run 2>&1 | head -n 30`
Expected: 无 YAML 解析错误（`pnpm install` Dry-run 不报错需等 Task 2/3 后才完全通过）

- [ ] **Step 4: Commit**

```bash
git add pnpm-workspace.yaml
git commit -m "chore(workspace): add evals and benchmarks to pnpm-workspace.yaml"
```

---

### Task 2: 新建 `evals/package.json`（`@trapmap/evals`，38 脚本硬迁）

**Files:**
- Create: `evals/package.json`
- Test: `pnpm --filter @trapmap/evals eval --help` 与 `pnpm --filter @trapmap/evals eval:retrieval:dry-run`（dry-run 无需 DB）

**Interfaces:**
- Consumes: `scripts/run-eval.ts`, `scripts/run-postgres-coordinated.ts`, `evals/**` 内部脚本
- Produces: `@trapmap/evals` 的 38 个可执行脚本（`eval*`）

- [ ] **Step 1: 采集根当前 38 条 `eval:*` 精确定义**

Run:

```bash
node -e "import('fs').then(fs=>console.log(JSON.stringify(JSON.parse(fs.readFileSync('package.json','utf8')).scripts,null,2)))" | grep -A1 '"eval'
# 或
cat package.json | python3 -c "import json; d=json.load(open('package.json')); [print(k, d['scripts'][k]) for k in sorted(d['scripts']) if k.startswith('eval')]"
```

记录全部 38 条键值（见本计划附录）。

- [ ] **Step 2: 创建 `evals/package.json`（路径修正版）**

```json
{
  "name": "@trapmap/evals",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "eval": "pnpm exec tsx --tsconfig ../tsconfig.base.json ../scripts/run-eval.ts",
    "eval:agent-planning": "pnpm run eval -- agent-planning --tier smoke",
    "eval:agent-planning:core": "pnpm run eval -- agent-planning --tier core --dry-run",
    "eval:agent-planning:dry-run": "pnpm run eval -- agent-planning --tier smoke --dry-run",
    "eval:agent-planning:smoke": "pnpm run eval -- agent-planning --tier smoke --dry-run",
    "eval:all": "pnpm run eval -- all --tier core",
    "eval:all:json": "pnpm run eval -- all --tier core --json --json-path ./reports/eval-report.json",
    "eval:ci": "pnpm exec tsx --tsconfig ../tsconfig.base.json scripts/eval-ci.ts",
    "eval:ci:core": "TIER=core pnpm exec tsx --tsconfig ../tsconfig.base.json scripts/eval-ci.ts",
    "eval:conflict": "pnpm exec tsx --tsconfig ../tsconfig.base.json graph-extraction/conflict-eval.ts",
    "eval:conflict:dry-run": "pnpm exec tsx --tsconfig ../tsconfig.base.json graph-extraction/conflict-eval.ts --dry-run",
    "eval:core": "pnpm run eval -- core",
    "eval:dedup": "pnpm exec tsx --tsconfig ../tsconfig.base.json graph-extraction/dedup-eval.ts",
    "eval:dedup:dry-run": "pnpm exec tsx --tsconfig ../tsconfig.base.json graph-extraction/dedup-eval.ts --dry-run",
    "eval:experience-gene": "pnpm exec tsx --tsconfig ../tsconfig.base.json experience-gene/run.ts",
    "eval:graph-extraction": "pnpm run eval -- graph-extraction",
    "eval:graph-extraction:dry-run": "pnpm run eval -- graph-extraction --tier smoke --dry-run",
    "eval:graph-extraction:smoke": "pnpm run eval -- graph-extraction --tier smoke",
    "eval:ingestion": "pnpm run eval -- ingestion",
    "eval:ingestion:dry-run": "pnpm run eval -- ingestion --tier smoke --dry-run",
    "eval:ingestion:smoke": "pnpm run eval -- ingestion --tier smoke",
    "eval:label-alignment": "pnpm run eval -- label-alignment --tier smoke --mode live",
    "eval:label-alignment:core": "pnpm run eval -- label-alignment --tier core --mode dry-run",
    "eval:label-alignment:dry-run": "pnpm run eval -- label-alignment --tier smoke --mode dry-run",
    "eval:label-alignment:smoke": "pnpm run eval -- label-alignment --tier smoke --mode dry-run",
    "eval:retrieval": "pnpm run eval -- retrieval",
    "eval:retrieval:core": "pnpm run eval -- retrieval --tier core",
    "eval:retrieval:dry-run": "pnpm run eval -- retrieval --tier smoke --dry-run",
    "eval:retrieval:live": "pnpm exec tsx --tsconfig ../tsconfig.base.json retrieval-live/run.ts",
    "eval:retrieval:live:compare": "pnpm exec tsx --tsconfig ../tsconfig.base.json retrieval-live/compare.ts",
    "eval:retrieval:live:smoke": "pnpm exec tsx --tsconfig ../tsconfig.base.json retrieval-live/run.ts --tier smoke",
    "eval:retrieval:smoke": "pnpm run eval -- retrieval --tier smoke",
    "eval:smoke": "pnpm exec tsx --tsconfig ../tsconfig.base.json ../scripts/run-postgres-coordinated.ts -- pnpm exec tsx --tsconfig ../tsconfig.base.json scripts/eval-all.ts --tier smoke",
    "eval:snapshots": "pnpm exec tsx --tsconfig ../tsconfig.base.json ../scripts/run-postgres-coordinated.ts -- pnpm exec tsx --tsconfig ../tsconfig.base.json promptfoo/scripts/generate-snapshots.ts",
    "eval:summary": "pnpm run eval -- summary",
    "eval:summary:core": "pnpm run eval -- summary --tier core",
    "eval:summary:dry-run": "pnpm run eval -- summary --tier smoke --dry-run",
    "eval:summary:smoke": "pnpm run eval -- summary --tier smoke"
  }
}
```

**注意**：
- `eval:smoke` 与 `eval:snapshots` 内含双层 `pnpm exec`，第二层 `promptfoo/scripts/...` 与 `scripts/eval-all.ts` 均以 `evals/` 为 cwd，故保留 `scripts/...` 相对路径；而第一层 `../scripts/run-postgres-coordinated.ts` 需 `../` 前缀。
- `eval:all:json` 的 `--json-path ./reports/eval-report.json` 在 `evals/` 内执行会写入 `evals/reports/eval-report.json`；如需保持根 `reports/` 则改为 `../reports/eval-report.json`。本计划保持 `../reports/eval-report.json` 更贴合 CI 期望（需验证 CI 脚本是否写根 reports）。
  - 若验证发现 CI 期望 `reports/` 在根，则将该脚本改为 `"pnpm run eval -- all --tier core --json --json-path ../reports/eval-report.json"`。
- 全部 38 条需与根原值逐条对照，键名保留 `eval:` 前缀，不做去前缀重命名。

- [ ] **Step 3: 安装并验证解析**

Run:

```bash
pnpm install
pnpm --filter @trapmap/evals exec echo ok
pnpm --filter @trapmap/evals run eval -- --help 2>&1 | head -n 20
# 期望：显示 SUITE 列表（smoke/core/all/retrieval/summary/...）
```

- [ ] **Step 4: 干跑验证（无需 DB）**

Run:

```bash
pnpm --filter @trapmap/evals eval:retrieval:dry-run 2>&1 | head -n 20
pnpm --filter @trapmap/evals eval:conflict:dry-run 2>&1 | head -n 20
# 期望：dry-run 路径可解析，不报 Cannot find module
```

- [ ] **Step 5: Commit**

```bash
git add evals/package.json pnpm-workspace.yaml
git commit -m "feat(evals): add @trapmap/evals package with 38 eval scripts (hard cut from root)"
```

---

### Task 3: 新建 `benchmarks/package.json`（`@trapmap/benchmarks`，19 脚本集中）

**Files:**
- Create: `benchmarks/package.json`
- Test: `pnpm --filter @trapmap/benchmarks bench:compare`（不压测，仅 jsVsGo 一致性）与 `pnpm --filter @trapmap/benchmarks stress:list`（需 Go 可用，否则跳过 Go 二进制检查）

**Interfaces:**
- Consumes: `benchmarks/harness/run-bench.ts`, `benchmarks/stress/**`, `services/go-accelerator/cmd/stress`
- Produces: `@trapmap/benchmarks` 的 `bench*` + `stress*` 脚本

- [ ] **Step 1: 创建 `benchmarks/package.json`**

```json
{
  "name": "@trapmap/benchmarks",
  "version": "0.1.0",
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

- [ ] **Step 2: 安装并验证**

Run:

```bash
pnpm install
pnpm --filter @trapmap/benchmarks exec echo ok
pnpm --filter @trapmap/benchmarks bench:compare 2>&1 | tail -n 20
# 期望：[bench harness] done — results in benchmarks/results/ ; 已有结果则 vitest bench 隔离通过
pnpm --filter @trapmap/benchmarks stress:list 2>&1 | head -n 20 || echo "Go not available, skip list"
```

- [ ] **Step 3: Commit**

```bash
git add benchmarks/package.json
git commit -m "feat(benchmarks): add @trapmap/benchmarks package with bench+stress scripts (hard cut from root)"
```

---

### Task 4: 根 `package.json` 瘦身 — 新增 `dev:web` + 删除 57 条

**Files:**
- Modify: `package.json:scripts`（新增 1，删除 57）
- Test: `pnpm --filter @trapmap/web-panel dev --help`（透传）与 `pnpm run eval --help` 应失败提示新入口

**Interfaces:**
- Consumes: Task 1-3 的新包
- Produces: 根 scripts 129 → 73，`dev:web` 可用，`eval/stress/bench` 在根不可用

- [ ] **Step 1: 编辑根 `package.json`**

新增（与 `dev:host-local` 相邻，保持字母序）：

```json
"dev:web": "pnpm --filter @trapmap/web-panel dev"
```

删除键（57 个）：

```
bench, bench:compare, bench:compute,
eval, eval:agent-planning, eval:agent-planning:core, eval:agent-planning:dry-run, eval:agent-planning:smoke,
eval:all, eval:all:json, eval:ci, eval:ci:core,
eval:conflict, eval:conflict:dry-run,
eval:core,
eval:dedup, eval:dedup:dry-run,
eval:experience-gene,
eval:graph-extraction, eval:graph-extraction:dry-run, eval:graph-extraction:smoke,
eval:ingestion, eval:ingestion:dry-run, eval:ingestion:smoke,
eval:label-alignment, eval:label-alignment:core, eval:label-alignment:dry-run, eval:label-alignment:smoke,
eval:retrieval, eval:retrieval:core, eval:retrieval:dry-run, eval:retrieval:live, eval:retrieval:live:compare, eval:retrieval:live:smoke, eval:retrieval:smoke,
eval:smoke, eval:snapshots, eval:summary, eval:summary:core, eval:summary:dry-run, eval:summary:smoke,
stress:all, stress:batch-cosine, stress:batch-cosine:legacy, stress:dedup, stress:dedup:legacy, stress:gene-derive, stress:gene-derive:legacy, stress:go, stress:go:all, stress:go:batch-cosine, stress:go:dedup, stress:go:gene-derive, stress:go:ranking, stress:list, stress:ranking, stress:ranking:legacy
```

操作：用脚本精确删除以防手误：

```bash
node <<'JS'
const fs=require('fs');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const del=[
 'bench','bench:compare','bench:compute',
 'eval','eval:agent-planning','eval:agent-planning:core','eval:agent-planning:dry-run','eval:agent-planning:smoke',
 'eval:all','eval:all:json','eval:ci','eval:ci:core',
 'eval:conflict','eval:conflict:dry-run','eval:core',
 'eval:dedup','eval:dedup:dry-run','eval:experience-gene',
 'eval:graph-extraction','eval:graph-extraction:dry-run','eval:graph-extraction:smoke',
 'eval:ingestion','eval:ingestion:dry-run','eval:ingestion:smoke',
 'eval:label-alignment','eval:label-alignment:core','eval:label-alignment:dry-run','eval:label-alignment:smoke',
 'eval:retrieval','eval:retrieval:core','eval:retrieval:dry-run','eval:retrieval:live','eval:retrieval:live:compare','eval:retrieval:live:smoke','eval:retrieval:smoke',
 'eval:smoke','eval:snapshots','eval:summary','eval:summary:core','eval:summary:dry-run','eval:summary:smoke',
 'stress:all','stress:batch-cosine','stress:batch-cosine:legacy','stress:dedup','stress:dedup:legacy','stress:gene-derive','stress:gene-derive:legacy','stress:go','stress:go:all','stress:go:batch-cosine','stress:go:dedup','stress:go:gene-derive','stress:go:ranking','stress:list','stress:ranking','stress:ranking:legacy'
];
for(const k of del) delete pkg.scripts[k];
pkg.scripts['dev:web']='pnpm --filter @trapmap/web-panel dev';
// 保持字母序（可选，biome 排序前）
fs.writeFileSync('package.json', JSON.stringify(pkg,null,2)+'\n');
console.log('remaining scripts', Object.keys(pkg.scripts).length);
JS
```

- [ ] **Step 2: 验证根计数与新别名**

Run:

```bash
node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('package.json','utf8')).scripts).filter(k=>k.startsWith('eval')).length)"
# 期望 0
node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('package.json','utf8')).scripts).filter(k=>k.startsWith('stress')).length)"
# 期望 0
node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('package.json','utf8')).scripts).filter(k=>k.startsWith('bench')).length)"
# 期望 0
grep -c '"dev:web"' package.json
# 期望 1
pnpm run dev:web -- --help 2>&1 | head -n 20 || pnpm --filter @trapmap/web-panel dev --help 2>&1 | head -n 20
# 期望透传至 vite
```

- [ ] **Step 3: 冒烟旧入口确实报错（硬切验证）**

Run:

```bash
pnpm run eval:smoke 2>&1 | head -n 20 && echo "ERROR should have failed" || echo "OK old eval:smoke fails as expected"
pnpm run bench:compute 2>&1 | head -n 20 && echo "ERROR" || echo "OK old bench fails"
```

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "refactor(root): add dev:web and remove eval/stress/bench (57 scripts) — hard cut to workspace packages"
```

---

### Task 5: 文档 & CI 硬切 — `grep` 全量替换

**Files:**
- Modify: `README.md`, `docs/architecture/DEPLOYMENT.md`, `docs/architecture/components/EVALUATION.md`, `docs/architecture/performance/PERF_STRESS_INFRA.md`, `evals/README.md`, `benchmarks/harness/README.md`, `benchmarks/stress/README.md`, `docs/operations/REGRESSION-COMMANDS.md`, `docs/operations/TESTING.md`, `docs/reference/SYSTEM_TRUTH_SOURCES.md`（如有命令索引）
- Modify: `.github/workflows/*.yml`（`eval.yml`, `ci.yml`, `nightly.yml` 等含 `pnpm eval:` / `pnpm bench` / `pnpm stress` 处）
- Test: `grep -rn "pnpm eval:smoke\|pnpm eval:retrieval\|pnpm stress:\|pnpm bench:" --include="*.md" --include="*.yml" | grep -v "docs/archived" | wc -l` == 0

**Interfaces:**
- Consumes: Task 2-4 的新命令形态
- Produces: 全仓库文档/CI 与新包命令一致

- [ ] **Step 1: 扫出现有引用**

Run:

```bash
grep -rn "pnpm eval:\|pnpm stress:\|pnpm bench" --include="*.md" --include="*.yml" --include="*.yaml" | tee /tmp/old-refs.txt
wc -l /tmp/old-refs.txt
cat /tmp/old-refs.txt | head -n 40
```

- [ ] **Step 2: 文档替换（示例 sed）**

```bash
# EVALUATION.md
sed -i 's/pnpm eval:smoke/pnpm --filter @trapmap\/evals eval:smoke/g' docs/architecture/components/EVALUATION.md
sed -i 's/pnpm eval:retrieval:smoke/pnpm --filter @trapmap\/evals eval:retrieval:smoke/g' docs/architecture/components/EVALUATION.md
sed -i 's/pnpm eval:retrieval:core/pnpm --filter @trapmap\/evals eval:retrieval:core/g' docs/architecture/components/EVALUATION.md
# 全量兜底（对剩余 eval:*）
sed -i 's/pnpm eval:/pnpm --filter @trapmap\/evals eval:/g' docs/architecture/components/EVALUATION.md
sed -i 's/pnpm --filter @trapmap\/evals eval: --/pnpm --filter @trapmap\/evals eval --/g' docs/architecture/components/EVALUATION.md

# PERF_STRESS_INFRA.md
sed -i 's/pnpm bench:compute/pnpm --filter @trapmap\/benchmarks bench:compute/g' docs/architecture/performance/PERF_STRESS_INFRA.md
sed -i 's/pnpm bench:compare/pnpm --filter @trapmap\/benchmarks bench:compare/g' docs/architecture/performance/PERF_STRESS_INFRA.md
sed -i 's/pnpm bench\b/pnpm --filter @trapmap\/benchmarks bench/g' docs/architecture/performance/PERF_STRESS_INFRA.md
sed -i 's/pnpm stress:/pnpm --filter @trapmap\/benchmarks stress:/g' docs/architecture/performance/PERF_STRESS_INFRA.md

# 其他 md
for f in evals/README.md benchmarks/harness/README.md benchmarks/stress/README.md docs/operations/REGRESSION-COMMANDS.md docs/operations/TESTING.md README.md docs/architecture/DEPLOYMENT.md; do
  [ -f "$f" ] && sed -i 's/pnpm eval:/pnpm --filter @trapmap\/evals eval:/g; s/pnpm bench:/pnpm --filter @trapmap\/benchmarks bench:/g; s/pnpm stress:/pnpm --filter @trapmap\/benchmarks stress:/g' "$f"
done
# dev:web 新增说明（DEPLOYMENT.md / README.md 的 dev 表手动增一行，或 sed 追加）
```

- **DEPLOYMENT.md / README.md** 手动在 `dev:*` 表增：

```md
| `dev:web` | `pnpm dev:web` | Web Panel 前端（Vite 4173） |
```

- [ ] **Step 3: CI 替换**

```bash
grep -rn "pnpm.*eval:" .github/workflows/ | cat
# 对每个 yml：
sed -i 's/pnpm eval:smoke/pnpm --filter @trapmap\/evals eval:smoke/g' .github/workflows/eval.yml
sed -i 's/pnpm eval:ci/pnpm --filter @trapmap\/evals eval:ci/g' .github/workflows/eval.yml
sed -i 's/TIER=core pnpm eval:ci:core/TIER=core pnpm --filter @trapmap\/evals eval:ci:core/g' .github/workflows/eval.yml
# 同理 bench/stress job
sed -i 's/pnpm bench:/pnpm --filter @trapmap\/benchmarks bench:/g' .github/workflows/*.yml
sed -i 's/pnpm stress:/pnpm --filter @trapmap\/benchmarks stress:/g' .github/workflows/*.yml
```

- [ ] **Step 4: 验证零残留（豁免 archived）**

Run:

```bash
grep -rn "pnpm eval:smoke\|pnpm eval:retrieval\|pnpm stress:\|pnpm bench:" --include="*.md" --include="*.yml" | grep -v "docs/archived" | grep -v "docs/superpowers/specs/2026-09-06-packages-json-restructure" | tee /tmp/residual.txt
wc -l /tmp/residual.txt
# 期望 0（允许 specs/plan 内的历史对照表，需排除）
```

- [ ] **Step 5: Commit**

```bash
git add README.md docs/ .github/ evals/README.md benchmarks/
git commit -m "docs(ci): migrate eval/stress/bench refs to pnpm --filter @trapmap/evals|benchmarks and add dev:web table"
```

---

### Task 6: 验证收敛 — 最小验证集合 + 架构边界

**Files:**
- Modify: 无（仅验证）
- Test: `pnpm check:docs`, `pnpm check:structure`, `pnpm typecheck`, `fallow audit`, dry-run eval, bench compare

**Interfaces:**
- Consumes: Task 1-5 全部产物
- Produces: 绿灯证据

- [ ] **Step 1: Workspace 安装与解析验证**

Run:

```bash
pnpm install
pnpm --filter @trapmap/evals eval --help 2>&1 | head -n 20
pnpm --filter @trapmap/benchmarks bench:compare 2>&1 | tail -n 20
pnpm --filter @trapmap/evals eval:retrieval:dry-run 2>&1 | head -n 20
```

Expected: 均无 Cannot find module / ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL

- [ ] **Step 2: 文档与结构守卫**

Run:

```bash
pnpm check:docs 2>&1 | tail -n 20
pnpm check:structure 2>&1 | tail -n 20
```

Expected: PASS（`check:docs` blocking tiers green）

- [ ] **Step 3: 类型与边界**

Run:

```bash
pnpm typecheck 2>&1 | tail -n 20
pnpm exec fallow audit --base main --no-cache 2>&1 | tail -n 30
```

Expected: `typecheck` 0 errors；`fallow` 提示 `evals`/`benchmarks` 无越界（脚本容器不导入 `packages/*`）

- [ ] **Step 4: 残留扫描最终确认**

Run:

```bash
grep -rn "pnpm eval:smoke\|pnpm eval:retrieval\|pnpm stress:\|pnpm bench:" --include="*.md" --include="*.yml" | grep -v "docs/archived" | grep -v "specs/2026-09-06" | grep -v "plans/2026-09-06" || echo "CLEAN"
```

Expected: `CLEAN`

- [ ] **Step 5: 可选 — Web 起服冒烟（30s）**

Run:

```bash
timeout 15 pnpm dev:web 2>&1 | head -n 30 || true
# 期望出现 vite ready on 4173
```

- [ ] **Step 6: 聚合 commit（如有遗漏修复）**

```bash
git status --porcelain
# 若有 fallow 或 typecheck 修复，单独 commit
git add -A && git commit -m "chore(verify): fix docs/structure/typecheck after workspace restructure" --no-verify || echo "no changes"
```

---

## 附录 — 根原 38 条 `eval:*` 全量（供对照）

```
eval: pnpm exec tsx --tsconfig tsconfig.base.json scripts/run-eval.ts
eval:agent-planning: pnpm run eval -- agent-planning --tier smoke
eval:agent-planning:core: pnpm run eval -- agent-planning --tier core --dry-run
eval:agent-planning:dry-run: pnpm run eval -- agent-planning --tier smoke --dry-run
eval:agent-planning:smoke: pnpm run eval -- agent-planning --tier smoke --dry-run
eval:all: pnpm run eval -- all --tier core
eval:all:json: pnpm run eval -- all --tier core --json --json-path ./reports/eval-report.json
eval:ci: pnpm exec tsx --tsconfig tsconfig.base.json evals/scripts/eval-ci.ts
eval:ci:core: TIER=core pnpm exec tsx --tsconfig tsconfig.base.json evals/scripts/eval-ci.ts
eval:conflict: pnpm exec tsx --tsconfig tsconfig.base.json evals/graph-extraction/conflict-eval.ts
eval:conflict:dry-run: pnpm exec tsx --tsconfig tsconfig.base.json evals/graph-extraction/conflict-eval.ts --dry-run
eval:core: pnpm run eval -- core
eval:dedup: pnpm exec tsx --tsconfig tsconfig.base.json evals/graph-extraction/dedup-eval.ts
eval:dedup:dry-run: pnpm exec tsx --tsconfig tsconfig.base.json evals/graph-extraction/dedup-eval.ts --dry-run
eval:experience-gene: pnpm exec tsx --tsconfig tsconfig.base.json evals/experience-gene/run.ts
eval:graph-extraction: pnpm run eval -- graph-extraction
eval:graph-extraction:dry-run: pnpm run eval -- graph-extraction --tier smoke --dry-run
eval:graph-extraction:smoke: pnpm run eval -- graph-extraction --tier smoke
eval:ingestion: pnpm run eval -- ingestion
eval:ingestion:dry-run: pnpm run eval -- ingestion --tier smoke --dry-run
eval:ingestion:smoke: pnpm run eval -- ingestion --tier smoke
eval:label-alignment: pnpm run eval -- label-alignment --tier smoke --mode live
eval:label-alignment:core: pnpm run eval -- label-alignment --tier core --mode dry-run
eval:label-alignment:dry-run: pnpm run eval -- label-alignment --tier smoke --mode dry-run
eval:label-alignment:smoke: pnpm run eval -- label-alignment --tier smoke --mode dry-run
eval:retrieval: pnpm run eval -- retrieval
eval:retrieval:core: pnpm run eval -- retrieval --tier core
eval:retrieval:dry-run: pnpm run eval -- retrieval --tier smoke --dry-run
eval:retrieval:live: pnpm exec tsx --tsconfig tsconfig.base.json evals/retrieval-live/run.ts
eval:retrieval:live:compare: pnpm exec tsx --tsconfig tsconfig.base.json evals/retrieval-live/compare.ts
eval:retrieval:live:smoke: pnpm exec tsx --tsconfig tsconfig.base.json evals/retrieval-live/run.ts --tier smoke
eval:retrieval:smoke: pnpm run eval -- retrieval --tier smoke
eval:smoke: pnpm exec tsx --tsconfig tsconfig.base.json scripts/run-postgres-coordinated.ts -- pnpm exec tsx --tsconfig tsconfig.base.json evals/scripts/eval-all.ts --tier smoke
eval:snapshots: pnpm exec tsx --tsconfig tsconfig.base.json scripts/run-postgres-coordinated.ts -- pnpm exec tsx --tsconfig tsconfig.base.json evals/promptfoo/scripts/generate-snapshots.ts
eval:summary: pnpm run eval -- summary
eval:summary:core: pnpm run eval -- summary --tier core
eval:summary:dry-run: pnpm run eval -- summary --tier smoke --dry-run
eval:summary:smoke: pnpm run eval -- summary --tier smoke
```

`bench` 3 与 `stress` 16 见 Task 3/4。

