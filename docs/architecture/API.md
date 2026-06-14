# TrapMap API 参考

本文档说明当前 TrapMap HTTP API 的运行时约定。完整路由清单请同时参考：

- [`docs/reference/api-surface.md`](../reference/api-surface.md)：全量路由 + contracts Schema 名称
- `GET /meta/routes`：运行中实例暴露的文档化路由列表

## 基础信息

| 项目 | 值 |
|------|-----|
| Base URL | `http://127.0.0.1:4000` |
| 版本前缀 | `/v1`、`/v2`、`/v3` |
| Content-Type | `application/json` |
| 认证 | 默认使用 `Authorization: Bearer <session-token>`；server 也支持 `SESSION_TRANSPORT=cookie` |

## 健康检查与运行时状态

### GET /health

用于 liveness。固定返回 `200`，并带统一 runtime snapshot：

```json
{
  "status": "ok",
  "liveness": "alive",
  "readiness": "ready",
  "product": "trapmap",
  "packages": ["cli", "server", "contracts"],
  "requestContext": {
    "requestIdHeader": "x-request-id",
    "traceHeader": "traceparent"
  },
  "dependencies": {
    "database": "postgres",
    "queueWorker": "running",
    "outboxWorker": "running",
    "graphQuery": "healthy"
  },
  "graphQuery": {
    "mode": "enabled-primary",
    "provider": "neo4j",
    "detail": null
  },
  "memory": {
    "rssMb": 128,
    "heapUsedMb": 64,
    "heapTotalMb": 96
  },
  "uptimeSeconds": 42,
  "async": {
    "queue": {
      "pending": 0,
      "running": 0,
      "dead": 0,
      "staleRunning": 0,
      "reclaimCount": 0
    },
    "outbox": {
      "pending": 0,
      "processing": 0,
      "failed": 0,
      "staleProcessing": 0,
      "reclaimCount": 0
    }
  }
}
```

### GET /ready

用于 traffic readiness。响应体与 `/health` 共用同一份 runtime snapshot，但会额外带 `ok`：

```json
{
  "ok": true,
  "liveness": "alive",
  "readiness": "ready",
  "product": "trapmap",
  "packages": ["cli", "server", "contracts"],
  "requestContext": {
    "requestIdHeader": "x-request-id",
    "traceHeader": "traceparent"
  },
  "dependencies": {
    "database": "json-store",
    "queueWorker": "not-configured",
    "outboxWorker": "not-configured",
    "graphQuery": "disabled"
  },
  "graphQuery": {
    "mode": "disabled",
    "provider": null,
    "detail": null
  },
  "memory": {
    "rssMb": 128,
    "heapUsedMb": 64,
    "heapTotalMb": 96
  },
  "uptimeSeconds": 42
}
```

当 `readiness === "not-ready"` 时：

- HTTP 状态码为 `503`
- 响应体中 `ok` 为 `false`

### GET /meta/routes

返回当前实例维护的文档化路由列表：

```json
{
  "documentedRoutes": [
    "POST /v1/auth/login",
    "GET /v1/auth/session",
    "POST /v1/auth/logout"
  ]
}
```

## 认证

### POST /v1/auth/login

请求体二选一：

```json
{ "accessKey": "ak_xxx" }
```

或：

```json
{ "systemAdminKey": "admin_xxx" }
```

响应：

```json
{
  "session": {
    "sessionId": "session_1",
    "member": {
      "id": "member_1",
      "teamId": "team_1",
      "handle": "alice",
      "roleTemplate": "user",
      "securityLevel": 5,
      "permissions": [],
      "notes": null,
      "isSystem": false,
      "createdAt": "2026-01-01T00:00:00Z",
      "updatedAt": "2026-01-01T00:00:00Z"
    },
    "activeTeam": {
      "id": "team_1",
      "name": "Platform",
      "slug": "platform",
      "description": null,
      "createdAt": "2026-01-01T00:00:00Z",
      "updatedAt": "2026-01-01T00:00:00Z"
    },
    "effectivePermissions": ["knowledge:submit"],
    "expiresAt": null,
    "issuedAt": "2026-01-01T00:00:00Z"
  }
}
```

会话 token 通过 `x-session-token` 响应头返回给 CLI。

### GET /v1/auth/session

```json
{
  "authenticated": true,
  "session": {
    "...": "same shape as loginResponse.session"
  }
}
```

### POST /v1/auth/logout

```json
{
  "ok": true
}
```

## 数据契约真值

以下枚举值以 `@trapmap/contracts` 为准，文档与 CLI 必须保持一致。

### Feedback `problemType`

- `incorrect`
- `outdated`
- `context-mismatch`
- `incomplete`
- `other`

没有 `unclear`。

### Evidence `sourceType`

- `internal-experience`
- `incident`
- `doc`
- `code`
- `external-reference`

### Evidence `evidenceLevel`

- `anecdotal`
- `reproduced`
- `documented`
- `verified-in-prod`

## 路由族概览

下面列出当前已实现的主要路由族。每个端点的请求/响应 Schema 名称见 [`api-surface.md`](../reference/api-surface.md)。

### 身份与组织

- `POST /v1/auth/login`
- `GET /v1/auth/session`
- `POST /v1/auth/logout`
- `GET /v1/teams`
- `POST /v1/teams`
- `POST /v1/teams/select`
- `POST /v1/members`
- `PATCH /v1/members/:memberId`
- `POST /v1/access-keys`

### 知识与 traps

- `POST /v1/knowledge`
- `GET /v1/knowledge/mine`
- `GET /v1/knowledge/:entryId`
- `POST /v1/knowledge/:entryId/resubmit`
- `PATCH /v1/knowledge/:entryId`
- `POST /v1/knowledge/:entryId/supersede`
- `GET /v1/knowledge/review-queue`
- `POST /v1/knowledge/review`
- `PATCH /v1/knowledge/:id/evidence`
- `POST /v1/traps`
- `GET /v1/traps`
- `GET /v1/traps/:trapId`
- `POST /v1/traps/:trapId/resubmit`
- `POST /v1/traps/:trapId/supersede`

### 候选、重复、检索

- `POST /v1/candidates`
- `GET /v1/candidates`
- `GET /v1/candidates/:candidateId`
- `POST /v1/candidates/:candidateId/manual-result`
- `POST /v1/candidates/:candidateId/apply-resolution`
- `GET /v1/duplicates`
- `GET /v1/duplicates/:candidateId`
- `GET /v1/duplicates/:candidateId/bundle`
- `POST /v1/retrieval/search`
- `POST /v2/retrieval/search`
- `POST /v3/retrieval/search`
- `POST /v3/retrieval/plan`
- `POST /v1/retrieval/skills/search-by-content`

### 反馈、remediation、运维

- `POST /v1/feedback`
- `GET /v1/operations/feedback`
- `POST /v1/operations/feedback/batch`
- `GET /v1/operations/feedback/stats/:entryId`
- `GET /v1/operations/feedback/remediation`
- `GET /v1/operations/feedback/remediation/:entryId`
- `POST /v1/operations/feedback/remediation/:entryId/complete`
- `GET /v1/operations/audit`
- `GET /v1/operations/knowledge`
- `POST /v1/operations/knowledge/:entryId/deactivate`
- `POST /v1/operations/import`
- `POST /v1/operations/export`
- `POST /v1/operations/artifacts/import`
- `POST /v1/operations/artifacts/export`
- `POST /v1/operations/artifacts/activate`
- `POST /v1/operations/artifacts/:artifactId/deactivate`
- `POST /v1/operations/artifacts/:artifactId/edit`
- `GET /v1/operations/artifacts/:artifactId/history`
- `GET /v1/operations/artifacts/review-queue`
- `POST /v1/operations/artifacts/:artifactId/review`
- `POST /v1/operations/migrate`
- `GET /v1/operations/status`
- `GET /v1/operations/status/async`
- `POST /v1/operations/status/async/tasks/:taskId/requeue`
- `GET /v1/operations/badcases/:feedbackId/export`
- `GET /v1/operations/stats/usage`
- `GET /v1/operations/stats/hits`
- `GET /v1/operations/stats/summary`
- `GET /v1/operations/decay/entries`
- `POST /v1/operations/decay/batch`
- `POST /v1/operations/decay/search`
- `GET /v1/operations/maintenance/entries`
- `POST /v1/operations/maintenance/batch`
- `POST /v1/operations/capsule-index/rebuild`
- `GET /v1/operations/capsule-index/health`
- `POST /v1/operations/capsule-index/cleanup-orphans`
- `POST /v1/admin/reconcile-knowledge-indexes`
- `POST /admin/boundary-search`

## 文档维护原则

- API 路由新增时，先更新 `docs/reference/api-surface.md`
- `API.md` 负责解释运行时行为、枚举真值、健康检查和主要路由族
- 需要完整逐路由细节时，优先查看 `api-surface.md` 与具体 route 源码
