# Task 11 Report: DATABASE_SCHEMA 文档校准（62→64 表）

Date: 2026-08-15
Branch: sdd/task-11 (worktree `Trap-Map-wt-task11`)

## 完成内容

### Step 1: 表清单 diff（persistence-schema 64 vs 文档 62）

实测 `packages/persistence-schema/src/` 共 **64 张 `pgTable`**（script 提取，逐文件 `pgTable('...')` 表名）。文档 62 表差异：

- **缺 2 表**（persistence-schema 有、文档无）：
  - `knowledge_submissions`（`knowledge.ts:324`，PK `id` text；提交记录，含 agent_review/reviewer_decision/review_notes 快照，`resubmission_of` 关联原始提交）
  - `knowledge_review_decisions`（`knowledge.ts:346`，PK `id` identity；decision CHECK IN ('approve','reject')）
- **多 1 幽灵表**（文档有、persistence-schema 无）：`conflict_relations`（见 Step 2 裁决）

### Step 2: conflict_relations 裁决

**该表真实存在**：`packages/service-governance-review/drizzle/0000_shiny_swarm.sql` 创建了 `CREATE TABLE "conflict_relations"`（含 `ck_conflict_relations_canonical_order` / `ck_conflict_relations_type` CHECK 约束），且 `service-governance-review/src/pg-ports.ts` 以原始 SQL 读写它（INSERT/SELECT，lines 98/124/146）。

这是**迁移 SQL 与 persistence-schema 双份表定义源的证据**：governance-review 拥有独立 drizzle baseline（0000_shiny_swarm.sql），其中 `conflict_relations` 未在 persistence-schema 建模。六个 service drizzle baseline 共建 66 张 CREATE TABLE（含遗留 `store_snapshot` 与 `conflict_relations`），persistence-schema 64 张，恰为 66 − store_snapshot（Wave-9 已删、迁移残留）− conflict_relations（未建模）。

**裁决（按 brief 最小改动原则）**：不补入 persistence-schema、不删除迁移 SQL，保持现状；在 `DATABASE_SCHEMA.md` 反馈与分析域标注"仅存在于 service-governance-review 迁移 SQL，未在 persistence-schema 建模"，并记录建议（见"疑虑"）。

### Step 3: task_queue 索引冗余确认（不删除，记录建议）

`queue.ts` 与 `service-job-runtime/drizzle/0000_sharp_old_lace.sql` 一致，task_queue 有 3 个索引：

| 索引 | 类型 | 列 | 条件 |
|---|---|---|---|
| `task_queue_type_dedupe_idx` | 非部分 | `(type, dedupe_key)` | — |
| `task_queue_running_lease_idx` | 部分 | `(type, lease_until, updated_at)` | `status='running'` |
| `task_queue_dedupe_pending_idx` | 部分唯一 | `(type, dedupe_key)` | `status IN ('pending','running')` |

**冗余确认**：`task_queue_type_dedupe_idx` 与 `task_queue_dedupe_pending_idx` 覆盖同一列组。唯一消费 `(type, dedupe_key)` 的查询是 `async-runtime.ts:120` 的 dedupe 回查，条件为 `TASK_DEDUPE_SQL_CONDITION` = `status IN ('pending','running')`（`policy.ts:74`），被部分唯一索引完全覆盖；终态行（completed/error/dead）无任何按 `(type, dedupe_key)` 的查询。**但删除会改变已应用迁移（0000_sharp_old_lace.sql 是已应用 baseline）**，按指示本任务只做文档校准，索引删除留给后续任务（建议见"疑虑"）。

**附带发现**：文档原"task_queue 关键索引"表列的 `task_queue_pending_dequeue_idx`（出队谓词索引）**当前 schema 已不存在**（仅残留在 `queue.ts:18` 注释，指向历史迁移 0009）。SKIP LOCKED 出队谓词（`status='pending' AND process_after<=NOW() ORDER BY priority DESC, created_at ASC`，`async-runtime.ts:174`）当前无专门索引支撑。文档索引表已按实际 schema 重写（type_dedupe / running_lease / dedupe_pending）。

### Step 4: 文档更新

- `docs/reference/DATABASE_SCHEMA.md`：
  - 表总览 62 → **64 张表**，并注明以 persistence-schema 实测为准
  - 知识域 14 → **16 表**：补 `knowledge_submissions`、`knowledge_review_decisions`（插在 revisions 后，与 `knowledge.ts` 文件顺序一致）
  - 反馈与分析域：`conflict_relations` 行移除，改为标注"仅存在于迁移 SQL，未在 persistence-schema 建模"
  - task_queue 关键索引表：按实际 schema 重写（去幽灵 `pending_dequeue_idx`，补 `type_dedupe_idx` 并标注冗余，注明出队谓词无索引）
- `docs/README.md`：两处 "62 张表" → "64 张表"（lines 203/267）
- `scripts/complexity-budgets.json`：doc-drift 守卫规则 `mustContain ["62 张表"]` → `["64 张表"]`，`mustNotContain` 增补 `"62 张表"` 防回退
- **docs/README.md:264 LLM 图提取条目**：核验 commit `ed6267ee`（Task 3）已加注"实现已标记 @eval-only，仅 eval 链路引用"，无需重复修改

### Step 5: 验证

| 验证 | 结果 |
|---|---|
| 表清单 diff（doc 69 行 vs ps 64，排除索引行） | 64 表全命中、无幽灵表（除已标注的迁移-only 表） |
| `rtk pnpm check:docs` | 通过（doc-drift/mermaid/md-lint/doc-truth/links 全绿；doc-references WARN 为归档文档预存问题，非本次引入） |
| `rtk pnpm check:structure` | 通过（structure-guard/arch-freeze/stale-package-refs 全绿） |
| `rtk pnpm --filter @trapmap/persistence-schema typecheck` | 通过（No errors found） |
| `rtk pnpm test:file -- scripts/__tests__/closeout-surface.test.ts` | 8/10 通过；2 失败为 **base HEAD 预存**（plan.md 活跃主线措辞断言，与本次无关，git stash 复现确认） |

## 疑虑 / 后续建议

1. **`task_queue_type_dedupe_idx` 删除**：冗余已确认（列组与部分唯一索引重合、无终态查询消费）。删除需：`queue.ts` 移除索引定义 + `service-job-runtime/drizzle/0000_sharp_old_lace.sql` 移除对应 `CREATE INDEX`（已应用迁移的原地修改需按团队约定走新迁移或重建基线，未在本任务处理）。建议留给索引清理后续任务。
2. **出队谓词缺索引**：SKIP LOCKED 出队查询（`type` + `status='pending'` + `process_after<=NOW()` + `ORDER BY priority DESC, created_at ASC`）无支撑索引；历史 0009 的 `task_queue_pending_dequeue_idx` 已随旧迁移退役。若队列吞吐成为热点，需评估是否补回。
3. **`conflict_relations` 双份表定义源**：建议后续任务评估——迁入 persistence-schema 统一建模（推荐，消除双份源），或按 dead-code 判定整体退役（需确认 governance-review 冲突检测链路是否仍被消费）。
4. **`store_snapshot` 迁移残留**：`service-identity-access/drizzle/0000_identity_access_baseline.sql` 仍建 `store_snapshot`（Wave-9 已删，doc 声明"已删除"），persistence-schema 无此表；属同类漂移，可并入表清单守卫 Task 12 的基线比对范围。
5. **防复发守卫**：Task 12 落地表清单 diff 守卫时，建议以"迁移 SQL 表集合 ⊇ persistence-schema 表集合"的包含方向断言，容忍 `conflict_relations`/`store_snapshot` 这类迁移-only 表，直到双份源消除。
6. **pre-existing test failures**：`closeout-surface.test.ts` 2 个用例（plan.md 活跃主线措辞）在 base HEAD 即失败，疑似前一任务的计划文档改动未同步测试断言，建议单独立项核对（超出本任务范围）。
