# 术语表

本文档定义 TrapMap 核心术语及其代码落点（TS/Zod/DB/Route 四列）。路径相对仓库根。

> 路径前缀：所有路径相对项目根；形式：`TS`=类型、`Zod`=Zod schema、`DB`=Drizzle 表、`Route`=HTTP 端点、`Impl`=实现模块。

---

## 核心概念

### Trap（陷阱）

团队踩坑经验；非独立类型，为 `KnowledgeEntry` 的 `sourceType: 'trap'` 语义变体。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/candidates.ts` | Zod (`trap`) | `CandidateSourceSchema` / `TrapCandidatePayloadSchema` |
| `packages/contracts/src/domain/knowledge.ts` | Zod | `KnowledgeEntry` 相关 |
| `packages/host-local/src/nest/gateway/gateway.route-defs.ts` / `packages/service-knowledge-write/src/routes.ts` | Route | `/v1/traps*`、`/v1/knowledge` 别名 |

### Skill（技能工件）

已验证最佳实践的目录形态（含 `SKILL.md` / `references/` / `assets/` / `scripts/`）。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/artifacts.ts` | Zod (`skillArtifactSchema`) | 聚合根：id/teamId/scope/labels/title/slug/lifecycle/owner/history/metadata |
| `packages/db/src/schema/artifacts.ts` | DB | `skill_artifacts`, `artifact_revisions`, `skill_artifact_files`, `skill_artifact_script_descriptors`, `skill_artifact_profiles/capsules/manifests/items/agent_reviews` |
| `packages/service-knowledge-write/src/routes.ts` | Route | `POST /v1/operations/artifacts/import\|export\|activate` 等 |

### Knowledge Entry（知识条目）

可检索的知识单元（Trap 或 Skill 批准后形态）。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/knowledge.ts` | Zod (`knowledgeEntrySchema`) | 聚合根定义 |
| `packages/db/src/schema/knowledge.ts` | DB | `knowledge_entries`, `knowledge_labels`, `knowledge_revisions`, `lifecycle_events` |
| `packages/db/src/schema/retrieval.ts` | DB | `knowledge_embeddings` (HNSW), `knowledge_search_documents` (tsvector+GIN), `graph_index_documents` |
| `packages/host-local/src/nest/gateway/gateway.route-defs.ts` | Route | `POST /v1/knowledge`, `GET /v1/knowledge/:id`, `PATCH /v1/knowledge/:id` |

### Pitfall

`Trap` 的同义词，早期文档用词，现统一为 Trap。

## 检索相关

### Retrieval（检索）

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/retrieval.ts` | Zod | `retrievalQueryModeSchema` (`semantic|hybrid|graph-assisted`), `retrievalStrategySchema` |
| `packages/service-knowledge-read/src/retrieval-orchestration.ts` | Impl | `searchKnowledge` / `searchKnowledgeV2` / `compileTrapFirstPlan` 编排 |
| `packages/service-knowledge-read/src/retrieval-semantic.ts` / `retrieval-keyword.ts` / `graph-query*.ts` | Impl | 语义/关键词/图三通道 |

### Capsule（胶囊）

Skill 派生的可操作知识单元。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/artifacts.ts` | Zod | capsule 结构 |
| `packages/db/src/schema/artifacts.ts` | DB | `skill_artifact_capsules`, `skill_artifact_capsule_embeddings` (HNSW), `keywordTokens jsonb+GIN` |
| `packages/service-knowledge-read/src/retrieval-recall-coordinator.ts` | Impl | 多通道召回与 merge/rerank |

### IntentCategory / semanticQuery / parseMethod

v2 检索的意图三元组：分类 / 语义优化查询 / 解析方式（`regex|llm`），由 `intent-recognition` 端口在 `service-knowledge-read/src/intent-recognition/` 产生，仅内部使用。

### Profile / Manifest

- **Profile**：`skill_artifact_profiles`（派生配置，1:1）。
- **Manifest**：`skill_artifact_client_manifests` + `skill_artifact_manifest_items`（references/assets/scripts 三合一）。

### Rerank / RetrievalCache

- **Rerank**：`rerankMergedCapsules()` 对 merge 后候选独立精排（复用 intent-aware 特征）。
- **Cache**：检索读模型缓存见 `retrieval-read-model-cache.ts`，按 `namespace` 隔离。

| 术语 | 位置 |
|------|------|
| `Hit@K / MRR / nDCG` | `evals/retrieval/` 指标（见 `docs/architecture/components/EVALUATION.md`）|
| `executionPlan / ExecutionStep` | `packages/contracts/src/domain/plans.ts`（图计划编译）|

## 生命周期

### Lifecycle State

`draft | pending_review | approved | active | deprecated | rejected | superseded`（`packages/contracts/src/domain/knowledge.ts` 的 `lifecycleStateSchema`；`artifact` 复用同一枚举）。事件审计在 `lifecycle_events` / `artifact_lifecycle_events`。

### Agent Review

AI 预审结果：`agent-pass | agent-rejected`，含 `duplicateRisk/correctnessRisk/completenessRisk (low|medium|high)`。实现在 `service-knowledge-write/src/` 与 `service-governance-review/src/` 协作；路由经 host gateway。

### Resubmit

被拒条目修正后重提，保留历史。契约见 `knowledgeResubmissionSchema`；路由 `POST /v1/knowledge/:entryId/resubmit`。

## 摄取管道

### Candidate（候选）

异步摄取入口（`trap|skill` 二型）。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/candidates.ts` | Zod | `CandidateStatusSchema` / `CandidateSubmissionSchema` |
| `packages/db/src/schema/candidates.ts` | DB | `candidates` (含 `analysis jsonb+GIN`), `candidate_outcomes` (manual|resolution), `candidate_duplicate_cases` (含 `matches jsonb+GIN`), `candidate_embeddings` |
| `packages/service-candidate-ingestion/src/routes.ts` | Route | `POST /v1/candidates`, `GET /v1/candidates/:id` |
| `packages/service-candidate-ingestion/src/pg-ports.ts` | Impl | 去重/调度编排 |

### Duplicate Case / Manual Resolution

- **Duplicate Case**：`candidate_duplicate_cases` + `matches jsonb`（`exact/high-overlap/semantic-similar`），由 `dedup-strategy` 端口产生。
- **Manual Resolution**：`candidate_outcomes(kind=manual|resolution)` 存裁定结果。

## 反馈与维护

### Feedback / Decay / Maintenance / Evidence / Boundary

| 概念 | 位置 |
|------|------|
| **Feedback** | `packages/db/src/schema/retrieval.ts`? 实际 `packages/db/src/schema/queue.ts` 的 `feedback_records`（含 remediation 列 + badcase jsonb），owner `service-governance-review` |
| **Decay** | `lifecycle_events` / 治理规则在 `service-governance-review/src/` |
| **Maintenance** | `knowledge_entries.maintenance_meta jsonb` + `skill_artifacts.maintenance_meta`（Phase2 合并） |
| **Evidence** | `knowledge_entries.boundary jsonb` / `skill_artifacts` 派生证据 |
| **Boundary** | `knowledge_entries.boundary jsonb+GIN`（6 子表已合并，见 [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)） |

## 权限与安全

### RBAC / Security Level / Scope

| 概念 | 位置 |
|------|------|
| **RBAC** | `packages/backend-core/src/governance-review/domain/` + `service-governance-review/src/`；契约 `packages/contracts/src/domain/knowledge.ts` + `packages/contracts/src/domain/operations.ts` |
| **Security Level** | `requiredLevel` 字段，`knowledge_entries` / `skill_artifacts` 均携带 |
| **Scope** | `global | project`，决定可见性；`knowledge_entries.scope`, `skill_artifacts.scope` |

## 评估

| 术语 | 说明 |
|------|------|
| **Smoke / Core Test** | `evals/retrieval/` 的 `smoke`（快速）与 `core`（全量）两档，`pnpm eval:smoke` |
| **Governance Failure** | 治理阶段可标准化失败分类，见 `docs/architecture/components/GOVERNANCE.md` |
| **Groundedness/Coverage** | 摘要评估指标，见 `evals/summary/` |

## 数据模型

### EntityId / ActorRef / Label

| 概念 | 位置 |
|------|------|
| **EntityId** | `packages/contracts/src/domain/common.ts` 纯字符串 ID（`prefixedId`） |
| **ActorRef** | `packages/backend-core/src/identity-access/domain/`（user/handle + membership 安全等级） |
| **Label** | `canonical_labels` + `label_aliases`（`packages/db/src/schema/labels.ts`），`knowledge_labels` 为 entry 绑定 |

## 其他

| 术语 | 位置 |
|------|------|
| **Skill Directory** | Skill 工件目录结构（`SKILL.md` / `references/` / `assets/` / `scripts/`），见 `docs/architecture/components/ARTIFACTS.md` |
| **Artifact** | 代码侧同 `SkillArtifact` |
| **Fallback** | 无 key 时向量回退为确定性哈希（`fallback` provider） |
| **Postgres Store** | 唯一生产存储：PostgreSQL 16 + pgvector + Drizzle（`packages/db/src/schema/`） |
| **Single Source of Truth** | `packages/db/src/schema/` 与 `packages/contracts` 为真源；文档为镜像 |
| **Migration Baseline** | 6 个 `packages/service-*/drizzle/` baseline，分布式按既定顺序执行 |
| **Activation Policy** | 技能激活策略（worker / gateway 侧决定） |
| **Entity Lineage** | `entity_lineage` 表，跨实体溯源 |
| **Render Kind** | 工件渲染类型（`skill_artifact_manifest_items.kind`） |

> 旧的 `JsonStore` / `store_snapshot` / `DualWrite` 已退役，不再作为术语；历史见 `docs/archived/`。
