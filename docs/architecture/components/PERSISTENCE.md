# 持久化层

> 真源：`packages/db/src/schema/`（42 表，owner-local baseline）与各 `packages/service-*/drizzle/`；镜像见 [DATABASE_SCHEMA.md](../../reference/DATABASE_SCHEMA.md)。

## 决策

- **权威**：PostgreSQL 16 + pgvector。所有业务主事实为结构化表，无新的 JSON 文件主路径。
- **迁移**：空库 baseline 建立当前 schema；不支持旧 `0000–0020` 原地升级。
- **索引**：向量 `HNSW`、全文 `tsvector + GIN`、低频字段 `jsonb + GIN / 函数索引`。

## 42 表按 Owner 分布

| Owner | Schema 文件 | 表 |
|---|---|---|
| `db` (shared) | `knowledge.ts` | `knowledge_entries`, `knowledge_revisions`, `lifecycle_events`, `knowledge_labels` |
|  | `artifacts.ts` | `skill_artifacts`, `artifact_revisions`, `artifact_lifecycle_events`, `skill_artifact_files`, `skill_artifact_script_descriptors`, `skill_artifact_profiles`, `skill_artifact_capsules`, `skill_artifact_capsule_embeddings`, `skill_artifact_client_manifests`, `skill_artifact_manifest_items`, `skill_artifact_agent_reviews` |
|  | `candidates.ts` | `candidates` (含 `analysis jsonb`), `candidate_duplicate_cases` (含 `matches jsonb`), `candidate_outcomes`, `candidate_embeddings` |
|  | `retrieval.ts` | `knowledge_embeddings`, `knowledge_search_documents` (tsvector+tokens), `graph_index_documents` |
|  | `queue.ts` | `task_queue`, `domain_event_outbox`, `workflow_runs` |
|  | `auth.ts` | `users`, `teams`, `memberships`, `access_keys`, `sessions`, `audit_events` |
|  | `labels.ts` | `canonical_labels`, `label_aliases`, `label_merge_records`, `label_embeddings` |
|  | `experience-genes.ts` | `experience_genes`, `experience_gene_embeddings`, `experience_gene_lineage` |
|  | `cron.ts` | `cron_jobs`, `cron_runs` |
| `service-governance-review` |  | `conflict_relations`, `feedback_records` (含 badcase jsonb), `maintenance_*` 投影 |
| `service-job-runtime` |  | `task_queue` 派生视图与 `workflow_runs` 为权威 |

> 详细用途与主键见 [DATABASE_SCHEMA.md](../../reference/DATABASE_SCHEMA.md)。`skill_artifacts` / `artifact_revisions` 上的 JSONB 为兼容缓存，结构化子表为事实源。

## 索引策略

- 向量：`knowledge_embeddings`, `skill_artifact_capsule_embeddings`, `experience_gene_embeddings` 用 `pgvector HNSW`。
- 全文：`knowledge_search_documents.search_vector` (`tsvector`) + GIN；`tokens text[]` + GIN。
- 低频合并：`candidates.analysis`、`candidate_duplicate_cases.matches`、`skill_artifacts.maintenance_meta` 等用 `jsonb + GIN / 函数索引`，80–90% 性能保底。
- 队列出队：`task_queue` 按 `status + process_after + priority + created_at` 谓词，无单独 `pending_dequeue` 索引，依赖 `ORDER BY … LIMIT 1 FOR UPDATE SKIP LOCKED`。

## 事务与一致性

- 候选创建与 `task_queue` 入队在同一 DB 事务内原子提交。
- 知识生命周期变更与 `domain_event_outbox` 写入同事务（`knowledge-write` 已收敛）。
- `task_queue` / `domain_event_outbox` 携带 lease（`workerId/startedAt/heartbeatAt/leaseUntil`），过期可回收为待处理。
- 启动时按 `bootstrap-repositories.ts → candidate-recovery → workers → graph-reconciliation → lifecycle` 顺序执行，见 [ARCHITECTURE.md](../ARCHITECTURE.md)。

## Repository 形态

各上下文通过 Port + Repository 抽象访问 PG：

- 写侧：`service-knowledge-write`、`service-candidate-ingestion`、`service-governance-review`、`service-identity-access` 分别实现各自 owner 表的 PG repository。
- 读侧：`service-knowledge-read` 组装检索读模型，不回写入 side 覆盖写侧投影。
- 测试：提供 `InMemory*Repository` 仅用于单元/集成测试，不作为生产回退。

## Drizzle Baseline

- 6 个 owner 各持一个 `drizzle/` baseline；distributed 按 `identity-access → knowledge-write → candidate-ingestion → governance-review → job-runtime → knowledge-read` 协调。
- `packages/db/src/schema/index.ts` 聚合所有表供 `check:table-schema` 校验。
