# `@trapmap/service-cron`

你用这个服务模块拥有 `cron_jobs` 注册表并轮询到期任务，它只调度，不执行业务。

## 入口

主入口为 `packages/service-cron/src/index.ts`，服务装配见 `packages/service-cron/src/deps.ts`，Fastify 工厂见 `packages/service-cron/src/server.ts`，路由见 `packages/service-cron/src/routes.ts`，到期轮询见 `packages/service-cron/src/scheduler.ts`（claim → enqueue → 记账），SQL 归属包见 `packages/service-cron/src/pg-ports.ts`（`createCronOwnerBundle`），迁移见 `packages/service-cron/src/migrations.ts`。

```ts
import { createCronOwnerBundle, createCronScheduler, createCronServer } from '@trapmap/service-cron';
```

## 行为

| 依赖 / 脚本 | 用途 |
| --- | --- |
| `@trapmap/backend-core` | 端口契约与模块底座 |
| `@trapmap/contracts` | cron schema |
| `@trapmap/db` | 表定义 |
| `@trapmap/lib` | `cronNextRun`、`cronValidate` |
| `drizzle-orm` / `pg` / `fastify` / `zod` | 数据访问、服务框架、校验 |
| `build` / `typecheck` / `test` | 编译 / 校验 / 单元测试 |

到期任务经注入的 `transport.task.enqueue` 进入异步队列，`trigger` 只做一次额外入队，不推进 `next_run_at`。执行、重试与死信归 `job-runtime`。
