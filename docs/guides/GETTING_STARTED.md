# 快速上手指南

本文档帮助你搭建 TrapMap 本地开发环境。

## 前置要求

| 工具 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | ≥ 20 | 推荐使用 Node.js 20 LTS |
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

编辑 `.env` 文件，至少配置以下变量：

| 变量 | 说明 | 示例 |
|------|------|------|
| `TRAPMAP_SYSTEM_ADMIN_KEY` | 管理员密钥（必填） | `openssl rand -hex 32` 生成 |
| `OPENAI_API_KEY` | OpenAI API 密钥（用于 AI 能力） | `sk-...` |
| `TRAPMAP_DATA_FILE` | JSON 存储路径（开发默认） | `.data/trapmap.json` |

### AI 提供商配置（可选）

默认使用 OpenAI。如需使用其他提供商：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `AI_PROVIDER` | 提供商类型：`openai`、`openai-compatible`、`ollama` | `openai` |
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
# 终端 1：启动 API 服务器
pnpm dev:server

# 终端 2：启动 CLI（可选，用于测试）
pnpm dev:cli
```

服务器启动后运行在 `http://localhost:4000`。

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
curl http://localhost:4000/health
```

预期响应：

```json
{
  "status": "ok",
  "product": "trapmap",
  "packages": ["cli", "server", "contracts"]
}
```

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
pnpm eval:smoke

# 完整评测
pnpm eval:core

# 单独运行检索评测
pnpm eval:retrieval:smoke

# 单独运行摘要评测
pnpm eval:summary:smoke
```

> 评测系统详情参见 [`evals/README.md`](../../evals/README.md) 和 [`docs/operations/TESTING.md`](../operations/TESTING.md)。

## 5. 常用开发命令

| 命令 | 说明 |
|------|------|
| `pnpm build` | 构建所有包 |
| `pnpm dev:server` | 开发模式启动服务器（热重载） |
| `pnpm dev:cli` | 开发模式启动 CLI |
| `pnpm test` | 运行测试 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm lint` | 代码风格检查 |
| `pnpm format` | 自动格式化代码 |

## 6. 目录结构

```
Trap-Map/
├── packages/
│   ├── cli/          # CLI 客户端
│   ├── server/       # API 服务器
│   ├── contracts/    # 共享 Schema
│   └── skills/       # 项目 Skill 定义
├── evals/            # 评估系统
├── scripts/          # 部署脚本
├── docs/             # 项目文档
```

## 7. 常见问题

### 端口被占用

如果 `4000` 端口被占用，可通过 `PORT` 环境变量修改：

```bash
PORT=4001 pnpm dev:server
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
pnpm dev:server

# 终端 2：运行冒烟评测
pnpm eval:smoke
```

CI 环境中评测会自动在 PR 时触发（路径匹配时），详见 [`docs/operations/CI_CD.md`](../operations/CI_CD.md)。
