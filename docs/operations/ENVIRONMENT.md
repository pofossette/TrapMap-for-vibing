# TrapMap 环境变量参考

本文档是 TrapMap 所有环境变量的完整参考。

## 常用起步变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `TRAPMAP_SYSTEM_ADMIN_KEY` | 管理员密钥；仅在需要 system-admin 能力时配置 | `openssl rand -hex 32` 生成 |
| `OPENAI_API_KEY` | OpenAI API 密钥；未配置时 AI provider 会回退到 `fallback` | `sk-...` |

## 数据库配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TRAPMAP_DATABASE_URL` | PostgreSQL 连接字符串（设置后启用 PostgresStore） | 空（使用 JsonStore） |
| `TRAPMAP_DATA_FILE` | JSON 文件存储路径（兼容回退，可选） | `.data/skill-shareer.json` |

> 设置 `TRAPMAP_DATABASE_URL` 后，服务器启动时会自动通过 Drizzle migration runner 运行数据库迁移（位于 `packages/server/drizzle/`）。迁移包含所有核心表、索引和 pgvector 扩展的创建。

### 可选 Graph DB 查询后端

TrapMap 的 graph DB 是可选查询后端。PostgreSQL `graph_index_documents` 仍是图索引的权威真相源；可选 graph DB 仅用于查询期图遍历与扩张，不接管图数据所有权。

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TRAPMAP_GRAPH_DB_ENABLED` | 启用可选 graph DB 查询后端 | `false` |
| `TRAPMAP_GRAPH_DB_PROVIDER` | 图查询后端提供者；当前仅支持 `neo4j` | `neo4j` |
| `TRAPMAP_GRAPH_DB_URI` | Neo4j 连接地址；仅在启用 graph DB 时必填 | 空 |
| `TRAPMAP_GRAPH_DB_USERNAME` | Neo4j 用户名；仅在启用 graph DB 时必填 | 空 |
| `TRAPMAP_GRAPH_DB_PASSWORD` | Neo4j 密码；仅在启用 graph DB 时必填 | 空 |
| `TRAPMAP_GRAPH_DB_DATABASE` | Neo4j database 名称 | `neo4j` |
| `TRAPMAP_GRAPH_DB_FAIL_OPEN` | graph DB 不可用时是否自动回退到内存 `graphology` backend | `true` |
| `TRAPMAP_GRAPH_DB_SYNC_ON_WRITE` | 图索引写入时是否同步刷新 graph DB 投影 | `true` |

行为约定：

- `TRAPMAP_GRAPH_DB_ENABLED=false` 时，查询路径保持现状，使用内存 `graphology` backend。
- `TRAPMAP_GRAPH_DB_ENABLED=true` 且后端健康时，查询路径可切到 `neo4j` backend。
- `TRAPMAP_GRAPH_DB_ENABLED=true` 且后端异常、同时 `TRAPMAP_GRAPH_DB_FAIL_OPEN=true` 时，请求会回退到内存 `graphology` backend，而不是阻断检索。
- `TRAPMAP_GRAPH_DB_ENABLED=true` 但缺少 `URI`、`USERNAME`、`PASSWORD` 等必需配置时，服务启动阶段会明确报错。

本地最小启动示例：

```bash
# 1. 启动本地 Neo4j（与默认 docker compose 分离，按需启用）
docker run --name trapmap-neo4j \
  -p 7474:7474 \
  -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/neo4jpass \
  -d neo4j:5

# 2. 启用 TrapMap graph DB flags
export TRAPMAP_GRAPH_DB_ENABLED=true
export TRAPMAP_GRAPH_DB_PROVIDER=neo4j
export TRAPMAP_GRAPH_DB_URI=bolt://127.0.0.1:7687
export TRAPMAP_GRAPH_DB_USERNAME=neo4j
export TRAPMAP_GRAPH_DB_PASSWORD=neo4jpass
export TRAPMAP_GRAPH_DB_DATABASE=neo4j
export TRAPMAP_GRAPH_DB_FAIL_OPEN=true
export TRAPMAP_GRAPH_DB_SYNC_ON_WRITE=true

# 3. 可选：先做连通性检查，再启动服务
pnpm --filter @trapmap/server graph-db:check
pnpm dev:server
```

补充说明：

- checked-in `docker-compose.yml` 默认只启动 `server + postgres`；Neo4j 需要你本地额外启动或通过 compose override 自行接入。
- 当前 rollout 默认值保持保守策略：所有环境都默认 `TRAPMAP_GRAPH_DB_ENABLED=false`，只有显式设置环境变量时才启用 Neo4j backend。
- `TRAPMAP_GRAPH_DB_SYNC_ON_WRITE=true` 时，图索引写入会额外尝试刷新 Neo4j projection；若 Neo4j 短暂不可用且 `TRAPMAP_GRAPH_DB_FAIL_OPEN=true`，主检索路径仍会继续使用 memory fallback。

### PG Recall 配置 (Phase 6，多路召回已全线落地)

多路召回管线（heuristic + keyword + semantic + graph 四通道）已是 v2 检索的默认唯一路径，无需额外开关启用。以下环境变量控制 keyword 和 semantic 通道的 PostgreSQL 索引增强：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `RETRIEVAL_CAPSULE_PG_KEYWORD` | 启用 capsule keyword PG recall（通过 `skill_artifact_capsule_keywords` 表 GIN 索引） | `false` |
| `RETRIEVAL_CAPSULE_PG_SEMANTIC` | 启用 capsule semantic PG recall（通过 `skill_artifact_capsule_embeddings` 表 HNSW 索引） | `false` |

**Fallback 行为**: PG recall 不可用时，keyword 和 semantic 通道自动回退到内存版本。单通道失败（包括 PG 连接错误）不会阻断 `/v2/retrieval/search` 主流程。

**Lifecycle sync**: capsule keyword / embedding index rows are now maintained by the shared artifact lifecycle indexing seam in PostgreSQL mode. There is currently no separate environment flag to disable only the write-side capsule index sync path.

**索引重建**: 当启用 PG 后，需运行 capsule index 运维入口将现有 approved artifact capsules 同步到 PG。稳定内部运维面已暴露为：

- `POST /v1/operations/capsule-index/rebuild` with `{ "mode": "full" }` for full rebuild
- `POST /v1/operations/capsule-index/rebuild` with `{ "mode": "artifact", "artifactId": "<artifact-id>" }` for artifact-scoped rebuild
- `GET /v1/operations/capsule-index/health` for source/index reconciliation
- `POST /v1/operations/capsule-index/cleanup-orphans` for orphan row cleanup

这些端点要求 system-admin 会话，并且仅在 PostgreSQL-backed store 启用时可用。

如果你使用 CLI，也可以通过以下运维命令调用同一组端点：

- `trapmap operations capsule-index rebuild`
- `trapmap operations capsule-index rebuild --mode artifact --artifact-id <artifact-id>`
- `trapmap operations capsule-index health`
- `trapmap operations capsule-index cleanup-orphans`

## 服务器配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NODE_ENV` | 运行环境 | 未设置（由部署环境控制） |
| `HOST` | 绑定地址 | `127.0.0.1` |
| `PORT` | 服务器端口 | `4000` |

## AI 提供商配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `AI_PROVIDER` | 提供商类型：`openai`、`openai-compatible`、`ollama`、`google-genai`。自动解析：显式值优先，其次 `OPENAI_API_KEY` → `openai`、`GEMINI_API_KEY` → `google-genai`，否则 `fallback`（使用确定性哈希向量） | 自动解析（见说明） |
| `AI_BASE_URL` | 兼容接口的 Base URL | `https://api.openai.com/v1` |
| `AI_API_KEY` | API 密钥 | `OPENAI_API_KEY` |
| `AI_CHAT_MODEL` | 聊天模型名称 | `gpt-4o-mini` |
| `AI_EMBEDDING_MODEL` | Embedding 模型名称 | `text-embedding-3-small` |
| `AI_PROMPT_TEMPLATE_FILE` | 可选的本地 JSON 槽位模板覆盖文件路径 | 未设置（不应用模板文件覆盖） |
| `AI_PROMPT_PROVIDER` | Prompt provider 选择：`anthropic`、`openai`、`deepseek`、`kimi`、`gemini`、`default` | 自动从模型 ID 推断 |

> 以上 AI 高级配置项未暴露为稳定 CLI 命令，仅通过环境变量控制。

### 独立 Embedding Provider

使用与 chat 不同的提供商处理 embedding：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `EMBEDDING_PROVIDER` | Embedding 提供商类型 | 与 `AI_PROVIDER` 相同 |
| `EMBEDDING_BASE_URL` | Embedding API Base URL | 提供商默认值 |
| `EMBEDDING_API_KEY` | Embedding API 密钥 | 与 `AI_API_KEY` 相同 |
| `EMBEDDING_MODEL` | Embedding 模型名称 | 提供商默认值 |

## 系统提示词模板

TrapMap 的服务端 AI 提示词支持“插槽式”覆盖。你可以提供一个本地 JSON 文件，按任务覆盖以下字段：

- `role`
- `task`
- `corePrinciples`
- `outputInstructions`
- `constraints`
- `examples`

注意：

- 系统提示词统一使用 XML 语义标记（四层架构中的内容层）
- JSON 仅用于 API 传输层（消息结构、工具参数 Schema）和模板覆盖文件
- 只支持覆盖槽位内容，不支持覆盖渲染骨架
- 四层架构详见 [docs/reference/xml-system-prompt-methodology.md](../reference/xml-system-prompt-methodology.md)

## 安全配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `CORS_ORIGINS` | 允许的 CORS 来源（逗号分隔，`*` 表示全部） | `*` |
| `RATE_LIMIT_MAX_PER_MINUTE` | 每分钟最大请求数（0 = 无限制） | `0` |
| `SESSION_TRANSPORT` | 会话传输方式：`bearer-header` 或 `cookie` | `bearer-header` |

## 日志配置

### 用户操作日志

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LOG_USER_OPS_ENABLED` | 启用用户操作日志 | `false` |
| `LOG_USER_OPS_DIR` | 用户操作日志目录 | `logs/user-ops` |

### RAG 检索日志

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LOG_RAG_ENABLED` | 启用 RAG 检索日志 | `false` |
| `LOG_RAG_DIR` | RAG 日志目录 | `logs/rag` |

### 日志轮转

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LOG_MAX_FILE_SIZE_MB` | 单个日志文件最大大小（MB） | `10` |
| `LOG_MAX_BACKUP_FILES` | 每日最大备份文件数 | `5` |

---

## 快速配置

```bash
# 复制环境变量模板
cp .env.example .env

# 生成管理员密钥
openssl rand -hex 32
# 将输出填入 TRAPMAP_SYSTEM_ADMIN_KEY
```

## 生产环境示例

```bash
# .env.production
NODE_ENV=production
TRAPMAP_SYSTEM_ADMIN_KEY=<your-admin-key>
OPENAI_API_KEY=<your-openai-key>
TRAPMAP_DATABASE_URL=postgresql://user:pass@localhost:5432/trapmap
AI_PROVIDER=openai
LOG_USER_OPS_ENABLED=true
LOG_RAG_ENABLED=true
```
