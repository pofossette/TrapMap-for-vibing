# @trapmap/app-light

light 宿主（`local-agent` / `team-monolith`）**组装中心**（thin assembly）。

## 职责范围

本包只做进程级装配，业务逻辑全部在库包 [`@trapmap/host-local`](../../packages/host-local/) 内：

1. **进程入口**：`src/index.ts` 是唯一入口，`main()` 负责启动编排
2. **env 读取绑定**：`TRAPMAP_DEPLOYMENT_PROFILE` / `HOST` / `PORT`
3. **profile 选择**：校验 profile 只允许 `local-agent` / `team-monolith`，其他值报错退出
4. **依赖装配**：只依赖 `@trapmap/host-local`，且只 import 包主入口（禁止子路径内部文件）
5. **信号处理**：SIGINT / SIGTERM 优雅关闭

## 启动方式

```bash
# 开发（默认 profile=local-agent，host=127.0.0.1，port=4000）
pnpm --filter @trapmap/app-light dev

# 生产（需先 build）
pnpm --filter @trapmap/app-light build
pnpm --filter @trapmap/app-light start
```

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `TRAPMAP_DEPLOYMENT_PROFILE` | `local-agent` | 只允许 `local-agent` / `team-monolith`，其他值启动报错退出 |
| `HOST` | `127.0.0.1` | 监听地址 |
| `PORT` | `4000` | 监听端口（0-65535 整数，非法值启动报错退出） |

其余运行时配置（数据库、AI provider、可观测性等）由 `@trapmap/host-local` 在内部读取，本包不感知。

## 禁止事项

- 不写业务逻辑：领域规则、port 实现、SQL、RouteDef、适配器一律禁止出现在本包
- 不 import `@trapmap/host-local` 的子路径（如 `@trapmap/host-local/src/...`），只 import 包主入口 `@trapmap/host-local`
