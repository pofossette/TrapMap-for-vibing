# TrapMap API 契约表面

> 状态：Active。核对日期：2026-09-08。本页只收录网关真实注册的路由。注册集合等于 6 个网关 RouteDef 文件导出的并集（见 `packages/host-distributed/src/gateway/route-defs/index.ts:11`），light 侧再经 `packages/host-local/src/nest/runtime/monolith-route-defs.ts:26` 过滤。你调用本页之外的旧路径时，先查文末「已退役端点」节。

路由契约是框架中立的 `RouteDef`（`method`、`path`、`schema`，见 `packages/backend-core/src/http/route-contract.ts:51`）。网关只做验证、鉴权与转发；错误体统一为 canonical envelope（`code`、`message`、`kind`，加 `requestId`、`traceId`、`details`）。

## 运行时与健康

| 方法 | 路由 | 源码 |
|---|---|---|
| `GET` | `/health` | `packages/host-distributed/src/gateway/routes.ts:268` |
| `GET` | `/live` | `packages/host-distributed/src/gateway/routes.ts:310` |
| `GET` | `/ready` | `packages/host-distributed/src/gateway/routes.ts:317` |
| `GET` | `/metrics` | `packages/host-distributed/src/gateway/server.ts:294` |

> 运行时响应形状（以 `ec0e4c99` 版为准）：`/health` 返回非 contracts 内部 runtime JSON `{ status, product, packages, liveness, readiness, requestContext, dependencies, graphQuery, memory, uptimeSeconds }`；`/ready` 返回 `{ ok, product, packages, liveness, readiness, requestContext, dependencies, graphQuery, memory, uptimeSeconds }`，`readiness === "not-ready"` 时返回 `503`；`/metrics` 返回 `text/plain; version=0.0.4` Prometheus exposition，仅低基数标签，禁 `requestId`/`traceId`/`queryId` 等高基数键进 label。
>
> 契约落点：`/health`、`/live`、`/ready`、`/metrics` 无请求/响应 contracts schema（runtime 面，待核实 2026-09-08 除外不适用）。

`operator runbook` 只依赖 `/health`、`/ready`、`/metrics`、`GET /v1/operations/status/async` 四个既有入口，不新增第二套 runtime control plane。

## 认证、团队与成员

源码：`packages/host-distributed/src/gateway/route-defs/identity.ts`。

| 方法 | 路由 | 用途 |
|---|---|---|
| `POST` | `/v1/auth/logout` | 清除当前会话（唯一对外认证路由） |
| `POST` | `/v1/teams` | 创建新团队 |
| `GET` | `/v1/teams` | 列出可用团队和当前活动团队 |
| `POST` | `/v1/teams/select` | 设置当前会话的活动团队 |
| `POST` | `/v1/members` | 注册新团队成员 |
| `PUT` | `/v1/members/:memberId` | 更新等级、权限或备注 |
| `POST` | `/v1/access-keys` | 为其他成员生成永久访问密钥 |

> 契约落点：`POST /v1/auth/logout` 请求无／响应 `logoutResponseSchema`（packages/contracts/src/domain/auth.ts:46）；`POST /v1/teams` 请求 `createTeamRequestSchema`（packages/contracts/src/domain/team.ts:48）／响应 `teamSchema`（packages/contracts/src/domain/team.ts:26）；`GET /v1/teams` 请求无／响应 `teamListResponseSchema`（packages/contracts/src/domain/team.ts:55）；`POST /v1/teams/select` 请求 `selectTeamRequestSchema`（packages/contracts/src/domain/team.ts:62）／响应 `activeSessionSchema`（packages/contracts/src/domain/auth.ts:19）；`POST /v1/members` 请求 `createMemberRequestSchema`（packages/contracts/src/domain/team.ts:68）／响应 `memberSchema`（packages/contracts/src/domain/team.ts:13）；`PUT /v1/members/:memberId` 请求 `updateMemberRequestSchema`（packages/contracts/src/domain/team.ts:79）／响应 `memberSchema`（packages/contracts/src/domain/team.ts:13）；`POST /v1/access-keys` 请求 `issueAccessKeyRequestSchema`（packages/contracts/src/domain/team.ts:88）／响应 `issueAccessKeyResponseSchema`（packages/contracts/src/domain/team.ts:96）。

## 知识条目

源码：`packages/host-distributed/src/gateway/route-defs/knowledge.ts`。

| 方法 | 路由 | 用途 |
|---|---|---|
| `POST` | `/v1/knowledge` | 提交新知识以供审核 |
| `GET` | `/v1/knowledge/mine` | 查看当前用户自己的提交记录和审核历史 |
| `GET` | `/v1/knowledge/projection-status` | 知识读取投影状态 |
| `GET` | `/v1/knowledge/:entryId` | 以所有者或审核者身份查看特定提交 |
| `PUT` | `/v1/knowledge/:entryId` | 有足够权限时更新已批准条目 |
| `POST` | `/v1/knowledge/:entryId/resubmit` | 重提被拒内容并保留历史 |
| `POST` | `/v1/knowledge/:entryId/supersede` | 标记条目被新条目取代 |

契约见 `packages/contracts/src/domain/knowledge.ts`（`knowledgeEntrySchema`、`agentReviewStatusSchema`）与 `packages/contracts/src/domain/common.ts:38`（`lifecycleStateSchema`）。

> 契约落点：`POST /v1/knowledge` 请求 `knowledgeSubmissionSchema`（packages/contracts/src/domain/knowledge.ts:112）／响应 `knowledgeEntryResponseSchema`（packages/contracts/src/domain/knowledge.ts:152）；`GET /v1/knowledge/mine` 请求无／响应 `knowledgeHistoryResponseSchema`（packages/contracts/src/domain/knowledge.ts:158）；`GET /v1/knowledge/:entryId` 请求无／响应 `knowledgeEntryResponseSchema`（packages/contracts/src/domain/knowledge.ts:152）；`PUT /v1/knowledge/:entryId` 请求 `knowledgeUpdateSchema`（packages/contracts/src/domain/knowledge.ts:132）／响应同上；`POST /v1/knowledge/:entryId/resubmit` 请求 `knowledgeResubmissionSchema`（packages/contracts/src/domain/knowledge.ts:124）／响应同上；`POST /v1/knowledge/:entryId/supersede` 请求 `{ replacementId: string }`（待核实 2026-09-08）／响应同上；`GET /v1/knowledge/projection-status` 请求无／响应 `{ status }`（待核实 2026-09-08）。

## 陷阱

| 方法 | 路由 | 用途 |
|---|---|---|
| `POST` | `/v1/traps` | 创建陷阱 |
| `GET` | `/v1/traps` | 列出当前用户的陷阱 |
| `GET` | `/v1/traps/:trapId` | 获取陷阱详情 |

> 契约落点：`POST /v1/traps` 请求 `knowledgeSubmissionSchema`（packages/contracts/src/domain/knowledge.ts:112）／响应 `knowledgeEntryResponseSchema`（packages/contracts/src/domain/knowledge.ts:152）；`GET /v1/traps` 请求无／响应 `knowledgeHistoryResponseSchema`（packages/contracts/src/domain/knowledge.ts:158）；`GET /v1/traps/:trapId` 请求无／响应 `knowledgeEntryResponseSchema`（packages/contracts/src/domain/knowledge.ts:152）。

## 候选与重复检测

源码：`packages/host-distributed/src/gateway/route-defs/candidate.ts`。light 侧网关另注册 `POST /v1/candidates/:candidateId/apply-resolution`（见 `packages/host-local/src/nest/gateway/gateway.route-defs.ts:212`），distributed 侧用 `resolution`，两边语义对齐但路径不同，你按宿主选择。

| 方法 | 路由 | 用途 |
|---|---|---|
| `POST` | `/v1/candidates` | 提交候选（异步摄取） |
| `GET` | `/v1/candidates` | 列出候选（支持按状态过滤） |
| `GET` | `/v1/candidates/:candidateId` | 获取候选状态 |
| `POST` | `/v1/candidates/:candidateId/resolution` | 候选决议入口（distributed） |
| `POST` | `/v1/candidates/:candidateId/manual-result` | 人工解决重复 |

> 契约落点：`POST /v1/candidates` 请求 `candidateSubmissionRequestSchema`（packages/contracts/src/domain/candidates.ts:299）／响应 `candidateSubmissionResponseSchema`（packages/contracts/src/domain/candidates.ts:312）；`GET /v1/candidates` 请求 `{ status?: string }`（待核实 2026-09-08）／响应 `candidateListResponseSchema`（packages/contracts/src/domain/candidates.ts:326）；`GET /v1/candidates/:candidateId` 请求无／响应 `candidateStatusResponseSchema`（packages/contracts/src/domain/candidates.ts:320）；`POST /v1/candidates/:candidateId/resolution` 请求 `candidateResolutionSchema`（待核实 2026-09-08，网关本地 `packages/host-distributed/src/gateway/route-defs/shared.ts:417`）／响应 `applyResolutionResponseSchema`（packages/contracts/src/domain/candidates.ts:425）；`POST /v1/candidates/:candidateId/manual-result` 请求 `ManualResultSubmissionSchema`（packages/contracts/src/domain/candidates.ts:366）／响应 `manualResultResponseSchema`（packages/contracts/src/domain/candidates.ts:445）；light 侧 `POST /v1/candidates/:candidateId/apply-resolution` 请求无／响应 `applyResolutionResponseSchema`（packages/contracts/src/domain/candidates.ts:425）。

## 检索

源码：`packages/host-distributed/src/gateway/route-defs/knowledge.ts:275` 起，light 侧见 `packages/host-local/src/nest/gateway/gateway.route-defs.ts:130` 起。

| 方法 | 路由 | 用途 |
|---|---|---|
| `POST` | `/v1/retrieval/search` | 条目级检索（语义、混合、图辅助；契约 `retrievalQuerySchema`，见 `packages/contracts/src/domain/retrieval.ts`） |
| `POST` | `/v3/retrieval/search` | 图计划检索（与 v1 同 schema，经同一 `knowledgeRead.search` 转发） |
| `POST` | `/v1/retrieval/skills/search-by-content` | 按内容搜索技能 |
| `POST` | `/v1/retrieval/genes/search` | Gene 原生检索；`TRAPMAP_EXPERIENCE_GENES_MODE` 控制开关行为（见 `packages/service-knowledge-read/src/experience-gene-routes.ts:100`） |

> 契约落点：`POST /v1/retrieval/search` 请求 `retrievalQuerySchema`（packages/contracts/src/domain/retrieval.ts:80）／响应 `retrievalResponseSchema`（packages/contracts/src/domain/retrieval.ts:221）；`POST /v3/retrieval/search` 请求 `graphPlanSearchQuerySchema`（packages/contracts/src/domain/retrieval.ts:549）／响应 `graphPlanSearchResponseSchema`（packages/contracts/src/domain/retrieval.ts:602）；`POST /v1/retrieval/skills/search-by-content` 请求 `skillLookupQuerySchema`（packages/contracts/src/domain/retrieval.ts:496）／响应 `skillLookupResponseSchema`（packages/contracts/src/domain/retrieval.ts:534）；`POST /v1/retrieval/genes/search` 请求 `geneSearchQuerySchema`（packages/contracts/src/domain/experience-gene-retrieval.ts:40）／响应 `geneSearchResponseSchema`（packages/contracts/src/domain/experience-gene-retrieval.ts:76）；`POST /v2/retrieval/search` 请求 `retrievalV2QuerySchema`（packages/contracts/src/domain/retrieval.ts:322）／响应 `retrievalV2ResponseWithHintsSchema`（packages/contracts/src/domain/retrieval.ts:442，未在网关注册）。

## 反馈与治理

源码：`packages/host-distributed/src/gateway/route-defs/governance.ts`。

| 方法 | 路由 | 用途 |
|---|---|---|
| `POST` | `/v1/knowledge/review` | 批准、拒绝或退回修正提交 |
| `GET` | `/v1/knowledge/review-queue` | 服务端筛选、排序和分页列出待审核条目 |
| `POST` | `/v1/knowledge/maintenance` | 触发 maintenance 治理编排 |
| `POST` | `/v1/knowledge/decay` | 触发 decay 治理编排 |
| `POST` | `/v1/feedback` | 网关保留的 public feedback 提交地址 |
| `GET` | `/v1/operations/feedback` | 管理员获取反馈列表 |
| `POST` | `/v1/operations/feedback/batch` | 批量处理反馈 |
| `GET` | `/v1/operations/feedback/stats/:entryId` | 获取条目的反馈统计和质量分数 |
| `GET` | `/v1/operations/feedback/remediation` | 获取达到阈值的 remediation 工作队列 |
| `GET` | `/v1/operations/feedback/remediation/:entryId` | 获取单个 remediation 详情与内容快照 |
| `POST` | `/v1/operations/feedback/remediation/:entryId/complete` | 完成 remediation 并批量 resolve 未解决反馈 |
| `POST` | `/v1/artifacts/review` | 旧版 artifact 审核入口（与工件 review 路由并存的兼容地址） |

> 契约落点：`POST /v1/knowledge/review` 请求 `reviewDecisionRequestSchema`（packages/contracts/src/domain/review.ts:31）／响应 `knowledgeEntryResponseSchema`（packages/contracts/src/domain/knowledge.ts:152）；`GET /v1/knowledge/review-queue` 请求 `reviewQueueQuerySchema`（packages/contracts/src/domain/review.ts:20）／响应 `reviewQueueResponseSchema`（packages/contracts/src/domain/review.ts:64）；`POST /v1/knowledge/maintenance` 与 `POST /v1/knowledge/decay` 请求 `knowledgeActionSchema`（待核实 2026-09-08，网关本地 `packages/host-distributed/src/gateway/route-defs/shared.ts:438`）／响应 `knowledgeEntryResponseSchema`（packages/contracts/src/domain/knowledge.ts:152）；`POST /v1/feedback` 请求 `feedbackSubmissionSchema`（packages/contracts/src/domain/feedback.ts:69）／响应 `feedbackResponseSchema`（packages/contracts/src/domain/feedback.ts:162）；`GET /v1/operations/feedback` 请求 `feedbackListRequestSchema`（packages/contracts/src/domain/feedback.ts:176）／响应 `feedbackListResponseSchema`（packages/contracts/src/domain/feedback.ts:229）；`POST /v1/operations/feedback/batch` 请求 `feedbackBatchRequestSchema`（packages/contracts/src/domain/feedback.ts:245）／响应 `feedbackBatchResponseSchema`（packages/contracts/src/domain/feedback.ts:278）；`GET /v1/operations/feedback/stats/:entryId` 请求无／响应 `feedbackStatsResponseSchema`（packages/contracts/src/domain/feedback.ts:323）；`GET /v1/operations/feedback/remediation` 请求无／响应 `feedbackRemediationQueueResponseSchema`（packages/contracts/src/domain/feedback.ts:367）；`GET /v1/operations/feedback/remediation/:entryId` 请求无／响应 `feedbackRemediationDetailResponseSchema`（packages/contracts/src/domain/feedback.ts:388）；`POST /v1/operations/feedback/remediation/:entryId/complete` 请求 `feedbackRemediationCompleteRequestSchema`（packages/contracts/src/domain/feedback.ts:394）／响应 `feedbackRemediationCompleteResponseSchema`（packages/contracts/src/domain/feedback.ts:400）；`POST /v1/artifacts/review` 请求 `artifactReviewBodySchema`（待核实 2026-09-08，网关本地 `packages/host-distributed/src/gateway/route-defs/shared.ts:483`）／响应 `artifactReviewResponseSchema`（待核实 2026-09-08）。

管理面另挂一组 `/api/admin/*` 路由（reviews、artifacts、graph、runtime-overview，见 `packages/host-distributed/src/gateway/route-defs/governance.ts:186` 起），只在 distributed 网关注册。

## 任务队列

源码：`packages/host-distributed/src/gateway/route-defs/job.ts`。

| 方法 | 路由 | 用途 |
|---|---|---|
| `POST` | `/v1/jobs` | 调度异步任务 |
| `GET` | `/v1/jobs/:jobId` | 查询任务状态 |
| `GET` | `/v1/jobs/queue` | 查询队列水位与统计 |
| `GET` | `/v1/operations/status/async` | async operator 真相面（见下文 Phase 4 closeout） |

> 契约落点：`POST /v1/jobs` 请求 `scheduleJobSchema`（待核实 2026-09-08）／响应 `jobSchema`（待核实 2026-09-08）；`GET /v1/jobs/:jobId` 请求无／响应 `jobStatusSchema`（待核实 2026-09-08）；`GET /v1/jobs/queue` 请求无／响应 `jobQueueStatusSchema`（待核实 2026-09-08）；`GET /v1/operations/status/async` 请求无／响应 `asyncOperationsStatusResponseSchema`（待核实 2026-09-08）。

## 定时任务

源码：`packages/host-distributed/src/gateway/route-defs/cron.ts`（distributed）、`packages/host-local/src/nest/gateway/gateway.cron-route-defs.ts`（light，session-guarded）、`packages/service-cron/src/routes.ts`（内部面）。

| 方法 | 路由 | 用途 |
|---|---|---|
| `GET` | `/v1/cron/jobs` | 列出定时任务 |
| `POST` | `/v1/cron/jobs` | 创建定时任务 |
| `GET` | `/v1/cron/jobs/:jobId` | 查询单条定时任务 |
| `PATCH` | `/v1/cron/jobs/:jobId` | 更新定时任务 |
| `DELETE` | `/v1/cron/jobs/:jobId` | 删除定时任务 |
| `POST` | `/v1/cron/jobs/:jobId/trigger` | 立即触发执行 |
| `GET` | `/v1/cron/status` | 调度器状态快照 |

> 契约落点：`GET /v1/cron/jobs` 请求无／响应 `cronJobListSchema`（待核实 2026-09-08，light 网关本地 `packages/host-local/src/nest/gateway/gateway.cron-route-defs.ts:22`）；`POST /v1/cron/jobs` 请求 `cronJobCreateInputSchema`（packages/contracts/src/domain/cron.ts:28）／响应 `cronJobSchema`（packages/contracts/src/domain/cron.ts:7）；`GET /v1/cron/jobs/:jobId` 请求无／响应 `cronJobSchema`（packages/contracts/src/domain/cron.ts:7）；`PATCH /v1/cron/jobs/:jobId` 请求 `cronJobUpdateInputSchema`（packages/contracts/src/domain/cron.ts:41）／响应同上；`DELETE /v1/cron/jobs/:jobId` 请求无／响应 `{ ok: true }`（待核实 2026-09-08）；`POST /v1/cron/jobs/:jobId/trigger` 请求无／响应 `cronJobSchema`（packages/contracts/src/domain/cron.ts:7）；`GET /v1/cron/status` 请求无／响应 `cronStatusSchema`（待核实 2026-09-08，近似 `cronJobStatusSnapshotSchema` 见 packages/contracts/src/domain/cron.ts:63）。

## 工件

源码：`packages/host-distributed/src/gateway/route-defs/knowledge.ts:35` 起。

| 方法 | 路由 | 用途 |
|---|---|---|
| `POST` | `/v1/operations/artifacts/import` | 导入工件目录 |
| `POST` | `/v1/operations/artifacts/export` | 导出工件 |
| `POST` | `/v1/operations/artifacts/activate` | 激活工件（获取文件内容用于执行） |
| `GET` | `/v1/operations/artifacts/review-queue` | 获取待审核的工件队列 |
| `POST` | `/v1/operations/artifacts/:artifactId/edit` | 编辑工件内容 |
| `GET` | `/v1/operations/artifacts/:artifactId/history` | 获取工件版本历史 |
| `POST` | `/v1/operations/artifacts/:artifactId/review` | 审核工件（approve 或 reject） |
| `POST` | `/v1/operations/artifacts/:artifactId/deactivate` | 停用工件 |

> 契约落点：`POST /v1/operations/artifacts/import` 请求 `artifactImportRequestSchema`（packages/contracts/src/domain/operations/knowledge.ts:155）／响应 `artifactImportResponseSchema`（packages/contracts/src/domain/operations/knowledge.ts:180）；`POST /v1/operations/artifacts/export` 请求 `artifactExportRequestSchema`（待核实 2026-09-08）／响应 `artifactExportResponseSchema`（packages/contracts/src/domain/operations/governance.ts:110）；`POST /v1/operations/artifacts/activate` 请求 `activationRequestSchema`（待核实 2026-09-08）／响应 `activationResponseSchema`（packages/contracts/src/domain/operations/governance.ts:166）；`GET /v1/operations/artifacts/review-queue` 请求无／响应 `skillReviewQueueResponseSchema`（packages/contracts/src/domain/operations/identity.ts:114）；`POST /v1/operations/artifacts/:artifactId/edit` 请求 `skillEditRequestSchema`（待核实 2026-09-08）／响应 `skillEditResponseSchema`（packages/contracts/src/domain/operations/identity.ts:13）；`GET /v1/operations/artifacts/:artifactId/history` 请求 `skillHistoryRequestSchema`（待核实 2026-09-08）／响应 `skillHistoryResponseSchema`（packages/contracts/src/domain/operations/identity.ts:63）；`POST /v1/operations/artifacts/:artifactId/review` 请求 `skillReviewDecisionRequestSchema`（待核实 2026-09-08）／响应 `skillReviewDecisionResponseSchema`（packages/contracts/src/domain/operations/identity.ts:132）；`POST /v1/operations/artifacts/:artifactId/deactivate` 请求 `artifactDeactivateRequestSchema`（待核实 2026-09-08）／响应 `artifactDeactivateResponseSchema`（待核实 2026-09-08）。

## Phase 4 closeout（operator 面冻结口径）

- 默认 operator surface 已冻结为 `operatorHome`、`configGovernance`、`capacityModel`、`bulkOperations` 以及 queue、outbox、cache、workflow drill-down。
- operator runbook 继续只依赖 `/health`、`/ready`、`/metrics`、`GET /v1/operations/status/async` 四个既有入口，不新增第二套 runtime control plane。
- dashboard/alert/SLO 只冻结为 operator 文档 truth：task queue、internal hop latency、error rate 需要被解释为可观测指标族，但不表示仓库已经提供 checked-in dashboard-as-code 或 alert rule pack。
- `workflow` drill-down 可以返回 internal 与 operator-only 的 `workflows[*].correlation`，用于解释 `requestId`、`traceId`、`queryId`、`feedbackId` 与 `asyncJobId` 的关系；它不属于新的通用 public additive field。
- `GET /v1/operations/badcases/:feedbackId/export` 的 `debug` 字段属于 operator 与 debug 闭环，不属于 script/eval draft payload；`scripts/archived/export-badcase-to-eval.ts` 只序列化 `draft`。
- 热点 `team`、`query`、`artifact` 不属于默认 operator surface contract；后续需要时做单独 deep drill-down 能力新增，不隐式塞入现有首页 schema。
- 本根计划已经关闭；新增 operator 或 debug route、operator panel、额外 public additive field 或新的 export wrapper，必须转入独立审计或独立计划，不在当前 closeout 口径下扩写。

## 已退役端点（不在网关注册集合中）

以下旧路径不在 6 个网关 RouteDef 文件的注册集合里。你不要再调用它们；历史契约只做排障参考。

- `POST /v1/auth/login`、`GET /v1/auth/session`：public 登录面已退役。凭证登录只活在内部面（`POST /internal/auth/login`，见 `packages/service-identity-access/src/routes.ts:106`），light 侧经 allowlist 保留，distributed 经网关 auth hook 签发 session。
- `PATCH /v1/knowledge/:id/evidence`、`POST /v1/operations/knowledge/:entryId/deactivate`：旧知识操作面，现由 `PUT /v1/knowledge/:entryId` 与工件 deactivate 路由覆盖。
- `POST /v1/traps/:trapId/resubmit`、`POST /v1/traps/:trapId/supersede`：旧 trap 面，用知识条目的 resubmit 与 supersede 路由代替。
- `GET /v1/duplicates*`：旧 duplicates 兼容面，现由候选路由覆盖。
- `GET /v1/operations/decay/entries`、`POST /v1/operations/decay/batch`、`POST /v1/operations/decay/search`、`GET /v1/operations/maintenance/entries`、`POST /v1/operations/maintenance/batch`：旧 operations 治理面，现由 `POST /v1/knowledge/decay` 与 `POST /v1/knowledge/maintenance` 覆盖。
- `POST /v1/operations/export`、`POST /v1/operations/import`、`GET /v1/operations/knowledge`、`GET /v1/operations/audit`、`GET /v1/operations/status`（非 async）、`POST /v1/operations/capsule-index/rebuild`、`GET /v1/operations/capsule-index/health`、`POST /v1/operations/capsule-index/cleanup-orphans`、`GET /v1/operations/stats/*`、`POST /admin/boundary-search`、`POST /v1/admin/reconcile-knowledge-indexes`：旧 operator 与统计面，仅保留 `GET /v1/operations/status/async`。

> 退役面契约落点（历史参考，以 `ec0e4c99` 为准）：`GET /v1/operations/stats/usage` 请求 `statsUsageQuerySchema`（待核实 2026-09-08）／响应 `statsUsageResponseSchema`（待核实 2026-09-08）；`GET /v1/operations/stats/hits` 请求 `statsHitRankingQuerySchema`（待核实 2026-09-08）／响应 `statsHitRankingResponseSchema`（待核实 2026-09-08）；`GET /v1/operations/stats/summary` 请求 `statsSummaryQuerySchema`（待核实 2026-09-08）／响应 `statsSummaryResponseSchema`（待核实 2026-09-08）；`POST /admin/boundary-search` 请求 `adminBoundarySearchQuerySchema`（packages/contracts/src/domain/admin.ts:50）／响应 `adminBoundarySearchResponseSchema`（packages/contracts/src/domain/admin.ts:82）。

## 核对命令

```bash
grep -rhoE "path: '/[^']+'" packages/host-distributed/src/gateway/route-defs/ | sort -u
grep -n "path:" packages/host-local/src/nest/gateway/gateway.route-defs.ts
pnpm exec tsx scripts/check-doc-drift.ts
```
