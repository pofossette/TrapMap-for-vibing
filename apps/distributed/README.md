# @trapmap/app-distributed

distributed 宿主的**组装中心**（thin assembly / composition layer）：把 `@trapmap/host-distributed` 库包导出的各 `start<X>Service()` 组装成可独立启动的进程入口。

- **定位**：gateway + candidate-ingestion / governance-review / job-runtime（即 candidate-worker / governance-worker / outbox-worker）三个 worker 的进程入口，负责 `--service` 参数分发、env 绑定与 SIGINT/SIGTERM 优雅关闭。
- **不承载业务逻辑**：所有服务实现、路由、DB 端口、配置解析都在 `packages/host-distributed`（及其依赖的 `service-*` 包）内，本包只做装配。

## 启动方式

```bash
# 全部服务（默认 4000-4006 端口）
pnpm --filter @trapmap/app-distributed dev          # 开发（tsx watch）
pnpm --filter @trapmap/app-distributed start        # 生产（node dist）

# 单服务（--service 分发）
pnpm --filter @trapmap/app-distributed dev:gateway
pnpm --filter @trapmap/app-distributed dev:candidate-ingestion
pnpm --filter @trapmap/app-distributed dev:governance-review
pnpm --filter @trapmap/app-distributed dev:job-runtime

pnpm --filter @trapmap/app-distributed start:gateway
pnpm --filter @trapmap/app-distributed start:candidate-ingestion
pnpm --filter @trapmap/app-distributed start:governance-review
pnpm --filter @trapmap/app-distributed start:job-runtime

# 或直接传参
pnpm --filter @trapmap/app-distributed start -- --service gateway
```

`--service` 合法集合来自 `@trapmap/host-distributed` 的 `ALL_SERVICES`（gateway / identity-access / knowledge-read / knowledge-write / candidate-ingestion / governance-review / job-runtime）。根级 `scripts/backend-target-registry.ts` 的 heavy devTargets（gateway / candidate-worker / governance-worker / outbox-worker）已指向本包的 `dev:gateway` / `dev:candidate-ingestion` / `dev:governance-review` / `dev:job-runtime` 脚本。

## 职责边界

- 只做：`--service` 参数解析与分发、按服务懒加载 `start<X>Service()`、打印启动端口、注册 SIGINT/SIGTERM 优雅关闭（close server + db）。
- 依赖面：仅通过 `@trapmap/host-distributed` 的 **package exports 子路径**（如 `@trapmap/host-distributed/config/index.js`、`@trapmap/host-distributed/gateway/index.js`）导入，禁止依赖任何其他包、禁止引入新依赖（如需新依赖先回 `@trapmap/lib` / host 库包，再回本包声明）。

## 禁止事项

- 禁止 import `@trapmap/host-distributed` 内部深路径（相对 `packages/` 源码路径或未在 exports 面暴露的目录）。
- 禁止在本包新增任何业务逻辑 / 路由 / DB 访问 / 配置解析；这些都必须落在 `packages/host-distributed`（domain 规则在 `packages/backend-core`）。
- 禁止修改 `packages/host-distributed` 源码来适配本包；exports 面缺失时只能扩 `packages/host-distributed/package.json` 的 exports（不动源码）。

## 验证

```bash
pnpm --filter @trapmap/app-distributed typecheck
pnpm --filter @trapmap/app-distributed test        # vitest project（当前无测试，--passWithNoTests）
```
