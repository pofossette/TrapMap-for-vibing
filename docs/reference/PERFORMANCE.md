# 性能指南

本文档提供 TrapMap 生产部署的性能调优参考。

## 检索性能

### 三种索引的延迟特征

| 索引类型 | 构建速度 | 查询延迟 | 适用场景 |
|----------|----------|----------|----------|
| 向量索引 (Embedding) | 慢（依赖 AI API） | 低（~50-200ms） | 语义相似性搜索 |
| 关键词索引 (BM25) | 快（本地计算） | 极低（~5-20ms） | 精确关键词匹配 |
| 图索引 (Graphology) | 中（DAG 构建） | 低（~10-50ms） | 关系扩展、陷阱优先检索 |

### 检索模式对比

| 模式 | 延迟 | 召回率 | 复杂度 |
|------|------|--------|--------|
| `semantic` | 最低 | 中 | 低 |
| `hybrid` | 中 | 高 | 中 |
| `graph-assisted` | 最高 | 最高 | 高 |

### 检索性能优化建议

- **语义模式**：适合精确查询，延迟最低
- **混合模式**：平衡召回率和延迟，适用于大多数场景
- **图辅助模式**：仅在需要关系扩展时使用，会额外增加图遍历开销
- 控制返回结果数量（`maxResults`），推荐 5-20 条

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
LOG_RAG_ENABLED=true LOG_RAG_DIR=logs/rag pnpm dev:server

# 分析日志
ls logs/rag/
```

---

## 相关文档

- [环境变量参考](ENVIRONMENT.md) — 完整配置项
- [部署指南](architecture/DEPLOYMENT.md) — Docker 部署和反向代理配置
- [故障排查](architecture/TROUBLESHOOTING.md) — 常见问题解决方案
- [API 参考 — 检索端点](../architecture/API.md#检索端点) — 检索算法细节
