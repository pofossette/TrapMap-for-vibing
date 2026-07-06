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

这个仓库是一个 `pnpm` + TypeScript monorepo，包含 `client-core`、`backend-core`、`host-local`、`host-distributed`、多组 `service-*` 包、CLI、web-panel、共享契约和评测工具，用来提交、审核、索引、检索和激活团队的工程知识与 Skill 工件。

文档入口分工：

- `README.md` 给人读，负责项目概览、价值、快速开始和主要导航
- `AGENTS.md` 给 agent 读，负责任务路由、最小验证和回写要求
- `CLAUDE.md` 只作为 Claude Code 兼容入口，指向 `AGENTS.md`
- 文档分层与回写规则见 [`docs/guides/DOCUMENTATION_GOVERNANCE.md`](docs/guides/DOCUMENTATION_GOVERNANCE.md)

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

长期架构演进（Phase 0–4）：

- 唯一长期后端主线已冻结并落地为 `Nest host + framework-free domain core + gradual service extraction`
- `light` / `heavy` 只表示后端构建目标：`local-agent`、`team-monolith` -> `light`，`distributed` -> `heavy`
- `light` 默认主入口终局冻结为 `packages/host-local/src/nest/**`；旧 Fastify 轻宿主与 rollback 入口已删除
- 运行模型固定为 `embedded/local-agent -> team-monolith -> distributed` 三档；`embedded` 是 `local-agent` 的产品语义，不新增第四种 profile
- CLI 与 web-panel 继续只面向统一 gateway；HTTP / internal / event contract 分别统一收敛到 `packages/contracts`、`packages/backend-core` 和共享 async contract
- 当前 `distributed` 定位已冻结为 `Level 2 / transitional-microservice`，第一批成熟服务样板 `knowledge-write + governance-review` 已完成 closeout

当前主线（Agent Eval 平台长期可维护架构，进行中）：

- 主线入口见 [`plan.md`](plan.md) 与 [`docs/todos/agent-eval-framework-evaluation-and-plan.md`](docs/todos/agent-eval-framework-evaluation-and-plan.md)
- 当前唯一 active closeout 是真实 `Langfuse` 目标验证；当前 shell 仍缺 `LANGFUSE_BASE_URL`、`LANGFUSE_PUBLIC_KEY`、`LANGFUSE_SECRET_KEY`，因此该项仍属 environment-blocked
- 第二平台适配、平台化扩张和其余长期残留统一归入 [`docs/todos/open-debt-and-compromises.md`](docs/todos/open-debt-and-compromises.md)

服务发现与可观测性主线已完成代码与文档面收口，剩余 Grafana UI / 目标环境验证等历史残留已转入 debt register 跟踪：

- 健康探针已实现真实 readiness/liveness 语义：`/ready` 基于依赖状态返回 `503`，不再固定返回 `ready`
- 分布式动态发现已落地：`ConsulDiscoveryAdapter` + `DiscoveryResolver` + `CachedDiscovery` + `RoundRobinSelector`，`TRAPMAP_*_URL` 保留为显式 override 和 Consul 不可用时的 fallback

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
| [docs/operations/ENVIRONMENT.md](docs/operations/ENVIRONMENT.md) | 环境变量配置 |
| [docs/operations/OBSERVABILITY-OPERATIONS.md](docs/operations/OBSERVABILITY-OPERATIONS.md) | 可观测性运维指南 |
| [docs/architecture/OBSERVABILITY.md](docs/architecture/OBSERVABILITY.md) | 可观测性架构 |
| [docs/architecture/SERVICE-DISCOVERY.md](docs/architecture/SERVICE-DISCOVERY.md) | 服务发现架构 |
| [docs/reference/SYSTEM_TRUTH_SOURCES.md](docs/reference/SYSTEM_TRUTH_SOURCES.md) | 架构事实、入口文件与文档参考规则 |
| [docs/reference/REPO_STRUCTURE.md](docs/reference/REPO_STRUCTURE.md) | 仓库目录结构、文档分层、归档位置和生成目录规则 |

## 🚀 快速开始

### 1. 本地开发

```bash
pnpm install
cp .env.example .env
# 编辑 .env，至少填入 OPENAI_API_KEY 和 TRAPMAP_SYSTEM_ADMIN_KEY

pnpm dev -- local-agent
```

本地默认 gateway 监听 `http://127.0.0.1:4000`，其中 `local-agent` / `team-monolith` 映射到 `light` 并由 `@trapmap/host-local` 提供，`distributed` 映射到 `heavy` 并由 `@trapmap/host-distributed` 提供。

推荐使用统一分发入口：

```bash
pnpm dev -- local-agent         # 单用户、本地完整治理 gateway（Nest light mainline）
pnpm dev -- team-monolith       # 小团队/单实例完整 gateway（Nest light mainline）
pnpm dev -- gateway             # distributed gateway
pnpm dev -- candidate-worker    # distributed candidate worker
pnpm dev -- governance-worker   # distributed governance worker
pnpm dev -- outbox-worker       # distributed outbox worker
```

兼容别名 `pnpm dev:local-agent`、`pnpm dev:team-monolith`、`pnpm dev:distributed:*` 仍可用，但后续文档和脚本维护默认以 `pnpm dev -- <target>` 为准。可用 target 列表见 `pnpm dev -- --help`。

`light` 默认主入口：

```bash
pnpm dev -- local-agent
pnpm dev -- team-monolith
pnpm --filter @trapmap/host-local dev
pnpm --filter @trapmap/host-local start
```

`@trapmap/host-local` 的 closeout 验收路径固定为 `build -> start -> observability-benchmark`。`dev` 只保留给开发便利，不作为“本轮是否修复完成”的事实源；本轮 closeout 不包含 `@trapmap/server build` 的全量清障。

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

`local-agent` 不推荐走 compose；直接使用 `pnpm dev -- local-agent` 更符合单用户轻量模式。

`docker-compose.yml` 中的 `server` service 现在只是 service name，实际运行的是 `packages/host-local/Dockerfile` 构建出来的 `team-monolith` light host。`distributed` profile 改为运行 `packages/host-distributed/Dockerfile` 构建的 gateway/worker 入口；CLI 仍然只连 `TRAPMAP_GATEWAY_URL`。

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
pnpm --filter @trapmap/host-local build
pnpm --filter @trapmap/host-local start
pnpm test:observability-closeout
pnpm test:observability-benchmark -- --base-url http://127.0.0.1:4000
pnpm test:discovery-closeout
pnpm test:distributed-closeout
pnpm test:deployment-smoke
pnpm test:runtime-foundations
pnpm typecheck
pnpm check:docs-drift
```

评测脚手架入口：

```bash
pnpm eval -- smoke
pnpm eval -- core
pnpm eval -- agent-planning --tier smoke --dry-run
pnpm eval -- label-alignment --tier smoke --mode dry-run
```

兼容别名 `pnpm eval:smoke`、`pnpm eval:core`、`pnpm eval:agent-planning:dry-run`、`pnpm eval:label-alignment:dry-run` 仍可用，但后续命令组合优先通过 `pnpm eval -- <suite> ...` 统一表达。可用 suite 与 flags 见 `pnpm eval -- --help`。

## Vitest 使用要求

- 仓库根 `pnpm test` 是 workspace 级全量测试入口，会按根 [`vitest.config.ts`](vitest.config.ts) 同时加载多个 project；不要把它当成查看失败列表的轻量命令。
- 仓库内 `pnpm test` / 包级 `pnpm test` 已统一为非 watch 的一次性执行；需要交互式 watch 时请显式运行 `pnpm exec vitest` 或进入具体包后手动启动。
- 不要使用 `pnpm test 2>&1 | grep ...`、`pnpm test 2>&1 | tail ...`、`pnpm test 2>&1 | head ...` 这类管道命令筛失败。它们不会减少 Vitest 实际启动的 worker 数，只会在输出层截断结果，仍可能触发高并发多进程和 OOM。
- 单文件测试请使用 `pnpm test:file -- <repo-root-relative-test-path>`，例如 `pnpm test:file -- packages/server/src/lib/runtime/metrics.test.ts`。
- 单包定向测试请使用 `pnpm --filter @trapmap/server test --run <project-local-test-path>` 这类包级命令，避免在仓库根使用 basename 或过短路径过滤。
- 日常开发优先执行与改动直接相关的最小测试集合；仅在需要做全仓回归时再运行根级 `pnpm test`。

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
  "liveness": "up",
  "readiness": "ready",
  "dependencies": {},
  "snapshot": {},
  "uptime": 42
}
```

完整健康端点：

| 端点 | 用途 |
|------|------|
| `GET /health` | 综合健康状态 |
| `GET /ready` | 就绪探针（Kubernetes readiness） |
| `GET /live` | 存活探针（Kubernetes liveness） |
| `GET /metrics` | Prometheus 格式指标 |

## 📈 可观测性与服务发现

TrapMap 采用 LGTM 栈（Loki、Grafana、Tempo、Prometheus）+ OpenTelemetry 提供统一可观测性：

- **指标**：Prometheus 格式，暴露于 `/metrics`
- **日志**：结构化 JSON 日志，通过 OTel 或 Loki 采集
- **链路追踪**：OpenTelemetry SDK 采集，推送至 Tempo
- **Dashboard**：Grafana 预置 `config/grafana/provisioning/dashboards/trapmap-overview.json`
- **服务发现**：`distributed` profile 支持 Consul 服务注册与 DNS 发现

详细说明：

- [可观测性架构](docs/architecture/OBSERVABILITY.md)
- [服务发现架构](docs/architecture/SERVICE-DISCOVERY.md)
- [可观测性运维指南](docs/operations/OBSERVABILITY-OPERATIONS.md)

---

## 📁 项目结构

```
Trap-Map/
├── packages/
│   ├── client-core/      # 共享 gateway SDK
│   ├── backend-core/     # 宿主无关后端内核
│   ├── service-*/        # bounded-context service assembly（identity-access / knowledge-* / candidate / governance / job-runtime）
│   ├── host-local/       # local-agent / team-monolith 宿主
│   ├── host-distributed/ # distributed 宿主
│   ├── web-panel/        # 管理员 Web 运维面板
│   ├── cli/              # Commander.js CLI 客户端
│   ├── server/           # 迁移期兼容壳层
│   ├── contracts/        # 共享 Zod Schema
│   ├── runtime-infra/    # 共享 runtime 基础设施 seam：store/repos、async transport、AI provider
│   └── skills/           # 项目级 Skill 工作流（非 workspace 包）
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
