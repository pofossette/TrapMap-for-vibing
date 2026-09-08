# 数据模型

> 状态：Active。核对日期：2026-09-08。本文档描述 TrapMap 核心实体与持久化边界。你要找表定义去 [数据库表结构](DATABASE_SCHEMA.md)；你要找契约去 `packages/contracts/src/domain/`。

基线：PostgreSQL 42 张表是唯一主事实源；`packages/db/src/schema/` 说了算。旧快照存储已退役，历史见 `docs/archived/`。

## 事实源边界

| 领域 | 主事实源 | 说明 |
|---|---|---|
| Knowledge / Skill Artifact / Candidate / Task Queue | PostgreSQL 结构化表 | 主表加修订加事件加子表，PG-first |
| Team / User / Member / Session / AccessKey / Audit | PostgreSQL | `users`、`teams`、`memberships`、`sessions`、`access_keys`、`audit_events`（见 `packages/db/src/schema/auth.ts`） |
| Feedback / Usage | PostgreSQL | `feedback_records`（`custom_answers` jsonb 加 GIN）与 `usage_events`（见 `packages/db/src/schema/knowledge.ts`） |
| 检索索引 | PostgreSQL | `knowledge_embeddings`（HNSW）、`knowledge_search_documents`（tsvector 加 GIN）、`graph_index_documents`、`skill_artifact_capsule_embeddings` |
| 标签目录 | PostgreSQL | `canonical_labels`、`label_aliases`、`canonical_label_embeddings`、`label_alignment_events`（见 `packages/db/src/schema/labels.ts`） |
| Gene | PostgreSQL | `experience_genes`、`experience_gene_events`、`experience_gene_embeddings`（见 `packages/db/src/schema/experience-genes.ts`） |

检索、标签与 Gene 的索引表是可重建投影，不承载业务真相。你重建它们不需要业务迁移。

## 关键模型

### Knowledge 与 Skill Artifact

- **KnowledgeEntry**：`id`、`teamId`、`scope`、`labels`、`shortcut`、`detail`、`requiredLevel`、`lifecycleState`、`owner`、`boundary`、`maintenanceMeta`。Zod 定义见 `packages/contracts/src/domain/knowledge.ts`；表见 `packages/db/src/schema/knowledge.ts`。
- **SkillArtifact**：`id`、`teamId`、`scope`、`labels`、`title`、`slug`、`requiredLevel`、`lifecycleState`、`owner`、`history`、`metadata`、`agentReview`。Zod 定义见 `packages/contracts/src/domain/artifacts.ts`；表见 `packages/db/src/schema/artifacts.ts`。
- 修订：`knowledge_revisions` 与 `artifact_revisions` 是不可变历史；`lifecycle_events` 与 `artifact_lifecycle_events` 审计状态机。
- 结构化子表为准；主表上的 `boundary`、`maintenance_meta` 等 jsonb 列是兼容缓存（见 [数据库表结构](DATABASE_SCHEMA.md)）。

### Candidate 与去重

- **Candidate**：`id`、`sourceType`（`trap` 或 `skill`）、`status`、`originalPayload`、`analysis`、`matches`、`outcomes`。Zod 定义见 `packages/contracts/src/domain/candidates.ts`；表见 `packages/db/src/schema/candidates.ts`。
- 去重：`candidate_duplicate_cases` 的 `matches` 列是 jsonb 加 GIN；匹配类型为 `exact`、`high-overlap`、`semantic-similar`。
- 人工结果与决议合并进 `candidate_outcomes`（`kind` 为 `manual` 或 `resolution`）。

### Identity 与治理

- **Membership** 连接 `users` 与 `teams`，决定 `requiredLevel` 资格与 RBAC。
- **Audit**：`audit_events` 记录关键动作。
- 生命周期状态机只有七态：`draft`、`submitted`、`agent-pass`、`agent-rejected`、`approved`、`rejected`、`deactivated`（见 `packages/contracts/src/domain/common.ts:38`）。`knowledge_entries` 与 `skill_artifacts` 共用这套枚举；事件审计落在 `lifecycle_events` 与 `artifact_lifecycle_events`。

### Queue、Outbox 与 Workflow

- `task_queue`（`pending`、`running`、`completed`、`failed`、`dead`）与 `domain_event_outbox`（`pending`、`processing`、`completed`、`failed`）都带租约列（`workerId`、`startedAt`、`heartbeatAt`、`leaseUntil`）。
- `workflow_runs`：`pending`、`running`、`completed`、`failed`，`stepName` 做线性 checkpoint。
- 候选创建与 `task_queue` 入队在同一事务；知识生命周期变更与 outbox 写入在同一事务。租约过期的行可以回收重领。

### Gene 与 Label

- **Gene**：`experience_genes` 是当前状态事实源，`experience_gene_events` 是审计，`experience_gene_embeddings` 是可重建投影。契约见 `packages/contracts/src/domain/experience-gene.ts`。
- **Label**：`canonical_labels` 是身份权威，`label_aliases` 映射变体，`canonical_label_embeddings` 做向量召回。仓储接口见 `packages/contracts/src/domain/label-repository.ts`。

## 队列词汇

- `task_queue.status`：`pending`、`running`、`completed`、`failed`、`dead`。
- `domain_event_outbox.status`：`pending`、`processing`、`completed`、`failed`。
- 派生概念：租约过期的 `running` 或 `processing` 行视为可回收；worker 状态分 `running`、`remote`、`degraded`、`not-configured`。

## 索引要点

- HNSW 向量索引：`knowledge_embeddings`、`skill_artifact_capsule_embeddings`、`experience_gene_embeddings`、`canonical_label_embeddings`。
- GIN 索引：`knowledge_search_documents` 的全文与 `tokens` 数组；`candidates.analysis`、`candidate_duplicate_cases.matches` 等 jsonb 列。
- 队列索引：`task_queue` 的 pending 去重部分唯一索引防重；`running` 租约索引用于回收；`domain_event_outbox` 的 pending 与 processing 租约索引。

## 配置与推导

- 部署时 6 个 service owner 各持迁移 baseline；表清单以 `packages/db/src/schema/` 实测 42 张为准，守卫是 `scripts/check-table-schema.ts`。
- 检索与 Gene 的向量和全文投影是可重建派生，不计入业务主事实。

## 文件行号锚点（2026-09-08 实测）

- `packages/contracts/src/domain/common.ts:38`：`lifecycleStateSchema` 七态枚举。
- `packages/db/src/schema/knowledge.ts:143`：`knowledge_entries` 表定义。
- `packages/db/src/schema/artifacts.ts:56`：`skill_artifacts` 表定义。
- `packages/db/src/schema/candidates.ts:20`：`candidates` 表定义。
- `packages/db/src/schema/experience-genes.ts:25`：`experience_genes` 表定义。
- `packages/db/src/schema/labels.ts:34`：`canonical_labels` 表定义。
- `packages/db/src/schema/queue.ts:27`：`task_queue` 表定义。
- `packages/db/src/schema/cron.ts:11`：`cron_jobs` 表定义。
