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

消费方只允许经本包 `package.json` exports 子路径导入。本包承载服务实现、路由、DB 端口与配置解析，进程装配（`--service` 分发、信号处理）归组装中心。`cron-scheduler` 的监听形态以源码为准，未知/待确认（2026-09-08）。
