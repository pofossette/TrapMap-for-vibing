# 检索延迟优化（latency-optimize）

> 状态：Active（2026-09-20 起，承接已合并的 [`retrieval-latency-observability`](retrieval-latency-observability.md) 主线；分支 `latency-optimize`）。

## 0. 目标与非目标

**目标**：在不改变检索语义（召回结果形状与治理行为）的前提下，把五路检索的 P50 压到两位数低段，并让每步改动都有"改动前 → 改动后"的实测对照，杜绝无法溯源的退化。

**非目标**：不改召回排序逻辑；不引入新依赖（Neo4j、Redis 等）；不处理真实 embedding provider 上线后的网络延迟（另行主线）。

## 1. 基线（改动前，main @ `c16b4faf`）

数据源：`benchmarks/retrieval-latency/live-pg-5way-{200,1000,3000}.json`（真 PG + pgvector + 真 HTTP，P50/P95 ms），快照副本存 `benchmarks/retrieval-latency/optimize/baseline-*.json`。

| 语料 | v1-search | v1-skills | v2-capsule | v3-graph-plan | v4-gene |
|---|---|---|---|---|---|
| 200 | 11.10 / 29.82 | 22.42 / 34.78 | 10.03 / 11.80 | 21.30 / 32.54 | 1.10 / 4.58 |
| 1000 | 41.55 / 50.79 | 87.85 / 97.89 | 50.98 / 52.44 | 80.12 / 87.84 | 1.02 / 1.55 |
| 3000 | 108.79 / 123.81 | 250.12 / 276.84 | 95.75 / 103.08 | 244.87 / 255.69 | 1.24 / 2.10 |

## 2. 三个结构性根因（代码证据）

1. **向量检索无 ANN 索引**：`schema.sql` 中 `experience_gene_embeddings` 有 HNSW（:968）+ gene 全文 GIN（:970）——gene 1ms 的全部原因；而 `knowledge_embeddings`（:886-887 仅 btree）与 `skill_artifact_capsule_embeddings`（:896-897 仅 btree）都没有向量索引。胶囊索引的注释明言应由已退役的 `ensureCapsuleVectorIndex()` 编程创建，无人补。v1 semantic 的 `<=>` 查询因此是全表精确扫描（36ms@1k，线性扩展）。
2. **图运行时每查询全量重建**：`MemoryGraphQueryBackend` 有 5 处 `loadRuntime()`，每处 = `listAll()` 全表 + 完整 graphology 建图。v3 一次查询触发 3 次；v1 graph 通道（`graph-channel.ts:44-48`）**每个候选源**调一次 `calculateSourceRelationStrength`，即 N 次。
3. **无界全量加载再过滤**：v1-skills 直连 `listForRetrieval({})`（空过滤拉全部 artifact 投影，约 45ms）绕过了 v1 已有的 60s 读模型缓存；v2 `loadCapsulePool` 每请求加载全部胶囊行（23ms）仅供进程内 heuristic 打分；v2 keyword 的全文表达式无 GIN 索引（27ms）。

## 3. 优化项

| # | 改动 | 预期（P50@1k） | 风险与对策 |
|---|---|---|---|
| P0-1 | `knowledge_embeddings` 与 `skill_artifact_capsule_embeddings` 补 HNSW（`vector_cosine_ops`，照抄 :968 同款） | v1 41→~10；v3/v2 的 semantic 项同步受益 | 查询已用 `<=>` 与索引算子匹配，零代码改动；`EXPLAIN ANALYZE` 验证命中 |
| P0-2 | `MemoryGraphQueryBackend` 运行时快照缓存（写钩子 `upsertDocument`/`removeSource`/`rebuildProjection` 失效 + **TTL 60s 兜底**，`TRAPMAP_GRAPH_RUNTIME_TTL_MS` 可调） | v3 80→~35 | 跨服务写入（artifact 派生写图文档不经此后端）不会触发钩子——TTL 兜底把陈旧度上限钉在 60s，与读模型缓存同一先例 |
| P1-1 | 胶囊全文表达式 GIN：`gin (to_tsvector('english', content || ' ' || coalesce(contextual_prefix,'')))`，与查询表达式逐字对齐 | v2 keyword 27→~2 | 表达式必须与 SQL 完全一致才会命中，用 `EXPLAIN ANALYZE` 验证 |
| P1-2a | v2 胶囊池 TTL 缓存（60s，`TRAPMAP_CAPSULE_POOL_TTL_MS` 可调），与读模型缓存同一先例 | v2 snapshot 23→~0（命中时） | 同 P0-2 的跨服务写陈旧度取舍，TTL 钉上限 |
| P1-2b | v1-skills 弃直连 `listForRetrieval({})`，改走 `getCachedRetrievalReadModel()?.skillArtifacts`（未命中再 build，后者自带缓存写入） | v1-skills 88→~45 | 读模型的 skillArtifacts 即同一 listForRetrieval 结果（read-model.test.ts 证实恒等透传）；v1 搜索会预热缓存 |
| P2 | v3 强度计算单遍合并 | 小（P0-2 后为纯内存） | 暂缓，观察 P0-2 后数据再定 |

**每步验证闭环**：`pnpm retrieval:latency:live`（五路对照，数据存 `benchmarks/retrieval-latency/optimize/after-<item>-*.json`）→ 数字回填第 4 节 → 与本项代码同一提交；`pnpm typecheck` + 相关包测试 + 守卫。

## 4. 执行记录（改动前 → 改动后实测，回填）

| # | 提交 | 改动 | P50@1k 前 → 后（五路） | 结论 |
|---|---|---|---|---|
| 基线 | c16b4faf | — | 41.55 / 87.85 / 50.98 / 80.12 / 1.02 | 见第 1 节 |
| P0-1 | 待填 | HNSW ×2 | 待填 | 待填 |
| P0-2 | 待填 | 图运行时缓存 | 待填 | 待填 |
| P1-1 | 待填 | 表达式 GIN | 待填 | 待填 |
| P1-2 | 待填 | 池缓存 + skills 走读模型 | 待填 | 待填 |

## 5. 债务与边界

- TTL 缓存（P0-2/P1-2a）引入最长 60s 的索引陈旧度：与既有读模型缓存同一先例，但跨服务写入路径要持续盯——若未来 artifact 派生改为进程内直写，应把失效钩子接过去并取消 TTL
- 真实 embedding provider 上线后，查询向量化的网络往返（50–200ms）将成为新的第一瓶颈，届时做查询 embedding 缓存/批量，另行主线
- 索引 DDL 对已有生产库生效需要构建时间（HNSW 建索引是 O(n log n)），上线窗口需评估
