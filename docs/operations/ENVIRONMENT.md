# TrapMap 环境变量参考

本文档是 TrapMap 所有环境变量的完整参考。

## 必需变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `TRAPMAP_SYSTEM_ADMIN_KEY` | 管理员密钥，用于创建系统级管理员账户 | `openssl rand -hex 32` 生成 |
| `OPENAI_API_KEY` | OpenAI API 密钥，用于 AI 嵌入和生成能力 | `sk-...` |

## 数据库配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TRAPMAP_DATABASE_URL` | PostgreSQL 连接字符串（设置后启用 PostgresStore） | 空（使用 JsonStore） |
| `TRAPMAP_DATA_FILE` | JSON 文件存储路径（兼容回退，可选） | `.data/skill-shareer.json` |

> 设置 `TRAPMAP_DATABASE_URL` 后，服务器启动时会自动通过 Drizzle migration runner 运行数据库迁移（位于 `packages/server/drizzle/`）。迁移包含所有核心表、索引和 pgvector 扩展的创建。

### PG Recall 配置 (Phase 6，多路召回已全线落地)

多路召回管线（heuristic + keyword + semantic + graph 四通道）已是 v2 检索的默认唯一路径，无需额外开关启用。以下环境变量控制 keyword 和 semantic 通道的 PostgreSQL 索引增强：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `RETRIEVAL_CAPSULE_PG_KEYWORD` | 启用 capsule keyword PG recall（通过 `skill_artifact_capsule_keywords` 表 GIN 索引） | `false` |
| `RETRIEVAL_CAPSULE_PG_SEMANTIC` | 启用 capsule semantic PG recall（通过 `skill_artifact_capsule_embeddings` 表 HNSW 索引） | `false` |
| `RETRIEVAL_CAPSULE_PG_INDEX_SYNC` | 启用 capsule 索引同步写入（artifact lifecycle 触发时写 keyword 和 embedding 索引表） | `false` |

**Fallback 行为**: PG recall 不可用时，keyword 和 semantic 通道自动回退到内存版本。单通道失败（包括 PG 连接错误）不会阻断 `/v2/retrieval/search` 主流程。

**索引重建**: 当启用 PG 后，需运行索引重建将现有 artifact capsules 同步到 PG。调用 `rebuildAllCapsuleIndexes()` 或编写 CLI 脚本触发。

## 服务器配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NODE_ENV` | 运行环境 | `production` |
| `HOST` | 绑定地址 | `127.0.0.1` |
| `PORT` | 服务器端口 | `4000` |

## AI 提供商配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `AI_PROVIDER` | 提供商类型：`openai`、`openai-compatible`、`ollama`、`google-genai`（未配置时自动回退到 `fallback`，使用确定性哈希向量） | `openai` |
| `AI_BASE_URL` | 兼容接口的 Base URL | `https://api.openai.com/v1` |
| `AI_API_KEY` | API 密钥 | `OPENAI_API_KEY` |
| `AI_CHAT_MODEL` | 聊天模型名称 | `gpt-4o-mini` |
| `AI_EMBEDDING_MODEL` | Embedding 模型名称 | `text-embedding-3-small` |
| `AI_PROMPT_TEMPLATE_FILE` | 可选的本地 JSON 槽位模板覆盖文件路径 | `docs/reference/system-prompt-slots.default.json` |
| `AI_PROMPT_PROVIDER` | Prompt provider 选择：`anthropic`、`openai`、`deepseek`、`kimi`、`gemini`、`default` | 自动从模型 ID 推断 |

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
