# @trapmap/client-core

Shared gateway transport layer for TrapMap clients.

## Purpose

This package contains the HTTP gateway SDK extracted from `packages/cli` so that
multiple clients (CLI, future web panel) can share the same request, error, and
session contract without depending on CLI-specific state management or Node.js
APIs.

## Design Principles

1. **Browser-compatible** -- uses only the standard `fetch` API.
2. **No CLI dependencies** -- does not import from `@trapmap/cli` or
   reference `CliState`.
3. **Explicit injection** -- all dependencies (base URL, session token)
   are supplied via the `SessionProvider` interface.
4. **Minimal surface** -- exports only what is needed for gateway
   communication.

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `apiRequest` | function | Execute a typed HTTP request against the gateway |
| `ApiError` | class | Unified gateway error with status code and payload |
| `SessionProvider` | interface | Contract for resolving URL and credentials |
| `ApiResponse<T>` | type | Wrapper returned on success |
| `RequestOptions` | type | Per-request options (path, method, body, overrides) |
| `HttpMethod` | type | `'GET' \| 'POST' \| 'PATCH'` -- supported HTTP verbs |

## Usage

```typescript
import type { SessionProvider } from '@trapmap/client-core';
import { apiRequest } from '@trapmap/client-core';

const provider: SessionProvider = {
  getBaseUrl: () => 'http://127.0.0.1:4000',
  getSessionToken: () => storedToken,       // null when unauthenticated
};

const { data, sessionToken } = await apiRequest(provider, {
  path: '/v1/knowledge',
  method: 'GET',
});
```

### Error handling

`apiRequest` throws `ApiError` for non-OK responses and for invalid JSON. The
error carries the HTTP status code, a payload (parsed body or raw text), and a
human-readable message.

```typescript
import { ApiError, apiRequest } from '@trapmap/client-core';

try {
  const { data } = await apiRequest(provider, { path: '/v1/knowledge' });
} catch (error) {
  if (error instanceof ApiError) {
    console.error(`Gateway error ${error.statusCode}: ${error.message}`);
    // error.payload contains the parsed response body (or { rawBody } on 502)
  } else {
    throw error; // network failure or unexpected error
  }
}
```
