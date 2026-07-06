# @trapmap/client-core

TrapMap 客户端共享的网关传输层。

## 目的

本包包含从 `packages/cli` 中提取的 HTTP 网关 SDK，使多个客户端（CLI、未来的 Web 面板）可以共享相同的请求、错误和会话契约，而无需依赖 CLI 特定的状态管理或 Node.js API。

## 设计原则

1. **兼容浏览器** -- 仅使用标准 `fetch` API。
2. **无 CLI 依赖** -- 不从 `@trapmap/cli` 导入，也不引用 `CliState`。
3. **显式注入** -- 所有依赖项（基础 URL、会话令牌）均通过 `SessionProvider` 接口提供。
4. **最小接口** -- 仅导出网关通信所需的内容。
5. **仅网关契约** -- 客户端后端形状提示（如 `backendTarget`）保留在本包之上；`client-core` 不会扩展内部服务发现或第二种 URL 模型。

## 导出

| 导出 | 类型 | 描述 |
|------|------|------|
| `apiRequest` | function | 对网关执行类型化的 HTTP 请求 |
| `ApiError` | class | 统一的网关错误，包含状态码和响应体 |
| `SessionProvider` | interface | 用于解析 URL 和凭据的契约 |
| `ApiResponse<T>` | type | 成功时返回的包装类型 |
| `RequestOptions` | type | 每次请求的选项（路径、方法、请求体、覆盖项） |
| `HttpMethod` | type | `'GET' \| 'POST' \| 'PATCH'` -- 支持的 HTTP 方法 |

## 用法

```typescript
import type { SessionProvider } from '@trapmap/client-core';
import { apiRequest } from '@trapmap/client-core';

const provider: SessionProvider = {
  getBaseUrl: () => 'http://127.0.0.1:4000',
  getSessionToken: () => storedToken,       // null 表示未认证
};

const { data, sessionToken } = await apiRequest(provider, {
  path: '/v1/knowledge',
  method: 'GET',
});
```

### 错误处理

`apiRequest` 在收到非 OK 响应或 JSON 无效时抛出 `ApiError`。错误携带 HTTP 状态码、响应体（已解析的 body 或原始文本）以及可读的消息。

```typescript
import { ApiError, apiRequest } from '@trapmap/client-core';

try {
  const { data } = await apiRequest(provider, { path: '/v1/knowledge' });
} catch (error) {
  if (error instanceof ApiError) {
    console.error(`网关错误 ${error.statusCode}: ${error.message}`);
    // error.payload 包含已解析的响应体（502 时为 { rawBody }）
  } else {
    throw error; // 网络故障或意外错误
  }
}
```
