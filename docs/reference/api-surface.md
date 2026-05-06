# TrapMap API Surface

> **文档关系说明**：本文档是 v1 API 契约表面的快速概览，列出所有端点的请求/响应 Schema 名称。若需完整端点详情（请求示例、响应字段说明），请参阅 [`architecture/API.md`](architecture/API.md)。

This document fixes the initial v1 API contract surface before feature implementation.
All routes are rooted at `/v1` and exchange JSON validated by `@trapmap/contracts`.

## Auth

| Method | Route | Request Contract | Response Contract | Purpose |
|--------|-------|------------------|-------------------|---------|
| `POST` | `/v1/auth/login` | `loginRequestSchema` | `loginResponseSchema` | Authenticate with an access key or system admin key |
| `GET` | `/v1/auth/session` | none | `sessionStatusResponseSchema` | Fetch current session and effective permissions |
| `POST` | `/v1/auth/logout` | none | `{ ok: boolean }` | Clear the active session |

## Teams and Members

| Method | Route | Request Contract | Response Contract | Purpose |
|--------|-------|------------------|-------------------|---------|
| `GET` | `/v1/teams` | none | `teamListResponseSchema` | List available teams and the active team |
| `POST` | `/v1/teams` | `createTeamRequestSchema` | `teamSchema` | Create a new team |
| `POST` | `/v1/teams/select` | `selectTeamRequestSchema` | `activeSessionSchema` | Set the active team for the current session |
| `POST` | `/v1/members` | `createMemberRequestSchema` | `memberSchema` | Onboard a new team member |
| `PATCH` | `/v1/members/:memberId` | `updateMemberRequestSchema` | `memberSchema` | Update level, permissions, or notes |
| `POST` | `/v1/access-keys` | `issueAccessKeyRequestSchema` | `accessKeySchema` | Mint a permanent access key for another member |

## Knowledge and Review

| Method | Route | Request Contract | Response Contract | Purpose |
|--------|-------|------------------|-------------------|---------|
| `POST` | `/v1/knowledge` | `knowledgeSubmissionSchema` | `knowledgeEntrySchema` | Submit new knowledge for review |
| `GET` | `/v1/knowledge/mine` | none | `knowledgeHistoryResponseSchema` | Inspect the current user's submissions and review history |
| `GET` | `/v1/knowledge/:entryId` | none | `knowledgeEntryResponseSchema` | Inspect a specific submission as the owner or reviewer |
| `POST` | `/v1/knowledge/:entryId/resubmit` | `knowledgeResubmissionSchema` | `knowledgeEntrySchema` | Resubmit rejected content while preserving history |
| `PATCH` | `/v1/knowledge/:entryId` | `knowledgeUpdateSchema` | `knowledgeEntrySchema` | Update an approved entry with sufficient privileges |
| `GET` | `/v1/knowledge/review-queue` | `reviewQueueQuerySchema` | `reviewQueueResponseSchema` | List reviewable entries |
| `POST` | `/v1/knowledge/review` | `reviewDecisionRequestSchema` | `knowledgeEntrySchema` | Approve or reject a submission |

## Retrieval and Operations

| Method | Route | Request Contract | Response Contract | Purpose |
|--------|-------|------------------|-------------------|---------|
| `POST` | `/v1/retrieval/search` | `retrievalQuerySchema` | `retrievalResponseSchema` | Run text-seed retrieval with security filters |
| `POST` | `/v1/operations/export` | `exportRequestSchema` | `exportBundleSchema` | Export accessible knowledge in the project JSON format |
| `POST` | `/v1/operations/import` | `importRequestSchema` | `{ imported: number }` | Import JSON or Claude-compatible skill content |
| `POST` | `/v1/knowledge/:entryId/deactivate` | `knowledgeDeactivateRequestSchema` | `knowledgeEntrySchema` | Deactivate a knowledge entry with audit logging |
| `GET` | `/v1/audit` | none | `auditEventSchema[]` | Inspect operational audit events |

## Notes

- CLI and server must treat `@trapmap/contracts` as the canonical schema surface.
- Later phases may add internal helper routes, but new user-facing workflow routes should extend this list rather than replacing it.
