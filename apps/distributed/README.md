# `@trapmap/app-distributed`

你用这个包把 `@trapmap/host-distributed` 导出的各 `start<X>Service()` 装配成可独立启动的进程入口，本包不承载业务逻辑。

## 入口

主入口为 `apps/distributed/src/index.ts`（`--service` 参数分发），进程装配见 `apps/distributed/src/main.ts`，组合逻辑见 `apps/distributed/src/composition/`。合法 `--service` 集合由 `@trapmap/host-distributed` 的 `ALL_SERVICES` 定义。

```bash
pnpm --filter @trapmap/app-distributed dev
pnpm --filter @trapmap/app-distributed dev:gateway
pnpm --filter @trapmap/app-distributed dev:candidate-ingestion
pnpm --filter @trapmap/app-distributed dev:governance-review
pnpm --filter @trapmap/app-distributed dev:job-runtime
pnpm --filter @trapmap/app-distributed dev:cron-scheduler
pnpm --filter @trapmap/app-distributed start -- --service gateway
pnpm --filter @trapmap/app-distributed typecheck
pnpm --filter @trapmap/app-distributed test
```

## 行为

| 依赖 / 脚本 | 用途 |
| --- | --- |
| `@trapmap/host-distributed` | 服务实现与 `start<X>Service()` 导出 |
| `@trapmap/assembly` | 装配内核 |
| `@trapmap/infra` | 共享基础设施 |
| `@trapmap/service-knowledge-read` | 读侧服务模块 |
| `@trapmap/contracts` | 共享契约类型 |
| `dev:*` / `start:*` | 按服务启停，生产路径跑 `node dist/index.js` |
| `test` | `vitest run --project app-distributed --passWithNoTests` |

你只允许经 `@trapmap/host-distributed` 的 `package.json` exports 子路径导入它，业务逻辑缺失时你扩 exports 面，不动库包源码。
