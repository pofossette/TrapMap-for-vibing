# 运行时重组迁移指南

## 状态

- 状态：`active`
- 创建日期：`2026-06-18`
- 目标：从遗留的 `cli + server` 形态迁移到 `client-core + backend-core + hosts` 架构

## 概述

运行时重组将 TrapMap 从单体的 `CLI + Server` 布局转变为模块化组装：

```text
packages/
├── client-core/       共享网关传输层
├── backend-core/      宿主无关的后端内核
├── service-knowledge-read/ 第一个读侧服务包，负责检索与读投影组装
├── service-knowledge-write/ 第一个已实现的服务包，负责权威知识写入
├── service-governance-review/ 第二个已实现的服务包，负责审查与反馈组装
├── service-candidate-ingestion/ 第三个已实现的服务包，负责候选权威组装
├── service-identity-access/ 第四个已实现的服务包，负责身份/访问组装
├── service-job-runtime/ 第五个已实现的服务包，负责运行时队列/状态组装
├── host-local/        轻量宿主，用于 local-agent / team-monolith
├── host-distributed/  重量宿主，用于 distributed 部署模式
├── cli/               仅包含 CLI 逻辑，消费 client-core
├── server/            兼容外壳 / 遗留实现层
├── contracts/         共享类型与 schema
└── skills/            技能制品
```

## 完成度审计

- 阶段 1 `client-core`：已完成。CLI 传输层已抽取，CLI 现在通过 `@trapmap/client-core` 与网关通信。
- 阶段 2 `backend-core`：已完成。运行时能力模型、端口、调用接缝以及有界上下文模块均存在于 `@trapmap/backend-core`。
- 阶段 3 `host-local`：已完成。根目录的 `pnpm dev:local-agent` 和 `pnpm dev:team-monolith` 现在指向 `@trapmap/host-local`。
- 阶段 4 `host-distributed`：已完成。根目录的分布式开发脚本现在指向 `@trapmap/host-distributed`。
- 阶段 5 遗留收口：部分完成。`packages/server（Wave-10 已删除）` 仍作为兼容外壳和验证层存在。在分布式模式下，candidate/review/maintenance/decay 的权威写入已迁移到 `@trapmap/host-distributed`；在 `light` 侧，默认的 `@trapmap/host-local` Nest 主线现在拥有 candidate/review 写入，而显式回滚路径仅保留已退役的兼容行为以及运行时/状态接缝。
- 阶段 6 物理拆分执行：进行中。当前仓库已落地 6 个 `service-*` 包：`@trapmap/service-knowledge-read`、`@trapmap/service-knowledge-write`、`@trapmap/service-governance-review`、`@trapmap/service-candidate-ingestion`、`@trapmap/service-identity-access`、`@trapmap/service-job-runtime`；`@trapmap/host-distributed` 以宿主装配层的方式消费这些服务包，`packages/server（Wave-10 已删除）` 不再持有 `knowledge-write`、`governance-review`、`candidate-ingestion`、`identity-access` 或 `job-runtime` 组装的权威事实。

## 当前官方入口点

请优先使用以下根目录脚本：

```bash
pnpm dev:local-agent
pnpm dev:team-monolith
pnpm dev:distributed:gateway
pnpm dev:distributed:candidate-worker
pnpm dev:distributed:governance-worker
pnpm dev:distributed:outbox-worker
pnpm dev:cli
```

旧的 `pnpm dev:server:compat*` 入口已经不再存在；兼容壳相关验证应改看当前 `packages/server（Wave-10 已删除）` 的运行时/状态接缝与现有根命令表面。
显式的 `local-agent` / `team-monolith` 根脚本仍存在，但它们已经转发到当前 `@trapmap/host-local` 主线，而不是旧兼容宿主。

## 环境兼容性

### 网关

- 默认本地网关 URL 仍为 `http://127.0.0.1:4000`
- `@trapmap/host-local` 现在默认 `PORT=4000`
- `@trapmap/host-distributed` 服务端口默认为 `4000-4006`

### 数据库 URL

新宿主同时接受以下两种变量：

- `DATABASE_URL`
- `TRAPMAP_DATABASE_URL`

每个服务的分布式覆盖变量仍为：

- `TRAPMAP_SERVICE_DATABASE_URL`

这保证了现有 `.env` 文件和大部分当前文档在迁移期间继续正常工作。

## Host-Local

最小本地用法：

```bash
TRAPMAP_DEPLOYMENT_PROFILE=local-agent pnpm --filter @trapmap/host-local dev
TRAPMAP_DEPLOYMENT_PROFILE=team-monolith pnpm --filter @trapmap/host-local dev
```

验证：

```bash
curl http://127.0.0.1:4000/health
curl http://127.0.0.1:4000/ready
```

相关环境变量：

```bash
TRAPMAP_DEPLOYMENT_PROFILE=local-agent|team-monolith
PORT=4000
HOST=0.0.0.0
LOG_LEVEL=info
TRAPMAP_DATABASE_URL=postgresql://...
# 或 DATABASE_URL=postgresql://...
TRAPMAP_DEPLOYMENT_PRESET=monolith
TRAPMAP_SERVICE_UNIT=full-platform
```

## Host-Distributed

开发命令：

```bash
pnpm --filter @trapmap/host-distributed dev:gateway
pnpm --filter @trapmap/host-distributed dev:identity-access
pnpm --filter @trapmap/host-distributed dev:knowledge-read
pnpm --filter @trapmap/host-distributed dev:knowledge-write
pnpm --filter @trapmap/host-distributed dev:candidate-ingestion
pnpm --filter @trapmap/host-distributed dev:governance-review
pnpm --filter @trapmap/host-distributed dev:job-runtime
```

验收说明：`@trapmap/host-distributed` 现在在多进程验收流程中消费全部 6 个已实现服务包的构建产物。如果你不使用打包好的 `test:distributed-acceptance` 入口，请在独立 `tsx` 驱动的分布式验收之前依次运行 `pnpm --filter @trapmap/service-identity-access build`、`pnpm --filter @trapmap/service-knowledge-read build`、`pnpm --filter @trapmap/service-knowledge-write build`、`pnpm --filter @trapmap/service-governance-review build`、`pnpm --filter @trapmap/service-candidate-ingestion build` 和 `pnpm --filter @trapmap/service-job-runtime build`。

验证：

```bash
curl http://127.0.0.1:4000/health
curl http://127.0.0.1:4001/health
curl http://127.0.0.1:4002/health
curl http://127.0.0.1:4003/health
curl http://127.0.0.1:4004/health
curl http://127.0.0.1:4005/health
curl http://127.0.0.1:4006/health
```

相关环境变量：

```bash
TRAPMAP_SERVICE_NAME=gateway|identity-access|knowledge-read|knowledge-write|candidate-ingestion|governance-review|job-runtime
TRAPMAP_SERVICE_PORT=4000
TRAPMAP_SERVICE_DATABASE_URL=postgresql://...
TRAPMAP_GATEWAY_URL=http://127.0.0.1:4000
TRAPMAP_IDENTITY_ACCESS_URL=http://127.0.0.1:4001
TRAPMAP_KNOWLEDGE_READ_URL=http://127.0.0.1:4002
TRAPMAP_KNOWLEDGE_WRITE_URL=http://127.0.0.1:4003
TRAPMAP_CANDIDATE_INGESTION_URL=http://127.0.0.1:4004
TRAPMAP_GOVERNANCE_REVIEW_URL=http://127.0.0.1:4005
TRAPMAP_JOB_RUNTIME_URL=http://127.0.0.1:4006
```

## 验证

此迁移线路的最小检查项：

```bash
pnpm test:distributed-acceptance
pnpm test:runtime-closeout
pnpm typecheck
pnpm test
pnpm test:deployment-smoke
pnpm test:runtime-foundations
pnpm check:docs-drift
```

微服务拆分就绪度采用更严格的运维门控。在启动物理拆分之前，请运行 [MICROSERVICE_SPLIT_ACCEPTANCE_CHECKLIST.md](./MICROSERVICE_SPLIT_ACCEPTANCE_CHECKLIST.md) 中的检查清单。

对于分布式拆分就绪度，将 `pnpm test:distributed-acceptance` 视为 Gate 2 / Gate 3 / Gate 5 的默认自动化门控。它是 `@trapmap/host-distributed` 拥有写入转发路径、在真实内部 HTTP 跨进程中保留认证/错误语义、以及通过网关表面暴露 job-runtime 所有权的权威自动化证明。

就绪度现已进入 6 个物理拆分的执行阶段：`knowledge-read`、`knowledge-write`、`governance-review`、`candidate-ingestion`、`identity-access`、`job-runtime` 都已经拥有专用 `service-*` 包，并继续保留仅网关外部访问模型和共享 PostgreSQL 部署方式。

此门控现在包含 `packages/host-distributed/src/gateway/distributed-runtime-closeout.test.ts`，它启动多个独立的 Node 进程分别运行 gateway、identity-access、candidate-ingestion、governance-review、knowledge-write 和 job-runtime。该 closeout 覆盖：

- `gateway -> 内部服务 -> knowledge-write` 多进程权威写入闭环
- 跨进程 `x-request-id` / `x-trace-id` 传播及仅网关认证验证
- 稳定的 `403 / 404 / 409 / 503 / 504` 故障映射，CLI 不感知内部拓扑
- 针对 job-runtime stale-running reclaim 的聚焦验证，通过分布式网关路径
- 针对同一运行时表面的 outbox 可重试失败、死信队列及 stale-processing reclaim 的聚焦验证

运维级 closeout 现在有独立的固定入口：

```bash
pnpm test:runtime-closeout
```

在 `docker compose --profile distributed up -d` 或等效的已部署运行时之后针对实时分布式网关运行。它验证现有的 `/v1/operations/status/async` 契约，而非引入并行的调试表面。

## 剩余差距

- `packages/server（Wave-10 已删除）` 仍存在，用于检索、运行时状态/就绪检查以及遗留兼容。它不再拥有分布式模式下 maintenance/decay 的权威写入，但 candidate/review 遗留写入编排仍在当前默认的 Fastify 路径上。
- `packages/server（Wave-10 已删除）` 也不再拥有 `knowledge-write` 或 `governance-review` 服务组装。这些组装现在位于 `packages/service-knowledge-write` 和 `packages/service-governance-review`，由 `host-distributed` 直接消费。
- 系统真相文档仍需持续收紧，使 host-local / host-distributed 在所有地方成为一等运行时事实，而不仅仅在本指南中。
- 分布式宿主现在在远程写入所有权和请求语义方面拥有更强的验收证据。任何剩余的 Gate 5 差距现在必须仅作为具体的 docker/已部署运维 closeout 问题来表述，而非读侧不成熟或分布式写入路径歧义。
