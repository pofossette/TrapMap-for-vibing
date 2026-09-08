# `@trapmap/host-distributed`

你用这个库包组装分布式宿主的进程启动、运行时连线与内部 HTTP 传输，可执行入口在 `@trapmap/app-distributed`。

## 入口

| 子路径 | 内容 |
| --- | --- |
| `@trapmap/host-distributed` | 主入口 |
| `@trapmap/host-distributed/migrate.js` | `runDistributedMigrations()`，供 `@trapmap/app-migration` 调用 |
| `@trapmap/host-distributed/config`（`*.js` 通配） | 配置解析 |
| `@trapmap/host-distributed/gateway`（`*.js` 通配） | 对外网关（认证、路由、指标） |
| `@trapmap/host-distributed/shared`（`*.js` 通配） | 共享传输与工具 |
| `@trapmap/host-distributed/identity-access` 等 6 组上下文子路径 | 各服务的 `start<X>Service()` |

服务端口划分：网关 `4000`，`identity-access` `4001`，`knowledge-read` `4002`，`knowledge-write` `4003`，`candidate-ingestion` `4004`，`governance-review` `4005`，`job-runtime` `4006`。

```bash
pnpm --filter @trapmap/app-distributed dev:gateway
pnpm --filter @trapmap/app-distributed start -- --service gateway
```

## 行为

消费方只允许经本包 `package.json` exports 子路径导入。本包承载服务实现、路由、DB 端口与配置解析，进程装配（`--service` 分发、信号处理）归组装中心。`cron-scheduler` 经 `./cron-scheduler/*.js` 具名导出（`startCronService`，`server.ts` 内 `scheduler.run()`/`stop()` 启停），监听形态待确认（2026-09-08）。

网关端点面（全量定义见 `src/gateway/route-defs/`，`candidate.ts`/`governance.ts`/`knowledge.ts`/`job.ts`/`cron.ts`/`identity.ts`）：

| 方法+路径 | 用途/落点 |
| --- | --- |
| `GET /health`、`/live`、`/ready`、`GET /metrics` | 存活/就绪探针与 Prometheus 指标 |
| `POST /v1/auth/login`、`/v1/auth/logout` | 登录发 token、登出失效 |
| `POST /v1/teams`、`GET /v1/teams`、`POST /v1/teams/select` | 建团队、列团队、选活跃团队 |
| `POST /v1/knowledge`、`GET /v1/knowledge/mine`、`/:entryId` | 提条目、列我的条目、取单条 |
| `POST /v1/retrieval/search`、`/v3/retrieval/search` | 检索搜索及 v3 别名 |
| `POST /v1/candidates`、`/:candidateId/resolution`、`/manual-result` | 提候选、决议、人工结果 |
| `POST /v1/knowledge/review`、`/maintenance`、`/decay`、`POST /v1/feedback` | 审核/维护/衰减决策与反馈提交 |
| `POST /v1/jobs`、`GET /v1/jobs/:jobId`、`/queue`、`GET /v1/operations/status/async` | 调度任务、查状态、队列快照 |
| `GET/POST /v1/cron/jobs…`、`/:jobId/trigger` | cron 任务增删查改与手动触发 |
| `POST /v1/operations/artifacts/*`、`GET …/review-queue` | 工件导入导出与审核队列 |

内部服务 URL（`service-config.ts`，本地 `localhost` / distributed 为 Docker DNS 名）：`TRAPMAP_GATEWAY_URL`（4000）、`TRAPMAP_IDENTITY_ACCESS_URL`（4001）、`TRAPMAP_KNOWLEDGE_READ_URL`（4002）、`TRAPMAP_KNOWLEDGE_WRITE_URL`（4003）、`TRAPMAP_CANDIDATE_INGESTION_URL`（4004）、`TRAPMAP_GOVERNANCE_REVIEW_URL`（4005）、`TRAPMAP_JOB_RUNTIME_URL`（4006）。

## 常见用法

### 起网关与单个服务（开发）

```bash
pnpm --filter @trapmap/app-distributed dev:gateway
pnpm --filter @trapmap/app-distributed dev:candidate-ingestion
```

脚本名以 `apps/distributed/package.json` 为准。网关占 `4000`，各服务端口见上文端口划分。

### 跑 acceptance 门

```bash
pnpm --filter @trapmap/host-distributed test:acceptance
```

这条验证真实 HTTP owner hop、correlation、错误分类与幂等 replay。你改权威写路径或 job ownership 时必跑。
