# 表压缩 Phase 2 — 55→42 张表合并计划（80-90%性能保底，模块化）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **基线**: `pre@7250bcf5` 55 张表（69→55 已完成，12 boundary +2低频 → jsonb+GIN）
> **目标**: 55→42（-13），保留 pgvector HNSW 独表，其余 1:1/小基数 1:N 用 jsonb+GIN/函数索引，单文件 ≤300(≤800 for knowledge/artifacts)，单模块 ≤600，复杂度守卫全绿，`check:table-schema` 对齐

## Global Constraints
- **成熟依赖优先**：pgvector HNSW 必须独表，向量不得 jsonb；GIN/函数索引替代 BTree 时需 `create index using gin` 或 `((col->>'key'))` 表达式
- **防集中**：禁止单文件 >800 行（knowledge.ts/artifacts.ts 已贴近上限，合并后应缩减）；禁止单服务承载过多能力（读模型 `knowledge_read` 与写路径 `candidate_ingestion/knowledge_write` 分离）
- **80-90% 性能保底**：低频 `reviewBy/自定义答案/坏例` 走 jsonb + 部分索引，高频 `label= / fingerprint=` 保留独立索引或函数唯一索引
- **双写窗口**：先加 jsonb 列双写 → 回填 → 切读 → 删表（本仓库空库基线，可直接切，但 pg-ports 必须同步）
- **守卫**：`pnpm check:table-schema && pnpm check:docs && pnpm check:structure && pnpm check:complexity && pnpm typecheck && pnpm test:relevant` 全绿

---

### Task 1: Candidate 链路 7→4（-3）— analyses / 手动+决议合并 / 去重明细 jsonb 化

**Files:**
- Modify: `packages/db/src/schema/candidates.ts` (唯一写集)
- Modify: `packages/service-candidate-ingestion/src/pg-ports.ts` (同域端口)
- Modify: `packages/service-candidate-ingestion/test/pg-ports.test.ts` (同域测试)
- Modify: `packages/candidate-ingestion` 任意 README 提及表清单（若有）

**Interfaces:**
- Consumes: `AnalysisSnapshot`, `DuplicateCase`, `ManualResultSubmission`, `ResolutionOutcome` (contracts)
- Produces: `candidates` 新增列 `analysis jsonb / outcome jsonb / duplicateMatches?`，表 `candidate_analyses` 删除，`candidate_manual_results + candidate_resolution_outcomes → candidate_outcomes` 单表，`candidate_duplicate_matches` 并入 `candidate_duplicate_cases.matches jsonb`

**Steps:**
- [ ] **Step 1: Write failing test for jsonb fallback**
```ts
// packages/service-candidate-ingestion/test/pg-ports.jsonb.test.ts
// 期望：写入 candidates.analysis jsonb 后，读取能还原 fingerprint/keywords/tokens/duplicateTrace
// 期望：candidate_outcomes 能同时承载 manual 与 resolution 决策
// 期望：duplicate_cases.matches jsonb 能存储 0..N match
```
Run: `pnpm --filter @trapmap/service-candidate-ingestion test --run test/pg-ports.test.ts` expect FAIL (表名不存在)

- [ ] **Step 2: Schema — candidates.ts**
  - `candidates` 加 `analysis jsonb $type<AnalysisSnapshot|null>` + `outcome jsonb` 可选或建 `candidate_outcomes` 新表；`candidate_duplicate_cases` 加 `matches jsonb default []` + `GIN(matches)`
  - 删除 `candidate_analyses`、`candidate_duplicate_matches`、`candidate_manual_results`、`candidate_resolution_outcomes` 四表，新增 `candidate_outcomes` 单表（`candidate_id PK`, `kind enum manual|resolution`, `decision`, `published/mapped` cols nullable, `submittedAt/resolvedBy` etc）
  - 保留 `candidates`, `candidate_duplicate_cases`, `candidate_outcomes`, `entity_lineage` 4表
  - 行数控制：`candidates.ts` 282→ ~220 行

- [ ] **Step 3: pg-ports.ts — 切读 jsonb**
  - `INSERT INTO candidate_analyses` → `UPDATE candidates SET analysis = $1 WHERE id = $2`
  - `SELECT * FROM candidate_analyses WHERE candidate_id` → `SELECT analysis FROM candidates`
  - `candidate_duplicate_matches` 的 `DELETE+INSERT` 循环 → 单条 `UPDATE candidate_duplicate_cases SET matches = $2::jsonb WHERE id=$1`
  - `candidate_manual_results` / `candidate_resolution_outcomes` 的 upsert/get → `candidate_outcomes` with `kind`

- [ ] **Step 4: Tests pass**
Run: `pnpm --filter @trapmap/service-candidate-ingestion test --run test/pg-ports.test.ts` + `pnpm --filter @trapmap/db test` (若有) + `pnpm check:table-schema`

- [ ] **Step 5: Commit**
```bash
git add packages/db/src/schema/candidates.ts packages/service-candidate-ingestion/src/pg-ports.ts packages/service-candidate-ingestion/test/pg-ports.test.ts
git commit -m "perf(db): candidate 7→4 — analyses→jsonb, manual+resolution→outcomes, matches→jsonb"
```

---

### Task 2: Artifact 派生 16→11（-5）— manifest 3→1 / metadata+maintenance 回 jsonb / capsule keywords 并入 capsules

**Files:**
- Modify: `packages/db/src/schema/artifacts.ts` (唯一写集)
- Modify: `packages/service-knowledge-write/src/artifact-ports.ts` + `artifact-derive-from-payloads.ts`（派生写）
- Modify: `packages/service-knowledge-write/test/artifact-ports.test.ts`

**Interfaces:**
- Consumes: `artifact_revisions.derived` jsonb 已含全量，结构化表是二次真相
- Produces: `skill_artifact_manifest_items(kind)` 单表，删除 `skill_artifact_metadata`/`skill_artifact_maintenance_assignments`/`skill_artifact_capsule_keywords` 三表

**Steps:**
- [ ] **Step 1: Failing test**
```ts
// 期望 manifest_items kind 区分 references/assets/scripts 三类，且 unique(revision_id, kind, path)
// 期望 skill_artifacts.metadata jsonb 能替代 skill_artifact_metadata 表查询
// 期望 capsules.keywordTokens jsonb GIN 能替代 capsule_keywords 表
```

- [ ] **Step 2: Schema — artifacts.ts**
  - 删除 `skill_artifact_manifest_references/assets/scripts` 3 表 → 新增 `skill_artifact_manifest_items` (`artifact_revision_id`, `kind enum references|assets|scripts`, `path`, `sha256/size/mediaType` + script 专属 `capability/argsSchemaSummary/sideEffect/defaultPolicy nullable` + `unique(revision_id, kind, path)` + `index(revision_id, kind)`)
  - 删除 `skill_artifact_metadata`、`skill_artifact_maintenance_assignments`、`skill_artifact_capsule_keywords`
  - `skill_artifact_capsules` 新增 `keywordTokens jsonb default [] + GIN`、`fieldKeywordTokens jsonb` 可选
  - 保留 11 表：`skill_artifacts`, `artifact_revisions`, `skill_artifact_files`, `skill_artifact_script_descriptors`, `skill_artifact_profiles`, `skill_artifact_capsules`, `skill_artifact_capsule_embeddings`, `skill_artifact_client_manifests`, `skill_artifact_manifest_items`, `skill_artifact_agent_reviews`, `artifact_lifecycle_events`
  - 行数：528→ ~420 行（拆 manifest 单表省 80 行，删 3 尾表省 60 行）

- [ ] **Step 3: pg-ports — 切读**
  - manifest 三表 `INSERT` → `INSERT INTO skill_artifact_manifest_items (..., kind)` 带 `kind` 参数
  - `skill_artifact_metadata` 的 `SELECT/INSERT` → `SELECT metadata FROM skill_artifacts`
  - `skill_artifact_maintenance_assignments` → `skill_artifacts.maintenance_meta jsonb`
  - `skill_artifact_capsule_keywords` → `UPDATE skill_artifact_capsules SET keyword_tokens=$1`

- [ ] **Step 4: Tests**
Run: `pnpm --filter @trapmap/service-knowledge-write test --run test/artifact-ports.test.ts` + `pnpm check:complexity`

- [ ] **Step 5: Commit**
```bash
git add packages/db/src/schema/artifacts.ts packages/service-knowledge-write/src/artifact-ports.ts packages/service-knowledge-write/test/artifact-ports.test.ts
git commit -m "perf(db): artifact 16→11 — manifest 3→1, metadata/maintenance→jsonb, capsule keywords→capsules"
```

---

### Task 3: Knowledge 检索与审计 13→10（-3）— keywords+search 合一 / maintenance→jsonb / review_decisions→submissions

**Files:**
- Modify: `packages/db/src/schema/knowledge.ts` (唯一写集)
- Modify: `packages/service-knowledge-write/src/knowledge-projection.ts` / `pg-ports.ts` / `knowledge-entry-tx.ts`
- Modify: `services/knowledge-read-go/internal/recall/store/pg.go` + `services/knowledge-read-go/internal/ranking/...` (若引用 keywords/search_documents)

**Interfaces:**
- Consumes: `knowledge_entries` 主表，`knowledge_search_documents`/`knowledge_keywords` 检索投影
- Produces: `knowledge_keywords` 删除，`knowledge_search_documents` 增 `tokens text[] + fieldTokens jsonb + GIN` 合一；`knowledge_maintenance_assignments` 删除；`knowledge_review_decisions` 删除（并入 `knowledge_submissions.reviewerDecision jsonb` 已有）

**Steps:**
- [ ] **Step 1: Failing test**
```ts
// 期望 knowledge_search_documents 含 tokens 数组且 GIN 可查
// 期望 knowledge_entries.maintenance_meta jsonb holistically替代 maintenance_assignments 表
// 期望 knowledge_submissions.reviewerDecision 替代 review_decisions 表
```

- [ ] **Step 2: Schema — knowledge.ts**
  - 删除 `knowledge_keywords`；`knowledge_search_documents` 增加 `tokens text[] default {} + GIN(tokens)`, `fieldTokens jsonb default {}`, `tokensHash?` 保留 `contentHash`
  - 删除 `knowledge_maintenance_assignments`
  - 删除 `knowledge_review_decisions`
  - 保留 10 表：`knowledge_entries`, `knowledge_revisions`, `knowledge_submissions`, `lifecycle_events`, `knowledge_labels`, `knowledge_search_documents`, `knowledge_embeddings`, `feedback_records`, `usage_events`, `domain_event_outbox`
  - 行数：630→ ~520 行

- [ ] **Step 3: Ports — 切读**
  - `knowledge_keywords` 的 `INSERT/SELECT tokens &&` → `knowledge_search_documents.tokens &&`
  - `knowledge_maintenance_assignments` 的 `SELECT WHERE reviewBy` → `knowledge_entries WHERE (maintenance_meta->>'reviewBy')::timestamptz < NOW()` + 函数索引
  - `knowledge_review_decisions` 的 `INSERT` → `UPDATE knowledge_submissions SET reviewer_decision=$1`

- [ ] **Step 4: Tests**
Run: `pnpm --filter @trapmap/service-knowledge-write test --run test/pg-ports.test.ts` + Go `go test ./internal/recall/...` + `pnpm check:table-schema`

- [ ] **Step 5: Commit**
```bash
git add packages/db/src/schema/knowledge.ts packages/service-knowledge-write/src/knowledge-projection.ts services/knowledge-read-go/internal/recall/store/pg.go
git commit -m "perf(db): knowledge 13→10 — keywords→search_documents, maintenance→jsonb, reviewDecisions→submissions"
```

---

### Task 4: 跨域检索与 Gene 4→3 / retrieval 2→1（-2）— badcase 删表 / gene search 合一

**Files:**
- Modify: `packages/db/src/schema/retrieval.ts` (删 `retrieval_badcase_traces`)
- Modify: `packages/db/src/schema/experience-genes.ts` (删 `experience_gene_search_documents`，并入 `experience_gene_embeddings` 或新建 `experience_gene_text_index`；本任务选 `embeddings` 加 `document text + GIN`)
- Modify: `packages/service-knowledge-write/src/experience-gene-repository.ts` / `experience-gene-snapshots.ts` 若涉 search_documents
- Modify: `services/knowledge-read-go/internal/recall` 若涉 gene

**Interfaces:**
- Consumes: `feedback_records` 已含 `queryId/routeFamily/failureClassification/selectedResultSnapshot`，可替代 badcase
- Produces: `retrieval_badcase_traces` 删除；`experience_gene_search_documents` 删除，`experience_gene_embeddings` 新增 `document text + document_gin` 或保留独立但合并

**Steps:**
- [ ] **Step 1: Failing test**
```ts
// 期望 retrieval_badcase_traces 不存在，查询改走 feedback_records
// 期望 experience_gene_search_documents 的写入改为 experience_gene_embeddings.document
```

- [ ] **Step 2: Schema**
  - `retrieval.ts` 删除 `retrieval_badcase_traces`，保留 `graph_index_documents` 1 表
  - `experience-genes.ts` 删除 `experience_gene_search_documents`，`experience_gene_embeddings` 新增 `document text default ''` + `GIN(to_tsvector)` 或 `document_gin` 索引；或新增 `experience_gene_text_documents` 与 embeddings 共享 PK 但本计划直接并入 embeddings
  - 保留 1+3 表 = retrieval 1, gene 3

- [ ] **Step 3: Ports**
  - `INSERT INTO retrieval_badcase_traces` → `UPDATE feedback_records SET selected_result_snapshot=$1` 或直接删调用（feedback 已含快照）
  - `experience_gene_search_documents` 的 `INSERT/SELECT` → `experience_gene_embeddings` 的 `document` 列

- [ ] **Step 4: Tests**
Run: `pnpm --filter @trapmap/service-knowledge-write test --run test/experience-gene*` + `pnpm check:table-schema`

- [ ] **Step 5: Commit**
```bash
git add packages/db/src/schema/retrieval.ts packages/db/src/schema/experience-genes.ts packages/service-knowledge-write/src/experience-gene-repository.ts
git commit -m "perf(db): retrieval 2→1 + gene 4→3 — badcase→feedback, gene search→embeddings"
```

---

### Task 5: 文档总线同步 55→42（-13）— DATABASE_SCHEMA / DATA_MODEL / PERSISTENCE / README / CI_CD

**Files:**
- Modify: `docs/reference/DATABASE_SCHEMA.md` (表总览 55→42, 各域小计, 关系图)
- Modify: `docs/reference/DATA_MODEL.md` (子表章节加 已归档 横幅，同 69→55 风格)
- Modify: `docs/architecture/components/PERSISTENCE.md` (域表计数)
- Modify: `docs/README.md`, `docs/operations/CI_CD.md`, `docs/reference/api-surface.md`
- Modify: `scripts/complexity-budgets.json` 若需调 knowledge.ts 预算（630→520 实际下降，无需上调）

**Interfaces:**
- Consumes: `packages/db/src/schema/*.ts` 实测 42 `pgTable`
- Produces: 文档 0 ghost 0 missing，section count 对齐

**Steps:**
- [ ] **Step 1: `pnpm check:table-schema` 预期 FAIL（doc 仍 55）**
- [ ] **Step 2: 更新 DATABASE_SCHEMA.md**
  - `## 表总览 (55 张表` → `## 表总览 (42 张表 — 2026-09-01 Phase 2 压缩，55→42）`
  - 知识域 `10→7/10?` 按 Task3 后 10 表更新小标题 `### 知识域 (10 表 →7?)` 实际 10；candidates `7→4`；artifact `16→11`；gene `4→3`；retrieval `2→1`；交叉 `5→?` 核实
  - 删去已删表行，保留历史说明 `> 已归档 2026-09-01 Phase 2：xxx 已合并为 yyy jsonb+GIN`
  - 更新外键关系图 mermaid
- [ ] **Step 3: 更新 DATA_MODEL.md / PERSISTENCE.md / README / CI_CD / api-surface 同步计數**
- [ ] **Step 4: `pnpm check:table-schema && pnpm check:docs && pnpm check:structure` PASS**
- [ ] **Step 5: Commit**
```bash
git add docs/reference/DATABASE_SCHEMA.md docs/reference/DATA_MODEL.md docs/architecture/components/PERSISTENCE.md docs/README.md
git commit -m "docs: sync 55→42 table compression Phase 2 (manifest/candidate/knowledge/gene)"
```

---

### Task 6: 全量门禁与回归（校验）

**Files:** 无新增，仅校验
- Run: `pnpm check:table-schema` 42/42
- Run: `pnpm check:docs` (mermaid 146, doc-drift 41, md-lint)
- Run: `pnpm check:structure` `pnpm check:complexity` `pnpm typecheck` `pnpm check:go-contract`
- Run: `pnpm --filter @trapmap/service-candidate-ingestion test --run` / `pnpm --filter @trapmap/service-knowledge-write test --run` / `go test ./...` in knowledge-read-go
- [ ] **验收**: 42 表 + 0 ghost/missing + 9 complexity PASS + typecheck 0 error + 相关域测试绿

