# TrapMap

基于 pnpm + TypeScript monorepo 的技能共享平台，用于团队工程知识、Trap 经验和 Skill 工件的提交、审核、索引与检索。仓库包含服务器、CLI、共享契约和评测。

TrapMap 有两类典型使用方式：

- 作为服务端知识库运行，提供检索、审核、导入导出和治理能力。
- 作为 Skill 工件源，被 Claude Code 等智能体工具检索后安装到本地技能目录中使用。

## 📖 文档

| 文档 | 说明 |
|------|------|
| [docs/README.md](docs/README.md) | 文档总览 |
| [architecture.md](architecture.md) | 系统架构概览 |
| [docs/guides/GETTING_STARTED.md](docs/guides/GETTING_STARTED.md) | 本地开发环境搭建 |
| [docs/guides/CODE_GUIDE.md](docs/guides/CODE_GUIDE.md) | 源码导读 |
| [docs/PACKAGES.md](docs/PACKAGES.md) | 各包职责 |
| [docs/reference/DATA_MODEL.md](docs/reference/DATA_MODEL.md) | 数据模型详解 |
| [docs/architecture/](docs/architecture/) | 完整架构文档（API、CLI、部署、流程图等） |
| [docs/reference/api-surface.md](docs/reference/api-surface.md) | v1 API 契约表面 |
| [CHANGELOG.md](CHANGELOG.md) | 版本更新日志 |
| [docs/guides/CONTRIBUTING.md](docs/guides/CONTRIBUTING.md) | 投稿指南 |
| [docs/reference/GLOSSARY.md](docs/reference/GLOSSARY.md) | 项目术语表 |

## 🚀 快速开始

### 1. 本地开发

```bash
pnpm install
cp .env.example .env
# 编辑 .env，至少填入 OPENAI_API_KEY 和 TRAPMAP_SYSTEM_ADMIN_KEY

pnpm dev:server
```

服务默认监听 `http://127.0.0.1:4000`。

另一个终端可运行 CLI：

```bash
pnpm dev:cli
```

### 2. Docker 部署

最快捷的部署方式：

```bash
cp .env.production.example .env
# 编辑 .env 并填入你的 OPENAI_API_KEY 与 TRAPMAP_SYSTEM_ADMIN_KEY
./scripts/deploy-quick.sh
```

部署后服务将在 http://localhost:4000 可用。

---

## 🔌 客户端集成与配置

TrapMap 中的 Skill 可以有两种消费方式：

- 通过客户端直接检索并展示 metadata-only 结果，再按需激活具体文件。
- 将激活后的 Skill 物化到 Claude Code、Codex、OpenCode 等工具约定的技能目录中，作为本地技能使用。

### 集成模型

Skill 工件通常包含以下结构：

```text
<skill-slug>/
├── SKILL.md
├── references/
├── assets/
└── scripts/
```

服务端不会在检索阶段直接返回完整文件，而是优先返回治理后的摘要与 `clientManifest` 元数据。客户端按需再拉取所选文件，这样更安全，也更适合智能体按需装载。

### 给 Claude Code 等工具安装 Skill

对支持“本地技能目录”的客户端，推荐把激活后的 Skill 写入该工具自己的用户级或项目级技能目录。

常见目录约定：

- Claude Code 用户级目录：`~/.claude/skills/`
- Claude Code 项目级目录：`.claude/skills/`
- Codex/其他工具：放到各自约定的 skills 目录，或先物化到项目内临时目录，再由客户端导入

推荐流程：

1. 在 TrapMap 中检索目标 Skill。
2. 根据返回的 `readNext`、`assets`、`scripts` 元数据决定需要激活哪些路径。
3. 使用激活接口或 CLI 将选中文件物化到本地目录。
4. 将物化后的 Skill 目录移动或同步到客户端技能目录。

如果你使用 TrapMap CLI，可直接激活选定路径：

```bash
pnpm dev:cli -- operations activate \
  --artifact <artifact-id> \
  --paths SKILL.md,references/setup.md,scripts/bootstrap.sh \
  --output ./.tmp/skills/<skill-slug>
```

然后把生成目录同步到 Claude Code 项目技能目录：

```bash
mkdir -p .claude/skills
cp -R ./.tmp/skills/<skill-slug> .claude/skills/<skill-slug>
```

如果要安装到用户全局目录，可改为：

```bash
mkdir -p ~/.claude/skills
cp -R ./.tmp/skills/<skill-slug> ~/.claude/skills/<skill-slug>
```

说明：

- `SKILL.md` 是核心入口，通常必须安装。
- `references/` 适合放较长说明或上下文材料。
- `assets/` 适合图片、模板、样例文件。
- `scripts/` 只应在客户端明确允许时启用；TrapMap 会返回脚本 capability 和默认策略，客户端应做二次确认。

### 客户端如何使用 TrapMap

最简单的客户端接入方式是把 TrapMap 当成一个“受治理的 Skill 检索后端”。

典型调用流程：

1. 客户端持有 TrapMap 会话或访问令牌。
2. 调用 `POST /v1/retrieval/skills/search-by-content` 按问题内容检索 Skill。
3. 向用户或智能体展示匹配结果、相关 capsule 和 activation hints。
4. 当用户确认使用某个 Skill 后，再调用激活接口拉取指定文件。
5. 将拉回的文件写入本地技能目录，或临时挂载到当前会话上下文。

检索示例：

```bash
curl -X POST http://127.0.0.1:4000/v1/retrieval/skills/search-by-content \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <token>' \
  -d '{
    "query": "JWT token validation",
    "limit": 5
  }'
```

适合客户端采用的策略：

- 检索阶段只消费元数据、capsule 和摘要，不默认拉全量文件。
- 依据 `clientManifest` 的 `references`、`assets`、`scripts` 生成“下一步操作”提示。
- 对 `scripts` 严格执行 allowlist 或人工确认策略，不要自动执行未知脚本。
- 把已激活的文件缓存到本地，减少重复下载和重复上下文注入。

### 推荐给不同客户端的落地方式

- Claude Code：优先写入 `.claude/skills/` 或 `~/.claude/skills/`，让运行时按目录发现。
- Codex 类工具：若支持本地技能/提示目录，写入其约定目录；若不支持，则把 `SKILL.md` 与所需 `references/` 注入会话上下文。
- 自建智能体平台：直接保存 TrapMap 返回的工件文件，并把 `clientManifest` 作为激活策略与审计依据。

### 与 MCP 的关系

TrapMap 本身更接近“受治理的知识与 Skill 仓库”，不要求客户端必须通过 MCP 接入。你可以：

- 直接走 HTTP API 集成。
- 在外层封装一个 MCP server，把 TrapMap 检索和激活接口暴露给支持 MCP 的客户端。

如果你的客户端已经有 MCP 生态，推荐把 TrapMap 作为后端数据源，而不是把所有 Skill 直接硬编码进 MCP server。

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

更完整的环境变量说明见 [docs/operations/ENVIRONMENT.md](docs/operations/ENVIRONMENT.md)。

### 插槽式系统提示词

系统提示词统一使用 XML 语义标记（四层架构中的内容层），支持通过本地 JSON 模板覆盖可编辑槽位内容。

- 模板覆盖文件：
  - `AI_PROMPT_TEMPLATE_FILE=docs/reference/system-prompt-slots.default.json`
- 四层架构说明：
  - JSON = 传输协议（API 层）：消息结构、工具参数 Schema
  - XML = 语义标记（内容层）：系统指令、环境信息
  - YAML = 配置文件（Skill 文件头）：Frontmatter 元数据
  - Markdown = 内容载体（Skill 正文）
- 详见 [docs/operations/ENVIRONMENT.md](docs/operations/ENVIRONMENT.md) 和 [docs/reference/xml-system-prompt-methodology.md](docs/reference/xml-system-prompt-methodology.md)
- `claim verification` 优先使用 `json`

XML 组织方法参考 [docs/reference/xml-system-prompt-methodology.md](docs/reference/xml-system-prompt-methodology.md)。默认可编辑槽位模板见 [docs/reference/system-prompt-slots.default.json](docs/reference/system-prompt-slots.default.json)。

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
>
> 在本仓库执行命令时，按本地约定应使用 `rtk` 前缀，例如 `rtk pnpm test`、`rtk pnpm lint`。
