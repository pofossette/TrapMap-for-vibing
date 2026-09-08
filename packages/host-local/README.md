# `@trapmap/host-local`

你用这个库包以单个 NestJS（Fastify）进程承载全平台，它是 `light` 宿主的唯一实现，可执行入口在 `@trapmap/app-light`。

## 入口

主入口为 `packages/host-local/src/index.ts`，导出 `start()`（`{ host, port }` 入参，返回带 `close()` 的句柄），Nest 装配见 `packages/host-local/src/nest/`（冻结默认主线）。`packages/host-local` 自身的 `dev` / `start` 脚本转发到 `@trapmap/app-light`，只用于库级调试。

```ts
import { start } from '@trapmap/host-local';

const handle = await start({ host: '0.0.0.0', port: 4000 });
await handle.close();
```

## 行为

| 依赖 / 脚本 | 用途 |
| --- | --- |
| `@nestjs/*` + `fastify` + `reflect-metadata` + `rxjs` | 单进程应用框架 |
| `@trapmap/service-*`（6 个摄取 / 治理 / 读 / 写 / 身份 / 任务包 + `service-cron`） | 限界上下文实现 |
| `@trapmap/ai-providers` / `@trapmap/assembly` / `@trapmap/backend-core` / `@trapmap/contracts` / `@trapmap/infra` / `@trapmap/lib` | 平台底座 |
| `pg` | PostgreSQL 驱动 |
| `prom-client` / `@opentelemetry/api` / `winston` / `winston-loki` / `@sentry/node` | 指标追踪日志 |
| `langfuse`（optional） | LLM 调用镜像 |

部署形态（`local-agent` / `team-monolith`）由 `TRAPMAP_DEPLOYMENT_PROFILE` 选择，运行模式按 profile 与 preset 推导，不直接读环境变量。

端点面（定义见 `src/nest/gateway/gateway.route-defs.ts`，健康见 `src/nest/health/`）：

| 方法+路径 | 用途 |
| --- | --- |
| `GET /health`、`/ready`、`/live`、`GET /metrics` | 健康/就绪/存活探针与指标 |
| `GET /v1/knowledge/:entryId`、`GET /v1/knowledge/mine` | 取单条、按用户列条目 |
| `POST /v1/retrieval/search`、`/v3/retrieval/search`、`POST /v1/retrieval/skills/search-by-content` | 检索搜索、v3 别名、按内容搜技能 |
| `GET /v1/knowledge/projection-status` | 读投影状态诊断 |
| `POST /v1/candidates/:candidateId/manual-result`、`/apply-resolution` | 人工结果、应用决议 |
| `GET /v1/knowledge/review-queue`、`POST /v1/knowledge/review` | 治理审核队列、审核决策 |

## 常见用法

### 本地起网关（开发）

```bash
pnpm dev -- local-agent
curl http://127.0.0.1:4000/health
```

等价别名见仓库根 `package.json`（`dev:local-agent`、`dev:team-monolith`）。`team-monolith` 形态要先配 `TRAPMAP_DATABASE_URL`。

### 跑本包测试

```bash
pnpm --filter @trapmap/host-local test
```

PG 集成用例无库时自动跳过。

### 在脚本里启停服务

```ts
import { start } from '@trapmap/host-local';

const handle = await start({ host: '0.0.0.0', port: 4000 });
await handle.close();
```

你只在测试编排里这样用，日常开发走 `pnpm dev`。
