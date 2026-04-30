# TrapMap 包结构

本文档说明 TrapMap 各包的职责、接口和关键类型。

## 包概览

| 包 | 入口 | 职责 |
|----|------|------|
| `packages/cli` | `src/index.ts` | Commander.js CLI 客户端，用户交互终端入口 |
| `packages/server` | `src/index.ts` | Fastify API 服务器，业务逻辑编排 |
| `packages/contracts` | `src/index.ts` | 共享 Zod Schema 和 TypeScript 类型 |
| `packages/skills` | — | 项目 Skill 定义（占位符） |

---

## packages/contracts

共享 Schema 和类型定义，同时被 CLI 和 Server 导入。

### 导出域

| 域 | 文件 | 说明 |
|----|------|------|
| auth | `domain/auth.ts` | 登录、会话、访问密钥 Schema |
| team | `domain/team.ts` | 团队、成员 Schema |
| knowledge | `domain/knowledge.ts` | 知识条目生命周期 Schema |
| review | `domain/review.ts` | 审核决策 Schema |
| retrieval | `domain/retrieval.ts` | 检索查询/响应 Schema |
| operations | `domain/operations.ts` | 导入/导出 Schema |
| candidates | `domain/candidates.ts` | 异步摄取候选 Schema |
| artifacts | `domain/artifacts.ts` | Skill 工件 Schema |
| evals | `domain/evals/` | 评估相关 Schema |

### 关键类型

```typescript
// 检索响应
import { retrievalResponseSchema } from '@trapmap/contracts';

// 知识条目
import { knowledgeEntrySchema } from '@trapmap/contracts';

// 审核决策
import { reviewDecisionRequestSchema } from '@trapmap/contracts';
```

---

## packages/server

HTTP 路由、授权、持久化、审核编排、检索和审计记录。

### 路由模块

| 文件 | 端点前缀 | 说明 |
|------|----------|------|
| `routes/auth.ts` | `/v1/auth` | 认证 |
| `routes/teams.ts` | `/v1/teams` | 团队管理 |
| `routes/members.ts` | `/v1/members` | 成员管理 |
| `routes/knowledge.ts` | `/v1/knowledge` | 知识条目 CRUD |
| `routes/review.ts` | `/v1/knowledge/review` | 审核工作流 |
| `routes/retrieval.ts` | `/v1/retrieval` | 检索（v1/v2/v3） |
| `routes/operations.ts` | `/v1/operations` | 导入/导出 |
| `routes/candidates.ts` | `/v1/candidates` | 异步摄取 |
| `routes/traps.ts` | `/v1/traps` | Trap 管理 |
| `routes/skills.ts` | `/v1/skills` | Skill 管理 |

### 配置

```typescript
// src/config.ts
import { createServerConfig } from './lib/config.js';

const config = createServerConfig({
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '127.0.0.1',
  aiProvider: process.env.AI_PROVIDER ?? 'openai',
});
```

---

## packages/cli

命令行接口， imperative 命令格式，shell 友好输出，支持可选 JSON 模式。

### 命令模块

| 命令 | 文件 | 说明 |
|------|------|------|
| `auth` | `commands/auth.ts` | 登录/登出 |
| `team` | `commands/team.ts` | 团队管理 |
| `member` | `commands/member.ts` | 成员管理 |
| `knowledge` | `commands/knowledge.ts` | 知识提交/查询 |
| `review` | `commands/review.ts` | 审核操作 |
| `retrieval` | `commands/retrieval.ts` | 检索命令 |
| `operations` | `commands/operations.ts` | 导入/导出 |
| `audit` | `commands/audit.ts` | 审计日志 |
| `trap` | `commands/trap.ts` | Trap 管理 |
| `skill` | `commands/skill.ts` | Skill 管理 |

### 输出模式

```bash
# 人类可读输出（默认）
pnpm cli knowledge search "如何处理 N+1"

# JSON 模式（机器解析）
pnpm cli knowledge search "如何处理 N+1" --json
```

### 状态管理

```typescript
// src/lib/config.ts
import { loadCliState } from './lib/config.js';

const cliState = await loadCliState();
const session = cliState.session;
```

---

## packages/skills

当前为占位符目录，待后续用于存放项目级 Skill 定义。

---

## 跨包依赖关系

```
contracts (共享 Schema)
    ↑
   / \
  cli  server
```

- `contracts` 无依赖，作为共享基础
- `cli` 依赖 `contracts`，调用 `server` 的 HTTP API
- `server` 依赖 `contracts`，实现业务逻辑
