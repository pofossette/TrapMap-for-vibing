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

## 2. 根因（代码证据，P0-1 实测后修订）

**实施中发现的关键事实（2026-09-20）**：v1/v3 的 DB 召回分支处于**三重断裂**状态，每次查询都静默降级到内存 O(n) 路径——

1. `pgRecall.keywordRecall`（`retrieval-infra-default.ts:84-127`）的 SQL 引用 `knowledge_search_documents.tokens` / `field_tokens_*` 等 **5 个不存在的列**（实际表只有 `entry_id/revision_no/document/labels/status`，schema.sql:331）→ `Promise.all` 必抛错；
2. 该表**没有任何写入方**（grep knowledge-write/read 均无）——即使修好 SQL，表也是空的，DB keyword 通道会返空导致质量回归；
3. 整个 DB 分支被 `TRAPMAP_RETRIEVAL_USE_DB_SEARCH` 特性开关关着（默认 false，:244-246），失败时仅 `console.error` 后静默走内存分支（`hybrid-channel.ts:95-97`）。

因此当前所有查询（含生产默认配置）走的是内存路径：`getBatchEmbeddings` **算完向量从不写回 `entry.embeddingCache`**（retrieval-semantic.ts:96-114 只填局部 Map）——每次查询对全部 eligible 条目重算 hash embedding + cosine，即 semantic 36ms 的大头。缓存校验逻辑（revision+textHash，:51-78）早已就绪，写回即备忘录。

原"缺 HNSW 索引"的分析**对当前路径不成立**（查询根本没到 pgvector）——HNSW 保留（P0-1），为 DB 分支未来启用铺路。

其余两个根因不变：

1. **向量检索无 ANN 索引**：`schema.sql` 中 `experience_gene_embeddings` 有 HNSW（:968）+ gene 全文 GIN（:970）——gene 1ms 的全部原因；而 `knowledge_embeddings`（:886-887 仅 btree）与 `skill_artifact_capsule_embeddings`（:896-897 仅 btree）都没有向量索引。胶囊索引的注释明言应由已退役的 `ensureCapsuleVectorIndex()` 编程创建，无人补。v1 semantic 的 `<=>` 查询因此是全表精确扫描（36ms@1k，线性扩展）。
2. **图运行时每查询全量重建**：`MemoryGraphQueryBackend` 有 5 处 `loadRuntime()`，每处 = `listAll()` 全表 + 完整 graphology 建图。v3 一次查询触发 3 次；v1 graph 通道（`graph-channel.ts:44-48`）**每个候选源**调一次 `calculateSourceRelationStrength`，即 N 次。
3. **无界全量加载再过滤**：v1-skills 直连 `listForRetrieval({})`（空过滤拉全部 artifact 投影，约 45ms）绕过了 v1 已有的 60s 读模型缓存；v2 `loadCapsulePool` 每请求加载全部胶囊行（23ms）仅供进程内 heuristic 打分；v2 keyword 的全文表达式无 GIN 索引（27ms）。

## 3. 优化项

| # | 改动 | 预期（P50@1k） | 风险与对策 |
|---|---|---|---|
| P0-0 | `getBatchEmbeddings` 算完写回 `entry.embeddingCache`（revision+textHash 校验已就绪） | v1 41→~10（36ms 重算 → ~3ms 纯 cosine） | 纯进程内备忘录，向量相同、分数不变；随读模型 60s TTL 一起失效 |
| P0-1 | `knowledge_embeddings` 与 `skill_artifact_capsule_embeddings` 补 HNSW（`vector_cosine_ops`，照抄 :968 同款） | **当前路径无收益（实测 40.12 vs 41.55）**——DB 分支未启用；为 DB 化铺路保留 | 查询已用 `<=>` 与索引算子匹配，零代码改动 |
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
| P0-1 | b88d0deb 后 | HNSW ×2（DDL） | 40.12 / 92.29 / 50.36 / 78.61 / 1.10——无收益，根因是 DB 分支三重断裂 | 假设证伪；索引保留铺路 |
| P0-0 | 本提交 | embedding 写回 + 纯函数备忘录 + **artifact 合并条目 WeakMap 备忘录**（真正主因） | 1000: **9.55** / 55.09 / 50.41 / **47.81** / 1.11；200: 3.33 / 13.79 / 8.65 / 12.85 / 1.01；3000: 26.88 / 168.24 / 84.06 / 149.93 / 1.18 | v1 3.6-4.4×、v3 ~1.7×、skills ~1.5×；v2 不变（不同池）；数据 `optimize/after-p0-0d-*.json` |

P0-0 关键发现：合并条目（`artifact_live_*`）在**每次查询**由 `mergeArtifactsIntoRetrievalPool` 重建为全新对象，任何 per-object 备忘录（embeddingCache 写回、WeakMap）都随对象丢弃——semantic 通道每查询对全部 artifact 条目重算 embedding（~30ms）。修复：`artifactToRetrievalEntry` 按 artifact 对象（来自缓存的读模型，身份稳定）用 WeakMap 复用同一 merged entry，写回自然跨查询存活。探针证据：修复前每查询 cacheMisses=全部 artifact 条目；修复后 knowledge+artifact 全部命中（semantic 通道 34ms → ~2ms）。
| P0-2 | 待填 | 图运行时缓存 | 待填 | 待填 |
| P1-1 | 待填 | 表达式 GIN | 待填 | 待填 |
| P1-2 | 待填 | 池缓存 + skills 走读模型 | 待填 | 待填 |

## 4b. 调试坑点与难点（过程实录，防止重蹈）

1. **假设先于路径核实（P0-1 证伪）**：HNSW 索引加上后 P50 纹丝不动（40.12 vs 41.55）。根因：v1/v3 的 DB 召回分支每次查询都在 SQL 报错后**静默降级**到内存 O(n) 路径——优化根本没作用到实际执行的代码。教训：**优化前必须先确认代码实际走的执行路径**，不能只看"某组件存在/不存在"。
2. **测量脚本把关键信号滤掉了**：bench 输出用 `| grep -E "^\| v|failed requests"` 只留表格行，而 DB 分支降级的唯一线索是 `console.error('[hybridRecall] DB search failed...')`——恰好在被滤掉的 stderr 里。直到专门 `grep -iE "hybridRecall|falling back"` 才抓到实锤。教训：**性能测量时不要过滤 stderr**；更根本的修法是降级必须进指标而非 console。
3. **降级被设计成静默**：`hybridRecall.ts:95-97` 的 catch 只打 console 就走内存分支，调用方与指标层全程无感。三重断裂（SQL 引用不存在列、表无写入方、特性开关默认关）因此能潜伏到生产默认配置而不被察觉。
4. **答案写在注释里但没人执行**：胶囊向量索引的 schema 注释明言"由 `ensureCapsuleVectorIndex()` 编程创建"（`packages/db/src/schema/artifacts.ts:333`），该函数随 `packages/server` 退役后无人补——索引缺失是**退役残留**而非有意设计。教训：删除包时要审计"注释里点名的跨包函数"。
5. **Schema 漂移是系统性模式，不是孤例**：同一形态出现三次——`skill_artifact_capsules.keyword_tokens/team_id`、`knowledge_search_documents.tokens/field_tokens_*/team_id`，均为 Drizzle schema 声明了但 `schema.sql` 没有的列。教训：见到一个漂移就要全库 grep 同类。
6. **写回缓存缺失是"半截工程"**：`getBatchEmbeddings` 只填局部 Map，从不写回 `entry.embeddingCache`——而校验逻辑（revision+textHash，`getCachedEmbedding`）早已就绪。说明原设计打算缓存但写回被丢；修复不是发明新机制而是补上断掉的一环。
7. **热点不在向量数学，在字符串/哈希/分词**：semantic 通道每条目每次查询做 2× `buildEmbeddingText` + 1× sha256 + 2× 全量分词（`computeLexicalIntentBoost` 对**每条目**重复 `normalizeQuery(seed)` 与 `normalizeQuery(buildEmbeddingText(entry))`）+ `entryTokens.includes(token)` 的 O(query×entry) 比较。直觉会去找"cosine 太慢"，实际 cosine 384 维只需微秒。
8. **EXPLAIN 在空表上无意义**：索引验证时临时库 rows=0，planner 走平凡计划，输出既不包含 Seq Scan 也不包含 Index Scan 的有效对比。教训：**验证索引必须带数据量跑**，或直接用端到端延迟差作为证据。
9. **环境依赖脆弱**：coordinated runner 依赖 docker daemon，宕机即中断且无法自愈（sudo 需要密码）；长扫描前应先 `docker ps` 探活。
10. **正确的记忆化位置是纯函数边界**：`normalizeQuery`/`buildEmbeddingText` 都是纯函数，在函数体内加备忘录（有界 Map / WeakMap）零行为风险；若试图改 `computeScore` 签名传预计算 tokens，会波及全部调用方——选错了改起来翻倍。

## 5. 债务与边界

- **DB keyword 分支三重断裂（新登记，独立于本分支）**：`knowledge_search_documents` 无写入方 + `keywordRecall` SQL 引用不存在列 + `USE_DB_SEARCH` 默认关闭。启用 DB 化需要 knowledge-write 在提交/修订时写 search document（对齐 gene 的写入模式），属跨服务工程，另立主线。修复前 v1/v3 的 semantic 走内存路径，本分支的 P0-0（写回缓存）是当前路径下唯一有效的 semantic 优化。
- **静默降级可观测性**：DB 分支失败仅 `console.error`，应进指标（degraded 计数）——放 P2。

- TTL 缓存（P0-2/P1-2a）引入最长 60s 的索引陈旧度：与既有读模型缓存同一先例，但跨服务写入路径要持续盯——若未来 artifact 派生改为进程内直写，应把失效钩子接过去并取消 TTL
- 真实 embedding provider 上线后，查询向量化的网络往返（50–200ms）将成为新的第一瓶颈，届时做查询 embedding 缓存/批量，另行主线
- 索引 DDL 对已有生产库生效需要构建时间（HNSW 建索引是 O(n log n)），上线窗口需评估
