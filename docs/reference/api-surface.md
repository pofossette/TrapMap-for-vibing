# TrapMap API 契约表面

> **文档关系说明**：本文档是 v1 API 契约表面的快速概览，列出所有端点的请求/响应 Schema 名称。若需完整端点详情（请求示例、响应字段说明），请参阅 [`docs/architecture/API.md`](../architecture/API.md)。

本文档在功能实现之前固定初始 v1 API 契约表面。所有路由均以 `/v1` 为根路径，通过 `@trapmap/contracts` 验证进行 JSON 数据交换。

## 认证

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|--------|-------|------------------|-------------------|---------|
| `POST` | `/v1/auth/login` | `loginRequestSchema` | `loginResponseSchema` | 使用访问密钥或系统管理员密钥进行认证 |
| `GET` | `/v1/auth/session` | 无 | `sessionStatusResponseSchema` | 获取当前会话和有效权限 |
| `POST` | `/v1/auth/logout` | 无 | `{ ok: boolean }` | 清除当前会话 |

## 团队与成员

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|--------|-------|------------------|-------------------|---------|
| `GET` | `/v1/teams` | 无 | `teamListResponseSchema` | 列出可用团队和当前活动团队 |
| `POST` | `/v1/teams` | `createTeamRequestSchema` | `teamSchema` | 创建新团队 |
| `POST` | `/v1/teams/select` | `selectTeamRequestSchema` | `activeSessionSchema` | 设置当前会话的活动团队 |
| `POST` | `/v1/members` | `createMemberRequestSchema` | `memberSchema` | 注册新团队成员 |
| `PATCH` | `/v1/members/:memberId` | `updateMemberRequestSchema` | `memberSchema` | 更新等级、权限或备注 |
| `POST` | `/v1/access-keys` | `issueAccessKeyRequestSchema` | `accessKeySchema` | 为其他成员生成永久访问密钥 |

## 知识与审核

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|--------|-------|------------------|-------------------|---------|
| `POST` | `/v1/knowledge` | `knowledgeSubmissionSchema` | `knowledgeEntrySchema` | 提交新知识以供审核 |
| `GET` | `/v1/knowledge/mine` | 无 | `knowledgeHistoryResponseSchema` | 查看当前用户自己的提交记录和审核历史 |
| `GET` | `/v1/knowledge/:entryId` | 无 | `knowledgeEntryResponseSchema` | 以所有者或审核者身份查看特定提交 |
| `POST` | `/v1/knowledge/:entryId/resubmit` | `knowledgeResubmissionSchema` | `knowledgeEntrySchema` | 重新提交被拒内容并保留历史记录 |
| `PATCH` | `/v1/knowledge/:entryId` | `knowledgeUpdateSchema` | `knowledgeEntrySchema` | 具有足够权限时更新已批准的条目 |
| `GET` | `/v1/knowledge/review-queue` | `reviewQueueQuerySchema` | `reviewQueueResponseSchema` | 列出待审核条目 |
| `POST` | `/v1/knowledge/review` | `reviewDecisionRequestSchema` | `knowledgeEntrySchema` | 批准或拒绝提交 |

## 检索与运维

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|--------|-------|------------------|-------------------|---------|
| `POST` | `/v1/retrieval/search` | `retrievalQuerySchema` | `retrievalResponseSchema` | 运行文本种子检索并应用安全过滤 |
| `POST` | `/v1/operations/export` | `exportRequestSchema` | `exportBundleSchema` | 以项目 JSON 格式导出可访问的知识 |
| `POST` | `/v1/operations/import` | `importRequestSchema` | `{ imported: number }` | 导入 JSON 或兼容 Claude 的技能内容 |
| `POST` | `/v1/knowledge/:entryId/deactivate` | `knowledgeDeactivateRequestSchema` | `knowledgeEntrySchema` | 停用知识条目并记录审计日志 |
| `GET` | `/v1/audit` | 无 | `auditEventSchema[]` | 查看操作审计事件 |

## 说明

- CLI 和 Server 必须将 `@trapmap/contracts` 视为规范的 Schema 契约表面。
- 后续阶段可能会添加内部辅助路由，但新的面向用户的工作流路由应扩展此列表而非替换它。
