# TrapMap API 契约表面

> **文档关系说明**：本文档是 API 契约表面的全量概览，列出所有端点的请求/响应 Schema 名称。若需完整端点详情（请求示例、响应字段说明），请参阅 [`docs/architecture/API.md`](../architecture/API.md)。
>
> **Round 3 更新**：知识域的标签（`knowledge_labels`）、边界（`knowledge_boundary_*` ×6）、维护（`knowledge_maintenance_assignments`）已从 JSONB 拆分为 PostgreSQL 结构化子表。API 契约表面未变，所有请求/响应 Schema 保持不变。`KnowledgeEntry` 的 Schema 类型定义仍为单一聚合，子表读写由 `PgKnowledgeRepository` 内部处理。

所有路由均以 `/v1` 或 `/v3` 为版本前缀，通过 `@trapmap/contracts` 验证进行 JSON 数据交换。

> 源码依据：`packages/server/src/routes/*.ts`、`packages/contracts/src/domain/*.ts`
>
> **Phase 1 instrumentation freeze**：统一 correlation key、metric namespace 与 public/internal debug 边界以 `packages/contracts/src/domain/observability.ts` 为准。API 响应只能增加 additive debug handles，不得把内部 workflow/candidate/artifact trace payload 直接提升为通用 public surface。

---

## Runtime / Health

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `GET` | `/health` | 无 | 非 contracts 内部 runtime JSON：`{ status, product, packages, liveness, readiness, requestContext, dependencies, graphQuery, memory, uptimeSeconds }` | Liveness 与实例运行时状态快照 |
| `GET` | `/ready` | 无 | 非 contracts 内部 runtime JSON：`{ ok, product, packages, liveness, readiness, requestContext, dependencies, graphQuery, memory, uptimeSeconds }`；`readiness === "not-ready"` 时返回 `503` | Traffic readiness 与降级状态判断 |
| `GET` | `/meta/routes` | 无 | `{ documentedRoutes: string[] }` | 暴露当前 server 维护的文档化路由列表 |

> 源码：`packages/server/src/app.ts`

## 认证

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `POST` | `/v1/auth/login` | `loginRequestSchema` | `loginResponseSchema` | 使用访问密钥或系统管理员密钥进行认证 |
| `GET` | `/v1/auth/session` | 无 | `sessionStatusResponseSchema` | 获取当前会话和有效权限 |
| `POST` | `/v1/auth/logout` | 无 | `logoutResponseSchema` | 清除当前会话 |

> 源码：`packages/server/src/routes/auth.ts`

## 团队与成员

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `GET` | `/v1/teams` | 无 | `teamListResponseSchema` | 列出可用团队和当前活动团队 |
| `POST` | `/v1/teams` | `createTeamRequestSchema` | `teamSchema` | 创建新团队 |
| `POST` | `/v1/teams/select` | `selectTeamRequestSchema` | `activeSessionSchema` | 设置当前会话的活动团队 |
| `POST` | `/v1/members` | `createMemberRequestSchema` | `memberSchema` | 注册新团队成员（`securityLevel` 来自请求，默认 0） |
| `PATCH` | `/v1/members/:memberId` | `updateMemberRequestSchema` | `memberSchema` | 更新等级、权限或备注 |
| `POST` | `/v1/access-keys` | `issueAccessKeyRequestSchema` | `issueAccessKeyResponseSchema` | 为其他成员生成永久访问密钥（通过 `repos.accessKey` 持久化） |

> 源码：`packages/server/src/routes/teams.ts`、`packages/server/src/routes/members.ts`、`packages/server/src/routes/access-keys.ts`

## 知识条目

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `POST` | `/v1/knowledge` | `knowledgeSubmissionSchema` | `knowledgeEntryResponseSchema` | 提交新知识以供审核 |
| `GET` | `/v1/knowledge/mine` | 无 | `knowledgeHistoryResponseSchema` | 查看当前用户自己的提交记录和审核历史 |
| `GET` | `/v1/knowledge/:entryId` | 无 | `knowledgeEntryResponseSchema` | 以所有者或审核者身份查看特定提交 |
| `PATCH` | `/v1/knowledge/:entryId` | `knowledgeUpdateSchema` | `knowledgeEntryResponseSchema` | 具有足够权限时更新已批准的条目 |
| `POST` | `/v1/knowledge/:entryId/resubmit` | `knowledgeResubmissionSchema` | `knowledgeEntryResponseSchema` | 重新提交被拒内容并保留历史记录 |
| `POST` | `/v1/knowledge/:entryId/supersede` | `{ replacementId: string }` | `knowledgeEntryResponseSchema` | 标记条目已被新条目取代 |
| `GET` | `/v1/knowledge/review-queue` | `reviewQueueQuerySchema` | `reviewQueueResponseSchema` | 列出待审核条目 |
| `POST` | `/v1/knowledge/review` | `reviewDecisionRequestSchema` | `knowledgeEntryResponseSchema` | 批准或拒绝提交；默认 `light` 主线通过 `host-local` Nest gateway 委托 `governance-review` owner，`heavy` 通过 distributed gateway 转发到 `governance-review` service |
| `PATCH` | `/v1/knowledge/:id/evidence` | `evidenceMetaSchema`（部分） | `{ evidence: evidenceMetaSchema }` | 更新知识条目的 evidence 元数据 |
| `POST` | `/v1/operations/knowledge/:entryId/deactivate` | `knowledgeDeactivateRequestSchema` | `knowledgeDeactivateResponseSchema` | 停用知识条目并记录审计日志 |

> 源码：`packages/server/src/routes/knowledge.ts`、`packages/host-local/src/nest/gateway/candidate-review.controller.ts`、`packages/host-distributed/src/gateway/routes.ts`、`packages/service-governance-review/src/routes.ts`、`packages/server/src/routes/evidence.ts`

## 陷阱（Traps）

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `POST` | `/v1/traps` | `knowledgeSubmissionSchema` | `knowledgeEntryResponseSchema` | 创建陷阱 |
| `GET` | `/v1/traps` | 无 | `knowledgeHistoryResponseSchema` | 列出当前用户的陷阱 |
| `GET` | `/v1/traps/:trapId` | 无 | `knowledgeEntryResponseSchema` | 获取陷阱详情 |
| `POST` | `/v1/traps/:trapId/resubmit` | `knowledgeResubmissionSchema` | `knowledgeEntryResponseSchema` | 重新提交被拒绝的陷阱 |
| `POST` | `/v1/traps/:trapId/supersede` | `{ replacementId: string }` | `knowledgeEntryResponseSchema` | 标记陷阱已被新条目取代 |

> 源码：`packages/server/src/routes/traps.ts`

## 候选与重复检测

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `POST` | `/v1/candidates` | `candidateSubmissionRequestSchema` | `candidateSubmissionResponseSchema` | 提交候选（异步摄取） |
| `GET` | `/v1/candidates` | `{ status?: string }` | `candidateListResponseSchema` | 列出候选（支持按状态过滤） |
| `GET` | `/v1/candidates/:candidateId` | 无 | `candidateStatusResponseSchema` | 获取候选状态 |
| `POST` | `/v1/candidates/:candidateId/manual-result` | `ManualResultSubmissionSchema` | `manualResultResponseSchema` | 人工解决重复 |
| `POST` | `/v1/candidates/:candidateId/apply-resolution` | 无 | `applyResolutionResponseSchema` | 兼容候选发布入口；不再由 `packages/server` Fastify compatibility shell 提供默认 authoritative write |
| `GET` | `/v1/duplicates` | 无 | `duplicateCaseListResponseSchema` | 列出所有重复案例 |
| `GET` | `/v1/duplicates/:candidateId` | 无 | `duplicateCaseResponseSchema` | 获取特定候选的重复案例 |
| `GET` | `/v1/duplicates/:candidateId/bundle` | 无 | `DuplicateJobBundleResponseSchema` | 获取重复候选完整包（含匹配实体） |

> 源码：`packages/server/src/routes/candidates.ts`（submit/query/duplicates compatibility surface）、`packages/host-local/src/nest/gateway/candidate-review.controller.ts`、`packages/host-distributed/src/gateway/routes.ts`、`packages/service-candidate-ingestion/src/routes.ts`

## 检索

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `POST` | `/v1/retrieval/search` | `retrievalQuerySchema` | `retrievalResponseSchema` | v1 条目级检索（语义/混合/图辅助，additive `queryId`） |
| `POST` | `/v2/retrieval/search` | `retrievalV2QuerySchema` | `retrievalV2ResponseWithHintsSchema` | v2 胶囊检索（含激活提示，additive `queryId`） |
| `POST` | `/v3/retrieval/search` | `graphPlanSearchQuerySchema` | `graphPlanSearchResponseSchema` | v3 图计划检索（置信度感知，高置信度返回计划，否则回退，additive `queryId`） |
| `POST` | `/v3/retrieval/plan` | `planQuerySchema` | `trapFirstPlanSchema` | v3 陷阱优先计划生成 |
| `POST` | `/v1/retrieval/skills/search-by-content` | `skillLookupQuerySchema` | `skillLookupResponseSchema` | 按内容搜索技能（additive `queryId`） |

> 源码：`packages/server/src/routes/retrieval.ts`

## 反馈

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `POST` | `/v1/feedback` | `feedbackSubmissionSchema` | `feedbackResponseSchema` | 提交知识条目反馈，支持 additive badcase reproducibility envelope；PG 模式下会返回 additive `asyncJobId` 用于 badcase export draft follow-up |
| `GET` | `/v1/operations/feedback` | `feedbackListRequestSchema` | `feedbackListResponseSchema` | 管理员获取反馈列表 |
| `GET` | `/v1/operations/feedback/remediation` | 无 | `feedbackRemediationQueueResponseSchema` | 获取达到阈值的 remediation 工作队列 |
| `GET` | `/v1/operations/feedback/remediation/:entryId` | 无 | `feedbackRemediationDetailResponseSchema` | 获取单个 trap/skill remediation 详情与内容快照 |
| `POST` | `/v1/operations/feedback/remediation/:entryId/complete` | `feedbackRemediationCompleteRequestSchema` | `feedbackRemediationCompleteResponseSchema` | 完成 remediation；批量 resolve 当前未解决 feedback，并在 PG 模式下返回 additive `asyncJobId` 指向后续 reactivation/reindex job |
| `POST` | `/v1/operations/feedback/batch` | `feedbackBatchRequestSchema` | `feedbackBatchResponseSchema` | 批量处理反馈（resolve/dismiss/triage/transition） |
| `GET` | `/v1/operations/feedback/stats/:entryId` | 无 | `feedbackStatsResponseSchema` | 获取条目的反馈统计和质量分数 |

> **Round 6 更新**：反馈持久化已从 `store_snapshot` JSONB 迁移为 `feedback_records` + `feedback_custom_answers` PostgreSQL 结构化表。API 契约不变。

> **2026-06-09 更新**：当同一 `trap` 或 `skill` 的未解决反馈数达到阈值（当前为 `10`）时，系统会在读取时聚合出 remediation/suppression 状态，并通过 `/v1/operations/feedback/remediation*` 暴露人工处理队列。当前 suppression 先通过检索时硬过滤生效；索引摘除/重建仍是后续增强项。

> 源码：`packages/server/src/routes/feedback.ts`、`packages/server/src/routes/feedback-admin.ts`

## Decay 管理

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `GET` | `/v1/operations/decay/entries` | `decayEntryListRequestSchema` | `decayEntryListResponseSchema` | 列出带有 decay 状态的知识条目 |
| `POST` | `/v1/operations/decay/batch` | `batchOperationRequestSchema` | `batchOperationResponseSchema` | 批量执行 decay 操作（extend/mark-review/deactivate/supersede） |
| `POST` | `/v1/operations/decay/search` | `{ pattern, decayStates?, limit? }` | `decayEntryListResponseSchema` | 按模式搜索带有 decay 状态的条目 |

> 源码：`packages/server/src/routes/decay.ts`

## Maintenance 管理

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `GET` | `/v1/operations/maintenance/entries` | `maintenanceEntryListRequestSchema` | `maintenanceEntryListResponseSchema` | 列出带有维护元数据的知识条目 |
| `POST` | `/v1/operations/maintenance/batch` | `maintenanceBatchOperationRequestSchema` | `maintenanceBatchOperationResponseSchema` | 批量执行维护操作（assign-owner/extend-review/mark-verified） |

> 源码：`packages/server/src/routes/maintenance.ts`

## 工件（Artifacts / Skills）

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `POST` | `/v1/operations/artifacts/activate` | `activationRequestSchema` | `activationResponseSchema` | 激活工件（获取文件内容用于执行） |
| `POST` | `/v1/operations/artifacts/:artifactId/deactivate` | `artifactDeactivateRequestSchema` | `artifactDeactivateResponseSchema` | 停用工件 |
| `POST` | `/v1/operations/artifacts/:artifactId/edit` | `skillEditRequestSchema` | `skillEditResponseSchema` | 编辑工件内容 |
| `GET` | `/v1/operations/artifacts/:artifactId/history` | `skillHistoryRequestSchema` | `skillHistoryResponseSchema` | 获取工件版本历史 |
| `POST` | `/v1/operations/artifacts/:artifactId/review` | `skillReviewDecisionRequestSchema` | `skillReviewDecisionResponseSchema` | 审核工件（approve/reject） |
| `POST` | `/v1/operations/artifacts/export` | `artifactExportRequestSchema` | `artifactExportResponseSchema` | 导出工件 |
| `POST` | `/v1/operations/artifacts/import` | `artifactImportRequestSchema` | `artifactImportResponseSchema` | 导入工件目录 |
| `GET` | `/v1/operations/artifacts/review-queue` | 无 | `skillReviewQueueResponseSchema` | 获取待审核的工件队列 |

> 源码：`packages/server/src/routes/operations/artifacts-activate.ts`、`packages/server/src/routes/operations/skill-edit.ts`、`packages/server/src/routes/operations/skill-review.ts`、`packages/server/src/routes/operations/artifacts-export.ts`、`packages/server/src/routes/operations/artifacts-import.ts`

## 操作端点

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `POST` | `/v1/operations/export` | `exportRequestSchema` | `exportBundleSchema` | 以 JSON 格式导出可访问的知识 |
| `POST` | `/v1/operations/import` | `importRequestSchema` | `importResponseSchema` | 导入 JSON 或兼容 Claude 的技能内容 |
| `GET` | `/v1/operations/knowledge` | `knowledgeListRequestSchema` | `knowledgeListResponseSchema` | 列出所有知识条目（旧版，用于迁移） |
| `GET` | `/v1/operations/audit` | `auditQuerySchema` | `auditListResponseSchema` | 查看操作审计事件 |
| `POST` | `/v1/operations/migrate` | `legacyMigrationRequestSchema` | `legacyMigrationResponseSchema` | 迁移旧版知识条目到工件格式 |
| `GET` | `/v1/operations/status` | `compatibilityStatusRequestSchema` | `compatibilityStatusResponseSchema` | 获取系统兼容性状态 |
| `GET` | `/v1/operations/status/async` | 无 | `asyncOperationsStatusResponseSchema` | 获取 Phase 2 async contract，以及 Phase 3 的 `operatorHome`、`configGovernance`、`capacityModel`、`bulkOperations`、queue/outbox/cache/workflow drill-down |
| `POST` | `/v1/operations/status/async/tasks/:taskId/requeue` | 无 | `asyncTaskRequeueResponseSchema` | 通过统一 operator flow 重新入队 dead task |
| `GET` | `/v1/operations/badcases/:feedbackId/export` | 无 | `badcaseExportResponseSchema` | 把持久化 badcase trace 导出为 deterministic eval draft，并附带 operator-only `debug` 闭环信息 |

> 源码：`packages/server/src/routes/operations.ts`（注册子路由）

Phase 4 closeout 补充：

- 默认 operator surface 已冻结为 `operatorHome`、`configGovernance`、`capacityModel`、`bulkOperations` 以及 queue/outbox/cache/workflow drill-down。
- `workflow` drill-down 当前可返回 internal/operator-only `workflows[*].correlation`，用于解释 `requestId` / `traceId` / `queryId` / `feedbackId` / `asyncJobId` 与 async follow-up 的关系；它不属于新的通用 public additive field。
- `GET /v1/operations/badcases/:feedbackId/export` 的 `debug` 字段同样属于 operator/debug 闭环，不属于 script/eval draft payload；`scripts/export-badcase-to-eval.ts` 只序列化 `draft`。
- 热点 `team/query/artifact` 当前不属于默认 operator surface contract；如后续需要，应作为单独 deep drill-down 能力新增，而不是隐式塞入现有首页 schema。
- 本根计划已经关闭；如需新增 operator/debug route、operator panel、额外 public additive field 或新的 export wrapper，必须转入独立审计或独立计划，而不是继续在当前 closeout 口径下扩写。

## Capsule-Index 运维

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `POST` | `/v1/operations/capsule-index/rebuild` | `{ mode: 'full' }` 或 `{ mode: 'artifact', artifactId }` | `{ mode, stats? / result?, rebuiltAt }` | 重建 capsule 索引（全量或按 artifact） |
| `GET` | `/v1/operations/capsule-index/health` | 无 | `{ sourceArtifactCount, report: { missingKeywords, missingEmbeddings, failedKeywords, failedEmbeddings, orphanKeywords, orphanEmbeddings }, reportedAt }` | 健康对账（只读） |
| `POST` | `/v1/operations/capsule-index/cleanup-orphans` | 无 | `{ sourceArtifactCount, removed, cleanedAt }` | 清理孤立索引行 |

> 源码：`packages/server/src/routes/operations/capsule-index.ts`
>
> **CLI 暴露**: `trapmap operations capsule-index rebuild|health|cleanup-orphans`。详见 CLI 帮助。

## 使用统计

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `GET` | `/v1/operations/stats/usage` | `statsUsageQuerySchema` | `statsUsageResponseSchema` | 按时间桶聚合的使用量时序数据 |
| `GET` | `/v1/operations/stats/hits` | `statsHitRankingQuerySchema` | `statsHitRankingResponseSchema` | 按条目命中次数排名 |
| `GET` | `/v1/operations/stats/summary` | `statsSummaryQuerySchema` | `statsSummaryResponseSchema` | 系统级汇总统计（仅 system-admin），包含 asyncArchitecture 决策指标，以及 namespace 级 cache invalidation / pending invalidation capacity 视角 |

> 源码：`packages/server/src/routes/operations/stats.ts`。注意：统计端点需要 PostgreSQL（`usageAnalyticsRepo`），否则返回 503。

## 边界搜索与管理

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `POST` | `/admin/boundary-search` | `adminBoundarySearchQuerySchema` | `adminBoundarySearchResponseSchema` | 搜索符合边界约束的知识条目（仅 system-admin） |
| `POST` | `/v1/admin/reconcile-knowledge-indexes` | 无 | `{ success, totalEntries, entriesSynced, ... }` | 重新同步所有知识索引（仅 system-admin） |

> 源码：`packages/server/src/routes/admin-boundary-search.ts`

---

## 说明

- CLI 和 Server 必须将 `@trapmap/contracts` 视为规范的 Schema 契约表面。
- 统计端点（`/v1/operations/stats/*`）依赖 PostgreSQL，使用 JSONB 存储的部署不可用。
- **Round 2 更新**：知识、陷阱（traps）、候选提交的内部实现已从 `store_snapshot` JSONB 切换为 PostgreSQL 专用表（通过 `KnowledgeRepository` / `CandidateRepository`）。API 契约表面未变，所有请求/响应 Schema 保持不变。`DualWrite*Repository` 兼容层已删除。
- **Round 3 更新**：知识域标签（`knowledge_labels`）、边界（`knowledge_boundary_*` ×6）、维护（`knowledge_maintenance_assignments`）已从 JSONB 拆为 PostgreSQL 结构化子表。`knowledge_entries` 及 `lifecycle_events` 表已补齐 `CHECK` 约束。`knowledge_revisions` 表已补齐 `unique(entry_id, revision_no)` 约束。知识条目读写 API 契约无变更。
- 后续阶段可能会添加内部辅助路由，但新的面向用户的工作流路由应扩展此列表而非替换它。
