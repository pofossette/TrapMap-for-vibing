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
持久层（存储抽象，支持 JSON 文件和 PostgreSQL）
```

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

当前阶段的明确非目标：

- 不做 MCP 协议。
- CLI 不直连多个后端服务，正式接入面保持 `gateway only`。
- 第一阶段不按服务拆分数据库。
- 不把 Kafka、NATS、Redis Streams 作为默认基础设施。

## 持久化基线

Round 0 已冻结数据库演进方向，后续轮次必须遵守以下边界：

- PostgreSQL 是目标唯一业务事实源，结构化主表优先于单行 `JSONB` 快照。
- `store_snapshot` 仅保留给尚未迁移的兼容域，不能再承接新的核心业务主路径。
- `DualWrite*Repository` 这类双写真相仅允许作为短期迁移策略，必须带明确删除轮次。
- 检索索引、capsule、profile、manifest、usage 统计属于派生层，不是业务真相来源。

当前状态：

- 知识、技能工件、候选、身份、审计、任务队列已切到 PostgreSQL 主路径。
- `store_snapshot` 仅保留为兼容层，用于尚未迁移的辅助域，以及少量启动恢复/运维路径；业务主读写边界以 `app.skillShareer.repos` 为准。
- 所有正式 DDL 目标应由 Drizzle migration 管理，不再通过 repository 运行时建表兜底。

**关键设计原则：**
- 存储接口抽象（`JsonStore` 用于开发/测试，`PostgresStore` 用于生产）
- AI 提供商抽象（支持 OpenAI、OpenAI 兼容接口、Ollama、Google GenAI）
- 检索管道多模式（语义检索 / 关键词检索 / 图增强检索）
- 异步摄取管道（候选提交 → 去重检测 → 人工裁定）

## 包结构

| 包 | 职责 |
|----|------|
| `packages/client-core` | 共享 gateway 访问层，供 CLI 与未来 Web 面板复用 |
| `packages/cli` | Commander.js CLI 客户端，所有用户交互的终端入口 |
| `packages/backend-core` | 宿主无关的后端核心内核、运行时能力模型与端口定义 |
| `packages/host-local` | `local-agent` / `team-monolith` 轻量宿主装配 |
| `packages/host-distributed` | `distributed` 重型宿主装配 |
| `packages/server` | 迁移期兼容壳层与既有实现面 |
| `packages/contracts` | 共享 Zod Schema 和 TypeScript 类型定义 |
| `packages/skills` | 项目级 Skill 定义 |
| `evals/` | 检索和摘要评估系统 |

## 文档导航

> **说明**：本文档为架构简洁概览。完整架构文档（包含模块详解、流程图、技术细节）请参阅下方链接。

**[docs/architecture/ARCHITECTURE.md](./docs/architecture/ARCHITECTURE.md)** — 完整架构文档

其他架构文档：

- [docs/architecture/API.md](./docs/architecture/API.md) — API 端点详解
- [docs/architecture/CLI.md](./docs/architecture/CLI.md) — CLI 命令详解
- [docs/architecture/DEPLOYMENT.md](./docs/architecture/DEPLOYMENT.md) — 部署指南
- [docs/architecture/FLOW.md](./docs/architecture/FLOW.md) — 系统流程图
- [docs/architecture/MODULES.md](./docs/architecture/MODULES.md) — 模块划分详解
- [docs/architecture/TROUBLESHOOTING.md](./docs/architecture/TROUBLESHOOTING.md) — 故障排查

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
