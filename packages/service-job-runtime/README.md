# `@trapmap/service-job-runtime`

你用这个服务模块运行任务队列与领域事件 outbox，它是异步传输的拥有者。

## 入口

主入口为 `packages/service-job-runtime/src/index.ts`，依赖装配为 `createJobRuntimeDeps`，路由为 `createJobRuntimeRouteDefs` / `registerJobRuntimeRoutes`，任务处理器见 `packages/service-job-runtime/src/handlers/`（experience-gene、governance-conflict 等），迁移见 `packages/service-job-runtime/src/migrations.ts`。

```ts
import { createJobRuntimeDeps } from '@trapmap/service-job-runtime';
```

## 行为

| 依赖 / 脚本 | 用途 |
| --- | --- |
| `@trapmap/backend-core` | 任务运行时模块、端口与错误类型 |
| `@trapmap/contracts` | 治理载荷等共享 schema |
| `@trapmap/db` | `task_queue` 与 `domain_event_outbox` 表定义 |
| `@trapmap/lib` | 纯函数工具 |
| `drizzle-orm` / `pg` | 迁移执行与数据访问 |
| `fastify` / `zod` | 服务框架与校验 |
| `build` / `typecheck` / `test` | 编译 / 校验 / 单元测试 |

业务服务经内部 job-runtime 端口调度后续工作，不直接操作队列运行时写能力。claim、租约、重试、死信语义归本包，业务事实归各聚合 owner。
