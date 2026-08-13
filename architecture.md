# TrapMap 系统架构

## 项目概述

TrapMap 是一个面向软件团队的知识共享平台，用于捕获、检索和复用工程经验（"陷阱"与"技能"）。系统同时服务于人类开发者和 AI 代理，通过终端 CLI 提供友好的交互接口。

## 核心架构

TrapMap 采用四层架构设计：

```
表现层（CLI / HTTP 客户端）
    ↓
路由层（薄层，仅做请求分发）
    ↓
业务逻辑层（AI 抽象、权限、检索、索引）
    ↓
持久层（PostgreSQL 主路径）
```

路由层由 `packages/backend-core/src/http/route-contract.ts` 的框架中立 `RouteDef` 契约承载：各 service 包以 `create<X>RouteDefs(deps)` 声明路由，host-local（Nest）与 host-distributed（Fastify gateway）经 `createNestAdapter` / `createFastifyAdapter` 消费同一份 RouteDef，宿主内不手写重复路由实现。业务规则沉淀在 `backend-core/<context>/domain/` 纯函数层，infrastructure 不新增业务判断。

## 部署基线

TrapMap 当前把部署语义拆成几层，后续文档与实现都应按这组词汇区分：

- `deployment profile`：产品/部署目标形态。当前活跃计划冻结为 `local-agent`、`team-monolith`、`distributed`。
- `deployment preset`：启动快捷方式与兼容输入。当前代码已实现 `monolith`、`api`、`candidate-worker`、`governance-worker`、`outbox-worker`。
- `runtimeMode`：当前进程运行角色，区分 `api`、`task-worker`、`outbox-worker`、`combined`。
- `serviceUnit`：当前进程拥有的异步工作边界，区分 `full-platform`、`candidate-ingestion`、`knowledge-governance`。
- `task transport`：任务投递介质。当前正式支持 `postgres`，可选支持 `rabbitmq`。

当前状态与目标状态需要明确区分：

- 已实现的是 `deployment preset -> runtimeMode/serviceUnit` 这层运行时语义。
- `local-agent`、`team-monolith`、`distributed` 现在已经作为正式 profile 入口落到根脚本与宿主装配中；底层运行时兼容语义仍继续复用 `preset + runtimeMode + serviceUnit`。
- `light` / `heavy` 是 build target 视角：`local-agent`、`team-monolith` -> `light`，`distributed` -> `heavy`。

当前阶段的明确非目标：

- 不做 MCP 协议。
- CLI 不直连多个后端服务，正式接入面保持 `gateway only`。
- 第一阶段不按服务拆分数据库。
- 不把 Kafka、NATS、Redis Streams 作为默认基础设施。

## 持久化基线

Round 0 已冻结数据库演进方向，后续轮次必须遵守以下边界：

- PostgreSQL 是唯一业务事实源，结构化主表优先于单行 `JSONB` 快照。
- 兼容层（`store_snapshot` / `JsonStore` / `PostgresStore`）已于 Wave-9 删除；`DualWrite*Repository` 这类双写真相仅允许作为短期迁移策略，必须带明确删除轮次。
- 检索索引、capsule、profile、manifest、usage 统计属于派生层，不是业务真相来源。

当前状态：

- 知识、技能工件、候选、身份、审计、任务队列已切到 PostgreSQL 主路径。
- 所有正式 DDL 目标应由 Drizzle migration 管理，不再通过 repository 运行时建表兜底。
- 权威的迁移状态与 schema 事实见 [`docs/reference/DATA_MODEL.md`](docs/reference/DATA_MODEL.md) 与 [`docs/reference/DATABASE_SCHEMA.md`](docs/reference/DATABASE_SCHEMA.md)。

**关键设计原则：**
- AI 提供商抽象（支持 OpenAI、OpenAI 兼容接口、Ollama、Google GenAI）
- 检索管道多模式（语义检索 / 关键词检索 / 图增强检索）
- 异步摄取管道（候选提交 → 去重检测 → 人工裁定）

## 包结构

| 包 | 职责 |
|----|------|
| `packages/client-core` | 共享 gateway 访问层，供 CLI 与未来 Web 面板复用 |
| `packages/cli` | Commander.js CLI 客户端，所有用户交互的终端入口 |
| `packages/backend-core` | 宿主无关的后端核心内核：六个 context 的纯 `domain/` 规则层、application/ports/use-cases，以及 `http/` 框架中立 RouteDef 路由契约与 Nest/Fastify 双 adapter |
| `packages/host-local` | `local-agent` / `team-monolith` 的 `light` 宿主装配；默认主入口为 `src/nest/**`，经 `createNestAdapter` 消费 RouteDefs |
| `packages/host-distributed` | `distributed` 的 `heavy` 重型宿主装配；gateway 为薄传输层，经 `createFastifyAdapter` 消费 RouteDefs |
| `packages/server` | **已删除**（Wave-10）。历史证据见 `docs/archived/archived-plans/compatibility-shell-retirement-runtime-infra-ownership.md` |
| `packages/contracts` | 共享 Zod Schema 和 TypeScript 类型定义 |
| `packages/service-*` | bounded-context service assembly：identity-access、knowledge-read/write、candidate-ingestion、governance-review、job-runtime；各自以 `create<X>RouteDefs` 声明路由，pg-ports 只留 SQL+行映射 |
| `packages/web-panel` | 管理员浏览器运维面板，继续只面向 gateway surface |
| `packages/skills` | 项目级 Skill 定义 |
| `evals/` | 检索和摘要评估系统 |

## Phase 0 冻结的长期宿主目标

- 唯一长期后端主线固定为 `Nest host + framework-free domain core + gradual service extraction`。
- `packages/host-local/src/nest/**` 是冻结后的 `light` 默认主入口；`packages/server`（Wave-10 已删除）与旧 Fastify 路径不再存在。
- 运行模型固定为 `embedded/local-agent -> team-monolith -> distributed` 三档；`embedded` 是当前 `local-agent` 的产品语义，不新增第四种常驻 profile。
- gateway 继续是宿主拥有的统一外部适配层；当前主线不创建 `packages/service-gateway`。
- `distributed` 当前成熟度冻结为 `Level 2 / transitional-microservice`。

## 文档导航

> **说明**：本文档为架构简洁概览。完整架构文档（包含模块详解、流程图、技术细节）请参阅下方链接。

**[docs/architecture/ARCHITECTURE.md](./docs/architecture/ARCHITECTURE.md)** — 完整架构文档

其他架构文档：

- [docs/architecture/API.md（已归档）](./docs/archived/architecture/API.md) — API 端点详解
- [docs/architecture/CLI.md](./docs/architecture/CLI.md) — CLI 命令详解
- [docs/architecture/DEPLOYMENT.md](./docs/architecture/DEPLOYMENT.md) — 部署指南
- [docs/architecture/FLOW.md（已归档）](./docs/archived/architecture/FLOW.md) — 系统流程图
- [docs/architecture/MODULES.md（已归档）](./docs/archived/architecture/MODULES.md) — 模块划分详解
- [docs/architecture/TROUBLESHOOTING.md（已归档）](./docs/archived/architecture/TROUBLESHOOTING.md) — 故障排查

## 数据模型概览

核心实体：

- **Team（团队）** — 成员容器，具有名称和 slug
- **Member（成员）** — 属于某个团队，具有角色模板（user/admin/system-admin）和安全等级
- **KnowledgeEntry（知识条目）** — 可检索的知识单元，具有生命周期状态（draft/submitted/approved/rejected 等）
- **SkillArtifact（技能工件）** — 技能目录形式的知识，具有版本历史和派生产物（Profile、Capsule、Manifest）
- **AccessKey（访问密钥）** — 成员的身份凭证

详细数据模型请参阅 [docs/reference/DATA_MODEL.md](./docs/reference/DATA_MODEL.md)。

## 版本

当前版本：**v0.1.0**
