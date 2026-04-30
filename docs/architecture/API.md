# TrapMap API 参考

> **文档关系说明**：本文档是 TrapMap API 的完整详细参考。若需快速概览所有端点及其请求/响应契约，请参阅 [`../api-surface.md`](../api-surface.md)。

## 概述

TrapMap 提供基于 Fastify 的 RESTful API，所有端点遵循 `/v1/` 或 `/v3/` 版本前缀。

## 基础信息

| 项目 | 值 |
|------|-----|
| Base URL | `http://localhost:4000/v1` |
| Content-Type | `application/json` |
| 认证 | Cookie (session) 或 Access Key |

## 认证端点

### POST /v1/auth/login

用户名密码登录。

**请求**:
```json
{
  "username": "alice@example.com",
  "password": "securepassword"
}
```

**响应** (200):
```json
{
  "user": {
    "id": "uuid-xxx",
    "username": "alice@example.com",
    "role": "contributor",
    "level": 1,
    "activeTeam": null
  },
  "permissions": ["knowledge:submit", "knowledge:search", "team:list"]
}
```

**Cookie**: 设置 `session` HTTP-only cookie

---

### GET /v1/auth/session

获取当前会话状态。

**响应** (200):
```json
{
  "session": {
    "id": "session-xxx",
    "user": {
      "id": "uuid-xxx",
      "username": "alice@example.com",
      "role": "admin",
      "level": 10
    },
    "expiresAt": "2026-05-07T12:00:00Z"
  }
}
```

**响应** (401): 未认证

---

### POST /v1/auth/logout

登出并使会话失效。

**响应** (200):
```json
{
  "success": true
}
```

---

## 团队端点

### POST /v1/teams

创建新团队。

**请求**:
```json
{
  "name": "Platform Team",
  "description": "Core platform development team"
}
```

**响应** (201):
```json
{
  "id": "team-xxx",
  "name": "Platform Team",
  "description": "Core platform development team",
  "createdAt": "2026-04-30T12:00:00Z",
  "createdBy": {
    "actorId": "user-xxx",
    "actorName": "alice@example.com"
  }
}
```

---

### GET /v1/teams

列出所有团队。

**响应** (200):
```json
{
  "teams": [
    {
      "id": "team-xxx",
      "name": "Platform Team",
      "memberCount": 5
    }
  ]
}
```

---

### POST /v1/teams/select

设置活动团队。

**请求**:
```json
{
  "teamId": "team-xxx"
}
```

**响应** (200):
```json
{
  "success": true,
  "activeTeam": {
    "id": "team-xxx",
    "name": "Platform Team"
  }
}
```

---

## 成员端点

### POST /v1/members

创建成员。

**请求**:
```json
{
  "username": "bob@example.com",
  "password": "securepassword",
  "role": "contributor",
  "level": 1,
  "teamId": "team-xxx"
}
```

**响应** (201):
```json
{
  "id": "member-xxx",
  "username": "bob@example.com",
  "role": "contributor",
  "level": 1,
  "teamId": "team-xxx",
  "createdAt": "2026-04-30T12:00:00Z"
}
```

---

### PATCH /v1/members/:memberId

更新成员。

**请求**:
```json
{
  "role": "reviewer",
  "level": 5
}
```

**响应** (200):
```json
{
  "id": "member-xxx",
  "username": "bob@example.com",
  "role": "reviewer",
  "level": 5
}
```

---

## 访问密钥端点

### POST /v1/access-keys

创建访问密钥。

**请求**:
```json
{
  "name": "CI Pipeline Key",
  "permissions": ["knowledge:submit", "knowledge:search"],
  "expiresInDays": 90
}
```

**响应** (201):
```json
{
  "id": "key-xxx",
  "name": "CI Pipeline Key",
  "key": "ak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "expiresAt": "2026-07-29T12:00:00Z",
  "permissions": ["knowledge:submit", "knowledge:search"],
  "level": 1
}
```

**注意**: `key` 字段仅在此响应中返回一次，之后不会再次显示。

---

## 知识端点

### POST /v1/knowledge

提交新知识条目。

**请求**:
```json
{
  "title": "OAuth2 Authentication Setup Guide",
  "content": "# OAuth2 Setup\n\n## Overview\nThis guide covers...",
  "format": "markdown",
  "requiredLevel": 2,
  "teamId": "team-xxx",
  "trapIds": ["trap-xxx"],
  "capsuleIds": ["capsule-xxx"]
}
```

**响应** (201):
```json
{
  "id": "entry-xxx",
  "title": "OAuth2 Authentication Setup Guide",
  "lifecycleState": "submitted",
  "createdAt": "2026-04-30T12:00:00Z"
}
```

---

### GET /v1/knowledge/mine

获取当前用户的知识条目。

**查询参数**:
- `limit`: 数量限制 (默认 20)
- `cursor`: 分页游标
- `state`: 生命周期状态过滤

**响应** (200):
```json
{
  "entries": [
    {
      "id": "entry-xxx",
      "title": "OAuth2 Setup Guide",
      "lifecycleState": "approved",
      "createdAt": "2026-04-30T12:00:00Z"
    }
  ],
  "nextCursor": "cursor-xxx"
}
```

---

### GET /v1/knowledge/:entryId

获取指定条目。

**响应** (200):
```json
{
  "id": "entry-xxx",
  "title": "OAuth2 Authentication Setup Guide",
  "content": "# OAuth2 Setup...",
  "format": "markdown",
  "requiredLevel": 2,
  "lifecycleState": "approved",
  "createdAt": "2026-04-30T12:00:00Z",
  "updatedAt": "2026-04-30T14:00:00Z",
  "createdBy": {
    "actorId": "user-xxx",
    "actorName": "alice@example.com"
  },
  "approvedBy": {
    "actorId": "user-yyy",
    "actorName": "bob@example.com"
  },
  "reviewHistory": [
    {
      "id": "review-xxx",
      "decision": "approved",
      "notes": "Good documentation",
      "reviewedBy": { "actorId": "user-yyy", "actorName": "bob" },
      "reviewedAt": "2026-04-30T14:00:00Z"
    }
  ],
  "indexState": {
    "vector": { "status": "synced", "indexedAt": "2026-04-30T14:00:05Z" },
    "keyword": { "status": "synced", "indexedAt": "2026-04-30T14:00:05Z" },
    "graph": { "status": "synced", "indexedAt": "2026-04-30T14:00:05Z" }
  }
}
```

---

### POST /v1/knowledge/:entryId/resubmit

重新提交被拒绝的条目。

**请求**:
```json
{
  "content": "# Updated OAuth2 Setup..."
}
```

**响应** (200):
```json
{
  "id": "entry-xxx",
  "lifecycleState": "submitted",
  "updatedAt": "2026-04-30T15:00:00Z"
}
```

---

### PATCH /v1/knowledge/:entryId

更新条目（仅限草稿状态）。

**请求**:
```json
{
  "title": "Updated Title",
  "content": "Updated content..."
}
```

**响应** (200):
```json
{
  "id": "entry-xxx",
  "title": "Updated Title",
  "updatedAt": "2026-04-30T15:00:00Z"
}
```

---

## 审核端点

### GET /v1/knowledge/review-queue

获取待审核队列。

**查询参数**:
- `limit`: 数量限制
- `lifecycleState`: 过滤状态 (默认 `agent-pass`)

**响应** (200):
```json
{
  "queue": [
    {
      "id": "entry-xxx",
      "title": "OAuth2 Setup Guide",
      "lifecycleState": "agent-pass",
      "submittedBy": {
        "actorId": "user-xxx",
        "actorName": "alice"
      },
      "submittedAt": "2026-04-30T12:00:00Z",
      "agentReviewResult": {
        "correctnessRisk": "low",
        "duplicateRisk": "none"
      }
    }
  ]
}
```

---

### POST /v1/knowledge/review

提交审核决策。

**请求**:
```json
{
  "entryId": "entry-xxx",
  "decision": "approved",
  "notes": "Well-documented guide"
}
```

**响应** (200):
```json
{
  "entryId": "entry-xxx",
  "lifecycleState": "approved",
  "reviewedBy": {
    "actorId": "user-yyy",
    "actorName": "bob@example.com"
  },
  "reviewedAt": "2026-04-30T16:00:00Z"
}
```

---

## 检索端点

### POST /v1/retrieval/search

v1 检索（基于条目）。

**请求**:
```json
{
  "query": "how to configure OAuth2 authentication",
  "mode": "semantic",
  "limit": 10,
  "filter": {
    "approvalStatus": "approved",
    "requiredLevel": {
      "lte": 5
    }
  }
}
```

**响应** (200):
```json
{
  "query": "how to configure OAuth2 authentication",
  "mode": "semantic",
  "results": [
    {
      "entryId": "entry-xxx",
      "title": "OAuth2 Setup Guide",
      "snippet": "...configure OAuth2 with Auth0...",
      "score": 0.92,
      "bucket": "global"
    }
  ],
  "trace": {
    "provider": "semantic",
    "confidence": 0.88,
    "fallback": false,
    "metadata": {
      "embeddingCacheHit": false
    }
  }
}
```

---

### POST /v3/retrieval/search

v2 胶囊检索。

**请求**:
```json
{
  "query": "OAuth2 authentication setup",
  "limit": 5
}
```

**响应** (200):
```json
{
  "query": "OAuth2 authentication setup",
  "mode": "capsule-native",
  "capsules": [
    {
      "capsuleId": "capsule-xxx",
      "artifactId": "artifact-xxx",
      "name": "OAuth2 Configuration",
      "content": "To configure OAuth2, first set up your provider...",
      "activationHint": "Use when implementing OAuth2 authentication",
      "score": 0.89
    }
  ],
  "trace": {
    "provider": "semantic",
    "confidence": 0.85,
    "capsuleCount": 1
  }
}
```

---

### POST /v3/retrieval/plan

v3 陷阱优先计划生成。

**请求**:
```json
{
  "query": "how to add OAuth2 authentication to a new service"
}
```

**响应** (200):
```json
{
  "planId": "plan-xxx",
  "query": "how to add OAuth2 authentication to a new service",
  "confidence": 0.82,
  "routing": "plan",
  "traps": [
    {
      "id": "trap-xxx",
      "name": "Requires HTTPS",
      "description": "OAuth2 requires HTTPS in production",
      "blockers": ["production"],
      "priority": 1
    }
  ],
  "skills": [
    {
      "id": "skill-xxx",
      "name": "HTTPS Setup Guide",
      "description": "How to configure nginx with HTTPS",
      "inputRequirements": ["nginx"],
      "outputGuarantees": ["https-enabled"]
    }
  ],
  "edges": [
    {
      "source": "skill-xxx",
      "target": "trap-xxx",
      "edgeType": "blocks"
    }
  ],
  "citations": [
    {
      "entryId": "entry-xxx",
      "nodeId": "trap-xxx",
      "snippet": "Production OAuth2 requires valid HTTPS...",
      "relevanceScore": 0.95
    }
  ]
}
```

**回退响应** (当置信度 < 0.7):
```json
{
  "planId": null,
  "query": "...",
  "confidence": 0.45,
  "routing": "fallback",
  "capsules": [...],
  "traps": [],
  "skills": [],
  "edges": [],
  "citations": []
}
```

---

### POST /v1/retrieval/skills/search-by-content

按内容搜索技能。

**请求**:
```json
{
  "query": "JWT token validation",
  "limit": 5
}
```

**响应** (200):
```json
{
  "query": "JWT token validation",
  "results": [
    {
      "capsuleId": "capsule-xxx",
      "artifactName": "JWT Implementation",
      "name": "JWT Validation Steps",
      "content": "1. Parse token 2. Verify signature...",
      "score": 0.91
    }
  ]
}
```

---

## 操作端点

### GET /v1/operations/audit

获取审计日志。

**查询参数**:
- `limit`: 数量限制
- `actorId`: 按参与者过滤
- `eventType`: 按事件类型过滤
- `startDate`: 开始日期
- `endDate`: 结束日期

**响应** (200):
```json
{
  "logs": [
    {
      "id": "audit-xxx",
      "timestamp": "2026-04-30T12:00:00Z",
      "eventType": "knowledge.approved",
      "actorId": "user-yyy",
      "resourceType": "knowledge_entry",
      "resourceId": "entry-xxx",
      "metadata": {
        "decision": "approved"
      }
    }
  ]
}
```

---

### POST /v1/operations/import

批量导入知识。

**请求**:
```json
{
  "entries": [
    {
      "title": "Entry 1",
      "content": "Content...",
      "requiredLevel": 0
    },
    {
      "title": "Entry 2",
      "content": "Content...",
      "requiredLevel": 1
    }
  ],
  "options": {
    "skipDuplicates": true
  }
}
```

**响应** (200):
```json
{
  "imported": 2,
  "skipped": 0,
  "errors": []
}
```

---

### POST /v1/operations/export

导出知识。

**请求**:
```json
{
  "format": "json",
  "filter": {
    "lifecycleState": "approved",
    "requiredLevel": { "lte": 3 }
  }
}
```

**响应** (200):
```json
{
  "format": "json",
  "count": 15,
  "data": [...]
}
```

---

### POST /v1/operations/knowledge/:entryId/deactivate

停用知识条目。

**响应** (200):
```json
{
  "entryId": "entry-xxx",
  "lifecycleState": "deactivated"
}
```

---

## 工件端点

### POST /v1/operations/artifacts

创建技能工件。

**请求**:
```json
{
  "name": "OAuth2 Implementation",
  "version": "1.0.0",
  "sourceFiles": [
    {
      "path": "src/auth.ts",
      "content": "export async function setupOAuth2()...",
      "language": "typescript"
    }
  ],
  "scope": "global",
  "requiredLevel": 2
}
```

**响应** (201):
```json
{
  "id": "artifact-xxx",
  "name": "OAuth2 Implementation",
  "version": "1.0.0",
  "status": "draft",
  "createdAt": "2026-04-30T12:00:00Z"
}
```

---

### POST /v1/operations/artifacts/:artifactId/derive

派生配置文件和胶囊。

**请求**:
```json
{
  "outputs": ["profile", "capsules", "manifest"],
  "options": {
    "maxCapsules": 10,
    "chunkSize": 2000
  }
}
```

**响应** (200):
```json
{
  "artifactId": "artifact-xxx",
  "status": "derived",
  "profile": {
    "id": "profile-xxx",
    "distilledText": "This implementation provides...",
    "keywords": ["oauth2", "authentication", "security"]
  },
  "capsules": [
    {
      "id": "capsule-xxx",
      "name": "OAuth2 Provider Setup",
      "content": "To set up OAuth2 provider..."
    }
  ],
  "manifest": {
    "id": "manifest-xxx",
    "metadata": {
      "name": "OAuth2 Implementation",
      "version": "1.0.0",
      "capabilities": ["authentication", "token-validation"]
    }
  }
}
```

---

### GET /v1/operations/artifacts/:artifactId/history

获取工件版本历史。

**响应** (200):
```json
{
  "lineage": {
    "rootId": "artifact-root-xxx",
    "versionCount": 3
  },
  "versions": [
    {
      "id": "artifact-xxx",
      "version": "1.0.0",
      "createdAt": "2026-04-30T12:00:00Z"
    },
    {
      "id": "artifact-yyy",
      "version": "1.1.0",
      "createdAt": "2026-05-01T12:00:00Z"
    }
  ]
}
```

---

### POST /v1/operations/artifacts/:artifactId/review

审核工件。

**请求**:
```json
{
  "decision": "approved",
  "notes": "Ready for publication"
}
```

**响应** (200):
```json
{
  "artifactId": "artifact-xxx",
  "status": "published",
  "reviewedAt": "2026-04-30T16:00:00Z"
}
```

---

## 候选端点

### POST /v1/candidates

提交候选（异步摄取）。

**请求**:
```json
{
  "content": "Some knowledge content from external source...",
  "source": "https://example.com/docs/guide",
  "metadata": {
    "originalUrl": "https://example.com/docs/guide",
    "scrapedAt": "2026-04-30T10:00:00Z"
  }
}
```

**响应** (202):
```json
{
  "id": "candidate-xxx",
  "status": "received",
  "submittedAt": "2026-04-30T12:00:00Z"
}
```

---

### GET /v1/duplicates/:candidateId/bundle

获取重复候选包。

**响应** (200):
```json
{
  "candidate": {
    "id": "candidate-xxx",
    "content": "...",
    "status": "duplicate_detected",
    "submittedAt": "2026-04-30T10:00:00Z"
  },
  "duplicates": [
    {
      "candidateId": "candidate-yyy",
      "matchType": "semantic",
      "similarity": 0.97,
      "content": "..."
    }
  ]
}
```

---

### POST /v1/candidates/:candidateId/manual-result

人工解决重复。

**请求**:
```json
{
  "resolution": "merge",
  "mergeIntoId": "candidate-yyy",
  "notes": "Content is duplicate, merging into existing"
}
```

**响应** (200):
```json
{
  "candidateId": "candidate-xxx",
  "status": "resolved",
  "resolution": "merge",
  "resolvedAt": "2026-04-30T14:00:00Z"
}
```

---

## Trap 端点

### POST /v1/traps

创建陷阱。

**请求**:
```json
{
  "name": "Requires HTTPS",
  "description": "This feature requires HTTPS to be enabled"
}
```

**响应** (201):
```json
{
  "id": "trap-xxx",
  "name": "Requires HTTPS",
  "description": "This feature requires HTTPS to be enabled",
  "createdAt": "2026-04-30T12:00:00Z"
}
```

---

### GET /v1/traps

列出陷阱。

**响应** (200):
```json
{
  "traps": [
    {
      "id": "trap-xxx",
      "name": "Requires HTTPS",
      "description": "This feature requires HTTPS",
      "usageCount": 5
    }
  ]
}
```

---

### GET /v1/traps/:trapId

获取陷阱详情。

**响应** (200):
```json
{
  "id": "trap-xxx",
  "name": "Requires HTTPS",
  "description": "This feature requires HTTPS to be enabled",
  "createdBy": {
    "actorId": "user-xxx",
    "actorName": "alice"
  },
  "createdAt": "2026-04-30T12:00:00Z",
  "referencedBy": [
    {
      "entryId": "entry-xxx",
      "entryTitle": "OAuth2 Guide"
    }
  ]
}
```

---

### POST /v1/traps/:trapId/resubmit

重新提交陷阱。

**请求**:
```json
{
  "content": "Updated trap description..."
}
```

**响应** (200):
```json
{
  "id": "trap-xxx",
  "lifecycleState": "submitted"
}
```

---

## 错误响应

### 标准错误格式

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required",
    "details": {}
  }
}
```

### 错误代码

| 代码 | HTTP 状态 | 描述 |
|------|----------|------|
| UNAUTHORIZED | 401 | 需要认证 |
| FORBIDDEN | 403 | 权限不足 |
| NOT_FOUND | 404 | 资源不存在 |
| VALIDATION_ERROR | 400 | 请求参数错误 |
| INVALID_STATE | 409 | 状态转换无效 |
| RATE_LIMITED | 429 | 请求过于频繁 |
| INTERNAL_ERROR | 500 | 服务器内部错误 |

---

## 速率限制

| 端点类型 | 限制 |
|----------|------|
| 检索 | 60/分钟 |
| 提交 | 30/分钟 |
| 其他 | 120/分钟 |

响应头：
- `X-RateLimit-Limit`: 限制数量
- `X-RateLimit-Remaining`: 剩余数量
- `X-RateLimit-Reset`: 重置时间戳
