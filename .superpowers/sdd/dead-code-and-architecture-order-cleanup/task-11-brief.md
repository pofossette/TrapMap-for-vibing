### Task 11: DATABASE_SCHEMA 文档校准

**Files:**
- Modify: `docs/reference/DATABASE_SCHEMA.md`（62→64 表；补 `knowledge_submissions`、`knowledge_review_decisions`；裁决 `conflict_relations` 幽灵表：若仅存在于 service-governance-review/drizzle/0000_shiny_swarm.sql 则从文档移除或迁入 persistence-schema——以实际迁移为准）
- Modify: `packages/persistence-schema/src/queue.ts`（确认 `task_queue_type_dedupe_idx` 非部分索引冗余，若覆盖同一列组则删除；以测试与迁移为准）
- 附带：`docs/README.md:264` LLM 图提取条目（已在 Task 3 标记 @eval-only 后，把归档条目标注为"仅 eval 链路引用"）

**Interfaces:**
- Consumes: persistence-schema 64 表实测 + DATABASE_SCHEMA.md 62 表 + migration SQL 对比。
- Produces: 文档与代码表清单一致；防复发守卫在 Task 12 落地。

- [ ] **Step 1: 生成表清单 diff**
  提取 persistence-schema 全部 pgTable 表名 vs DATABASE_SCHEMA.md 表清单，列出差异。
- [ ] **Step 2: 更新文档**
  DATABASE_SCHEMA.md 更新为 64 表 + 补缺表 + 裁决 conflict_relations。
- [ ] **Step 3: 索引冗余确认**
  按 queue.ts 注释与迁移 SQL 确认 task_queue_type_dedupe_idx 冗余后删除（含迁移 SQL 中的对应索引，谨慎：先确认无查询依赖）。
- [ ] **Step 4: 验证**
  `rtk pnpm check:docs`、`rtk pnpm check:structure`、受影响包测试。
- [ ] **Step 5: Commit**
  `docs: align DATABASE_SCHEMA with persistence-schema (64 tables)`

