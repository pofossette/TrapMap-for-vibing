
# @trapmap/service-knowledge-read

知识检索读侧服务模块。提供多通道召回（关键词 / 语义 / 图辅助）、候选重排、响应组装及 RAG 日志采集的完整检索流水线，供宿主组装层 (host assembly) 按需挂载。

## 职责

| 职责 | 说明 |
|---|---|
| 检索读侧 (retrieval read side) | 对外暴露 Fastify HTTP 端点，承载知识条目查询与检索搜索请求 |
| 关键词通道 (keyword channel) | 基于分词的 BM25 风格召回，支持字段级权重（labels 3x, shortcut 2x, detail 1x）与 token 匹配追踪 |
| 语义通道 (semantic channel) | 基于 embedding 向量相似度的召回，支持 pgvector 加速与内存回退，含 lexical intent boost |
| 图辅助通道 (graph-assisted channel) | 基于图索引的 local neighborhood expansion 召回，与 hybrid 模式合并后 rerank |
| 召回协调器 (recall coordinator) | 根据查询模式 (`semantic` / `hybrid` / `graph-assisted`) 分发到对应策略，合并多通道候选并重排 |
| 响应组装 (response assembly) | 将排序后的候选转化为 `globalConstraints` / `projectKnowledge` 分桶响应，附带引用、摘要与 refinement；支持 v2 capsule-first 组装与 activation hints |
| 入口投影 (entry projection) | `knowledge-read` 自有的 temporary direct-backed projection，为 `getById` / `listMine` 提供缓存读模型，支持 invalidation 与 rebuild |
| 图 LLM 抽取 (graph LLM extraction) | 两阶段 LLM 流水线：文本分段 -> 并发实体抽取 -> 合并 / gleaning -> 图节点/边记录转换，支持 canonical label alignment |
| 图索引仓库 (graph index repository) | PostgreSQL `graph_index_documents` 表的 CRUD 仓库，供图投影回填与查询使用 |
| 图查询后端 (graph query backend) | `MemoryGraphQueryBackend` 实现：one-hop expansion、relation strength、local expansion view、mitigating skills 查询 |
| 候选语料 (candidate corpus) | PostgreSQL 读端口，列出已批准的 traps 与 skills 供候选流水线使用 |
| RAG 日志 (RAG logging) | 按日写入 JSON Lines 格式的检索流水线日志，支持文件轮转与环境变量配置 |

## HTTP 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/internal/knowledge/:entryId` | 按 ID 获取单条知识条目，不存在时返回 404 |
| `GET` | `/internal/knowledge/mine` | 列出指定用户的知识条目（`?userId=...&teamId=...`），`userId` 必填 |
| `POST` | `/internal/retrieval/search` | 执行检索搜索，body 参数：`query`（必填）、`teamId`、`limit` |
| `GET` | `/internal/health` | 健康检查，返回 `{ status: "ok", service: "knowledge-read" }` |
| `GET` | `/internal/knowledge-read/projection-status` | 读模型投影状态诊断，包含各 surface 的一致性、新鲜度与降级策略 |
| `POST` | `/internal/knowledge-read/projection-rebuild` | 由 read-side owner 重建 entry snapshot，返回 `202` 和最新 projection status；未配置时返回 501 |

## 公开 API

### 主入口 (`index.ts`)

**服务器与路由**

| 导出 | 说明 |
|---|---|
| `createKnowledgeReadServer(config, deps)` | 创建 Fastify 服务实例，注入依赖并注册路由 |
| `registerKnowledgeReadRoutes(app, module)` | 将 HTTP 路由注册到 Fastify 实例 |
| `createKnowledgeReadDeps(deps)` | 将端口层接口桥接到 `@trapmap/backend-core` 的 `KnowledgeReadDeps` |
| `createKnowledgeReadServiceModule(deps)` | 创建 `KnowledgeReadPort` 模块实例 |

**检索流水线**

| 导出 | 说明 |
|---|---|
| `searchKnowledge(services, auth, query)` | 检索主入口：编排 snapshot -> 路由 -> 召回 -> 组装 -> 日志的完整流程 |
| `updateEntryEmbeddingCache(services, entryId)` | 刷新指定条目的 embedding 缓存 |
| `dispatchByMode(mode, seed, entries, parsed, ...)` | 按模式分发到对应召回策略 |
| `semanticRecall(...)` | 语义召回策略：pgvector 优先，内存 cosine 回退 |
| `hybridRecall(...)` | 混合召回策略：语义 + 关键词并行，merge + rerank |
| `graphAssistedHybridRecall(...)` | 图辅助混合召回：语义 + 关键词 + 图 expansion 三路合并 |

**通道与策略注册**

| 导出 | 说明 |
|---|---|
| `ChannelRegistry` / `StrategyRegistry` | 通道与策略注册表类 |
| `createKnowledgeReadChannelRegistry()` | 创建预注册 semantic + keyword 通道的注册表 |
| `createKnowledgeReadStrategyRegistry()` | 创建预注册 semantic / hybrid / graph-assisted 策略的注册表 |
| `createKnowledgeReadRetrievalQuery(options)` | 创建 `RetrievalQueryPort` 实现 |
| `createKnowledgeReadOwnerRetrievalServices(options)` | 创建宿主检索服务依赖包 |

**关键词通道**

| 导出 | 说明 |
|---|---|
| `tokenize(text)` | 文本分词：lowercase + 非字母数字分割 + 去重 |
| `normalizeQuery(query)` | 查询归一化：分词后过滤长度 < 2 的 token |
| `keywordRecall(queryText, entries)` | 关键词召回：字段权重匹配，返回排序候选 |
| `keywordChannel` | 预构建的 `KnowledgeReadRecallChannel` 实例 |

**语义通道**

| 导出 | 说明 |
|---|---|
| `semanticChannel` | 预构建的语义通道实例，内部使用 embedding + cosine similarity |

**过滤与治理**

| 导出 | 说明 |
|---|---|
| `isEntryEligible(entry, auth, filters, services?)` | 检查单条条目是否符合检索资格（审批状态、安全等级、团队、scope、label、衰减） |
| `filterEligibleEntries(entries, auth, filters, services?)` | 批量过滤符合资格的条目 |
| `filterByBoundaryContext(entries, boundaryContext, services?)` | 按边界约束过滤条目（版本约束不满足的条目排除） |

**响应组装**

| 导出 | 说明 |
|---|---|
| `assembleResponseBuckets(scoredEntries, filters, citations?, conflicts?)` | 分桶为 globalConstraints / projectKnowledge |
| `buildRetrievalResponse(gc, pk, refinement, summary?)` | 构建完整检索响应 |
| `buildEmptyResponse()` | 构建空响应 |
| `toRetrievalMatch(scoredEntry, filters, citation?, conflicts?)` | 将 scored entry 转为检索匹配 |
| `buildCitations(candidates)` | 从 merged candidates 构建结构化引用 |
| `buildSummary(options)` | 基于命中结果的确定性抽取式摘要 |
| `buildCapsuleSummary(options)` | v2 capsule-first 摘要 |
| `buildCapsuleCitations(capsules)` | 从 capsule matches 构建引用 |
| `generateRefinement(services, query, gc, pk)` | LLM refinement 生成（best-effort，3 句话精炼） |
| `isRefinementAvailable(services)` | 检查 refinement provider 是否可用 |

**读模型与投影**

| 导出 | 说明 |
|---|---|
| `buildRetrievalReadModel(repos)` | 从仓库构建检索读模型（知识条目 + 技能制品 + 冲突关系） |
| `buildOwnerReadModel(repos)` | 宿主管理用读投影 |
| `createOwnerReadModelProjection(options)` | 创建宿主读模型投影实例 |
| `assertKnowledgeReadMigrationSet()` | 断言 Drizzle 迁移集完整性 |
| `runKnowledgeReadMigrations(pool)` | 执行 Drizzle 迁移 |

**图相关**

| 导出 | 说明 |
|---|---|
| `createKnowledgeReadGraphIndexRepository(pool)` | 创建 PostgreSQL graph_index_documents 仓库 |
| `createMemoryGraphQueryBackend(repo)` | 创建内存图查询后端 |
| `createCandidateCorpusPgReadPort(pool)` | 创建候选语料 PostgreSQL 读端口 |

**图 LLM 抽取**（通过 `graph-llm-extract.ts`）

| 导出 | 说明 |
|---|---|
| `extractGraphEntitiesWithLLM(chat, text, options?)` | 两阶段 LLM 图实体抽取主入口 |
| `extractSegmentEntities(chat, segment, maxRetries?)` | 单段实体抽取 |
| `planExtraction(chat, text, cache?)` | Phase 1 文本分段规划 |
| `mergeExtractions(extractions)` | 合并多段抽取结果 |
| `toGraphRecords(extraction)` | 转换为 GraphNodeRecord / GraphEdgeRecord |
| `dedupeGraphRecords({ nodes, edges })` | 图记录去重 |
| `buildNodeId(...)` / `buildEdgeId(...)` / `normalizeValue(...)` | 确定性 ID 生成工具 |
| `parseExtractionPlan(...)` / `parseLlmExtraction(...)` | LLM JSON 响应解析 + Zod 校验 |

**RAG 日志**

| 导出 | 说明 |
|---|---|
| `loadRagLogConfig()` | 从环境变量加载 RAG 日志配置 |
| `generateQueryId()` | 生成唯一查询 ID（`qry_` 前缀） |
| `logRagRetrieval(config, entry)` | 写入 RAG 检索日志条目（fire-and-forget） |

**Schema 导出**（通过 `schema.ts`）

从 `@trapmap/persistence-schema` 重导出 Drizzle 表定义：`knowledgeEmbeddings`、`knowledgeKeywords`、`knowledgeSearchDocuments`、`canonicalLabelEmbeddings`、`skillArtifactCapsuleEmbeddings`、`skillArtifactCapsuleKeywords`、`graphIndexDocuments`、`retrievalBadcaseTraces`。

**Store 类型导出**（通过 `./store.js` 子路径）

`KnowledgeRecord`、`SkillArtifactRecord`、`FeedbackQueueRecord`、`StoreData` 及其关联的 revision / submission / lifecycle / metadata / embedding cache / index state 记录类型。

## 核心模块

| 模块文件 | 说明 |
|---|---|
| `server.ts` | 创建 Fastify 服务实例，注入依赖并注册路由 |
| `routes.ts` | HTTP 路由注册与 `InvocationError` 到 HTTP 状态码的映射（validation->400, forbidden->403, not-found->404, conflict->409, unavailable->503, timeout->504） |
| `deps.ts` | 依赖适配层，将端口层接口桥接到 `@trapmap/backend-core` 的 `KnowledgeReadDeps` |
| `context.ts` | 核心类型定义：`SkillShareerServices`、`ResolvedAuthContext`、`KnowledgeReadRetrievalInfra`、`KnowledgeReadSupportInfra` 等 |
| `entry-projection.ts` | `knowledge-read` 自有 entry projection：从仓库刷新完整 snapshot，并为 `getById` / `listMine` 提供缓存读模型，支持 invalidation 与 rebuild |
| `server-retrieval-seam.ts` | 构建通道注册表 (semantic / keyword) 与策略注册表 (semantic / hybrid / graph-assisted)，并暴露 `RetrievalQueryPort` 实现 |
| `retrieval-orchestration.ts` | `ChannelRegistry` 与 `StrategyRegistry` 的注册表类定义 |
| `retrieval-keyword.ts` | 关键词召回通道：分词 (`tokenize`)、归一化 (`normalizeQuery`)、字段权重匹配 (labels 3x, shortcut 2x, detail 1x) |
| `retrieval-semantic.ts` | 语义召回通道：embedding 文本构建、cosine 相似度计算、词法意图加成、批量 embedding 缓存优化 |
| `retrieval-recall-coordinator.ts` | 召回协调器：按模式分发 (`dispatchByMode`)、语义 / 混合 / 图辅助三种召回策略实现、候选合并与 rerank；支持 pgvector DB 搜索与内存回退 |
| `filters.ts` | 检索前置过滤：通过 package-local seam 执行治理 eligibility、衰减判断与边界约束 |
| `search-knowledge.ts` | 检索流水线主入口 (`searchKnowledge`)：编排 snapshot -> eligibility -> boundary-filter -> routing -> recall -> assembly -> summary -> refinement -> 日志的完整流程 |
| `read-model.ts` | 从仓库构建检索读模型 (`RetrievalReadModel`)：知识条目 + 技能制品 + 冲突关系，并通过 package-local cache seam 复用缓存 |
| `response-assembly.ts` | 响应组装：分桶、v2 capsule-first 组装、激活提示 (activation hints: readNext / assets / scripts) 构建 |
| `response-citations.ts` | 引用构建：从合并候选生成结构化引用，保留审计分数与通道信息 |
| `response-summary.ts` | 摘要构建：基于命中结果的确定性抽取式摘要，支持 v1 和 v2 capsule 摘要 |
| `response-refinement.ts` | LLM refinement 生成：通过 package-local support seam 获取 prompt blocks / prompt string，再由 AI chat provider 生成 3 句话精炼 |
| `rag-log.ts` | RAG 日志：配置加载、查询 ID 生成、JSON Lines 写入与文件轮转 |
| `graph-index-repository.ts` | PostgreSQL `graph_index_documents` 表的 CRUD 仓库实现 |
| `graph-query.ts` | `MemoryGraphQueryBackend`：one-hop expansion、relation strength、local expansion view、mitigating skills |
| `graph-llm-extract.ts` | 两阶段 LLM 图实体抽取编排器，含 gleaning、canonical label alignment、resilience |
| `candidate-corpus-pg.ts` | 候选语料 PostgreSQL 读端口（listApprovedTraps / listApprovedSkills） |
| `activation-policy.ts` | 脚本激活策略映射（legacy manual/auto/blocked -> four-state） |
| `retrieval-infra.ts` / `knowledge-read-support-infra.ts` | package-local read-side seam getter：分别承载 retrieval/query-time 与治理、缓存失效、refinement prompt 能力 |
| `schema.ts` | 从 `@trapmap/persistence-schema` 重导出 Drizzle 表定义 |
| `store.ts` | 读侧数据记录类型定义（KnowledgeRecord、SkillArtifactRecord、FeedbackQueueRecord 等） |

## 依赖关系

| 包 | 用途 |
|---|---|
| `@trapmap/backend-core` | 核心端口定义 (`KnowledgeReadPort`、`KnowledgeReadDeps`) 与模块工厂 |
| `@trapmap/contracts` | 检索查询 / 响应 / 引用 / 摘要 / 图索引等契约 schema (Zod)；graph runtime snapshot 构建工具 |
| `@trapmap/persistence-schema` | Drizzle ORM 表定义（embedding、keyword、graph_index 等） |
| `drizzle-orm` | ORM 与迁移执行 |
| `fastify` | HTTP 框架 |
| `pg` | PostgreSQL 客户端 (用于 pgvector 语义搜索、pg keyword recall、图索引仓库) |

**开发依赖**

| 包 | 用途 |
|---|---|
| `@trapmap/service-knowledge-write` | 图 LLM 抽取中的 canonical label alignment (动态导入) |

`@trapmap/server` 已退役。retrieval 默认装配与 support 默认装配均由 package-local seam 提供。

## 子路径导出

| 路径 | 说明 |
|---|---|
| `.` | 主入口，导出所有公开 API |
| `./store.js` | 读侧数据记录类型（`KnowledgeRecord`、`SkillArtifactRecord`、`FeedbackQueueRecord`、`StoreData` 等） |

## 检索模式

| 模式 | 说明 |
|---|---|
| `semantic` | 纯语义召回：pgvector DB 搜索优先，内存 cosine 回退；含 lexical intent boost |
| `hybrid` | 混合召回：语义 + 关键词并行，merge candidates -> rerank（含 freshness decay、boundary scoring、early termination） |
| `graph-assisted` | 图辅助混合召回：semantic + keyword + graph expansion 三路合并，graph score 以 0.2 boost factor 合入 |

## Entry Projection

entry snapshot 当前是 `temporary-direct-backed-projection`：生命周期失效后 status 会显示 `refresh-pending` 和 lag，operator 可显式 rebuild。它的退出条件是由 outbox 维护独立的 persisted projection；这不是新的默认跨 owner direct-read 路径。

投影缓存通过 `KnowledgeReadSupportInfra.cache` seam 管理，支持以下 invalidation 原因：`approved`、`deactivated`、`remediation-suppressed`、`remediation-reactivated`。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `USE_DB_SEARCH` | `"false"` | 设为 `"true"` 启用 pgvector 向量搜索加速 |
| `LOG_RAG_ENABLED` | `"false"` | 设为 `"true"` 启用 RAG 检索日志 |
| `LOG_RAG_DIR` | `logs/rag` | RAG 日志输出目录 |
| `LOG_MAX_FILE_SIZE_MB` | `10` | 单个日志文件最大体积 (MB)，超出后触发轮转 |
| `LOG_MAX_BACKUP_FILES` | `5` | 保留的历史日志备份数量 |

## 构建与测试

```bash
pnpm --filter @trapmap/service-knowledge-read build    # TypeScript 编译
pnpm --filter @trapmap/service-knowledge-read test     # Vitest 测试
pnpm --filter @trapmap/service-knowledge-read typecheck # 类型检查
```

## 测试文件

测试文件与源码同目录，使用 `*.test.ts` 命名约定：

`candidate-corpus-pg.test.ts`、`deps.test.ts`、`entry-projection.test.ts`、`graph-index-repository.test.ts`、`graph-query.test.ts`、`import-boundary.test.ts`、`knowledge-read-support-infra-default.test.ts`、`migrations.test.ts`、`rag-log.test.ts`、`read-model.test.ts`、`retrieval-infra-default.test.ts`、`retrieval-keyword.test.ts`、`retrieval-orchestration.test.ts`、`retrieval-read-model-cache.test.ts`、`routes.test.ts`、`search-knowledge.test.ts`、`server-retrieval-seam.test.ts`、`server.test.ts`、`response-refinement.test.ts`
