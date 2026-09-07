# 术语表

> 状态：Active。核对日期：2026-09-08。本页每个术语都锚定源码：Zod 契约在 `packages/contracts/src/domain/`，表在 `packages/db/src/schema/`，路由在网关 RouteDef 文件。你发现术语与代码不符时，以代码为准并回來改本页。

路径全部相对仓库根。

## 核心概念

### Trap（陷阱）

团队踩坑经验。它不是独立类型，是 `KnowledgeEntry` 的一种语义变体。

| 位置 | 形式 | 说明 |
|---|---|---|
| `packages/contracts/src/domain/candidates.ts` | Zod（`CandidateSubmissionSchema`） | 候选提交契约含 `trap` 来源类型 |
| `packages/contracts/src/domain/knowledge.ts` | Zod（`knowledgeEntrySchema`） | 聚合根定义 |
| `packages/host-distributed/src/gateway/route-defs/knowledge.ts:239` | Route | `POST /v1/traps`、`GET /v1/traps`、`GET /v1/traps/:trapId` |

### Skill（技能工件）

验证过的最佳实践目录形态（含 `SKILL.md`、`references`、`assets`、`scripts`）。

| 位置 | 形式 | 说明 |
|---|---|---|
| `packages/contracts/src/domain/artifacts.ts` | Zod（`skillArtifactSchema`） | 聚合根 |
| `packages/db/src/schema/artifacts.ts` | DB | `skill_artifacts` 等 11 表（见 [数据库表结构](DATABASE_SCHEMA.md)） |
| `packages/host-distributed/src/gateway/route-defs/knowledge.ts:35` | Route | `POST /v1/operations/artifacts/import` 等 8 条工件路由 |

### Knowledge Entry（知识条目）

可检索的知识单元（Trap 或 Skill 批准后的形态）。

| 位置 | 形式 | 说明 |
|---|---|---|
| `packages/contracts/src/domain/knowledge.ts` | Zod（`knowledgeEntrySchema`） | 聚合根定义 |
| `packages/db/src/schema/knowledge.ts` | DB | `knowledge_entries`、`knowledge_labels`、`knowledge_revisions`、`lifecycle_events` 等 7 表 |
| `packages/host-distributed/src/gateway/route-defs/knowledge.ts:163` | Route | `GET /v1/knowledge/:entryId` 等 7 条知识路由 |

## 生命周期

### Lifecycle State

七态枚举，知识条目与工件共用（见 `packages/contracts/src/domain/common.ts:38`）：`draft`、`submitted`、`agent-pass`、`agent-rejected`、`approved`、`rejected`、`deactivated`。事件审计落在 `lifecycle_events` 与 `artifact_lifecycle_events`。

### Agent Review

AI 预审结果：`agent-pass` 或 `agent-rejected`（见 `packages/contracts/src/domain/knowledge.ts:22` 的 `agentReviewStatusSchema`）。`service-knowledge-write` 与 `service-governance-review` 协作产生它，调用经过宿主网关。

### Resubmit 与 Supersede

被拒条目修正后重提，历史保留。路由是 `POST /v1/knowledge/:entryId/resubmit` 与 `POST /v1/knowledge/:entryId/supersede`（见 `packages/host-distributed/src/gateway/route-defs/knowledge.ts:209`）。

## 摄取管道

### Candidate（候选）

异步摄取入口，分 `trap` 与 `skill` 两型。

| 位置 | 形式 | 说明 |
|---|---|---|
| `packages/contracts/src/domain/candidates.ts` | Zod（`CandidateSubmissionSchema`） | 提交契约 |
| `packages/db/src/schema/candidates.ts` | DB | `candidates`（含 `analysis` jsonb 加 GIN）、`candidate_outcomes`（`manual` 或 `resolution`）、`candidate_duplicate_cases`（含 `matches` jsonb 加 GIN）、`entity_lineage` |
| `packages/service-candidate-ingestion/src/index.ts:37` | Impl | `createCandidateIngestionRouteDefs` 导出 |

### Duplicate Case 与 Manual Resolution

- **Duplicate Case**：`candidate_duplicate_cases` 加 `matches` jsonb（`exact`、`high-overlap`、`semantic-similar`）。
- **Manual Resolution**：`candidate_outcomes`（`kind` 为 `manual` 或 `resolution`）存裁定结果。路由是 `POST /v1/candidates/:candidateId/manual-result` 与 `POST /v1/candidates/:candidateId/resolution`。

## 检索相关

### Retrieval（检索）

| 位置 | 形式 | 说明 |
|---|---|---|
| `packages/contracts/src/domain/retrieval.ts` | Zod（`retrievalQuerySchema`） | 查询契约 |
| `packages/service-knowledge-read/src/index.ts:88` | Impl | `createKnowledgeReadRouteDefs` 导出 |
| `packages/host-distributed/src/gateway/route-defs/knowledge.ts:275` | Route | `POST /v1/retrieval/search`、`POST /v3/retrieval/search`、`POST /v1/retrieval/skills/search-by-content` |

### Capsule（胶囊）

Skill 派生的可操作知识单元。表是 `skill_artifact_capsules` 与 `skill_artifact_capsule_embeddings`（HNSW），见 `packages/db/src/schema/artifacts.ts:292`。

### Profile 与 Manifest

- **Profile**：`skill_artifact_profiles`（派生配置，1 对 1）。
- **Manifest**：`skill_artifact_client_manifests` 加 `skill_artifact_manifest_items`（references、assets、scripts 三合一）。

### Experience Gene

经验基因：`experience_genes` 是当前状态事实源，`experience_gene_events` 是审计，`experience_gene_embeddings` 是可重建投影。契约见 `packages/contracts/src/domain/experience-gene.ts`（`experienceGeneSchema`）；检索路由是 `POST /v1/retrieval/genes/search`（见 `packages/service-knowledge-read/src/experience-gene-routes.ts:100`）。

## 反馈与治理

### Feedback

用户反馈结构化持久为 `feedback_records`（`custom_answers` jsonb 加 GIN，见 `packages/db/src/schema/knowledge.ts:383`）。提交契约是 `packages/contracts/src/domain/feedback.ts` 的 `feedbackSubmissionSchema`。网关保留 public 提交地址 `POST /v1/feedback`，管理面挂在 `/v1/operations/feedback*`（见 `packages/host-distributed/src/gateway/route-defs/governance.ts:81`）。

### Boundary

知识适用边界。契约见 `packages/contracts/src/domain/boundary.ts`（`boundarySchema`）；存储是 `knowledge_entries` 的 `boundary` jsonb 列（见 `packages/db/src/schema/knowledge.ts:165`）。

### Decay 与 Maintenance

治理规则由 `service-governance-review` 拥有。触发路由是 `POST /v1/knowledge/decay` 与 `POST /v1/knowledge/maintenance`（见 `packages/host-distributed/src/gateway/route-defs/governance.ts:55`）。 decay 与 maintenance 的领域契约分别见 `packages/contracts/src/domain/decay.ts` 与 `packages/contracts/src/domain/maintenance.ts`。

### Evidence

条目附带的证据与溯源元数据，存在 `knowledge_entries` 的 `evidence_meta` jsonb 列。契约见 `packages/contracts/src/domain/evidence.ts`。

## 权限与安全

### RBAC、Security Level 与 Scope

- **Security Level**：`requiredLevel` 字段，`knowledge_entries` 与 `skill_artifacts` 都带（0 到 10，见 `packages/db/src/schema/knowledge.ts:227` 的 check）。
- **Scope**：`global` 或 `project`，决定可见性（见 `packages/db/src/schema/knowledge.ts:222` 的 check）。
- **Actor**：调用方身份见 `packages/contracts/src/domain/common.ts` 的 `actorRefSchema`；实体 ID 规范见同文件的 `entityIdSchema`。

## 队列与调度

### Task、Outbox 与 Cron

- **Task**：任务结构与队列状态快照见 `packages/contracts/src/domain/task-queue.ts`（`Task`、`TaskQueueStatusSnapshot`）；表是 `task_queue`（见 `packages/db/src/schema/queue.ts:27`）。
- **Outbox**：领域事件 outbox 表见 `packages/db/src/schema/knowledge.ts:522`。
- **Cron**：定时任务契约见 `packages/contracts/src/domain/cron.ts`（`cronJobSchema`）；表是 `cron_jobs`（见 `packages/db/src/schema/cron.ts:11`）；路由是 `packages/host-distributed/src/gateway/route-defs/cron.ts` 的 7 条 `/v1/cron/*`。

## 标签

### Canonical Label 与 Alias

规范标签身份权威是 `canonical_labels`，变体映射是 `label_aliases`，向量召回是 `canonical_label_embeddings`（见 `packages/db/src/schema/labels.ts:34`）。仓储记录结构见 `packages/contracts/src/domain/label-repository.ts`（`CanonicalLabelRecord`、`LabelAliasRecord`）。

## 其他

| 术语 | 落点 |
|---|---|
| **Entity Lineage** | `entity_lineage` 表，跨实体溯源（见 `packages/db/src/schema/candidates.ts:126`） |
| **Single Source of Truth** | `packages/db/src/schema/` 与 `packages/contracts` 是真源；文档是镜像 |
| **Usage Events** | `usage_events` 表，检索命中时序记录（见 `packages/db/src/schema/knowledge.ts:479`） |
