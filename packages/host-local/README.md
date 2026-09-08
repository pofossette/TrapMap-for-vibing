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
