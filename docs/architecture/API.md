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

Access Key 或 System Admin Key 登录。

**请求**:
```json
{
  "accessKey": "ak_xxxxxxxxxxxxxxxxxxxx"
}
```

或使用管理员密钥：

```json
{
  "systemAdminKey": "admin-xxxxxxxxxxxxxxxxxxxx"
}
```

**响应** (200):
```json
{
  "user": {
    "id": "uuid-xxx",
    "handle": "alice",
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
  "handle": "bob@example.com",
  "roleTemplate": "user",
  "securityLevel": 1,
  "teamId": "team-xxx"
}
```

**响应** (201):
```json
{
  "id": "member-xxx",
  "handle": "bob@example.com",
  "roleTemplate": "user",
  "securityLevel": 1,
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
  "securityLevel": 5,
  "permissions": ["knowledge:review"]
}
```

**响应** (200):
```json
{
  "id": "member-xxx",
  "handle": "bob@example.com",
  "roleTemplate": "user",
  "securityLevel": 5,
  "permissions": ["knowledge:review"]
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

### POST /v2/retrieval/search

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

### POST /v3/retrieval/search

v3 GraphRAG-lite 检索（置信度感知）。高置信度时返回 TrapFirstPlan，否则降级到 v1/v2 检索。

**请求**:
```json
{
  "rawPlanQuery": "how to add OAuth2 authentication to a new service"
}
```

**响应** (200): 返回 `GraphPlanSearchResponse`，包含 `plan`（TrapFirstPlan）或 `fallback`（v1/v2 响应）。

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

## 反馈端点

### POST /v1/feedback

提交知识条目反馈。

**请求**:
```json
{
  "entryId": "entry-xxx",
  "entryType": "trap",
  "problemType": "outdated" | "incorrect" | "unclear" | "other",
  "description": "This guide is outdated",
  "context": {
    "queryUsed": "search query that led to this entry",
    "resultPosition": 1
  },
  "querySeed": "optional original query seed",
  "customAnswers": {
    "wouldRecommend": false
  }
}
```

**响应** (201):
```json
{
  "feedback": {
    "id": "feedback-xxx",
    "entryId": "entry-xxx",
    "entryType": "trap",
    "problemType": "outdated",
    "description": "This guide is outdated",
    "submittedAt": "2026-05-06T12:00:00Z",
    "submittedBy": {
      "id": "user-xxx",
      "handle": "alice@example.com",
      "securityLevel": 5
    },
    "status": "new"
  }
}
```

**自动触发**：当同类反馈达到阈值时（如 3 条 outdated），系统自动标记条目进入相应生命周期状态。

---

## 管理员反馈端点

### GET /v1/operations/feedback

管理员获取反馈列表。

**查询参数**:
- `limit`: 数量限制 (默认 50)
- `status`: 按状态过滤 (`new`, `triaged`, `resolved`, `dismissed`)
- `problemType`: 按问题类型过滤
- `entryId`: 按条目 ID 过滤
- `entryType`: 按条目类型过滤 (`trap`, `skill`)
- `minAgeDays`: 最小天数
- `maxAgeDays`: 最大天数

**响应** (200):
```json
{
  "items": [
    {
      "id": "feedback-xxx",
      "entryId": "entry-xxx",
      "entryType": "trap",
      "entryShortcut": "oauth-setup",
      "problemType": "outdated",
      "description": "This guide is for old version",
      "context": { "queryUsed": "oauth setup" },
      "submittedAt": "2026-05-06T12:00:00Z",
      "submittedBy": {
        "id": "user-xxx",
        "handle": "alice@example.com",
        "securityLevel": 5
      },
      "status": "new",
      "ageDays": 5,
      "adminNotes": null
    }
  ],
  "total": 150
}
```

---

### POST /v1/operations/feedback/batch

批量处理反馈。

**请求**:
```json
{
  "feedbackIds": ["feedback-xxx", "feedback-yyy"],
  "action": "resolve" | "dismiss" | "triage" | "transition",
  "notes": "Action taken to address feedback",
  "dryRun": false,
  "transitionTarget": "stale"
}
```

**响应** (200):
```json
{
  "action": "resolve",
  "dryRun": false,
  "items": [
    {
      "feedbackId": "feedback-xxx",
      "eligible": true,
      "reason": null,
      "transitionApplied": false
    }
  ],
  "totalEligible": 2,
  "totalIneligible": 0,
  "appliedAt": "2026-05-06T14:00:00Z"
}
```

---

### GET /v1/operations/feedback/stats/:entryId

获取条目的反馈统计和质量分数。

**响应** (200):
```json
{
  "entryId": "entry-xxx",
  "entryType": "trap",
  "quality": {
    "totalFeedback": 15,
    "unresolvedFeedback": 3,
    "outdatedReports": 2,
    "incorrectReports": 1,
    "qualityScore": 0.55,
    "lastFeedbackAt": "2026-05-06T12:00:00Z"
  },
  "recentFeedback": [...]
}
```

---

## Decay 管理端点

### GET /v1/operations/decay/entries

列出带有 decay 状态的知识条目。

**查询参数**:
- `limit`: 数量限制 (默认 50)
- `decayStates`: 按 decay 状态过滤 (`active`, `review-due`, `stale`, `expired`, `superseded`)
- `ageMinDays`: 最小年龄天数
- `ageMaxDays`: 最大年龄天数
- `labels`: 按标签过滤
- `scope`: 按范围过滤 (`global`, `team`)

**响应** (200):
```json
{
  "items": [
    {
      "id": "entry-xxx",
      "scope": "global",
      "labels": ["auth", "oauth"],
      "shortcut": "oauth-setup",
      "lifecycleState": "approved",
      "requiredLevel": 2,
      "updatedAt": "2026-04-30T12:00:00Z",
      "decayState": "stale",
      "freshnessType": "evergreen",
      "ageDays": 95,
      "lastVerifiedAt": "2026-02-01T00:00:00Z",
      "supersededById": null
    }
  ],
  "total": 25
}
```

---

### POST /v1/operations/decay/batch

批量执行 decay 操作。

**请求**:
```json
{
  "entryIds": ["entry-xxx", "entry-yyy"],
  "action": "extend" | "mark-review" | "deactivate" | "supersede",
  "extendDays": 30,
  "replacementId": "entry-zzz",
  "dryRun": false
}
```

**响应** (200):
```json
{
  "action": "extend",
  "dryRun": false,
  "items": [
    {
      "entryId": "entry-xxx",
      "shortcut": "oauth-setup",
      "currentDecayState": "stale",
      "proposedDecayState": "fresh",
      "changeDescription": "Extending verification by 30 days",
      "eligible": true,
      "ineligibilityReason": null
    }
  ],
  "totalEligible": 2,
  "totalIneligible": 0,
  "appliedAt": "2026-05-06T14:00:00Z"
}
```

---

### POST /v1/operations/decay/search

按模式搜索带有 decay 状态的条目。

**请求**:
```json
{
  "pattern": "oauth",
  "decayStates": ["stale", "review-due"],
  "limit": 20
}
```

**响应** (200):
```json
{
  "items": [...],
  "total": 5
}
```

---

## Maintenance 管理端点

### GET /v1/operations/maintenance/entries

列出带有维护元数据的知识条目。

**查询参数**:
- `limit`: 数量限制 (默认 50)
- `missingOwner`: 仅显示无所有者的条目
- `reviewOverdue`: 仅显示审核逾期的条目
- `staleVerification`: 仅显示验证过期的条目
- `staleDays`: 过期天数阈值 (默认 180)
- `labels`: 按标签过滤
- `scope`: 按范围过滤

**响应** (200):
```json
{
  "items": [
    {
      "id": "entry-xxx",
      "scope": "global",
      "labels": ["auth"],
      "shortcut": "oauth-setup",
      "lifecycleState": "approved",
      "requiredLevel": 2,
      "updatedAt": "2026-04-30T12:00:00Z",
      "decayState": "stale",
      "ageDays": 95,
      "lastVerifiedAt": "2026-02-01T00:00:00Z",
      "maintainer": {
        "id": "user-xxx",
        "handle": "alice@example.com",
        "securityLevel": 5
      },
      "reviewBy": "2026-05-01T00:00:00Z"
    }
  ],
  "total": 10
}
```

---

### POST /v1/operations/maintenance/batch

批量执行维护操作。

**请求**:
```json
{
  "entryIds": ["entry-xxx", "entry-yyy"],
  "action": "assign-owner" | "extend-review" | "mark-verified",
  "newMaintainerId": "user-xxx",
  "newMaintainerHandle": "alice@example.com",
  "extendDays": 30,
  "dryRun": false
}
```

**响应** (200):
```json
{
  "action": "assign-owner",
  "dryRun": false,
  "items": [
    {
      "entryId": "entry-xxx",
      "shortcut": "oauth-setup",
      "currentMaintainer": null,
      "currentReviewBy": null,
      "proposedChange": "Assign owner: alice@example.com",
      "eligible": true,
      "ineligibilityReason": null
    }
  ],
  "totalEligible": 2,
  "totalIneligible": 0,
  "appliedAt": "2026-05-06T14:00:00Z"
}
```

---

### POST /v1/admin/reconcile-knowledge-indexes

重新同步所有知识索引（向量、关键词、图）。

**权限**: 仅限系统管理员。

**响应** (200):
```json
{
  "success": true,
  "totalEntries": 150,
  "entriesSynced": 148,
  "entriesRemoved": 2,
  "entriesSkipped": 0
}
```

---

## Evidence 元数据端点

### PATCH /v1/knowledge/:id/evidence

更新知识条目的 evidence 元数据。

**请求**:
```json
{
  "sourceType": "stack-overflow" | "github-issue" | "official-docs" | "internal-experience",
  "sourceRef": "https://stackoverflow.com/questions/xxx",
  "evidenceLevel": "anecdotal" | "tested" | "verified" | "authoritative"
}
```

**响应** (200):
```json
{
  "evidence": {
    "sourceType": "stack-overflow",
    "sourceRef": "https://stackoverflow.com/questions/xxx",
    "evidenceLevel": "tested",
    "verifiedAt": "2026-05-06T12:00:00Z",
    "verifiedBy": {
      "id": "user-xxx",
      "handle": "alice@example.com",
      "securityLevel": 5
    }
  }
}
```

---

## Boundary Search 端点（管理员）

### POST /admin/boundary-search

搜索符合边界约束的知识条目。

**权限**: 仅限系统管理员。

**请求**:
```json
{
  "context": "backend",
  "platform": "node.js",
  "package": "express",
  "maxResults": 20
}
```

**响应** (200):
```json
{
  "matches": [
    {
      "entryId": "entry-xxx",
      "scope": "global",
      "shortcut": "express-middleware-order",
      "detail": "Middleware execution order in Express.js...",
      "labels": ["express", "middleware"],
      "boundary": {
        "context": ["backend"],
        "versions": [{ "platform": "node.js", "min": "14.0.0" }],
        "prerequisites": ["express"],
        "signals": [],
        "exclusions": [],
        "evidence": []
      }
    }
  ],
  "query": {
    "context": "backend",
    "platform": "node.js",
    "package": "express"
  }
}
```

---

## 其他操作端点

### POST /v1/operations/artifacts/activate

激活工件（获取文件内容用于执行）。

**请求**:
```json
{
  "artifactId": "artifact-xxx",
  "revision": "1.0.0",
  "selectedPaths": ["references/guide.md", "scripts/setup.sh"]
}
```

**响应** (200):
```json
{
  "artifactId": "artifact-xxx",
  "title": "OAuth2 Implementation",
  "revision": "1.0.0",
  "requiredLevel": 2,
  "files": [
    {
      "path": "references/guide.md",
      "kind": "reference",
      "sha256": "abc123...",
      "sizeBytes": 2048,
      "mediaType": "text/markdown",
      "source": "references/",
      "content": "# OAuth2 Setup Guide..."
    }
  ],
  "scriptDescriptors": [
    {
      "path": "scripts/setup.sh",
      "runMode": "cli",
      "policy": "user-opt-in"
    }
  ],
  "activatedAt": "2026-05-06T12:00:00Z",
  "activatedBy": {
    "id": "user-xxx",
    "handle": "alice@example.com",
    "securityLevel": 5
  }
}
```

---

### POST /v1/operations/artifacts/:artifactId/deactivate

停用工件。

**请求**:
```json
{
  "reason": "Deprecated in favor of new implementation"
}
```

**响应** (200):
```json
{
  "artifact": {
    "id": "artifact-xxx",
    "title": "OAuth2 Implementation",
    "lifecycleState": "deactivated"
  },
  "previousState": "approved",
  "newState": "deactivated"
}
```

---

### POST /v1/operations/artifacts/:artifactId/edit

编辑工件内容。

**请求**:
```json
{
  "title": "Updated OAuth2 Guide",
  "labels": ["auth", "oauth2", "security"],
  "files": [
    {
      "path": "SKILL.md",
      "content": "Updated content...",
      "language": "markdown"
    }
  ],
  "scriptDescriptors": [
    {
      "path": "scripts/setup.sh",
      "runMode": "cli",
      "policy": "user-opt-in"
    }
  ]
}
```

**响应** (200):
```json
{
  "artifact": {
    "id": "artifact-xxx",
    "title": "Updated OAuth2 Guide",
    "latestRevision": {
      "revision": "1.1.0"
    }
  },
  "previousRevision": "1.0.0",
  "lifecycleTransition": {
    "from": "approved",
    "to": "agent-pass"
  }
}
```

---

### GET /v1/operations/artifacts/review-queue

获取待审核的工件队列。

**查询参数**:
- `limit`: 数量限制
- `lifecycleState`: 过滤状态 (默认 `agent-pass`)

**响应** (200):
```json
{
  "queue": [
    {
      "id": "artifact-xxx",
      "title": "OAuth2 Implementation",
      "slug": "oauth2-implementation",
      "lifecycleState": "agent-pass",
      "submittedBy": {
        "id": "user-xxx",
        "handle": "alice@example.com",
        "securityLevel": 5
      },
      "submittedAt": "2026-05-06T12:00:00Z"
    }
  ]
}
```

---

### POST /v1/operations/artifacts/import

导入工件目录。

**请求**:
```json
{
  "directoryPath": "/path/to/skill",
  "scope": "global",
  "teamId": null,
  "requiredLevel": 2
}
```

**响应** (200):
```json
{
  "imported": 3,
  "skipped": 1,
  "errors": []
}
```

---

### POST /v1/operations/artifacts/export

导出工件。

**请求**:
```json
{
  "artifactIds": ["artifact-xxx"],
  "format": "directory"
}
```

**响应** (200):
```json
{
  "format": "directory",
  "artifacts": [
    {
      "id": "artifact-xxx",
      "title": "OAuth2 Implementation",
      "files": [...]
    }
  ]
}
```

---

### POST /v1/operations/migrate

迁移旧版知识条目到工件格式。

**响应** (200):
```json
{
  "migrated": 50,
  "skipped": 5,
  "errors": []
}
```

---

### GET /v1/operations/status

获取系统兼容性状态。

**查询参数**:
- `teamId`: 按团队过滤

**响应** (200):
```json
{
  "totalLegacyEntries": 100,
  "migratedEntriesCount": 75,
  "unmigratedEntriesCount": 25,
  "totalArtifacts": 80,
  "artifactsBySourceKind": {
    "skill-directory": 30,
    "single-skill-md": 15,
    "legacy-knowledge": 35
  },
  "unmigratedEntryIds": ["entry-xxx", "entry-yyy"],
  "coexistenceActive": true,
  "sunsetReady": false,
  "sunsetBlockers": ["25 unmigrated entries remaining"],
  "reportedAt": "2026-05-06T12:00:00Z"
}
```

---

### GET /v1/operations/knowledge

列出所有知识条目（旧版，用于迁移）。

**查询参数**:
- `limit`: 数量限制
- `scope`: 按范围过滤
- `lifecycleState`: 按生命周期状态过滤

**响应** (200):
```json
{
  "entries": [...]
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
