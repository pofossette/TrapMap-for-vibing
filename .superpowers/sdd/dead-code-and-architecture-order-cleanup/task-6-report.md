# Task 6 Report: evals 双轨 runner 合并与孤儿目录清理

Date: 2026-08-15
Branch: sdd/task-6 (worktree `Trap-Map-wt-task6`)

## 完成内容

### Step 1: 合并 eval-ci 与 eval-all 双轨 runner

- `evals/scripts/eval-all.ts`:
  - 导出 `runRetrievalEval` / `runSummaryEval`（原为模块私有函数），并导出 `RetrievalResult` / `SummaryResult` 类型供 CI 复用。
  - 文件头补充说明：CI runner 是唯一的外部消费者。
- `evals/scripts/eval-ci.ts`:
  - 删除重复的 `runRetrievalEval` / `runSummaryEval` / `CIReportSummary`（约 -120 行），改为 `import { runRetrievalEval, runSummaryEval } from './eval-all.js'`。
  - `CIReport` 收敛为共享 schema：`retrieval: RetrievalResult | null`、`summary: SummaryResult | null`（原先 CI 自造的子对象 + `report: unknown` 已删除）。
  - 基线比较/写基线处删除 `as RetrievalEvalReport` 裸断言（类型收窄后不再需要）。
  - 新增 `getCiEvalOptions()` 构造共享 runner 的选项（dryRun=false、allowEmpty=false、verbose=false，与旧 CI 行为一致）。
  - 补齐 `if (process.argv[1] === fileURLToPath(import.meta.url))` 入口守卫（与 eval-all.ts 一致）。原文件无守卫：import 即执行 `main()`，曾导致在单测 import 时触发真实评测尝试（旧测试不 import 该模块所以潜伏，本次合并暴露），已修复。
  - 导出 `compareWithBaseline` / `writeBaseline` / `formatRegressionResult` / `formatCompactSummary` / `CIReport` 供测试直接复用。
- `evals/scripts/__tests__/eval-ci.test.ts`:
  - 删除 ~130 行内联"逻辑重造"测试脚手架（原注释明言"函数导出后切换为直接 import"），改为直接 import 真实实现。
  - `formatCompactSummary` fixtures 更新为完整 `CIReport`（`RetrievalResult`/`SummaryResult`）形状。
- 报告写盘路径：CI 恒写 `reports/eval-report.json`（`writeCIReport`）；eval-all 经 `--json --json-path`（默认同路径，见 `package.json` 的 `eval:all:json`）。两者 schema 已收敛为共享的 RetrievalResult/SummaryResult 子对象；CI 报告保留 CI 特有的 `regression` 字段与 GitHub outputs 语义。**双轨评估哪个 schema 更全：** eval-all 的 `CombinedReport` 覆盖 6 个 suite，明显更全，CI 侧按共享 runner 的 result 形状收敛。

### Step 2: 删除孤儿目录

- `rg "evals/baselines"` 仅命中任务自身 todo 文档（docs/todos/dead-code-and-architecture-order-cleanup.md），代码与文档（docs/README.md、evals/README.md、docs/architecture/components/EVALUATION.md、REPO_STRUCTURE.md）均无引用，无需同步文档描述。
- `git rm -r evals/baselines`：删除 `.gitkeep` + `README.md`（真实基线由 `eval-ci.ts` 的 `BASELINES_DIR = 'reports/baselines'` 管理）。

### Step 3: knip entry 补全

`knip.json` entry 新增（均经 ls 确认存在）：
`evals/agent-planning/run.ts`、`evals/label-alignment/run.ts`、`evals/graph-extraction/run.ts`、`evals/ingestion/run.ts`、`evals/retrieval-live/run.ts`、`evals/retrieval-live/compare.ts`、`evals/graph-extraction/dedup-eval.ts`、`evals/graph-extraction/conflict-eval.ts`、`evals/scripts/annotate-skills.ts`。

knip 输出验证：无新增 unused file；4 条 entry 提示 "Remove redundant entry pattern"（retrieval-live/run.ts、compare.ts、dedup-eval.ts、conflict-eval.ts，因 package.json 脚本已被 tsx 插件自动识别）——纯提示性，不报错。

## 验证摘要

| 验证 | 结果 |
|---|---|
| `rtk pnpm typecheck` | 通过（No errors found） |
| `rtk pnpm test:file -- evals/scripts/__tests__/eval-ci.test.ts` | 10/10 通过 |
| `rtk pnpm test:file -- evals/scripts/__tests__/eval-all.test.ts` | 15/16 通过（1 个失败为**预先存在**的环境依赖失败，见下） |
| `rtk pnpm eval -- retrieval --tier smoke --dry-run` | 通过（加载用例，Dry run complete，exit 0） |
| `rtk pnpm eval -- summary --tier smoke --dry-run` | 通过（加载 6 用例，Dry run complete，exit 0） |
| `rtk pnpm eval -- smoke --dry-run`（eval-all 聚合路径） | 通过（6 suite 全跑，33/33 cases passed） |
| `TIER=bogus pnpm exec tsx evals/scripts/eval-ci.ts` | 正确报 Invalid TIER 并 exit 1（入口可运行） |
| `rtk pnpm exec biome check`（改动文件） | 通过（1 处 import 排序自动修复） |
| `rtk pnpm exec knip` | 无新增 unused；entry 生效 |

## 预存失败说明

`eval-all.test.ts` 的 `routes all six suites through their bridges in dry-run` 用例失败（`expect(report.retrieval).not.toBeNull()`）。已用 `git stash` 在改动前 HEAD 复现同一失败——**非本次改动引入**，原因是 retrieval bridge 需 PostgreSQL（本地无 PG 服务）。CI 中该测试在带 postgres service 的 eval-parity job 环境可过。

## 疑虑

1. `eval-all.test.ts` 那条干跑用例在无 PG 的本地环境必失败（预存），未做处理；如需本地可跑可考虑 mock bridge，超出本任务范围。
2. knip 对 4 个新 entry 报 "redundant entry pattern" 提示（tsx 插件已自动识别 package.json 脚本入口）；这是 knip 的提示而非错误，按 brief 要求保留显式 entry。
3. `scripts/run-eval.ts` 的 `--smoke` 特判（graph-extraction/ingestion）按 brief 保留未动。
