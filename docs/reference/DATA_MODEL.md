# 数据模型

本文档描述 TrapMap 核心实体与持久化边界。契约见 `packages/contracts/src/domain/`，表见 `packages/db/src/schema/`。

> 基线：PostgreSQL 42 表为唯一主事实源；空库建库，不支持 `0000–0020` 原地升级。旧 `store_snapshot` 已退役，见 `docs/archived/`。

## 事实源边界

| 领域 | 主事实源 | 说明 |
|---|---|---|
| Knowledge / Skill Artifact / Candidate / Task Queue | PostgreSQL 结构化表 | 主表+修订+事件+子表，PG-first |
| Team / User / Member / Session / AccessKey / Audit | PostgreSQL | `users/teams/memberships/sessions/access_keys/audit_events` |
| Feedback / Conflict / Usage | PostgreSQL | `feedback_records` (custom_answers jsonb+GIN) / `conflict_relations` / `usage_events` |
| 检索索引 | PostgreSQL | `knowledge_embeddings`(HNSW) / `knowledge_search_documents`(tsvector+GIN) / `graph_index_documents` / `capsule_embeddings` |
| 标签目录 | PostgreSQL | `canonical_labels / aliases / embeddings / events` |
| Gene | PostgreSQL | `experience_genes / events / embeddings` |

> 检索/标签/Gene 索引表为可重建投影，不承载业务真相。

## 关键模型

### Knowledge / Skill Artifact

- **KnowledgeEntry**：`id/teamId/scope/labels/shortcut/detail/requiredLevel/lifecycleState/owner/history/boundary/maintenanceMeta`（Zod: `knowledgeEntrySchema`）。
- **SkillArtifact**：`id/teamId/scope/labels/title/slug/requiredLevel/lifecycleState/owner/history/metadata/agentReview`（Zod: `skillArtifactSchema`）。
- 修订：`knowledge_revisions` / `artifact_revisions` 为 immutable 历史；`lifecycle_events` / `artifact_lifecycle_events` 审计状态机。
- 结构化子表为准，`*.boundary / maintenance_meta` 等 jsonb 为缓存（见 [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)）。

### Candidate / Duplicate

- **Candidate**：`id/sourceType(trap|skill)/status/originalPayload/analysis/matches/outcomes`（`CandidateStatusSchema`: `received|queued|analyzing|duplicate_detected|ready_for_review|resolved|error`）。
- 去重：`candidate_duplicate_cases.matches jsonb+GIN`，匹配类型 `exact|high-overlap|semantic-similar`。
- 人工结果与决议合并为 `candidate_outcomes(kind=manual|resolution)`。

### Identity / Governance

- **Membership** 连接 `users ↔ teams`，决定 `requiredLevel` 资格与 RBAC。
- **Audit**：`audit_events` 记录关键动作。
- 冲突：`conflict_relations` 由 `governance-review` 写入，`knowledge-read` 只读投影。

### Queue / Outbox / Workflow

- `task_queue(status: pending|running|completed|failed|dead)` + `domain_event_outbox(status: pending|processing|completed|failed)` 均含 lease（`workerId/startedAt/heartbeatAt/leaseUntil`）。
- `workflow_runs`：`pending|running|completed|failed`，`stepName` 线性 checkpoint。
- Shared jobs：`knowledge.index-follow-up` / `feedback.remediation-reactivation` / `feedback.badcase-export-draft` 为派生输入。

### Gene / Label

- **Gene**：`experience_genes` 为当前状态事实源，`experience_gene_events` 为审计，`experience_gene_embeddings` 为可重建投影。
- **Label**：`canonical_labels` 为身份权威，`label_aliases` 映射变体，`label_embeddings` 用于向量召回。

## 原子性与回收

- 候选创建+ `task_queue` 入队同事务；知识生命周期变更+ `outbox` 同事务。
- `task_queue` / `outbox` 过期 `leaseUntil` 可回收为待 claim。

## 队列/Outbox 词汇

- `task_queue.status`: `pending|running|completed|failed|dead`
- `domain_event_outbox.status`: `pending|processing|completed|failed`
- 派生：`staleRunning` / `staleProcessing`（lease 过期）；worker `running|remote|degraded|not-configured`。

## 索引要点

- HNSW：`knowledge_embeddings` / `capsule_embeddings` / `gene_embeddings` / `label_embeddings`
- GIN：`knowledge_search_documents` 全文；`candidates.analysis` / `matches` / `maintenance_meta` 等 jsonb
- 队列：`task_queue_dedupe_pending_idx (type,dedupe_key) partial` 防重；`running_lease_idx` 用于 reclaim

## 配置与推导

- 部署：6 service owner 各持 `drizzle/` baseline；distributed 按既定顺序执行。
- 检索/Gene 的向量与全文投影为可重建派生，不计入业务主事实。
