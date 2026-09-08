# TrapMap 代码导读

> 状态：Active。你按本页顺序读，能用最少的文件数摸到系统骨架。

## 建议阅读顺序

```text
contracts → hosts + service owners → cli → evals
```

你先吃透数据契约，再看宿主如何组装服务，最后看客户端与评测如何消费网关。

## 1. 共享契约层：`packages/contracts`

入口是 `packages/contracts/src/index.ts`。跨包类型与 Zod schema 的唯一来源，CLI 与服务端都从这里 import，保证两端一致。

### 先读这几个领域文件

| 文件 | 内容 |
|------|------|
| `packages/contracts/src/domain/common.ts` | 基础类型与分页查询 |
| `packages/contracts/src/domain/auth.ts` | 登录、会话、访问密钥 |
| `packages/contracts/src/domain/candidates.ts` | 异步摄取管道的候选条目 |
| `packages/contracts/src/domain/artifacts.ts` | Skill 工件（capsule、profile、manifest） |
| `packages/contracts/src/domain/artifact-ports.ts` | 工件读取投影契约 |
| `packages/contracts/src/domain/health.ts` | 健康快照契约 |
| `packages/contracts/src/domain/observability.ts` | correlation key、metric 命名、failure taxonomy 的冻结入口 |

`packages/contracts/src/domain/` 下还有团队、检索、评测等 schema，你用到时再展开。契约一改，两端与评测同时受影响。

## 2. 服务端：宿主加六个 service owner

`packages/server/` 兼容壳已于 2026-07-31 删除。服务端由两层构成：宿主负责组装与进程形态，owner 包负责领域真相。

### 2.1 宿主入口

| 宿主 | 位置 | 覆盖形态 |
|------|------|----------|
| `@trapmap/host-local` | `packages/host-local/src/nest/` | `local-agent`、`team-monolith` |
| `@trapmap/host-distributed` | `packages/host-distributed/src/` | `distributed` 网关与 workers |

`packages/host-local/src/nest/` 下按能力面分子目录（`gateway`、`identity-access`、`candidate-ingestion`、`governance-review`、`job-runtime`、`cron`、`health`、`config`）。启动配置走 `packages/host-local/src/nest/config/config.ts`，distributed 侧走 `packages/host-distributed/src/config/service-config.ts`。环境变量全表在 `docs/reference/ENVIRONMENT.md`。

### 2.2 六个 service owner 包

| 包 | 领域 |
|----|------|
| `packages/service-identity-access/` | 认证、用户、团队 |
| `packages/service-knowledge-write/` | 知识与工件写入 |
| `packages/service-knowledge-read/` | 检索与图查询读侧 |
| `packages/service-candidate-ingestion/` | 候选处理管道 |
| `packages/service-governance-review/` | 治理、审核、反馈 |
| `packages/service-job-runtime/` | 任务队列与 outbox |

Schema 真源在 `packages/db/src/schema/`（42 张 `pgTable`，以 `pnpm check:table-schema` 实测为准）。service 包里不直接定义表，只 re-export `@trapmap/db`，守卫是 `pnpm check:pgtable-single-source`。

### 2.3 AI 与存储接缝

AI provider 配置走 `packages/ai-providers/src/provider-config.ts`，提示词槽位走 `packages/ai-providers/src/prompt-builder.ts`。Embedding 可以与 chat 走不同提供商，变量见 `docs/reference/ENVIRONMENT.md` 的 AI 一节。持久化走各 owner 的 repository，经 PostgreSQL 落库；JSON 文件存储只剩 `local-agent` 兼容回退。

## 3. 客户端：`apps/cli`

入口是 `apps/cli/src/index.ts`。命令按文件注册在 `apps/cli/src/commands/`（`knowledge.ts`、`retrieval.ts`、`review.ts`、`member.ts`、`audit.ts` 等），基础设施在 `apps/cli/src/lib/`：

| 文件 | 职责 |
|------|------|
| `apps/cli/src/lib/config.ts` | 会话、网关地址、输出格式的本地状态 |
| `apps/cli/src/lib/http.ts` | 认证头注入与错误处理 |
| `apps/cli/src/lib/output.ts` | 表格、JSON、ANSI 输出 |
| `apps/cli/src/lib/sanitize.ts` | `stripNewlines`、`stripAnsi`、`sanitizeForDisplay`，挡格式化注入 |
| `apps/cli/src/lib/activation-policy.ts` | Skill 激活四态策略的客户端收紧 |
| `apps/cli/src/lib/artifact-bundle.ts` | 工件拉取与本地物化 |

CLI 是网关的薄包装，核心逻辑全在服务端。你读 CLI 只看交互流程与 API 调用形状。

## 4. 评估系统：`evals/`

统一入口是 `evals/scripts/eval-all.ts`（`eval:smoke`、`eval:core` 经它分发），CI 基线对比入口是 `evals/scripts/eval-ci.ts`（`eval:ci`、`eval:ci:core`）。各 suite 的 `run.ts`（`evals/retrieval/run.ts`、`evals/summary/run.ts` 等）只管本域数据集与判定。快照 parity 在 `evals/promptfoo/parity-*.test.ts`，对照 `evals/promptfoo/snapshots/`。跑法与结果读法见 `docs/operations/TESTING.md`。

## 5. 安全模型要点

SecurityLevel 是 0 到 10 的整数，用户等级大于等于条目等级才能访问。RBAC 权限、`audit:read`、生命周期流转见 `docs/operations/SECURITY.md`。

## 6. 配置入口速查

| 场景 | 文件 |
|------|------|
| 环境变量真相表 | `docs/reference/ENVIRONMENT.md` |
| 服务配置 | `packages/host-local/src/nest/config/config.ts`、`packages/host-distributed/src/config/service-config.ts` |
| CLI 状态 | `apps/cli/src/lib/config.ts` |
| TypeScript | `tsconfig.base.json` |
| 代码规范 | `biome.json` |
| 测试 | `vitest.config.ts` |
| 部署拓扑 | `docker-compose.yml` |
| workspace | `pnpm-workspace.yaml` |

包内导航看各包 README 与 `docs/PACKAGES.md`。

## 常见用法

下面按目录给上手顺序：入口文件加阅读顺序加第一条命令。权威细节只在各包 README 与 `docs/reference/` 里维护，这里只给导航。

### packages/backend-core

入口：`packages/backend-core/src/index.ts`。你先读 `packages/backend-core/src/ports/`（端口形状），再读 `packages/backend-core/src/runtime/`（能力模型与路由表面），最后按需进六个限界上下文目录。第一条命令：

```bash
pnpm --filter @trapmap/backend-core typecheck
pnpm --filter @trapmap/backend-core test
```

### packages/contracts

入口：`packages/contracts/src/index.ts`。你先读 `packages/contracts/src/domain/common.ts`，再读你负责领域的 schema 文件，最后看 `packages/contracts/src/enum-types/`。第一条命令：

```bash
pnpm --filter @trapmap/contracts test --run
```

### packages/db

入口：`packages/db/src/index.ts`。你先读 `packages/db/src/schema/`（表定义），再读 `packages/db/src/client.ts`（`createDb`），最后读 `packages/db/src/migrate.ts`（`runMigrations`）。第一条命令：

```bash
pnpm --filter @trapmap/db typecheck
pnpm check:table-schema
```

### packages/host-local

入口：`packages/host-local/src/index.ts`（`start()`）。你先读 `packages/host-local/src/nest/config/config.ts`（配置），再读 `packages/host-local/src/nest/gateway/`（路由组装），最后按能力面进其他子目录。第一条命令：

```bash
pnpm --filter @trapmap/host-local test
```

### packages/host-distributed

入口：`packages/host-distributed/src/index.ts`，进程分发见 `packages/host-distributed/src/runner.ts`。你先读 `packages/host-distributed/src/config/service-config.ts`（配置），再读 `packages/host-distributed/src/gateway/`（网关），最后进你负责的服务目录。第一条命令：

```bash
pnpm --filter @trapmap/host-distributed test
```

### apps/cli

入口：`apps/cli/src/index.ts`。你先读 `apps/cli/src/lib/config.ts` 与 `apps/cli/src/lib/http.ts`（状态与传输），再读 `apps/cli/src/commands/` 下你关心的命令文件。第一条命令：

```bash
pnpm --filter @trapmap/cli dev -- --help
```
