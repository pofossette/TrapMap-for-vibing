# TrapMap

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Monorepo](https://img.shields.io/badge/architecture-monorepo-111827)](#trapmap)
[![Fastify](https://img.shields.io/badge/server-Fastify-000000?logo=fastify&logoColor=white)](https://fastify.dev/)
[![CLI + API](https://img.shields.io/badge/interface-CLI%20%2B%20API-8B5CF6)](#适合怎么用)
[![Knowledge Base](https://img.shields.io/badge/domain-Knowledge%20Base-CA8A04)](#核心能力)
[![Agent Tooling](https://img.shields.io/badge/ecosystem-Agent%20Tooling-DC2626)](#适合谁用)
[![AI Coding](https://img.shields.io/badge/focus-AI%20Coding%20Workflow-0F766E)](#trapmap)
[![Skill Governance](https://img.shields.io/badge/approach-Skill%20Governance-7C3AED)](#trapmap-想做什么)
[![Retrieval First](https://img.shields.io/badge/strategy-Retrieval%20First-1D4ED8)](#一个最小使用流程)

面向 AI 编程工作流的知识与 Skill 治理基础设施。

这个仓库是一个 `pnpm` + TypeScript monorepo，包含 `client-core`、`backend-core`、`host-local`、`host-distributed`、CLI、共享契约和评测工具，用来提交、审核、索引、检索和激活团队的工程知识与 Skill 工件。

## TL;DR

- 问题：AI 编程工具跨会话记忆隔离，同类坑点会反复出现；Skill 过量会污染上下文；Skill 缩略信息质量不稳会直接影响命中效果
- 方案：把知识、Trap 经验和 Skill 做成可治理、可检索、可按需激活的工件，而不是默认全部挂载
- 目标：减少重复踩坑，提高团队经验复用效率，降低上下文负担，让 agent 更容易选中真正需要的能力

## 为什么做 TrapMap

这个项目最初来自三个很实际的问题：

1. 使用 Claude Code、Codex 等工具开发时，跨会话记忆往往是隔离的。同一个坑点可能在不同会话里被反复踩中，团队经验也难以稳定地共享给后来的智能体或协作者。
2. Skill 虽然能挂载能力，但 Skill 不是越多越好。过量 Skill 会消耗上下文，还会干扰 agent 的判断，最后让开发过程出现额外副作用，而不是提升效率。
3. Skill 真正生效，依赖的是 agent 先读取一段缩略信息，再判断要不要使用它。但现实里这段缩略信息的质量并不稳定，Skill 本身也缺少治理，因此效果经常打折。这个项目想探索一种更高效、更可控的 Skill 使用方式。

## TrapMap 想做什么

TrapMap 的核心思路不是“把所有 Skill 都塞进上下文”，而是把知识和 Skill 变成可检索、可筛选、可按需激活的工件：

- 先存储和治理知识、Trap 经验、Skill 描述与文件结构
- 再让客户端按问题检索最相关的结果
- 最后只激活当前任务真正需要的那一小部分内容

这样做的目标是：

- 减少同类错误在跨会话中重复发生
- 让团队经验能以更稳定的方式复用
- 降低 Skill 过载带来的上下文污染
- 提高 agent 选中“正确 Skill”的概率，而不是盲目挂载全部能力

## 适合谁用

- 使用 Claude Code、Codex、OpenCode 等工具进行日常开发的个人开发者
- 希望沉淀工程经验、减少重复踩坑的小团队
- 想把 Skill 从“提示词堆积”升级为“可治理工件”的 AI 工程团队

## 核心能力

- 知识与 Trap 经验提交、审核、结构化存储
- Skill 工件化管理，包括 `SKILL.md`、`references/`、`assets/`、`scripts/`
- 基于问题内容的检索、摘要和激活提示
- 只拉取当前任务真正需要的文件，避免默认全量注入上下文
- CLI、服务端 API 与评测工具配套，方便集成和迭代

## 它和常见方案有什么不同

- 它不是把所有 Skill 长期挂载到会话里，而是强调检索优先、按需激活
- 它不是单纯的提示词仓库，而是带治理、审核和结构化元数据的工件系统
- 它不是只做向量检索，而是关心 Skill 是否值得被激活、该激活哪些部分、如何降低副作用

## 一个最小使用流程

1. 团队把踩坑经验、工作流或 Skill 工件提交到 TrapMap
2. 服务端对内容做审核、结构化和索引
3. 当 agent 遇到具体任务时，客户端先检索相关结果，而不是预加载全部 Skill
4. 只激活当前任务需要的 `SKILL.md` 或部分 `references/`、`scripts/`
5. 经验被复用，重复错误减少，会话上下文也更干净

## 适合怎么用

TrapMap 有两类典型使用方式：

- 作为服务端知识库运行，提供检索、审核、导入导出和治理能力
- 作为 Skill 工件源，被 Claude Code、Codex、OpenCode 等工具按需检索并安装到本地技能目录中使用

当前工程状态：

- deployment profile 现已作为正式 capability 模型落地到宿主 runtime：`local-agent`、`team-monolith`、`distributed`
- `deployment preset` 继续作为兼容启动输入存在，但解析后统一收敛到 `profile + runtimeMode + serviceUnit + capabilities`
- `/health`、`/ready` 与 runtime/status metadata 现在会暴露 profile、route surface、async ownership expectation、storage posture、auth/team expectation
- CLI 的正式接入模型固定为 `gateway only`：本地配置只保存一个 gateway URL，后端是否单体或拆成 worker/service unit 对 CLI 透明
- `distributed` phase-1 的正式拓扑为 `gateway / retrieval / candidate-ingestion / governance / outbox-runtime`
- `retrieval` 当前仍是逻辑服务边界，不是独立 runtime 二进制；CLI 也不会看到 retrieval 专用 URL
- Knowledge 域已经完成结构化拆表
- Skill Artifact 域已进入 Round 4：主路径在 PostgreSQL，`files`、`script_descriptors`、`profile/capsules/clientManifest` 已补入结构化子表；原 `artifact_revisions` JSONB 列继续保留为兼容缓存，不再是唯一事实源
- PG-first 收敛已完成：核心请求处理通过 `repos` 读写（`packages/server/src/lib/repos/`）；`store_snapshot` 作为兼容层保留，仍服务于未迁移辅助域以及部分启动恢复/运维路径。详见 `docs/reference/SYSTEM_TRUTH_SOURCES.md`

## 快速理解

你可以把 TrapMap 理解为一个给 AI 编程工具使用的“受治理知识层”：

- 对人：它沉淀团队里真正有价值的踩坑经验和工作方法
- 对 agent：它提供更轻量、更结构化的检索结果，而不是一股脑塞入大量 Skill
- 对项目：它把“经验复用”从临时聊天记录，变成可维护的工程资产

## 项目状态

TrapMap 目前处于持续演进阶段。核心方向已经比较明确：知识治理、Skill 工件化、检索优先、按需激活；但在 Skill ranking、capsule 质量控制和更细粒度的激活策略上，项目仍在继续探索。

## 📖 文档

| 文档 | 说明 |
|------|------|
| [docs/README.md](docs/README.md) | 文档总览 |
| [architecture.md](architecture.md) | 根入口级系统架构摘要 |
| [docs/guides/GETTING_STARTED.md](docs/guides/GETTING_STARTED.md) | 本地开发环境搭建 |
| [docs/guides/CODE_GUIDE.md](docs/guides/CODE_GUIDE.md) | 源码导读 |
| [docs/PACKAGES.md](docs/PACKAGES.md) | 各包职责 |
| [docs/PACKAGE_STACK_RATIONALE.md](docs/PACKAGE_STACK_RATIONALE.md) | 各包及主要子包的技术选型原因 |
| [docs/reference/DATA_MODEL.md](docs/reference/DATA_MODEL.md) | 数据模型详解 |
| [docs/architecture/](docs/architecture/) | 完整架构文档（模块、组件、API、CLI、部署、流程图等） |
| [docs/reference/api-surface.md](docs/reference/api-surface.md) | v1 API 契约表面 |
| [CHANGELOG.md](CHANGELOG.md) | 版本更新日志 |
| [docs/guides/CONTRIBUTING.md](docs/guides/CONTRIBUTING.md) | 投稿指南 |
| [docs/reference/GLOSSARY.md](docs/reference/GLOSSARY.md) | 项目术语表 |
| [docs/reference/SYSTEM_TRUTH_SOURCES.md](docs/reference/SYSTEM_TRUTH_SOURCES.md) | 架构事实、入口文件与文档参考规则 |
| [docs/reference/REPO_STRUCTURE.md](docs/reference/REPO_STRUCTURE.md) | 仓库目录结构、文档分层、归档位置和生成目录规则 |

## 🚀 快速开始

### 1. 本地开发

```bash
pnpm install
cp .env.example .env
# 编辑 .env，至少填入 OPENAI_API_KEY 和 TRAPMAP_SYSTEM_ADMIN_KEY

pnpm dev:local-agent
```

本地默认 gateway 监听 `http://127.0.0.1:4000`，其中 `local-agent` / `team-monolith` 由 `@trapmap/host-local` 提供，`distributed` 由 `@trapmap/host-distributed` 提供。

三种正式开发入口：

```bash
pnpm dev:local-agent                    # 单用户、最小 retrieval-first gateway
pnpm dev:team-monolith                  # 小团队/单实例完整 gateway
pnpm dev:distributed:gateway            # distributed gateway
pnpm dev:distributed:candidate-worker   # distributed candidate worker
pnpm dev:distributed:governance-worker  # distributed governance worker
pnpm dev:distributed:outbox-worker      # distributed outbox worker
```

另一个终端可运行 CLI：

```bash
pnpm dev:cli
```

### 2. Docker 部署

推荐按 deployment profile 选择入口：

```bash
# team-monolith gateway（compose 默认入口）
docker compose up -d

# distributed gateway + workers
docker compose --profile distributed up -d

# distributed + optional RabbitMQ task transport
docker compose --profile distributed --profile mq up -d
```

`local-agent` 不推荐走 compose；直接使用 `pnpm dev:local-agent` 更符合单用户轻量模式。

`docker-compose.yml` 中的 `server` service 目前仍承担统一 gateway 的 compose 入口。`distributed` profile 只是在它之外追加 `candidate-worker`、`governance-worker`、`outbox-worker`；CLI 仍然只连 `TRAPMAP_GATEWAY_URL`。

最快捷试跑方式：

```bash
cp .env.production.example .env
# 编辑 .env 并填入你的 OPENAI_API_KEY 与 TRAPMAP_SYSTEM_ADMIN_KEY
./scripts/deploy-quick.sh
```

部署后服务将在 http://localhost:4000 可用。

## 最小验证

deployment flexibility 相关改动至少回归：

```bash
pnpm test:deployment-smoke
pnpm test:runtime-foundations
pnpm typecheck
pnpm check:docs-drift
```

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
pnpm dev:cli -- activate \
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
| `HOST` | 绑定地址 | `127.0.0.1` |
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
{
  "status": "ok",
  "product": "trapmap",
  "packages": ["client-core", "backend-core", "host-local", "cli", "contracts"],
  "memory": { "rssMb": 128, "heapUsedMb": 64, "heapTotalMb": 96 },
  "uptimeSeconds": 42
}
```

---

## 📁 项目结构

```
Trap-Map/
├── packages/
│   ├── client-core/      # 共享 gateway SDK
│   ├── backend-core/     # 宿主无关后端内核
│   ├── host-local/       # local-agent / team-monolith 宿主
│   ├── host-distributed/ # distributed 宿主
│   ├── cli/              # Commander.js CLI 客户端
│   ├── server/           # 迁移期兼容壳层
│   ├── contracts/        # 共享 Zod Schema
│   └── skills/           # 项目级 Skill 工作流
├── evals/             # 检索和摘要评估系统
├── docs/              # 项目文档
│   └── architecture/  # 详细架构文档
├── scripts/           # Automation and deploy scripts
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

# 开发模式运行 local-agent
pnpm dev:local-agent

# 或完整 team-monolith
pnpm dev:team-monolith

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
