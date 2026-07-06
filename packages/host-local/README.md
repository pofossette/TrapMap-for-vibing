# @trapmap/host-local

TrapMap `local-agent` 与 `team-monolith` 部署配置的轻量主机组装包。冻结的默认轻量主线为 `src/nest/**`。

## 用途

本包是 TrapMap 单机部署的真实 `light` 主机实现。`src/nest/**` 是默认且唯一支持的主机入口。

## 部署配置

| 配置 | 路由面 | Worker | 数据库 | 认证 |
|---|---|---|---|---|
| `local-agent` | 完整网关 + 治理 | 运行时模式拥有任务时进程内执行 | JSON 存储可用 | 单用户完整治理 |
| `team-monolith` | 完整网关 | 进程内任务 + outbox | 需要 PostgreSQL | 团队认证 |

## 使用方式

### 编程式调用（通过 `start()`）

下方 `start()` 示例对应默认 Nest 主线。

```typescript
import { start } from '@trapmap/host-local';

const handle = await start({
  port: 3000,
});

// handle.close() 以关闭
```

#### 接口定义

包导出以下 TypeScript 接口：

```typescript
interface NestBootstrapOptions {
  host?: string;   // 监听地址，默认 '0.0.0.0'
  port?: number;   // 监听端口，默认 4000
}

interface NestBootstrapResult {
  app: unknown;               // NestFastifyApplication 实例
  close: () => Promise<void>; // 优雅关闭函数
}
```

### 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `TRAPMAP_DEPLOYMENT_PROFILE` | `(null，运行时推断)` | `local-agent` 或 `team-monolith` |
| `TRAPMAP_DEPLOYMENT_PRESET` | `monolith` | 部署预设 |
| `PORT` | `4000` | HTTP 监听端口 |
| `TRAPMAP_DATABASE_URL` | (无) | PostgreSQL 连接字符串 |

> **注意**：`RUNTIME_MODE`（`api`、`task-worker`、`outbox-worker`、`combined`）不由环境变量读取，而是由运行时根据部署配置和预设程序化推断得出。

## 架构

host-local 包负责 `light` 主机组装。Nest 路径是冻结的默认主线，也是唯一支持的本地主机入口。

```
host-local (HTTP, 中间件, 生命周期)
  -> backend-core ports (repo, queue, retrieval, actor, audit)
  -> backend-core modules (identity, knowledge, candidates, governance, jobs)
  -> backend-core 调用模型 (sync/async, 错误分类)
```

主机从配置中读取部署配置，并使用 backend-core 的 `resolveRuntimeDeployment()` 来决定注册哪些路由、启动哪些 worker 以及暴露哪些能力。
