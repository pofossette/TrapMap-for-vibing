# Task 7 Report: candidates 表双份定义合并到 persistence-schema 单源

Date: 2026-08-15
Branch: sdd/task-7 (worktree `Trap-Map-wt-task7`)

## 完成内容

### Step 1: diff 两份定义（核实 Task 3 完成度）

Task 3（commit `ed6267ee`）已把本地 7 表定义替换为单行 re-export，并补了依赖声明。本任务以 `git show ed6267ee^` 恢复删除前的本地 `schema.ts`（172 行），与 `packages/persistence-schema/src/candidates.ts` 逐表 diff（剥离注释与空白后）：

**结果：零漂移。** 7 张表（candidates、candidate_analyses、candidate_duplicate_cases、candidate_duplicate_matches、candidate_manual_results、candidate_resolution_outcomes、entity_lineage）的列名、列顺序、nullability、默认值、CHECK 集合、索引定义全部一致。仅有的差异是工厂来源不同，语义等价：

- 本地版：内联 `const auditTimestamps = () => ({ createdAt, updatedAt })`
- persistence-schema 版：`import { auditTimestamps } from './column-factories.js'`（同 `createdAt + updatedAt`，均 `withTimezone defaultNow()`）

### Step 2: 统一到 persistence-schema

无需代码改动——Task 3 已完成全部统一：

- `packages/service-candidate-ingestion/src/schema.ts`：已是 `export * from '@trapmap/persistence-schema'`（1 行）
- `packages/service-candidate-ingestion/package.json`：已声明 `"@trapmap/persistence-schema": "workspace:*"`（dependencies）
- `packages/persistence-schema/src/candidates.ts`：与本地版无差异，无需补齐
- `packages/service-candidate-ingestion/src/migrations.ts`：owner 守卫正确——`assertOwnerMigrationSet('candidate-ingestion', folder, ['0000_colorful_silk_fever'])` 与 `drizzle/meta/_journal.json` 唯一 entry 一致；`migrations.test.ts` 4 条守卫用例（完整集、reject 外部 SQL、reject 外部 journal tag、reject 缺失 tag）全过

### Step 3: 迁移 SQL 与 persistence-schema 一致性核对

`drizzle/0000_colorful_silk_fever.sql` 与 persistence-schema 逐项核对：

- **表名**：7 张表名全部一致 ✓
- **列名/类型/默认值**：全部一致 ✓
- **CHECK**：10 条约束（ck_candidates_source_type、ck_candidates_status、ck_candidate_duplicate_cases_type、ck_candidate_duplicate_matches_entity_type、ck_candidate_duplicate_matches_match_type、ck_candidate_manual_results_decision、ck_candidate_resolution_outcomes_decision、ck_entity_lineage_relationship_type、ck_entity_lineage_source_type、ck_entity_lineage_target_type）全部一致 ✓
- **索引**：11 条索引全部一致 ✓

**唯一差异（预存，非 Task 3 遗漏）**：迁移 SQL 的 `candidates` 表包含 3 个 legacy nullable JSONB 列——`analysis_snapshot`、`duplicate_case`、`manual_result`。该差异溯源到 Task 3 之前的更早基线（`a8024098` 重生成 SQL 时保留了旧 baseline 的列；`git log -S analysis_snapshot` 显示两份 schema 定义都从未同步过这些列）。证据表明这些列是结构性拆分的产物（注释明确 "Replaces JSONB analysis_snapshot/duplicate_case/manual_result column"），代码层不再使用：

- `pg-ports.ts` 无任何读写这 3 列的 SQL
- `pg-ports.test.ts` 显式断言 `expectNoSql(calls, 'UPDATE candidates SET manual_result')` 等三条（303、334、383 行）

按 brief 原则"以迁移 SQL 为准修复 persistence-schema"只适用于 Task 3 遗漏的列漂移；此处两份定义一致、代码不消费 legacy 列，把 3 列加回 persistence-schema 反而会重新引入死 schema。**未修改 persistence-schema**，遗留项记录在报告疑虑中（需 0001 迁移 DROP 列，超出本任务范围）。

## 验证摘要

| 验证 | 结果 |
|---|---|
| `rtk pnpm --filter @trapmap/service-candidate-ingestion test --run` | 5 文件 39/39 通过（pg-ports 17、routes 12、migrations 4、processing 4、processing-task-queue 2） |
| `rtk pnpm typecheck` | 通过（No errors found） |
| `rtk pnpm exec fallow audit --base main` | ✓ No issues |

## 疑虑

1. 迁移 SQL `candidates` 表的 3 个 legacy JSONB 列（analysis_snapshot/duplicate_case/manual_result）是既有迁移陈旧：实际应用 0000 后 DB 会多出这 3 个列，与 persistence-schema 单源定义不一致。正确修复需新增 0001 迁移 `ALTER TABLE candidates DROP COLUMN ...`（或重生成基线），且需评估现有环境 DB 是否有数据依赖，超出本任务范围，建议后续单独任务处理。
2. 本任务无代码改动，commit 仅为任务报告；Step 2 的实体改动由 Task 3（ed6267ee）完成并已合入。
3. `migrations.ts` 的 owner 守卫只校验 journal tag 集合，不校验 SQL 内容与 schema 的一致性——本次是人工核对。若希望 CI 自动防漂移，可考虑给 persistence-schema 增加 schema↔SQL 快照对比测试，属可选改进。
