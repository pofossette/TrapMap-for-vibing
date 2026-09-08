# `@trapmap/client-core`

你用这个包从任意客户端调用 TrapMap 网关，它是 CLI 与 web-panel 共享的传输层。

## 入口

主入口为 `packages/client-core/src/index.ts`，HTTP 实现见 `packages/client-core/src/http/`，会话契约见 `packages/client-core/src/session/`。

```ts
import { apiRequest, ApiError } from '@trapmap/client-core';
import type { SessionProvider } from '@trapmap/client-core';

const provider: SessionProvider = {
  getBaseUrl: () => 'http://127.0.0.1:4000',
  getSessionToken: () => storedToken,
};
const { data } = await apiRequest(provider, { path: '/v1/knowledge', method: 'GET' });
```

## 行为

本包零运行时依赖，只用标准 `fetch`，因此你能在浏览器直接使用它。调用方注入已解析的网关 base URL，`BackendTarget` 形状由 `@trapmap/contracts` 定义。支持的方法为 `GET` / `POST` / `PATCH`，非 OK 响应或非法 JSON 抛 `ApiError`（携带状态码与响应体）。
