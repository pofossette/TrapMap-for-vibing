# `@trapmap/app-mcp`

你用这个包经网关 HTTP API 把 TrapMap 知识与 skill 能力暴露为 MCP server，本包不实现后端业务逻辑。

## 入口

主入口为 `apps/mcp/src/index.ts`（stdio 传输），server 组装见 `apps/mcp/src/server.ts`，工具定义见 `apps/mcp/src/tools/`，网关调用走 `apps/mcp/src/gateway-client.ts`，配置与权限分别见 `apps/mcp/src/config.ts` 与 `apps/mcp/src/permissions.ts`。

```bash
pnpm --filter @trapmap/app-mcp start
pnpm --filter @trapmap/app-mcp typecheck
pnpm --filter @trapmap/app-mcp test
```

## 行为

| 依赖 / 脚本 | 用途 |
| --- | --- |
| `@modelcontextprotocol/sdk` | MCP server 与 stdio 传输 |
| `@trapmap/client-core` | 网关传输 |
| `@trapmap/contracts` | 共享契约类型 |
| `@trapmap/lib` | 纯函数工具 |
| `zod` | 输入校验 |
| `start` | `tsx src/index.ts` 直接运行，无 `build` 产物 |

工具面处于扩展中，新增工具时你同步更新本 README 的入口表。
