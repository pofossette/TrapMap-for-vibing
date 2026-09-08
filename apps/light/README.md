# `@trapmap/app-light`

你用这个包把 `@trapmap/host-local` 装配成单机进程入口，本包只做进程级装配。

## 入口

唯一入口为 `apps/light/src/index.ts`，进程装配见 `apps/light/src/main.ts`，组合逻辑见 `apps/light/src/composition/`。`profile` 只允许 `local-agent` / `team-monolith`，其余值启动报错退出。你只允许 import `@trapmap/host-local` 主入口，禁止子路径深导入。

```bash
pnpm --filter @trapmap/app-light dev
pnpm --filter @trapmap/app-light build
pnpm --filter @trapmap/app-light start
pnpm --filter @trapmap/app-light typecheck
pnpm --filter @trapmap/app-light test
```

## 行为

| 依赖 / 脚本 | 环境变量 | 说明 |
| --- | --- | --- |
| `@trapmap/host-local` | | 服务实现与 `start()` |
| `@trapmap/assembly` | | 装配内核 |
| `@trapmap/infra` | | 共享基础设施 |
| `@trapmap/service-knowledge-read` | | 读侧服务模块 |
| `@trapmap/contracts` | | 共享契约类型 |
| | `TRAPMAP_DEPLOYMENT_PROFILE` | 默认 `local-agent` |
| | `HOST` | 默认 `127.0.0.1` |
| | `PORT` | 默认 `4000` |

数据库、AI provider、可观测性等运行时配置由 `@trapmap/host-local` 在内部读取，本包不感知。

## 常见用法

### 开发态启动（默认 local-agent）

```bash
pnpm --filter @trapmap/app-light dev
curl http://127.0.0.1:4000/health
```

`TRAPMAP_DEPLOYMENT_PROFILE` 未设时即 `local-agent`。切 `team-monolith` 前先配 `TRAPMAP_DATABASE_URL`。

### 构建并生产态启动

```bash
pnpm --filter @trapmap/app-light build
pnpm --filter @trapmap/app-light start
```

`start` 跑 `node dist/index.js`，端口默认 `4000`，改端口用 `PORT` 环境变量。
