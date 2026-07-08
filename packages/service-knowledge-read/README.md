# @trapmap/service-knowledge-read

知识检索读侧服务模块。提供多通道召回（关键词 / 语义 / 图辅助）、候选重排、响应组装及 RAG 日志采集的完整检索流水线，供宿主组装层 (host assembly) 按需挂载。

## 职责

| 职责 | 说明 |
|---|---|
| 检索读侧 (retrieval read side) | 对外暴露 Fastify HTTP 端点，承载知识条目查询与检索搜索请求 |
| 关键词通道 (keyword channel) | 基于分词的 BM25 风格召回，支持字段级权重与 token 匹配追踪 |
| 语义通道 (semantic channel) | 基于 embedding 向量相似度的召回，支持 pgvector 加速与内存回退 |
| 召回协调器 (recall coordinator) | 根据查询模式 (`semantic` / `hybrid` / `graph-assisted`) 分发到对应策略，合并多通道候选并重排 |
| 响应组装 (response assembly) | 将排序后的候选转化为 `globalConstraints` / `projectKnowledge` 分桶响应，附带引用、摘要与 refinement |
| RAG 日志 (RAG logging) | 按日写入 JSON Lines 格式的检索流水线日志，支持文件轮转与环境变量配置 |

## HTTP 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/internal/knowledge/:entryId` | 按 ID 获取单条知识条目，不存在时返回 404 |
| `GET` | `/internal/knowledge/mine` | 列出指定用户的知识条目（`?userId=...&teamId=...`），`userId` 必填 |
| `POST` | `/internal/retrieval/search` | 执行检索搜索，body 参数：`query`（必填）、`teamId`、`limit` |
| `GET` | `/internal/health` | 健康检查，返回 `{ status: "ok", service: "knowledge-read" }` |
| `GET` | `/internal/knowledge-read/projection-status` | 读模型投影状态诊断，包含各 surface 的一致性、新鲜度与降级策略 |

## 核心模块

| 模块文件 | 说明 |
|---|---|
| `server.ts` | 创建 Fastify 服务实例，注入依赖并注册路由 |
| `routes.ts` | HTTP 路由注册与 `InvocationError` 到 HTTP 状态码的映射 |
| `deps.ts` | 依赖适配层，将端口层接口桥接到 `@trapmap/backend-core` 的 `KnowledgeReadDeps` |
| `server-retrieval-seam.ts` | 构建通道注册表 (semantic / keyword) 与策略注册表 (semantic / hybrid / graph-assisted)，并暴露 `RetrievalQueryPort` 实现 |
| `retrieval-orchestration.ts` | `ChannelRegistry` 与 `StrategyRegistry` 的注册表类定义 |
| `retrieval-keyword.ts` | 关键词召回通道：分词 (`tokenize`)、归一化 (`normalizeQuery`)、字段权重匹配 |
| `retrieval-semantic.ts` | 语义召回通道：embedding 文本构建、cosine 相似度计算、词法意图加成 |
| `retrieval-recall-coordinator.ts` | 召回协调器：按模式分发 (`dispatchByMode`)、语义 / 混合 / 图辅助三种召回策略实现、候选合并与 rerank |
| `filters.ts` | 检索前置过滤：通过 package-local seam 执行治理 eligibility、衰减判断与边界约束 |
| `search-knowledge.ts` | 检索流水线主入口 (`searchKnowledge`)：编排快照 -> 路由 -> 召回 -> 组装 -> 日志的完整流程 |
| `read-model.ts` | 从仓库构建检索读模型 (`RetrievalReadModel`)：知识条目 + 技能制品 + 冲突关系，并通过 package-local cache seam 复用缓存 |
| `response-assembly.ts` | 响应组装：分桶、v2 capsule-first 组装、激活提示 (activation hints) 构建 |
| `response-citations.ts` | 引用构建：从合并候选生成结构化引用，保留审计分数与通道信息 |
| `response-summary.ts` | 摘要构建：基于命中结果的确定性抽取式摘要，支持 v1 和 v2 capsule 摘要 |
| `response-refinement.ts` | LLM refinement 生成：通过 package-local support seam 获取 prompt blocks / prompt string，再由 AI chat provider 生成 3 句话精炼 |
| `rag-log.ts` | RAG 日志：配置加载、查询 ID 生成、JSON Lines 写入与文件轮转 |
| `retrieval-infra.ts` / `knowledge-read-support-infra.ts` | package-local read-side seam getter：前者承载 retrieval/query-time 能力，后者承载治理、缓存失效与 refinement prompt 能力 |

## 依赖关系

| 包 | 用途 |
|---|---|
| `@trapmap/backend-core` | 核心端口定义 (`KnowledgeReadPort`、`KnowledgeReadDeps`) 与模块工厂 |
| `@trapmap/contracts` | 检索查询 / 响应 / 引用 / 摘要等契约 schema (Zod) |
| `@trapmap/runtime-infra` | 运行时仓库接口 (`SkillShareerRepos`) |
| `@trapmap/server` | 服务端共享库；默认只在 package-local seam/default assembly 中被消费，用于冲突关联、embedding、图查询、检索评分、治理、缓存失效与 refinement prompt 默认实现 |
| `fastify` | HTTP 框架 |
| `pg` | PostgreSQL 客户端 (用于 pgvector 语义搜索与 pg keyword recall) |

普通业务文件默认不直接认识 `@trapmap/server` 的治理、衰减、cache invalidation、prompt builder 模块布局；这些 server internals 集中在 `retrieval-infra-default.ts`、`knowledge-read-support-infra-default.ts` 和宿主装配位点，通过本地 seam 类型暴露给检索编排使用。

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
