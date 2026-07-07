# 快速上手指南

本文档帮助你搭建 TrapMap 本地开发环境。

## 前置要求

| 工具 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | 24 | 与当前 CI / workspace 基线一致 |
| pnpm | 10.33.0 | **必须使用 pnpm，禁止使用 npm 或 yarn** |
| Docker | ≥ 24 | 仅在使用 Docker 部署时需要 |
| Docker Compose | ≥ 2 | 仅在使用 Docker 部署时需要 |

> ⚠️ **重要**：本项目强制使用 pnpm。如果使用 npm 或 yarn 安装依赖会导致依赖解析错误和构建失败。

## 1. 克隆与依赖安装

```bash
# 克隆项目
git clone <repository-url>
cd Trap-Map

# 使用 corepack 启用正确版本的 pnpm
corepack prepare pnpm@10.33.0 --activate

# 安装根依赖（必须使用 pnpm）
pnpm install

# 安装所有 workspace 依赖
pnpm build
```

## 2. 环境配置

```bash
# 复制环境变量模板
cp .env.example .env
```

编辑 `.env` 文件。常见起步配置如下：

| 变量 | 说明 | 示例 |
|------|------|------|
| `TRAPMAP_SYSTEM_ADMIN_KEY` | 管理员密钥（可选；仅在你要创建/使用 system-admin 能力时需要） | `openssl rand -hex 32` 生成 |
| `OPENAI_API_KEY` | OpenAI API 密钥（可选；未配置时回退到 fallback provider） | `sk-...` |
| `TRAPMAP_DATABASE_URL` | PostgreSQL 连接字符串（推荐；兼容主文档口径） | `postgresql://localhost:5432/trapmap` |
| `DATABASE_URL` | PostgreSQL 连接字符串（新宿主同样支持） | `postgresql://localhost:5432/trapmap` |
| `TRAPMAP_DATA_FILE` | JSON 存储路径（兼容回退，可选） | `.data/skill-shareer.json` |

### PostgreSQL 设置（推荐）

当前开发主线推荐使用 PostgreSQL。设置 `TRAPMAP_DATABASE_URL` 或 `DATABASE_URL` 后即可启动；Drizzle 数据库迁移仍由 `packages/server/drizzle/` 作为权威迁移目录提供。若未设置数据库 URL，部分本地姿态仍会回退到 JSON 文件存储。

```bash
# 创建数据库
createdb trapmap

# 手动运行迁移（可选，服务器启动时自动执行）
pnpm --filter @trapmap/server db:migrate

# 生成新迁移（修改 schema 后）
pnpm --filter @trapmap/server db:generate
```

### 可选：本地 Neo4j graph backend

如果你只是常规开发，不需要 Neo4j。只有在验证 optional graph DB backend 时才需要额外启动：

```bash
docker run --name trapmap-neo4j \
  -p 7474:7474 \
  -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/neo4jpass \
  -d neo4j:5

export TRAPMAP_GRAPH_DB_ENABLED=true
export TRAPMAP_GRAPH_DB_PROVIDER=neo4j
export TRAPMAP_GRAPH_DB_URI=bolt://127.0.0.1:7687
export TRAPMAP_GRAPH_DB_USERNAME=neo4j
export TRAPMAP_GRAPH_DB_PASSWORD=neo4jpass
export TRAPMAP_GRAPH_DB_DATABASE=neo4j
export TRAPMAP_GRAPH_DB_FAIL_OPEN=true
export TRAPMAP_GRAPH_DB_SYNC_ON_WRITE=true

pnpm --filter @trapmap/server graph-db:check
```

`TRAPMAP_GRAPH_DB_FAIL_OPEN=true` 时，即使 Neo4j 暂时不可用，服务也会回退到内存 `graphology` backend。

### JSON 文件存储（兼容回退）

如未设置 `TRAPMAP_DATABASE_URL` 或 `DATABASE_URL`，`local-agent` 会回退到 JSON 文件存储模式。此模式仅用于向后兼容，推荐使用 PostgreSQL。

### AI 提供商配置（可选）

AI 提供商支持自动解析。设置 `OPENAI_API_KEY` 后自动使用 OpenAI；也可通过 `AI_PROVIDER` 显式指定。如需使用其他提供商：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `AI_PROVIDER` | 提供商类型：`openai`、`openai-compatible`、`ollama`、`google-genai` | 自动解析：显式值优先；`OPENAI_API_KEY` → `openai`；`GEMINI_API_KEY` → `google-genai`；否则 `fallback` |
| `AI_BASE_URL` | 兼容接口的 Base URL | `https://api.openai.com/v1` |
| `AI_API_KEY` | 兼容接口的 API 密钥 | `OPENAI_API_KEY` |
| `AI_CHAT_MODEL` | 聊天模型名称 | `gpt-4o-mini` |
| `AI_EMBEDDING_MODEL` | Embedding 模型名称 | `text-embedding-3-small` |

### 日志配置（可选）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LOG_USER_OPS_ENABLED` | 启用用户操作日志 | `false` |
| `LOG_RAG_ENABLED` | 启用 RAG 检索日志 | `false` |

## 3. 启动开发服务器

### 方式一：直接运行（推荐）

```bash
# 终端 1：启动 local-agent 或 team-monolith
pnpm dev -- local-agent
# 或
pnpm dev -- team-monolith

# 终端 2：启动 CLI（可选，用于测试）
pnpm dev:cli
```

默认 gateway 运行在 `http://127.0.0.1:4000`。`pnpm dev -- local-agent` / `pnpm dev -- team-monolith` 现在由 `@trapmap/host-local` 提供；`distributed` 相关根脚本由 `@trapmap/host-distributed` 提供。

如需拆分运行时：

```bash
pnpm dev -- gateway
pnpm dev -- candidate-worker
pnpm dev -- governance-worker
pnpm dev -- outbox-worker
```

默认推荐 `pnpm dev -- local-agent`；需要完整团队能力时使用 `pnpm dev -- team-monolith`。兼容别名 `pnpm dev:local-agent`、`pnpm dev:team-monolith`、`pnpm dev:distributed:*` 仍可用。

运行时说明：

- `serviceUnit=candidate-ingestion` 拥有 candidate processing 任务面，适合候选提交与候选 worker 相关验证。
- `serviceUnit=knowledge-governance` 拥有 shared jobs / lifecycle follow-up / outbox 相关工作面，适合 review、decay、indexing follow-up 验证。
- API / worker 组合层通过 `asyncTransport` 和 `LifecyclePublisher` 接入异步基础设施；业务服务本身不应直接构造 `TaskQueue`。

如需预演服务拆分，额外设置 `TRAPMAP_SERVICE_UNIT`：

```bash
TRAPMAP_SERVICE_UNIT=candidate-ingestion pnpm dev -- candidate-worker
TRAPMAP_SERVICE_UNIT=knowledge-governance pnpm dev -- governance-worker
TRAPMAP_SERVICE_UNIT=knowledge-governance pnpm dev -- outbox-worker
TRAPMAP_SERVICE_UNIT=full-platform pnpm dev -- team-monolith
```

### 方式二：Docker Compose

```bash
# 启动服务
docker compose up -d

# 查看日志
docker compose logs -f

# 停止服务
docker compose down
```

## 4. 验证安装

### 健康检查

```bash
curl http://127.0.0.1:4000/health
curl http://127.0.0.1:4000/ready
```

预期要点：

```json
{
  "status": "ok",
  "liveness": "alive",
  "readiness": "ready",
  "product": "trapmap",
  "packages": ["cli", "server", "contracts"],
  "requestContext": {
    "requestIdHeader": "x-request-id",
    "traceHeader": "traceparent"
  },
  "dependencies": {
    "database": "postgres",
    "runtimeMode": "combined",
    "serviceUnit": "full-platform",
    "queueWorker": "running",
    "outboxWorker": "running",
    "graphQuery": "disabled"
  },
  "serviceUnit": {
    "name": "full-platform"
  },
  "memory": { "rssMb": 128, "heapUsedMb": 64, "heapTotalMb": 96 },
  "uptimeSeconds": 42
}
```

`/ready` 与 `/health` 共享同一份 runtime snapshot，但会额外返回 `ok`。当 `readiness === "not-ready"` 时，`/ready` 返回 `503`。

拆分运行时时重点看 ownership：

```bash
curl -H "Authorization: Bearer <token>" http://127.0.0.1:4000/v1/operations/status/async
```

- `candidate-ingestion` 进程应只声明 `queue.ownership.ownsCandidateTaskWork=true`
- `knowledge-governance` task-worker 进程应只声明 `queue.ownership.ownsSharedJobTaskWork=true`
- `knowledge-governance` outbox-worker 进程应声明 `outbox.ownership.ownsOutboxWork=true`
- JSON store 模式下 ownership 仍会声明，但 async worker state 会是 `not-configured`

### 运行测试

```bash
# 运行所有测试
pnpm test

# 类型检查
pnpm typecheck

# 代码格式化检查
pnpm lint
```

### 运行评测

```bash
# 冒烟测试（快速验证检索质量）
pnpm eval -- smoke

# 完整评测
pnpm eval -- core

# 单独运行检索评测
pnpm eval -- retrieval --tier smoke

# 单独运行摘要评测
pnpm eval -- summary --tier smoke
```

> 评测系统详情参见 [`evals/README.md`](../../evals/README.md) 和 [`docs/operations/TESTING.md`](../operations/TESTING.md)。

## 5. 常用开发命令

| 命令 | 说明 |
|------|------|
| `pnpm build` | 构建所有包 |
| `pnpm dev -- local-agent` | 通过 `@trapmap/host-local` 启动最小本地 gateway（热重载） |
| `pnpm dev -- team-monolith` | 通过 `@trapmap/host-local` 启动完整 team gateway（热重载） |
| `pnpm dev -- gateway` | 通过 `@trapmap/host-distributed` 启动 distributed gateway |
| `pnpm dev -- candidate-worker` | 通过 `@trapmap/host-distributed` 启动 candidate-ingestion service |
| `pnpm dev -- governance-worker` | 通过 `@trapmap/host-distributed` 启动 governance-review service |
| `pnpm dev -- outbox-worker` | 通过 `@trapmap/host-distributed` 启动 job-runtime service |
| `pnpm dev:cli` | 开发模式启动 CLI |
| `pnpm test` | 运行测试 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm check` | 代码风格检查 |
| `pnpm format` | 自动格式化代码 |

## 6. 目录结构

```
Trap-Map/
├── packages/
│   ├── client-core/      # 共享 gateway SDK
│   ├── backend-core/     # 宿主无关内核
│   ├── host-local/       # local-agent / team-monolith 宿主
│   ├── host-distributed/ # distributed 宿主
│   ├── cli/              # CLI 客户端
│   ├── server/           # 迁移期兼容壳层
│   ├── contracts/        # 共享 Schema
│   └── skills/           # 项目 Skill 定义
├── evals/            # 评估系统
├── scripts/          # 部署脚本
├── docs/             # 项目文档
```

## 7. 常见问题

### 端口被占用

如果 `4000` 端口被占用，可通过 `PORT` 环境变量修改：

```bash
PORT=4001 pnpm dev:local-agent
```

### pnpm install 失败

确保使用正确版本的 pnpm：

```bash
corepack prepare pnpm@10.33.0 --activate
pnpm install
```

### Docker 构建失败

确保 Docker 已启动并分配足够资源（推荐 4GB+ 内存）。

### 如何配置 AI 提供商

默认使用 OpenAI。如需使用其他提供商（如 Ollama 本地模型），在 `.env` 中设置：

```bash
AI_PROVIDER=ollama
AI_BASE_URL=http://localhost:11434
AI_CHAT_MODEL=llama3
AI_EMBEDDING_MODEL=nomic-embed-text
```

如需使用独立的 embedding 提供商：

```bash
EMBEDDING_PROVIDER=google-genai
EMBEDDING_API_KEY=your-gemini-key
EMBEDDING_MODEL=text-embedding-004
```

### 如何运行评测

评测系统用于验证检索和摘要质量。首次运行前需启动服务器：

```bash
# 终端 1：启动服务器
pnpm dev:local-agent

# 终端 2：运行冒烟评测
pnpm eval:smoke
```

CI 环境中评测会自动在 PR 时触发（路径匹配时），详见 [`docs/operations/CI_CD.md`](../operations/CI_CD.md)。
