# TrapMap

基于 pnpm + TypeScript monorepo 的技能共享平台，包含服务器、CLI 和契约包。

## 📖 文档

| 文档 | 说明 |
|------|------|
| [architecture.md](architecture.md) | 系统架构概览 |
| [docs/guides/GETTING_STARTED.md](docs/guides/GETTING_STARTED.md) | 本地开发环境搭建 |
| [docs/reference/DATA_MODEL.md](docs/reference/DATA_MODEL.md) | 数据模型详解 |
| [docs/architecture/](docs/architecture/) | 完整架构文档（API、CLI、部署、流程图等） |
| [docs/reference/api-surface.md](docs/reference/api-surface.md) | v1 API 契约表面 |
| [CHANGELOG.md](CHANGELOG.md) | 版本更新日志 |
| [docs/guides/CONTRIBUTING.md](docs/guides/CONTRIBUTING.md) | 投稿指南 |
| [docs/reference/GLOSSARY.md](docs/reference/GLOSSARY.md) | 项目术语表 |

## 🚀 快速部署

最快捷的部署方式：

```bash
# 1. 配置环境变量
cp .env.production.example .env
# 编辑 .env 并填入你的 OPENAI_API_KEY

# 2. 运行快速部署脚本
./scripts/deploy-quick.sh
```

部署后服务将在 http://localhost:4000 可用。

---

## 📋 部署选项

### 选项一：快速部署（推荐）

对于简单的部署场景，使用快速部署脚本：

```bash
./scripts/deploy-quick.sh
```

### 选项二：完整部署脚本

需要更多部署控制时：

```bash
./scripts/deploy.sh deploy
```

### 可用命令

| 命令 | 说明 |
|---------|-------------|
| `./scripts/deploy.sh deploy` | 初始部署 |
| `./scripts/deploy.sh start` | 启动服务 |
| `./scripts/deploy.sh stop` | 停止服务 |
| `./scripts/deploy.sh restart` | 重启服务 |
| `./scripts/deploy.sh logs` | 查看日志 |
| `./scripts/deploy.sh status` | 检查状态 |
| `./scripts/deploy.sh update` | 更新并重启 |
| `./scripts/deploy.sh shell` | 进入容器 |
| `./scripts/deploy.sh clean` | 清理所有内容 |

### 直接使用 Docker Compose

```bash
# 构建并启动
docker compose up -d

# 查看日志
docker compose logs -f

# 停止
docker compose down
```

---

## 🔧 配置

### 必需环境变量

| 变量 | 说明 | 示例 |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API 密钥 | `sk-...` |
| `TRAPMAP_SYSTEM_ADMIN_KEY` | 管理员密钥 | 使用 `openssl rand -hex 32` 生成 |

### 可选配置

| 变量 | 说明 | 默认值 |
|----------|-------------|---------|
| `NODE_ENV` | 运行环境 | `production` |
| `HOST` | 绑定地址 | `0.0.0.0` |
| `PORT` | 服务器端口 | `4000` |

---

## 📊 健康检查

服务提供健康检查端点：

```bash
curl http://localhost:4000/health
```

预期响应：
```json
{"status":"ok","timestamp":"..."}
```

---

## 📁 项目结构

```
Trap-Map/
├── packages/
│   ├── cli/          # Commander.js CLI 客户端
│   ├── server/       # Fastify API 服务器
│   ├── contracts/    # 共享 Zod Schema
│   └── skills/       # 项目级 Skill 工作流
├── evals/             # 检索和摘要评估系统
├── docs/              # 项目文档
│   └── architecture/  # 详细架构文档
├── scripts/           # 部署脚本
├── .planning/        # GSD 规划文档
├── docker-compose.yml
└── README.md
```

---

## 🛠️ 开发

```bash
# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 开发模式运行服务器
pnpm dev:server

# 开发模式运行 CLI
pnpm dev:cli

# 运行测试
pnpm test

# 类型检查
pnpm typecheck

# 代码检查
pnpm lint

# 代码格式化
pnpm format
```

> 📘 本地开发环境详细搭建步骤请参阅 [docs/guides/GETTING_STARTED.md](docs/guides/GETTING_STARTED.md)。
