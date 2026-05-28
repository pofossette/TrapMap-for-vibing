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

## 持久化基线

Round 0 已冻结数据库演进方向，后续轮次必须遵守以下边界：

- PostgreSQL 是目标唯一业务事实源，结构化主表优先于单行 `JSONB` 快照。
- `store_snapshot` 仅保留给尚未迁移的兼容域，不能再承接新的核心业务主路径。
- `DualWrite*Repository` 这类双写真相仅允许作为短期迁移策略，必须带明确删除轮次。
- 检索索引、capsule、profile、manifest、usage 统计属于派生层，不是业务真相来源。

当前状态：

- 知识、技能工件、候选、任务队列已切到 PostgreSQL 主路径。
- 用户、团队、成员、会话、访问密钥等域仍通过 `SkillShareerStore` / `store_snapshot` 兼容层运行。
- 所有正式 DDL 目标应由 Drizzle migration 管理，不再通过 repository 运行时建表兜底。

**关键设计原则：**
- 存储接口抽象（`JsonStore` 用于开发/测试，`PostgresStore` 用于生产）
- AI 提供商抽象（支持 OpenAI、OpenAI 兼容接口、Ollama、Google GenAI）
- 检索管道多模式（语义检索 / 关键词检索 / 图增强检索）
- 异步摄取管道（候选提交 → 去重检测 → 人工裁定）

## 包结构

| 包 | 职责 |
|----|------|
| `packages/cli` | Commander.js CLI 客户端，所有用户交互的终端入口 |
| `packages/server` | Fastify API 服务器，业务逻辑编排 |
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
