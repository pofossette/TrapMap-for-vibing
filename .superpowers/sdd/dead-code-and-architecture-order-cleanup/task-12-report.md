# Task 12 Report: 防复发守卫落地

**Status:** DONE
**Branch:** sdd/task-12
**Date:** 2026-08-15

## Summary

落地四类防复发守卫并接入 CI（`doc-guardrails` job、`scripts/run-ci.ts`、`package.json` scripts）。四类守卫均带正反例单测（31 个新用例），全部通过；`check:docs`、`check:structure`、`typecheck`、`fallow audit --base main` 全绿。

## 守卫实现

### 1. 表清单守卫 — `scripts/check-table-schema.ts`（`check:table-schema`）

- 以 `packages/persistence-schema/src/` 的 64 张 `pgTable` 为权威，diff `docs/reference/DATABASE_SCHEMA.md` 表清单。
- 检测四类漂移：缺表（schema 有、文档无）、幽灵表（文档有、schema 无）、分节计数不一致（`### X (N 表)` 与实际行数不符）、总表数不一致（`## 表总览 (N 张表)` 与 schema 数不符）。
- 文档解析排除 `_idx` 结尾的索引行（5 个已知索引表行不会误报）。
- `store_snapshot`：迁移 SQL 历史残留（Task 11 发现，66 CREATE TABLE = 64 + conflict_relations + store_snapshot），守卫范围明确限定 persistence-schema（64 表权威），不阻塞；已在守卫头注释与 CI_CD.md/TESTING.md 中记录。
- 测试：`scripts/__tests__/check-table-schema.test.ts`（9 用例，含正例 + 缺表/幽灵表/分节/总数四个反例）。

### 2. pgTable 单源守卫 — `scripts/check-pgtable-single-source.ts`（`check:pgtable-single-source`）

- 扫描 `packages/service-*` 全部 src 文件：
  - `schema.ts` 必须包含 `export * from '@trapmap/persistence-schema'` 且不得调用 `pgTable(`；
  - 其余文件同样禁止 `pgTable(`（防止定义藏进非 schema 文件）。
- 当前全仓 service 包零 `pgTable` 调用（Task 3 re-export 化），守卫立即通过。
- 测试：`scripts/__tests__/check-pgtable-single-source.test.ts`（9 用例，直接定义/缺 re-export/非 schema 文件/注释豁免/非 service 包豁免）。

### 3. eval import 边界守卫 — `scripts/check-eval-imports.ts`（`check:eval-imports`）

- 新建守卫（未改 `check-relative-imports.mjs`，其 packages 范围语义不变）。
- 允许面：`@trapmap/*` 包名导入（走 exports）、`packages/contracts/**`、host-local eval allowlist（3 个实际导入文件：host-runtime/host-services/config）、带 `@eval-only` 头注释的模块；`EVAL_TEST_FACADE_ALLOWLIST` 保留 1 个文档化测试面例外（`retrieval-read-model-cache.ts`，其 `resetRetrievalReadModelCacheForTests` 为产品模块上的测试专用入口，产品代码引用故不能标 @eval-only）。
- 其余 evals→packages 深路径直连即失败。
- 为通过守卫修复了 evals 内 3 个边界违规：
  - `evals/retrieval/lib/adapters.ts`：`KnowledgeRecord`/`DerivedSkillCapsuleRecord`/`KnowledgeOwnerPort` → `@trapmap/contracts`；`ArtifactWritePort` → `@trapmap/service-knowledge-write`。
  - `evals/summary/lib/judge.ts` + `judge.test.ts`：`buildClaimVerificationSystemPrompt` → `@trapmap/ai-providers/prompts.js`（tsconfig.base.json 补 `@trapmap/ai-providers/*` paths 映射）。
  - `evals/promptfoo/parity-retrieval.test.ts`：6 个 migrations 深导入 → `@trapmap/service-*` 包名。
- 测试：`scripts/__tests__/check-eval-imports.test.ts`（6 用例，允许面 + 违规反例 + 包名/evals 内部导入豁免）。

### 4. @eval-only 标记守卫 — `scripts/check-eval-only.ts`（`check:eval-only`）

- 收集 evals→packages 相对导入目标，落在 `packages/service-*`/`backend-core`/`host-*` 范围内的模块，若：
  - 无产品相对引用（`packages/**` 内相对导入扫描），且
  - 不通过包 index re-export 链可达（产品公共面），
  则判定为 eval-only，必须带 `@eval-only` 头注释，否则失败。
- 现状：graph-llm-extract / llm-dedup / llm-conflict 已标记；本次为另两个真实 eval-only 模块补标记：
  - `packages/service-knowledge-write/src/knowledge-record-mutations.ts`（仅 evals/retrieval/lib/adapters.ts 引用）
  - `packages/service-knowledge-write/src/artifact-derive-from-payloads.ts`（仅 evals/ingestion/bridge.ts 与 evals/scripts/annotate-skills.ts 引用）
- 测试：`scripts/__tests__/check-eval-only.test.ts`（7 用例，含未标记反例 + 全标记正例 + index 可达/产品引用豁免）。

## CI / 脚本注册

- `package.json`：新增 `check:table-schema`、`check:pgtable-single-source`、`check:eval-imports`、`check:eval-only`。
- `scripts/run-ci.ts`：STEPS 追加 4 个守卫（check:asserts 之后）。
- `.github/workflows/ci.yml`：`doc-guardrails` job 追加 4 个 `pnpm check:*` 步骤。
- `scripts/lib/eval-import-lib.ts`：两守卫共享的导入收集/目标解析/标记检测工具（scanImportRefs 语义镜像 check-relative-imports.mjs，加 fallow 抑制注释说明）。
- 测试夹具去重：新增 `scripts/__tests__/helpers/temp-repo.ts`，四个测试文件共用。

## 文档更新

- `docs/operations/CI_CD.md`：doc-guardrails 行与说明段加入 4 个守卫及其判定语义；store_snapshot 范围说明。
- `docs/operations/TESTING.md`：验证矩阵加 4 行；结构重构守卫段补命令示例。
- `docs/guides/DOCUMENTATION_GOVERNANCE.md`：新增「数据与架构防复发守卫」小节。
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`：规则 28 命令清单更新；check:* 面 7→11 命令。
- `scripts/complexity-budgets.json`：CI_CD.md / SYSTEM_TRUTH_SOURCES.md 两条 doc-drift 规则同步更新。

## 验证结果

| 验证项 | 结果 |
|---|---|
| `check:table-schema`（真实仓） | PASS（64 = 64） |
| `check:pgtable-single-source`（真实仓） | PASS |
| `check:eval-imports`（真实仓） | PASS |
| `check:eval-only`（真实仓） | PASS |
| 新增 guard 单测（4 文件） | 31 passed |
| `rtk pnpm check:docs` | PASS（doc-references 有 4 条 pre-existing 非阻断 WARN，与本次改动无关） |
| `rtk pnpm check:structure` | PASS |
| `rtk pnpm check:asserts` | PASS（0 裸断言） |
| `rtk pnpm check:imports` | PASS |
| `rtk pnpm typecheck` | PASS |
| `rtk pnpm exec fallow audit --base main` | PASS（0 introduced；5 处 fallow-ignore-next-line complexity 带理由抑制） |
| `rtk pnpm test:file` scripts 全量 | 229 passed / 3 pre-existing failed（check-doc-references、closeout-surface，main 上同样失败） |
| evals 受影响测试（judge/adapters） | 14 passed / 7 skipped（PG 依赖跳过） |
| `eval:smoke` | 未运行：本机 docker 不可用（Task 13 已约定 CI 补跑记录） |

## 疑虑 / 备注

1. **`pnpm install` 环境坑**：worktree 的 per-package `node_modules` 链接缺失（packages/lib/node_modules 等），导致 evals vitest 无法解析 gray-matter；`pnpm install --force` 修复。main worktree 同样存在此现象（judge.test.ts 在 main 上同样失败），属环境基线问题，与本次改动无关。
2. **fallow 复杂度抑制**：5 个扫描/状态机函数加 `fallow-ignore-next-line complexity -- <reason>`（CRAP 阈值 30 在无覆盖率证据时对 CC≥5 的守卫扫描函数过严；仓库既有 79 个同型脚本 findings 与 35 个 packages 抑制为同一惯例）。
3. **test-facade allowlist**：`retrieval-read-model-cache.ts` 属产品模块但 evals 使用其测试专用 reset 入口，以显式 allowlist + 注释记录，后续若想彻底消除可考虑把 reset 迁入独立 @eval-only 模块。
4. **knip.json**：Task 6 已补 entry（`evals/graph-extraction/dedup-eval.ts`、`conflict-eval.ts` 等），本次确认 eval 死代码可报告，无需改动。
5. **store_snapshot**：仍建议后续任务评估从 identity-access 迁移 SQL 删除或迁移到 persistence-schema（本守卫刻意不覆盖迁移 SQL）。
