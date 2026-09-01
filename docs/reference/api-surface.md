# TrapMap API 契约表面

> **文档关系说明**：本文档是 API 契约表面的全量概览，列出所有端点的请求/响应 Schema 名称。若需完整端点详情（请求示例、响应字段说明），请参阅 [`docs/archived/architecture/API.md`](../archived/architecture/API.md)。
>
> **Round 3 更新**：知识域的标签（`knowledge_labels`）、边界（`knowledge_boundary_*` ×6）、维护（`knowledge_maintenance_assignments`）已从 JSONB 拆分为 PostgreSQL 结构化子表。API 契约表面未变，所有请求/响应 Schema 保持不变。`KnowledgeEntry` 的 Schema 类型定义仍为单一聚合，子表读写由 `PgKnowledgeRepository` 内部处理。
>
> **Wave-10 更新（2026-08-01）**：`packages/server（Wave-10 已删除）` 已于 Wave-10 删除。本文档中的 `packages/server（Wave-10 已删除）` 路径指向已删除的实现。API 端点已迁移至各 service owner 包和 gateway。
>
> **T3 对账（2026-08-30）**：本表以两宿主网关的 `createGatewayRouteDefs` / `createCronGatewayRouteDefs` / `createExperienceGeneRouteDefs` 为准（`packages/host-local/src/nest/gateway/*`、`packages/host-distributed/src/gateway/route-defs.ts`、`packages/service-knowledge-read/src/experience-gene-routes.ts`）。仍在 `SURFACE_INVENTORY_DRIFT` 中的旧版路径为已随 server 包退役、未在 gateway 实现的 legacy 面；`SURFACE_EXEMPTIONS` 仅保留 `/v2/retrieval/search`（CLI `--v2` 兼容，见 `docs/todos/open-debt-and-compromises.md`）。

所有路由均以 `/v1` 或 `/v3` 为版本前缀，通过 `@trapmap/contracts` 验证进行 JSON 数据交换。

> 源码依据：`packages/host-local/src/nest/gateway/gateway.route-defs.ts`、`packages/host-local/src/nest/gateway/gateway.cron-route-defs.ts`、`packages/host-distributed/src/gateway/route-defs.ts`、`packages/service-knowledge-read/src/experience-gene-routes.ts`、`packages/contracts/src/domain/*.ts`
>
> **Phase 1 instrumentation freeze**：统一 correlation key、metric namespace 与 public/internal debug 边界以 `packages/contracts/src/domain/observability.ts` 为准。API 响应只能增加 additive debug handles，不得把内部 workflow/candidate/artifact trace payload 直接提升为通用 public surface。

---

## Shared Client Configuration Contract

`@trapmap/contracts` exports `BackendTarget` and `backendTargetSchema` for client-side
configuration. The only values are `light` and `heavy`: `local-agent` and
`team-monolith` resolve to `light`; `distributed` resolves to `heavy`.
`normalizeBackendTarget()` treats missing or invalid persisted values as `light`.

This is not an HTTP route parameter and does not select an internal service. Clients
continue to use one `gatewayUrl`; the current persistent consumer is the CLI.

> Source: `packages/contracts/src/enum-types/backend-target.ts`, `apps/cli/src/lib/config.ts`

---

## Runtime / Health

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `GET` | `/health` | 无 | 非 contracts 内部 runtime JSON：`{ status, product, packages, liveness, readiness, requestContext, dependencies, graphQuery, memory, uptimeSeconds }` | Liveness 与实例运行时状态快照 |
| `GET` | `/ready` | 无 | 非 contracts 内部 runtime JSON：`{ ok, product, packages, liveness, readiness, requestContext, dependencies, graphQuery, memory, uptimeSeconds }`；`readiness === "not-ready"` 时返回 `503` | Traffic readiness 与降级状态判断 |
| `GET` | `/metrics` | 无 | `text/plain; version=0.0.4` Prometheus exposition | Runtime / async / DB / queue / internal-hop 指标导出；仅低基数标签，禁止 requestId/traceId/queryId 等高基数键进入 label |
| `GET` | `/meta/routes` | 无 | `{ documentedRoutes: string[] }` | 暴露当前 server 维护的文档化路由列表 |

> 源码：`packages/server（Wave-10 已删除）/src/app.ts`
>
> **Phase 3 observability closeout**：`/metrics` 当前只冻结 Prometheus scrape surface，不引入第二套 operator JSON route。`requestId`、`traceId`、`queryId`、`feedbackId`、`asyncJobId` 等高基数关联键继续留在日志、workflow snapshot 或 durable trace，而不是 metrics label。

## 认证

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `POST` | `/v1/auth/logout` | 无 | `logoutResponseSchema` | 清除当前会话（唯一对外认证路由） |

> 源码：`packages/host-distributed/src/gateway/route-defs.ts`
>
> **已退役（不在 gateway）**：`POST /v1/auth/login`、`GET /v1/auth/session` 曾由 `packages/server（Wave-10 已删除）/src/routes/auth.ts` 提供，现未在任何宿主 gateway 注册；如需认证请走分布式网关的 sessionToken / access-key 流程。两者仍在 `SURFACE_INVENTORY_DRIFT` 中豁免，避免新增漂移。

## 团队与成员

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `GET` | `/v1/teams` | 无 | `teamListResponseSchema` | 列出可用团队和当前活动团队 |
| `POST` | `/v1/teams` | `createTeamRequestSchema` | `teamSchema` | 创建新团队 |
| `POST` | `/v1/teams/select` | `selectTeamRequestSchema` | `activeSessionSchema` | 设置当前会话的活动团队 |
| `POST` | `/v1/members` | `createMemberRequestSchema` | `memberSchema` | 注册新团队成员（`securityLevel` 来自请求，默认 0） |
| `PUT` | `/v1/members/:memberId` | `updateMemberRequestSchema` | `memberSchema` | 更新等级、权限或备注（网关实现为 `PUT`） |
| `POST` | `/v1/access-keys` | `issueAccessKeyRequestSchema` | `issueAccessKeyResponseSchema` | 为其他成员生成永久访问密钥（通过 `repos.accessKey` 持久化） |

> 源码：`packages/host-distributed/src/gateway/route-defs.ts`

## 知识条目

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `POST` | `/v1/knowledge` | `knowledgeSubmissionSchema` | `knowledgeEntryResponseSchema` | 提交新知识以供审核 |
| `GET` | `/v1/knowledge/mine` | 无 | `knowledgeHistoryResponseSchema` | 查看当前用户自己的提交记录和审核历史 |
| `GET` | `/v1/knowledge/:entryId` | 无 | `knowledgeEntryResponseSchema` | 以所有者或审核者身份查看特定提交 |
| `PUT` | `/v1/knowledge/:entryId` | `knowledgeUpdateSchema` | `knowledgeEntryResponseSchema` | 具有足够权限时更新已批准的条目（网关为 `PUT`） |
| `POST` | `/v1/knowledge/:entryId/resubmit` | `knowledgeResubmissionSchema` | `knowledgeEntryResponseSchema` | 重新提交被拒内容并保留历史记录 |
| `POST` | `/v1/knowledge/:entryId/supersede` | `{ replacementId: string }` | `knowledgeEntryResponseSchema` | 标记条目已被新条目取代 |
| `GET` | `/v1/knowledge/review-queue` | `reviewQueueQuerySchema` | `reviewQueueResponseSchema` | 服务端筛选、排序和分页列出待审核条目；响应区分 `filteredTotal` 与授权队列 `total` |
| `POST` | `/v1/knowledge/review` | `reviewDecisionRequestSchema` | `knowledgeEntryResponseSchema` | 批准、拒绝或退回修正提交；默认 `light` 主线通过 `host-local` Nest gateway 委托 `governance-review` owner，`heavy` 通过 distributed gateway 转发到 `governance-review` service |
| `GET` | `/v1/knowledge/projection-status` | 无 | `{ status }` | 知识读取投影状态（gateway 直通 `knowledgeRead.getProjectionStatus`） |
| `POST` | `/v1/knowledge/decay` | `knowledgeActionSchema` | `knowledgeEntryResponseSchema` | 触发 decay 治理编排（distributed gateway，`POST /v1/knowledge/decay`） |
| `POST` | `/v1/knowledge/maintenance` | `knowledgeActionSchema` | `knowledgeEntryResponseSchema` | 触发 maintenance 治理编排（distributed gateway，`POST /v1/knowledge/maintenance`） |

> 源码：`packages/host-local/src/nest/gateway/gateway.route-defs.ts`、`packages/host-distributed/src/gateway/route-defs.ts`、`packages/service-governance-review/src/routes.ts`
>
> **已退役（不在 gateway）**：`PATCH /v1/knowledge/:id/evidence`、`POST /v1/operations/knowledge/:entryId/deactivate` 仍见于旧 `packages/server（Wave-10 已删除）/src/routes`，现不在网关实现，保留在 `SURFACE_INVENTORY_DRIFT`。

## 陷阱（Traps）

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `POST` | `/v1/traps` | `knowledgeSubmissionSchema` | `knowledgeEntryResponseSchema` | 创建陷阱 |
| `GET` | `/v1/traps` | 无 | `knowledgeHistoryResponseSchema` | 列出当前用户的陷阱 |
| `GET` | `/v1/traps/:trapId` | 无 | `knowledgeEntryResponseSchema` | 获取陷阱详情 |

> 源码：`packages/host-distributed/src/gateway/route-defs.ts`（网关仅暴露上述 3 条；`POST /v1/traps/:trapId/resubmit`、`POST /v1/traps/:trapId/supersede` 为旧 server 面，已退役，仍在 `SURFACE_INVENTORY_DRIFT`）

## 候选与重复检测

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `POST` | `/v1/candidates` | `candidateSubmissionRequestSchema` | `candidateSubmissionResponseSchema` | 提交候选（异步摄取） |
| `GET` | `/v1/candidates` | `{ status?: string }` | `candidateListResponseSchema` | 列出候选（支持按状态过滤） |
| `GET` | `/v1/candidates/:candidateId` | 无 | `candidateStatusResponseSchema` | 获取候选状态 |
| `POST` | `/v1/candidates/:candidateId/manual-result` | `ManualResultSubmissionSchema` | `manualResultResponseSchema` | 人工解决重复 |
| `POST` | `/v1/candidates/:candidateId/apply-resolution` | 无 | `applyResolutionResponseSchema` | 兼容候选发布入口（host-local 网关，`apply-resolution`） |
| `POST` | `/v1/candidates/:candidateId/resolution` | `candidateResolutionSchema` | `applyResolutionResponseSchema` | 候选决议入口（distributed 网关，`resolution`） |

> 源码：`packages/host-local/src/nest/gateway/gateway.route-defs.ts`、`packages/host-distributed/src/gateway/route-defs.ts`、`packages/service-candidate-ingestion/src/routes.ts`
>
> **已退役（不在 gateway）**：`GET /v1/duplicates`、`GET /v1/duplicates/:candidateId`、`GET /v1/duplicates/:candidateId/bundle` 为旧 server 的 duplicates 兼容面，现未在网关实现，保留在 `SURFACE_INVENTORY_DRIFT`。

## 检索

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `POST` | `/v1/retrieval/search` | `retrievalQuerySchema` | `retrievalResponseSchema` | v1 条目级检索（语义/混合/图辅助，additive `queryId`） |
| `POST` | `/v2/retrieval/search` | `retrievalV2QuerySchema` | `retrievalV2ResponseWithHintsSchema` | v2 胶囊检索（含激活提示，additive `queryId`）— 仅文档与 CLI `--v2` 引用，未在任何宿主 gateway 注册，经 `SURFACE_EXEMPTIONS` 豁免 |
| `POST` | `/v3/retrieval/search` | `graphPlanSearchQuerySchema` | `graphPlanSearchResponseSchema` | v3 图计划检索（置信度感知，高置信度返回计划，否则回退，additive `queryId`） |
| `POST` | `/v1/retrieval/skills/search-by-content` | `skillLookupQuerySchema` | `skillLookupResponseSchema` | 按内容搜索技能（additive `queryId`） |
| `POST` | `/v1/retrieval/genes/search` | `geneSearchQuerySchema` | `geneSearchResponseSchema` | Gene 原生检索；由 `TRAPMAP_EXPERIENCE_GENES_MODE` 控制，off/shadow 返回 canonical disabled envelope。CLI `trapmap search-gene` 渲染 `<strategy-gene>`，MCP `trapmap_search_experience_genes` 返回 structured response |

> 源码：`packages/service-knowledge-read/src/routes.ts`、`packages/service-knowledge-read/src/experience-gene-routes.ts`（内部检索 RouteDefs）、`packages/host-local/src/nest/gateway/gateway.route-defs.ts`、`packages/host-distributed/src/gateway/route-defs.ts`（外部网关 RouteDef 消费方）
>
> **已退役（不在 gateway）**：`POST /v3/retrieval/plan`（`trapFirstPlanSchema`）曾由旧 server 提供，现未在网关注册，仍在 `SURFACE_INVENTORY_DRIFT`。

## 反馈

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `POST` | `/v1/feedback` | `feedbackSubmissionSchema` | `feedbackResponseSchema` | gateway 保留的 public feedback 提交 URL；由 `governance-review` owner 写入，支持 additive badcase reproducibility envelope 和 `asyncJobId` follow-up |
| `GET` | `/v1/operations/feedback` | `feedbackListRequestSchema` | `feedbackListResponseSchema` | 管理员获取反馈列表 |
| `GET` | `/v1/operations/feedback/remediation` | 无 | `feedbackRemediationQueueResponseSchema` | 获取达到阈值的 remediation 工作队列 |
| `GET` | `/v1/operations/feedback/remediation/:entryId` | 无 | `feedbackRemediationDetailResponseSchema` | 获取单个 trap/skill remediation 详情与内容快照 |
| `POST` | `/v1/operations/feedback/remediation/:entryId/complete` | `feedbackRemediationCompleteRequestSchema` | `feedbackRemediationCompleteResponseSchema` | 完成 remediation；批量 resolve 当前未解决 feedback，并在 PG 模式下返回 additive `asyncJobId` 指向后续 reactivation/reindex job |
| `POST` | `/v1/operations/feedback/batch` | `feedbackBatchRequestSchema` | `feedbackBatchResponseSchema` | 批量处理反馈（resolve/dismiss/triage/transition） |
| `GET` | `/v1/operations/feedback/stats/:entryId` | 无 | `feedbackStatsResponseSchema` | 获取条目的反馈统计和质量分数 |
| `POST` | `/v1/artifacts/review` | `artifactReviewBodySchema` | `artifactReviewResponseSchema` | 旧版 artifact 审核入口（distributed gateway 兼容现存 MCP `trapmap_review_decision`，与 `/v1/operations/artifacts/:artifactId/review` 并存） |

> **Round 6 更新**：反馈持久化已从 `store_snapshot` JSONB 迁移为 `feedback_records` PostgreSQL 结构化表（`custom_answers` JSONB + GIN，原 `feedback_custom_answers` 表已于 2026-09-01 压缩移除）。API 契约不变。

> **2026-06-09 更新**：当同一 `trap` 或 `skill` 的未解决反馈数达到阈值（当前为 `10`）时，系统会在读取时聚合出 remediation/suppression 状态，并通过 `/v1/operations/feedback/remediation*` 暴露人工处理队列。当前 suppression 先通过检索时硬过滤生效；索引摘除/重建仍是后续增强项。

> 源码：`packages/host-distributed/src/gateway/route-defs.ts`、`packages/service-governance-review/src/routes.ts`、`packages/service-governance-review/src/admin.ts`

> **Wave-4 ownership**：public `/v1/feedback` 与 `/v1/operations/feedback*` URL、认证 actor、trace/correlation headers 和 canonical error semantics 由 gateway 保留；feedback admin、统计、批处理、remediation 和 conflict workflow 由 `governance-review` owner 提供 internal API。`job-runtime` 仅拥有这些异步命令的 queue、retry、lease、workflow 和 dead-letter substrate。

## 任务队列（Jobs - job-runtime）

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `POST` | `/v1/jobs` | `scheduleJobSchema` | `jobSchema` | 调度异步任务（distributed gateway 直通 `jobRuntime.schedule`） |
| `GET` | `/v1/jobs/:jobId` | 无 | `jobStatusSchema` | 查询任务状态 |
| `GET` | `/v1/jobs/queue` | 无 | `jobQueueStatusSchema` | 查询队列水位与统计 |

> 源码：`packages/host-distributed/src/gateway/route-defs.ts`、`packages/service-job-runtime/src/routes.ts`（internal `/internal/jobs*`）

## 定时任务（Cron - cron-scheduler）

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `GET` | `/v1/cron/jobs` | 无 | `cronJobListSchema` | 列出定时任务 |
| `POST` | `/v1/cron/jobs` | `cronJobCreateInputSchema` | `cronJobSchema` | 创建定时任务（201） |
| `GET` | `/v1/cron/jobs/:jobId` | 无 | `cronJobSchema` | 查询单条定时任务 |
| `PATCH` | `/v1/cron/jobs/:jobId` | `cronJobUpdateInputSchema` | `cronJobSchema` | 更新定时任务 |
| `DELETE` | `/v1/cron/jobs/:jobId` | 无 | `{ ok: true }` | 删除定时任务 |
| `POST` | `/v1/cron/jobs/:jobId/trigger` | 无 | `cronJobSchema` | 立即触发执行 |
| `GET` | `/v1/cron/status` | 无 | `cronStatusSchema` | 调度器状态快照 |

> 源码：`packages/host-local/src/nest/gateway/gateway.cron-route-defs.ts`（host-local，session-guarded）、`packages/host-distributed/src/gateway/route-defs.ts`（distributed，trusted-actor）、`packages/service-cron/src/routes.ts`（internal `/internal/cron/*` 与 `/cron/*` service 面）

## Decay 管理

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `POST` | `/v1/knowledge/decay` | `knowledgeActionSchema` | `knowledgeEntryResponseSchema` | 触发 decay 治理（distributed，见上文“知识条目”） |

> **已退役（不在 gateway）**：`GET /v1/operations/decay/entries`、`POST /v1/operations/decay/batch`、`POST /v1/operations/decay/search` 为旧 server 的 `packages/server（Wave-10 已删除）/src/routes/decay.ts` 面，现仅通过 `POST /v1/knowledge/decay` 由 `governance-review`/`knowledge-write` 协作实现，旧 operations 路径保留在 `SURFACE_INVENTORY_DRIFT`。

> 源码：`packages/server（Wave-10 已删除）/src/routes/decay.ts`（旧）与 `packages/host-distributed/src/gateway/route-defs.ts`（现）

## Maintenance 管理

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `POST` | `/v1/knowledge/maintenance` | `knowledgeActionSchema` | `knowledgeEntryResponseSchema` | 触发 maintenance 治理（distributed，见上文“知识条目”） |

> **已退役（不在 gateway）**：`GET /v1/operations/maintenance/entries`、`POST /v1/operations/maintenance/batch` 来自旧 `packages/server（Wave-10 已删除）/src/routes/maintenance.ts`，现由 `POST /v1/knowledge/maintenance` 替代，旧路径保留在 `SURFACE_INVENTORY_DRIFT`。

> 源码：`packages/server（Wave-10 已删除）/src/routes/maintenance.ts`（旧）与 `packages/host-distributed/src/gateway/route-defs.ts`（现）

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

> 源码：`packages/host-distributed/src/gateway/route-defs.ts`、`packages/service-knowledge-write/src/artifact-routes.ts`

## 操作端点

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `GET` | `/v1/operations/status/async` | 无 | `asyncOperationsStatusResponseSchema` | 获取 Phase 2 async contract，以及 Phase 3 的 `operatorHome`、`configGovernance`、`capacityModel`、`bulkOperations`、queue/outbox/cache/workflow drill-down |

> 源码：`packages/host-distributed/src/gateway/route-defs.ts`
>
> **已退役（不在 gateway）**：`POST /v1/operations/export`、`POST /v1/operations/import`、`GET /v1/operations/knowledge`、`GET /v1/operations/audit`、`GET /v1/operations/status`、`POST /v1/operations/status/async/tasks/:taskId/requeue`、`GET /v1/operations/badcases/:feedbackId/export` 均为旧 `packages/server（Wave-10 已删除）/src/routes/operations.ts` 与子路由面，现仅保留 `GET /v1/operations/status/async` 作为 operator 面；旧路径保留在 `SURFACE_INVENTORY_DRIFT`。

Phase 4 closeout 补充：

- 默认 operator surface 已冻结为 `operatorHome`、`configGovernance`、`capacityModel`、`bulkOperations` 以及 queue/outbox/cache/workflow drill-down。
- operator runbook 继续只依赖 `/health`、`/ready`、`/metrics`、`/v1/operations/status/async` 四个既有入口，不新增第二套 runtime control plane。
- dashboard/alert/SLO 当前只冻结为 operator 文档 truth：task queue、internal hop latency、error rate 需要被解释为可观测指标族，但不表示仓库已经提供 checked-in dashboard-as-code 或 alert rule pack。
- `workflow` drill-down 当前可返回 internal/operator-only `workflows[*].correlation`，用于解释 `requestId` / `traceId` / `queryId` / `feedbackId` / `asyncJobId` 与 async follow-up 的关系；它不属于新的通用 public additive field。
- `GET /v1/operations/badcases/:feedbackId/export` 的 `debug` 字段同样属于 operator/debug 闭环，不属于 script/eval draft payload；`scripts/archived/export-badcase-to-eval.ts` 只序列化 `draft`。
- 热点 `team/query/artifact` 当前不属于默认 operator surface contract；如后续需要，应作为单独 deep drill-down 能力新增，而不是隐式塞入现有首页 schema。
- 本根计划已经关闭；如需新增 operator/debug route、operator panel、额外 public additive field 或新的 export wrapper，必须转入独立审计或独立计划，而不是继续在当前 closeout 口径下扩写。

## Capsule-Index 运维

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `POST` | `/v1/operations/capsule-index/rebuild` | `{ mode: 'full' }` 或 `{ mode: 'artifact', artifactId }` | `{ mode, stats? / result?, rebuiltAt }` | 重建 capsule 索引（全量或按 artifact）— 已退役，不在 gateway（`SURFACE_INVENTORY_DRIFT`） |
| `GET` | `/v1/operations/capsule-index/health` | 无 | `{ sourceArtifactCount, report: { missingKeywords, missingEmbeddings, failedKeywords, failedEmbeddings, orphanKeywords, orphanEmbeddings }, reportedAt }` | 健康对账（只读）— 已退役 |
| `POST` | `/v1/operations/capsule-index/cleanup-orphans` | 无 | `{ sourceArtifactCount, removed, cleanedAt }` | 清理孤立索引行 — 已退役 |

> 源码：`packages/server（Wave-10 已删除）/src/routes/operations/capsule-index.ts`（旧实现，已随 server 包删除）
>
> **CLI 暴露**（历史）：`trapmap operations capsule-index rebuild|health|cleanup-orphans`。现不在网关实现，仅文档保留，路径在 `SURFACE_INVENTORY_DRIFT`。

## 使用统计

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `GET` | `/v1/operations/stats/usage` | `statsUsageQuerySchema` | `statsUsageResponseSchema` | 按时间桶聚合的使用量时序数据 — 已退役 |
| `GET` | `/v1/operations/stats/hits` | `statsHitRankingQuerySchema` | `statsHitRankingResponseSchema` | 按条目命中次数排名 — 已退役 |
| `GET` | `/v1/operations/stats/summary` | `statsSummaryQuerySchema` | `statsSummaryResponseSchema` | 系统级汇总统计（仅 system-admin）— 已退役 |

> 源码：`packages/server（Wave-10 已删除）/src/routes/operations/stats.ts`。注意：统计端点需要 PostgreSQL（`usageAnalyticsRepo`），否则返回 503。
>
> **状态**：上述 3 条统计端点现未在任何宿主 gateway 注册，保留在 `SURFACE_INVENTORY_DRIFT`，仅作历史契约参考。

## 边界搜索与管理

| 方法 | 路由 | 请求契约 | 响应契约 | 用途 |
|------|------|----------|----------|------|
| `POST` | `/admin/boundary-search` | `adminBoundarySearchQuerySchema` | `adminBoundarySearchResponseSchema` | 搜索符合边界约束的知识条目（仅 system-admin，`POST /admin/boundary-search` 非版本化，不受 route-surface 守卫） |
| `POST` | `/v1/admin/reconcile-knowledge-indexes` | 无 | `{ success, totalEntries, entriesSynced, ... }` | 重新同步所有知识索引（仅 system-admin）— 已退役，`SURFACE_INVENTORY_DRIFT` |

> 源码：`packages/server（Wave-10 已删除）/src/routes/admin-boundary-search.ts`（旧）

---

## 说明

- 所有错误响应统一为 canonical error envelope：`{ code, message, kind, requestId?, traceId?, error?, details? }`。`kind` 与 HTTP 状态码遵循共享 invocation taxonomy（400 validation / 401 unauthorized / 403 forbidden / 404 not-found / 409 conflict / 503 unavailable / 504 timeout / 500 internal）；`error` 是 `message` 的兼容别名；`details` 携带结构化附加信息（如 Zod 校验 issues）。`/v1/auth/login` 与网关 auth hook 的历史 `{ error, kind }` 响应体仍由各宿主保留（guard/登录入口语义，见 `packages/host-distributed/src/gateway/routes.ts`）。
- CLI 和 Server 必须将 `@trapmap/contracts` 视为规范的 Schema 契约表面。
- 统计端点（`/v1/operations/stats/*`）依赖 PostgreSQL，使用 JSONB 存储的部署不可用。
- **Round 2 更新**：知识、陷阱（traps）、候选提交的内部实现已从 `store_snapshot` JSONB 切换为 PostgreSQL 专用表（通过 `KnowledgeRepository` / `CandidateRepository`）。API 契约表面未变，所有请求/响应 Schema 保持不变。`DualWrite*Repository` 兼容层已删除。
- **Round 3 更新**：知识域标签（`knowledge_labels`）、边界（`knowledge_boundary_*` ×6）、维护（`knowledge_maintenance_assignments`）已从 JSONB 拆为 PostgreSQL 结构化子表。`knowledge_entries` 及 `lifecycle_events` 表已补齐 `CHECK` 约束。`knowledge_revisions` 表已补齐 `unique(entry_id, revision_no)` 约束。知识条目读写 API 契约无变更。
- 后续阶段可能会添加内部辅助路由，但新的面向用户的工作流路由应扩展此列表而非替换它。


## MCP 工具面（apps/mcp，2026-08-22 主线新增）

`@trapmap/app-mcp` 以 stdio 暴露 10 个工具，全部经 gateway `/v1` 表面转发；角色门控与审计见 `docs/guides/CLIENT_INTEGRATION.md`。映射：search_knowledge→POST /v1/retrieval/search；get_skill_manifest/read_skill_files→POST /v1/operations/artifacts/export；submit_knowledge→POST /v1/knowledge；submit_skill_draft→POST /v1/operations/artifacts/import；submit_feedback→POST /v1/feedback；list_review_queue→GET /v1/operations/artifacts/review-queue；get_review_detail→GET /v1/operations/artifacts/:id/history；review_decision→POST /v1/artifacts/review；complete_remediation→POST /v1/operations/feedback/remediation/:entryId/complete。
