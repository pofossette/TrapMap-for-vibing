# 入库预计算策略 (Precomputation Strategy)

## 概述

TrapMap 采用**"入库重、出库轻"**的架构策略：将昂贵的计算（LLM 调用、Embedding 生成、图实体提取等）集中在条目入库（提交 → 审核 → 索引）阶段完成，检索阶段尽可能只读预计算结果，将查询延迟降到最低。

> **设计原则来源**：[`archived/plans/plan-2026-05-26-write-heavy-read-light-backend-convergence.md`](../archived/archived-plans/plan-2026-05-26-write-heavy-read-light-backend-convergence.md)
> "入库承担计算和外部 API 延迟，出库只读结构化事实和派生投影"

---

## 预计算措施总览

| # | 措施 | 入库阶段工作 | 外部 API 调用 | 检索阶段效果 |
|---|------|-------------|:------------:|-------------|
| A1 | Embedding 向量预生成 | `vector` adapter `sync()` 对 `canonicalText` 生成 1536 维向量 | **Embedding API × 1** | 检索直接读缓存向量，PG 路径走 HNSW 近似搜索 |
| A2 | 关键词 Token 预分词 + field 分桶 + boundary facet 预索引 | `keyword` adapter `sync()` 构建 `PersistedKeywordState` | 无 | 检索直接读 `persistedState.fieldTokens`，无需重新分词 |
| A3 | LLM 图实体预提取 | `graph` adapter `sync()` 调 `extractGraphEntitiesWithLLM()` 两阶段 LLM 提取 nodes/edges | **LLM API × N** | PostgreSQL `graph_index_documents` 保留 durable truth；查询时走 `GraphQueryBackend`，disabled 用 Graphology，enabled 可投影到 Neo4j |
| A4 | Capsule 派生预计算 | `deriveFromPayloads()` 从 SKILL.md + references/ 生成 profile/capsules/manifest | 见 A5 | v2 检索直接消费派生的 capsule 结构 |
| A5 | Capsule contextualPrefix 预生成 | `enrichCapsules()` 两阶段 LLM 生成上下文前缀 | **LLM API × (1 + capsuleCount)** | 检索时参与 15% 权重评分，纯文本 token overlap |
| A6 | Capsule 索引预同步 | `syncArtifactCapsules()` 预写 keyword tokens + embedding vectors 到 PG 表 | **Embedding API × capsuleCount** | v2 多路召回通道直接查预建 PG 索引 |
| A7 | LLM 提取结果缓存 | `LlmExtractionCache`（contentHash + promptVersion，LRU 300 + TTL 1h） | 无（缓存命中时跳过） | 间接：确保图索引完整，使 A3 的检索路径可用 |
| A8 | 重复检测 LLM 语义判定 | Jaccard 预筛 + `judgeDuplicateWithLLM()` | **LLM API × top-K** | 入库质量保障，防止重复/低质量条目污染检索结果 |
| A9 | PG 结构化索引表预建 | `knowledge_embeddings`（pgvector HNSW）、`knowledge_keywords`（text[] GIN）、`graph_index_documents`、capsule 索引表 | 无 | PG 路径毫秒级向量/关键词/图搜索 |

---

## 逐项详解

### A1: Embedding 向量预生成

**入库代码**：`indexing/adapters/vector.ts` → `sync()` → `generateEmbedding(canonicalText)`

入库时对每条 approved 条目的 `canonicalText`（`shortcut + detail + labels`）生成 embedding 向量，持久化到两个位置：

| 位置 | 用途 |
|------|------|
| `entry.embeddingCache.vector` | 内存/JSON 路径直接读取 |
| `knowledge_embeddings` 表（pgvector HNSW） | PG 路径向量近似搜索 |

**检索时**：`getEntryEmbedding()` 优先读 `embeddingCache.vector`（`recall/semantic.ts:125-156`），cache miss 时才 fallback 到 API。PG 路径直接查 `knowledge_embeddings` 表。

### A2: 关键词 Token 预分词 + field 分桶 + boundary facet 预索引

**入库代码**：`indexing/adapters/keyword.ts` → `sync()` → 构建 `PersistedKeywordState`

入库时完成三项本地计算：

1. **Token 分词**：`tokenize(canonicalText)` → 小写、去重
2. **Field 分桶**：按 shortcut / detail / labels 分桶，支持检索时字段级加权匹配
3. **Boundary facet 预索引**：从 `boundary` 提取 contexts / packages / platforms 归一化值

结果写入 `entry.indexState.keyword.persistedState` 和 PG `knowledge_keywords` 表。

**检索时**：`tokenizeEntry()` 直接读 `persistedState.fieldTokens`（`recall/keyword.ts:67-76`），无需重新分词。

### A3: LLM 图实体预提取

**入库代码**：`indexing/adapters/graph.ts` → `sync()` → `extractGraphEntitiesWithLLM()`

入库时通过两阶段 LLM 提取图节点和关系：

```
Phase 1: planExtraction() → ExtractionPlan（长文本切分策略）
Phase 2: extractSegmentEntities() × N（并行提取 nodes/edges）
Gleaning: 可选二次提取
```

提取结果 + 边界实体 → `buildTrapGraphDocument()` → `upsertGraphIndexDocument()` 持久化到 `graph_index_documents` 表。

**Phase 3 更新**：
- `graph_index_documents` 仍是唯一 durable graph truth。
- 当 `TRAPMAP_GRAPH_DB_ENABLED=true` 且 `TRAPMAP_GRAPH_DB_SYNC_ON_WRITE=true` 时，写入路径会把同一份 `GraphIndexDocumentRecord` 额外投影到 Neo4j。
- 查询路径统一通过 `GraphQueryBackend`：memory backend 直接从 PG truth 组装 Graphology 运行时，Neo4j backend 只承担可选的邻接查询/局部扩展，不拥有真相源。
- `TRAPMAP_GRAPH_DB_FAIL_OPEN=true` 时，Neo4j 不可用会回退到 memory backend，不阻断检索。

**检索时**：
- v1 graph-assisted：`buildGraphRuntimeSnapshot()` 从持久化文档组装 → `expandSourcesOneHop()` BFS 遍历 → `calculateGraphScore()` 确定性公式（`recall/graph-assisted.ts`）
- v2 graph channel：`expandSourcesOneHop()` + `calculateSourceRelationStrength()`（`channels/graph.ts`）
- v3 plan compiler：`buildLocalExpansionView()` BFS 有界扩展（`graph-plan/plan-compiler.ts`）

**三条检索路径的召回/评分/图遍历均不调用 LLM。**

### A4: Capsule 派生预计算

**入库代码**：`artifacts/derive.ts` → `deriveFromPayloads()`

入库时从 SKILL.md + references/ 派生三类结构化输出：

| 输出 | 说明 |
|------|------|
| Profile（1 条） | title + summary + keywords |
| Capsules（1-5 条） | capsuleId + situation + problem + goal + content + labels |
| ClientManifest（1 条） | references + assets + scripts 元数据 |

**检索时**：v2 `rankCapsules()` 直接从 `artifact.latestRevision.derived.capsules[]` 读取预派生结构。

### A5: Capsule contextualPrefix 预生成

**入库代码**：`artifacts/contextual-enrichment.ts` → `enrichCapsules()`

入库时通过两阶段 LLM 为每个 capsule 生成上下文前缀（≤300 字符）：

```
Phase 1: generateCapsuleManifest() → 结构化 capsule 清单
Phase 2: generateSingleCapsuleContent() × N → 每个 capsule 的 contextualPrefix
```

结果写入 `DerivedSkillCapsuleRecord.contextualPrefix`。

**检索时**：`contextualPrefix` 参与 v2 评分权重 15%（`capsule-recall.ts` `computeContextMatchScore()`），使用纯文本 token overlap，不调用 LLM。

### A6: Capsule 索引预同步

**入库代码**：`retrieval/capsules/repositories/index-sync.ts` → `syncArtifactCapsules()`

入库时为每个 capsule 预生成两套索引数据，写入 PG 表：

| PG 表 | 内容 | 检索通道 |
|-------|------|---------|
| `skill_artifact_capsule_keywords` | field tokens（content/situation/problem/goal/labels/contextualPrefix） | `capsule-keyword` 通道 |
| `skill_artifact_capsule_embeddings` | embedding vector | `capsule-semantic` 通道 |

**检索时**：v2 keyword/semantic 通道直接查 PG 索引表，查询文本的 embedding 和 token 化在检索侧实时完成。

### A7: LLM 提取结果缓存

**入库代码**：`indexing/graph-lite/llm-cache.ts` → `LlmExtractionCache`

两层缓存避免入库时重复调用 LLM：

| 缓存层 | Key | Value | 容量 / TTL |
|--------|-----|-------|-----------|
| Phase 1 | SHA-256(text + `:pv{PROMPT_VERSION}`) | `ExtractionPlan` | 300 / 1h |
| Phase 2 | 同上 | `LlmExtractionResult` | 300 / 1h |

`promptVersion` 递增时自动全量 cache miss，触发后台重建。

### A8: 重复检测 LLM 语义判定

**入库代码**：`candidates/detector.ts` + `candidates/llm-dedup.ts`

两阶段管道：
1. **Jaccard 预筛**（确定性）：token overlap 缩小候选范围
2. **LLM 语义判定**（可选）：识别同义词场景（如 "deploy docker" ≈ "ship docker"）

此措施不直接影响检索延迟，但通过防止重复/低质量条目入库，间接保护检索结果质量。

### A9: PG 结构化索引表预建

入库阶段写入的 PG 索引表及其检索用途：

| PG 表 | 索引类型 | 检索用途 |
|-------|---------|---------|
| `knowledge_embeddings` | pgvector HNSW (`vector_cosine_ops`) | v1 语义检索向量近似搜索 |
| `knowledge_keywords` | text[] GIN (`&&` overlap) | v1 关键词检索 |
| `knowledge_search_documents` | tsvector GIN | 全文检索辅助 |
| `graph_index_documents` | JSONB nodes/edges | 图检索 durable truth；memory backend 直接组装 Graphology，Neo4j backend 从这里重建投影 |
| `skill_artifact_capsule_keywords` | text[] GIN | v2 capsule-keyword 通道 |
| `skill_artifact_capsule_embeddings` | pgvector HNSW | v2 capsule-semantic 通道 |

---

## 检索路径的残余外部 API 调用

即使有上述预计算，检索阶段仍有少量不可避免的外部 API 调用：

| 调用 | 触发条件 | 代码位置 | 说明 |
|------|---------|---------|------|
| **Query embedding** | 每次 v1/v2 检索必调 | `recall/semantic.ts:162`；`channels/semantic.ts:105` | 查询文本是动态的，不可预计算 |
| **Entry embedding（cache miss）** | 内存路径，entry 未索引或缓存过期时 | `recall/semantic.ts:151` | 可通过确保所有 entry 已入库索引来消除 |
| **Intent parsing LLM** | v2/v3 首次查询 | `capsules/intent.ts:411` `parseSeedIntentWithLLM()` | 有 intent cache（TTL 30min, 200 条）+ 自动 fallback 到正则解析 |

> **设计约束**：v2/v3 的 `parseSeedIntentWithLLM()` 失败时自动降级到确定性正则解析器 `parseSeedIntent()`，确保检索在 LLM 不可用时仍能正常工作。

---

## 入库 API 请求清单

入库阶段（从提交到索引完成）的全部外部 API 调用：

| 阶段 | API 调用 | 条件 | 计数 |
|------|---------|------|------|
| 候选分析 | Embedding API | 每个候选 | 1 |
| 候选分析 | LLM（重复判定） | ChatProvider 可用 | top-K = 5 |
| 索引：Vector adapter | Embedding API | 每个 approved 条目 | 1 |
| 索引：Graph adapter | LLM（图提取） | ChatProvider 可用 | 1 + N segments + gleaning |
| 索引：Graph adapter | LLM（边界提取） | ChatProvider 可用 | 1 |
| 派生：Capsule enrichment | LLM（manifest） | ChatProvider 可用 | 1 |
| 派生：Capsule enrichment | LLM（per-capsule prefix） | ChatProvider 可用 | capsuleCount |
| 索引：Capsule sync | Embedding API | 每个 capsule | capsuleCount |

**典型场景**：一条 approved Trap 条目入库 ≈ 2 次 Embedding API + 2-4 次 LLM API。
一个 3-capsule Skill artifact 入库 ≈ 4 次 Embedding API + 5-7 次 LLM API。

---

## 延迟对比参考

| 检索阶段操作 | 使用预计算时 | 不使用预计算时（估算） |
|------------|------------|-------------------|
| v1 语义召回（PG 路径） | ~50-200ms（HNSW 搜索） | 需为每个 entry 生成 embedding → 数秒 |
| v1 关键词召回 | ~5-20ms（GIN 索引） | 需为每个 entry 重新分词 → 数百 ms |
| v1 图辅助召回 | ~10-50ms（Graphology 遍历） | 需为每个 entry 调 LLM 提取图实体 → 数十秒 |
| v2 capsule 评分 | ~20-50ms（读派生结构） | 需从原始 SKILL.md 实时派生 → 数秒 |
| v3 图计划编译 | ~30-100ms（BFS 扩展） | 需实时构建图 → 不可行 |

> **注意**：以上为粗略参考值，实际延迟取决于数据规模、网络条件和硬件配置。详见 [PERFORMANCE.md](../reference/PERFORMANCE.md)。

---

## 相关文档

- [索引管道详解](components/INDEXING.md) — 三个适配器的入库同步流程
- [异步摄取管道](components/INGESTION.md) — 候选提交、重复检测、发布
- [检索系统](components/RETRIEVAL.md) — v1/v2/v3 检索路径
- [统一缓存架构](CACHING.md) — RetrievalCache 泛型类与缓存实例配置
- [LLM 图提取计划](HYBRID_GRAPH_EXTRACTION.md) — 两阶段 LLM 提取架构
- [Capsule Contextual Enrichment](../plans/capsule-contextual-enrichment-plan.md) — 上下文前缀生成
- [性能指南](../reference/PERFORMANCE.md) — 检索性能、Embedding 性能、存储性能
