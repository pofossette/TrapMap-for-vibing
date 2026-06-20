# 性能指南

本文档提供 TrapMap 生产部署的性能调优参考。

> 当前正式运行入口优先通过 `@trapmap/host-local` 与 `@trapmap/host-distributed` 暴露。本文中提到的 PostgreSQL、检索、索引和缓存底层模块仍大量位于 `packages/server`，因为那部分实现尚未完全从兼容代码面退场。

## 检索性能

### 三种索引的延迟特征

| 索引类型 | 构建速度 | 查询延迟特征 | 适用场景 |
|----------|----------|----------|----------|
| 向量索引 (Embedding) | 慢（依赖 AI API） | 常由外部 embedding 调用主导 | 语义相似性搜索 |
| 关键词索引 (BM25) | 快（本地计算） | 通常最低 | 精确关键词匹配 |
| 图索引 (`graphology` / optional Neo4j) | 中（图文档预计算） | 取决于 query-time traversal 成本 | 关系扩展、陷阱优先检索 |

### 检索模式对比

| 模式 | 延迟倾向 | 召回率 | 复杂度 |
|------|------|--------|--------|
| `semantic` | 最低 | 中 | 低 |
| `hybrid` | 中 | 高 | 中 |
| `graph-assisted` | 最高 | 最高 | 高 |

### 检索性能优化建议

- **语义模式**：适合精确查询，延迟最低
- **混合模式**：平衡召回率和延迟，适用于大多数场景
- **图辅助模式**：仅在需要关系扩展时使用，会额外增加图遍历开销
- 控制返回结果数量（`maxResults`），推荐 5-20 条

### Optional Neo4j backend: 预期收益区间

Neo4j 不是通用加速开关。它只替换 graph-assisted 路径中的局部图遍历，预期收益集中在这些操作：

- one-hop expansion
- relation strength 计算
- mitigation lookup
- bounded local expansion view 构建

更可能看到收益的场景：

- `graph_index_documents` 已经较大，单次查询需要命中较多相邻节点
- graph-assisted 查询是瓶颈，而不是 embedding API 或 keyword / semantic recall
- Neo4j 连接稳定，没有频繁触发 `enabled-fallback`

通常看不到明显收益的场景：

- 小数据集、本地 smoke fixture、或 query 本身主要靠 semantic / keyword 通道解决
- Neo4j 未启用、连通性不稳定，或 `TRAPMAP_GRAPH_DB_FAIL_OPEN=true` 下经常回退到 memory backend
- 写路径远多于读路径，而你的热点并不在 graph traversal

### 可复现实验方法

建议固定同一份 PostgreSQL 数据、同一组 retrieval smoke cases，并把“启动成本”和“查询效果”分开记录：

```bash
# 0. 可选：先确认 Neo4j 连通
pnpm --filter @trapmap/server graph-db:check

# 1. startup: disabled vs enabled
pnpm --filter @trapmap/server graph-db:benchmark-startup

# 2. baseline retrieval: disabled / memory
time pnpm eval:retrieval:smoke

# 3. healthy neo4j primary
time env \
  TRAPMAP_GRAPH_DB_ENABLED=true \
  TRAPMAP_GRAPH_DB_PROVIDER=neo4j \
  TRAPMAP_GRAPH_DB_URI=bolt://127.0.0.1:7687 \
  TRAPMAP_GRAPH_DB_USERNAME=neo4j \
  TRAPMAP_GRAPH_DB_PASSWORD=<your-password> \
  TRAPMAP_GRAPH_DB_DATABASE=neo4j \
  TRAPMAP_GRAPH_DB_FAIL_OPEN=true \
  pnpm eval:retrieval:smoke

# 4. forced fallback control group
time env \
  TRAPMAP_GRAPH_DB_ENABLED=true \
  TRAPMAP_GRAPH_DB_PROVIDER=neo4j \
  TRAPMAP_GRAPH_DB_URI=bolt://127.0.0.1:65535 \
  TRAPMAP_GRAPH_DB_USERNAME=neo4j \
  TRAPMAP_GRAPH_DB_PASSWORD=<your-password> \
  TRAPMAP_GRAPH_DB_FAIL_OPEN=true \
  pnpm eval:retrieval:smoke
```

执行建议：

- 先做 1 次预热，再对每组至少跑 3-5 次，记录 p50，而不是只看单次 wall clock。
- `graph-db:benchmark-startup` 会输出 disabled-memory、enabled-current-env（若你已提供 Neo4j env）以及 enabled-fallback-control 的多次启动耗时。
- 重点观察 graph-assisted smoke cases；semantic-only case 对 Neo4j 基本不敏感。
- 若 healthy Neo4j 与 forced fallback 基本无差别，通常意味着当前数据规模还没到 traversal 成本主导，或服务实际上一直在 fallback。

### 为什么检索快：入库预计算策略

TrapMap 采用"入库重、出库轻"架构。昂贵的计算（LLM 调用、Embedding 生成、图实体提取等）集中在入库阶段完成，检索阶段尽可能只读预计算结果：

| 预计算措施 | 入库时完成 | 检索时效果 |
|-----------|-----------|-----------|
| Embedding 向量预生成 | Vector adapter 对 `canonicalText` 生成向量 | 检索读缓存 + PG HNSW 搜索 (~50-200ms) |
| 关键词 Token 预分词 + field 分桶 | Keyword adapter 构建 `PersistedKeywordState` | 检索直接读 persistedState (~5-20ms) |
| LLM 图实体预提取 | Graph adapter 两阶段 LLM 提取 nodes/edges | 检索走纯 Graphology BFS (~10-50ms)，零 LLM |
| Capsule 派生预计算 | `deriveFromPayloads()` 生成 profile/capsules | v2 检索直接读派生结构 |
| Capsule contextualPrefix 预生成 | LLM 生成上下文前缀 | 检索纯文本匹配，不调 LLM |
| Capsule 索引预同步 | 预写 keyword tokens + embedding 到 PG 表 | v2 通道直接查预建索引 |

检索路径的残余外部调用：每次检索需 1 次 query embedding API；v2/v3 首次查询需 1 次 intent parsing LLM（有 cache + 正则 fallback）。

> 完整的预计算策略清单、入库 API 请求汇总和延迟对比见 [入库预计算策略](../architecture/PRECOMPUTATION.md)。

---

## Embedding 性能

### 批量处理

Embedding API 调用是主要延迟来源。系统支持批量处理以减少请求次数：

```bash
# 调整批量大小（默认值取决于实现）
# 较大批量 = 更少 API 调用 = 更快，但单次请求更大
```

### Embedding 模型选择

当前 schema 使用 384 维向量（兼容 fallback provider）。通过 `AI_EMBEDDING_MODEL` 环境变量配置具体模型。

| 模型 | 维度 | 速度 | 质量 |
|------|------|------|------|
| `text-embedding-3-small` | 1536 | 快 | 好 |
| `text-embedding-3-large` | 3072 | 中 | 更好 |
| fallback（确定性哈希） | 384 | 极快 | 基线 |

> **注意**：切换到非 384 维模型时，需重建 `knowledge_embeddings` 和 `skill_artifact_capsule_embeddings` 表的向量索引。

通过环境变量配置：

```bash
AI_EMBEDDING_MODEL=text-embedding-3-small   # 推荐（需配 AI_API_KEY）
AI_EMBEDDING_MODEL=text-embedding-3-large   # 更高质量，更高延迟
```

---

## 存储性能

### JSON 文件存储（开发）

- 适用场景：开发环境、小规模部署（< 1000 条目）
- 优点：零配置、易于调试
- 注意：大量条目时文件 IO 成为瓶颈
- **Round 2**：知识/工件/候选的运行时读写不再走 JSONB 单行快照；JSON 文件存储仍用于用户/团队/会话等辅助域。`DualWrite*Repository` 影子写入已删除。

### PostgreSQL 存储（生产）

```bash
TRAPMAP_DATABASE_URL=postgresql://user:pass@localhost:5432/trapmap
# 或
DATABASE_URL=postgresql://user:pass@localhost:5432/trapmap
```

- 适用场景：生产环境、大规模部署
- **Round 2**：以下表已投入使用并替代 `store_snapshot` JSONB 单行快照：
  - `knowledge_entries` / `knowledge_revisions` / `lifecycle_events` — 知识条目结构化存储
  - `skill_artifacts` / `artifact_revisions` / `artifact_lifecycle_events` — 技能工件结构化存储
  - `candidates` — 候选提交行级存储
  - `usage_events` — 使用统计
  - `feedback_records` / `feedback_custom_answers` — 反馈结构化存储（Round 6）
  - `usage_events_daily_rollup` — 使用统计预聚合（Round 6）
  - `knowledge_embeddings` — 向量索引（pgvector HNSW），labels 已从 JSONB 迁移为 `text[]`（Round 7）
  - `knowledge_keywords` — 关键词索引，tokens 已从 JSONB 迁移为 `text[]`，field_tokens 拆为三列 `text[]`（Round 7）
  - `knowledge_search_documents` — tsvector 全文检索索引（Round 7）
  - `graph_index_documents` — GraphRAG-lite 图索引持久化（Round 7）
- 连接池配置建议：

| 参数 | 建议值 | 说明 |
|------|--------|------|
| `max_connections` | 20-50 | 根据并发量调整 |
| `shared_buffers` | 25% 总内存 | PostgreSQL 缓冲区 |
| `effective_cache_size` | 75% 总内存 | 查询规划器参考 |
| `work_mem` | 16-64MB | 排序和哈希操作 |

---

## 服务器配置

这里的 `HOST` / `PORT` 直接作用于当前宿主入口。`pnpm dev:local-agent` 与 `pnpm dev:team-monolith` 默认由 `@trapmap/host-local` 监听 `4000`；distributed 服务默认监听 `4000-4006`。

### 运行时调优

```bash
# 绑定地址
HOST=127.0.0.1    # 生产环境建议绑定本地，通过反向代理暴露
PORT=4000

# Node.js 参数（启动时）
NODE_OPTIONS="--max-old-space-size=512"   # 限制堆内存
```

### AI 提供商配置

```bash
# 使用兼容接口（如本地部署的模型）
AI_PROVIDER=openai-compatible
AI_BASE_URL=http://localhost:11434/v1    # Ollama 示例
AI_CHAT_MODEL=llama3
AI_EMBEDDING_MODEL=nomic-embed-text
```

有效 `AI_PROVIDER` 值：`openai`、`openai-compatible`、`ollama`、`google-genai`、`fallback`（默认，确定性哈希嵌入 + 空操作聊天）。

本地部署 AI 模型可消除网络延迟和 API 限流。

## Phase 3 容量建模入口

当前 Phase 3 不引入第二套性能协议，而是把容量入口挂到现有 operator surface：

- `GET /v1/operations/status/async`
  - `capacityModel.backlogPressure`
  - `capacityModel.handlerLatency`
  - `capacityModel.cachePressure`
  - `capacityModel.databasePool`
- `GET /v1/operations/stats/summary`
  - `asyncArchitecture.queueBacklogByType`
  - `asyncArchitecture.deadLetterByType`
  - `asyncArchitecture.retryRateByType`
  - `asyncArchitecture.avgHandlerLatencyMsByType`
  - `asyncArchitecture.cacheHitRateByNamespace`
  - `asyncArchitecture.cacheInvalidationByNamespace`
  - `asyncArchitecture.cachePendingInvalidationByNamespace`

当前事实：

- PostgreSQL 连接池预算目前只暴露“是否配置”与后续扩展位 `maxConnections`，还没有把驱动内部池状态做成正式 contract。
- bulk/rebuild/backfill 的进度、checkpoint、failure sample 与 resume 能力统一从 `workflow_runs.stats` 汇总到 `bulkOperations`，而不是单独维护第二套性能记录面。

Phase 4 closeout 结论：

- `capacityModel.databasePool.maxConnections` 已关闭为 deferred detail：
  - 当前仅保留 operator-facing shape，不把运行时连接池 introspection 升级为正式 contract。
  - closeout 理由是现有 runtime mode / transport / host 之间没有统一、稳定的池状态来源。
- 热点 `team/query/artifact` 已关闭为 non-default deep drill-down：
  - 默认 operator surface 保持 backlog、latency、cache invalidation、workflow progress 等高层容量信号。
  - 热点分析若未来需要，应独立设计数据来源与响应 contract，而不是扩张默认 status 首页。

---

## 日志性能影响

| 配置 | 影响 | 建议 |
|------|------|------|
| `LOG_USER_OPS_ENABLED=true` | 每次操作额外写日志文件 | 生产环境启用 |
| `LOG_RAG_ENABLED=true` | 每次检索写详细日志 | 调试时启用，性能关键场景关闭 |
| `LOG_MAX_FILE_SIZE_MB=10` | 控制单文件大小 | 保持默认 |

---

## 常见瓶颈排查

| 症状 | 可能原因 | 排查方法 |
|------|----------|----------|
| 首次查询慢 | Embedding API 延迟 | 检查网络和 AI API 响应时间 |
| 批量导入慢 | 逐条 Embedding | 确认批量处理已启用 |
| 内存增长 | 图索引累积 | 检查图节点数量，考虑索引重建 |
| 检索结果不准 | 索引过期 | 重新索引：提交新条目后自动触发 |

---

## 性能监控

### 健康检查

```bash
curl http://localhost:4000/health
```

### 日志分析

启用 RAG 日志后，检索日志包含每次查询的延迟信息：

```bash
# 查看最近的检索延迟
LOG_RAG_ENABLED=true LOG_RAG_DIR=logs/rag pnpm dev:local-agent

# 分析日志
ls logs/rag/
```

---

## 相关文档

- [环境变量参考](../operations/ENVIRONMENT.md) — 完整配置项
- [部署指南](../architecture/DEPLOYMENT.md) — Docker 部署和反向代理配置
- [故障排查](../architecture/TROUBLESHOOTING.md) — 常见问题解决方案
- [API 参考 — 检索端点](../architecture/API.md#检索端点) — 检索算法细节
