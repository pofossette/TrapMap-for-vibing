# 数据模型

本文档描述 TrapMap 系统的核心数据实体及其关系。所有 Schema 定义位于 `packages/contracts/src/domain/`。

> **Round 2 更新**：知识条目（knowledge）、技能工件（artifact）和候选提交（candidate）的核心读写路径已从单行 `store_snapshot` JSONB 切换为 PostgreSQL 结构化表。`DualWrite*Repository` 兼容层已删除，`store_snapshot` 仅保留为用户/团队/会话等尚未迁移域的运行时存储。知识序列化中的 `StoreData` 依赖已替换为 `UserLookupContext` 轻量接口。
>
> **Round 6 更新**：反馈（feedback）已从 `store_snapshot` JSONB 迁移为 PostgreSQL 结构化表（`feedback_records` + `feedback_custom_answers`）。`PgFeedbackRepository` 替代 `InMemoryFeedbackRepository` 成为主路径。用法统计新增 `usage_events_daily_rollup` 预聚合表。
>
> **Round 7 更新**：检索索引模型完成结构化改造。`knowledge_keywords.tokens` 和 `field_tokens` 从 JSONB 迁移为原生 `text[]` 类型，使用 `&&`（数组重叠）替代 `?|`（JSONB 包含）进行 token 匹配。`knowledge_embeddings.labels` 从 JSONB 迁移为 `text[]`。新增 `knowledge_search_documents` 表（tsvector 全文检索）和 `graph_index_documents` 表（GraphRAG-lite 持久化，替代 `store_snapshot.graphIndexDocuments` 内存存储）。
>
> **Round 3 更新**：知识域完成结构化改造。`knowledge_entries` 表补齐 `CHECK` 约束（`scope`、`lifecycle_state`、`required_level`）。`knowledge_labels` 表从 JSONB 拆分为结构化子表，支持按标签精确过滤和聚合。边界（boundary）从单 JSONB 列拆为六个子表：`knowledge_boundary_contexts`、`knowledge_boundary_versions`、`knowledge_boundary_prerequisites`、`knowledge_boundary_signals`、`knowledge_boundary_exclusions`、`knowledge_boundary_evidence`。维护（maintenance）拆为 `knowledge_maintenance_assignments` 独立表。`knowledge_revisions` 补齐 `(entry_id, revision_no)` 唯一约束。`lifecycle_events` 补齐 `type` CHECK 约束。JSONB 列保留为读优化缓存，与结构化子表同步。

## 基线冻结（Round 0）

Round 0 的目标不是立即改完所有表，而是冻结后续数据库现代化的边界，避免后续轮次继续引入与目标模型冲突的新持久化方案。

### 当前事实源边界

| 领域 | 当前主事实源 | 说明 |
|------|-------------|------|
| Knowledge | PostgreSQL 结构化表 | 主表 + 版本表 + 生命周期事件 + 标签/边界/维护子表，带 CHECK 约束 |
| Skill Artifact | PostgreSQL 结构化表 | 工件、版本、文件、capsule/profile/manifest 等为主路径 |
| Candidate | PostgreSQL 结构化表 | 候选、重复检测、处理状态与队列已切到 PG 主路径 |
| Task Queue | PostgreSQL 结构化表 | 队列表和相关索引由 Drizzle migration 管理 |
| Team / User / Member / Session / AccessKey | `store_snapshot` JSONB | 仍通过 `SkillShareerStore` 兼容抽象提供运行时存储 |
| Audit / Duplicates / Lineage / Graph Index 等辅助域 | 混合状态，以 JSONB 为主 | 后续轮次再逐步拆分，当前不再新增新的快照依赖面 |
| Feedback | PostgreSQL 结构化表 | `feedback_records` + `feedback_custom_answers`，Round 6 迁移 |
| Usage Analytics | PostgreSQL 结构化表 | `usage_events` + `usage_events_daily_rollup`，Rollup 为派生表 |

### JSONB 保留与拆分准则

- 必须拆分为结构化列或子表的字段：
  - 参与筛选、排序、分页的字段
  - 参与唯一约束、外键、状态校验的字段
  - 参与治理、统计、权限、检索召回的字段
  - 需要局部更新、并发写入或精确回填的字段
- 允许暂时保留在 `JSONB` 的字段：
  - 低频扩展元数据
  - 外部原始响应快照
  - 仅用于迁移期核对的过渡字段

### 目标分层约定

- 业务主表：承载聚合根当前态，是业务唯一事实源。
- 历史表：承载 revision、版本快照和可追溯历史。
- 事件表：承载生命周期变更、人工审核、状态流转、发布关系。
- 派生索引表：承载 embeddings、关键词索引、capsule、profile、manifest、usage rollup，不得成为新的业务真相来源。

### 迁移策略约定

1. 先冻结目标模型和命名规范，再写 migration。
2. 先建立 PostgreSQL 真表与索引，再提供回填脚本。
3. 如存在兼容期，兼容层必须有明确删除轮次，不允许长期双写。
4. 完成影子核对后停止双写，主路径只保留一个事实源。
5. 仅在全部调用点迁移完成后删除旧表/旧快照依赖。

## 实体概览

```
Team (团队)
    │
    ├── Member (成员) 1:N
    │       │
    │       └── AccessKey (访问密钥) 1:N
    │
    ├── KnowledgeEntry (知识条目) 1:N
    │       │
    │       └── KnowledgeRevision (知识版本) 1:N
    │
    └── SkillArtifact (技能工件) 1:N
            │
            └── SkillArtifactRevision (工件版本) 1:N
                    │
                    ├── SkillProfile (技能画像)
                    ├── SkillCapsule (技能胶囊) 1:N
                    └── ClientManifest (客户端清单)

CandidateSubmission (候选提交) → DuplicateCase (去重案例) → 关联 KnowledgeEntry 或 SkillArtifact
```

## 核心类型

### EntityId

所有实体 ID 均使用 `entityIdSchema`：`z.string().min(1).max(128)`

### LifecycleState（生命周期状态）

```typescript
'draft' | 'submitted' | 'agent-pass' | 'agent-rejected' | 'approved' | 'rejected' | 'deactivated'
```

流程：

```
draft → submitted → agent-pass/agent-rejected
                        ↓               ↓
                    approved        rejected
                        ↓               ↓
                   (可更新)      (可 resubmit)
```

### Scope（作用域）

```typescript
'global' | 'project'
```

### SecurityLevel（安全等级）

`z.number().int().min(0).max(10)` — 数值越高，可访问的内容越敏感。

### Permission（权限枚举）

```typescript
'session:read' | 'team:create' | 'team:list' | 'team:select'
| 'member:create' | 'member:update' | 'member:key:create'
| 'knowledge:submit' | 'knowledge:search' | 'knowledge:review'
| 'knowledge:update' | 'knowledge:export' | 'knowledge:import'
| 'audit:read'
```

---

## Team（团队）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | EntityId | 唯一标识 |
| `name` | string | 团队名称 |
| `slug` | string | URL 友好标识符 |
| `description` | string? | 团队描述 |
| `createdAt` | ISO8601 | 创建时间 |
| `updatedAt` | ISO8601 | 更新时间 |

团队是成员的容器，支持多团队。成员通过 `teamId` 关联到团队。

---

## Member（成员）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | EntityId | 唯一标识 |
| `teamId` | EntityId | 所属团队 |
| `handle` | string | 用户名/句柄 |
| `roleTemplate` | `'user' \| 'admin' \| 'system-admin'` | 角色模板 |
| `securityLevel` | SecurityLevel | 安全等级（0-10） |
| `permissions` | Permission[] | 权限列表（可覆盖角色模板） |
| `notes` | string? | 备注 |
| `isSystem` | boolean | 是否为系统成员 |

---

## AccessKey（访问密钥）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | EntityId | 唯一标识 |
| `memberId` | EntityId | 所属成员 |
| `tokenPreview` | string | Token 预览（保留前 6-24 位） |
| `issuedBy` | ActorRef | 签发者 |
| `teamId` | EntityId | 关联团队 |
| `level` | SecurityLevel | 密钥等级 |
| `notes` | string? | 备注 |
| `revokedAt` | string? | 撤销时间（null 表示有效） |

---

## KnowledgeEntry（知识条目）

知识条目是 TrapMap 的核心可检索单元。

> **Round 3 结构化**：`labels`、`boundary`、`maintenanceMeta` 已从单 JSONB 列拆分为独立可查询子表。见下方「KnowledgeEntry 子表」各节。JSONB 列保留为读优化缓存，`PgKnowledgeRepository` 写入时同步维护结构化表。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | EntityId | 唯一标识 |
| `teamId` | EntityId? | 所属团队（null 表示全局） |
| `scope` | Scope | 作用域（`CHECK` 约束保证 `'global'` 或 `'project'`） |
| `labels` | Label[] | 标签列表（JSONB 缓存列，结构化存储见 `knowledge_labels`） |
| `shortcut` | string | 简短摘要（≤280 字符） |
| `detail` | string | 详细内容（≤10000 字符） |
| `requiredLevel` | SecurityLevel | 访问所需安全等级（`CHECK` 约束保证 0-10） |
| `lifecycleState` | LifecycleState | 当前状态（`CHECK` 约束保证合法枚举值） |
| `owner` | ActorRef | 所有者 |
| `latestRevision` | KnowledgeRevision | 最新版本 |
| `history` | KnowledgeRevision[] | 所有版本历史 |
| `metadata` | KnowledgeMetadata | 元数据（提交次数等） |
| `latestSubmission` | KnowledgeSubmissionRecord? | 最新提交记录 |
| `submissionHistory` | KnowledgeSubmissionRecord[] | 所有提交历史 |
| `agentReview` | AgentReviewResult? | AI 预审结果 |
| `reviewHistory` | ReviewDecision[] | 审核决定历史 |
| `reviewNotes` | ReviewNote[] | 审核备注 |
| `lifecycleHistory` | KnowledgeLifecycleEvent[] | 生命周期事件（`type` 受 `CHECK` 约束） |
| `boundary` | Boundary? | 边界约束（JSONB 缓存列，结构化存储见六个边界子表） |
| `maintenanceMeta` | MaintenanceMeta? | 维护元数据（JSONB 缓存列，结构化存储见 `knowledge_maintenance_assignments`） |
| `createdAt` | ISO8601 | 创建时间 |
| `updatedAt` | ISO8601 | 更新时间 |

### KnowledgeRevision（知识版本）

> **Round 3**：`knowledge_revisions` 表已补齐 `unique(entry_id, revision_no)` 约束，保证每个条目版本的唯一性。

| 字段 | 类型 | 说明 |
|------|------|------|
| `revision` | number | 版本号（递增） |
| `submittedAt` | ISO8601 | 提交时间 |
| `submittedBy` | ActorRef | 提交者 |
| `shortcut` | string | 版本级简短摘要 |
| `detail` | string | 版本级详细内容 |
| `labels` | Label[] | 标签 |

### KnowledgeEntry 子表（Round 3 结构化）

以下子表将原先嵌入 `knowledge_entries` JSONB 列的数组拆分为独立可索引行。所有子表的数据通过 `PgKnowledgeRepository` 与 JSONB 缓存列同步写入。

#### knowledge_labels（标签）

| 字段 | 类型 | 说明 |
|------|------|------|
| `entry_id` | FK → `knowledge_entries.id` | 知识条目 |
| `label` | text | 标签值 |
| `createdAt` | ISO8601 | 创建时间 |

唯一约束：`unique(entry_id, label)`。支持按标签精确过滤（AND 语义）和聚合统计。

#### knowledge_boundary_contexts（边界上下文）

| 字段 | 类型 | 说明 |
|------|------|------|
| `entry_id` | FK → `knowledge_entries.id` | 知识条目 |
| `context_value` | text | 上下文标签值（如 `'frontend'`、`'production'`） |
| `createdAt` | ISO8601 | 创建时间 |

唯一约束：`unique(entry_id, context_value)`。

#### knowledge_boundary_versions（边界版本约束）

| 字段 | 类型 | 说明 |
|------|------|------|
| `entry_id` | FK → `knowledge_entries.id` | 知识条目 |
| `package_name` | text | 包名/工具名（如 `'react'`、`'node'`） |
| `range_value` | text | 语义化版本范围（如 `'>=16.8.0'`） |
| `note` | text? | 说明 |

#### knowledge_boundary_prerequisites（边界前置条件）

| 字段 | 类型 | 说明 |
|------|------|------|
| `entry_id` | FK → `knowledge_entries.id` | 知识条目 |
| `description` | text | 前置条件描述 |
| `kind` | text? | 类型：`environment`、`permission`、`tool`、`configuration`、`other` |
| `required` | integer | 是否为必需（1=必需，0=可选） |
| `createdAt` | ISO8601 | 创建时间 |

#### knowledge_boundary_signals（边界信号匹配器）

| 字段 | 类型 | 说明 |
|------|------|------|
| `entry_id` | FK → `knowledge_entries.id` | 知识条目 |
| `pattern` | text | 匹配模式 |
| `kind` | text | 模式类型：`keyword`、`exact`、`regex`、`error-code`、`log-pattern` |
| `description` | text? | 触发说明 |

#### knowledge_boundary_exclusions（边界排除规则）

| 字段 | 类型 | 说明 |
|------|------|------|
| `entry_id` | FK → `knowledge_entries.id` | 知识条目 |
| `description` | text | 排除条件描述 |
| `kind` | text? | 排除类别：`platform`、`version`、`context`、`configuration`、`other` |
| `createdAt` | ISO8601 | 创建时间 |

#### knowledge_boundary_evidence（边界证据引用）

| 字段 | 类型 | 说明 |
|------|------|------|
| `entry_id` | FK → `knowledge_entries.id` | 知识条目 |
| `kind` | text | 证据来源类型：`issue`、`incident`、`cve`、`documentation`、`test`、`commit`、`other` |
| `identifier` | text | 引用标识（issue 号、CVE ID、commit hash 等） |
| `url` | text? | 证据来源 URL |
| `note` | text? | 相关性说明 |

#### knowledge_maintenance_assignments（维护分配）

| 字段 | 类型 | 说明 |
|------|------|------|
| `entry_id` | text PK / FK → `knowledge_entries.id` | 知识条目（1:1 关系） |
| `maintainer_user_id` | text? | 维护者用户 ID（null 表示未分配） |
| `maintainer_handle` | text? | 维护者句柄（读优化副本） |
| `maintainer_level` | integer? | 维护者安全等级 |
| `review_by` | ISO8601? | 计划审核时间 |

索引：`(maintainer_user_id)`、`(review_by)`，支持按维护者和复核截止时间筛选。

### AgentReviewResult（AI 预审结果）

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | `'agent-pass' \| 'agent-rejected'` | AI 预审状态 |
| `duplicateRisk` | `'low' \| 'medium' \| 'high'` | 重复风险 |
| `correctnessRisk` | `'low' \| 'medium' \| 'high'` | 正确性风险 |
| `completenessRisk` | `'low' \| 'medium' \| 'high'` | 完整性风险 |
| `checkedAt` | string | 检查时间 |
| `notes` | string[] | AI 备注 |

---

## SkillArtifact（技能工件）

技能工件以目录形式存储技能知识，支持版本历史。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | EntityId | 唯一标识 |
| `teamId` | EntityId? | 所属团队 |
| `scope` | Scope | 作用域 |
| `labels` | Label[] | 标签 |
| `title` | string | 标题 |
| `slug` | string | URL 友好标识符 |
| `requiredLevel` | SecurityLevel | 访问所需安全等级 |
| `lifecycleState` | LifecycleState | 当前状态 |
| `owner` | ActorRef | 所有者 |
| `latestRevision` | number | 最新版本号 |
| `history` | SkillArtifactRevision[] | 所有版本历史 |
| `metadata` | SkillArtifactMetadata | 元数据（JSONB 缓存列，结构化存储见 `skill_artifact_metadata`） |
| `agentReview` | AgentReviewResult? | AI 预审结果 |
| `reviewHistory` | ReviewDecision[] | 审核决定历史 |
| `reviewNotes` | ReviewNote[] | 审核备注 |
| `lifecycleHistory` | SkillArtifactLifecycleEvent[] | 生命周期事件 |

### SkillArtifactRevision（工件版本）

| 字段 | 类型 | 说明 |
|------|------|------|
| `revision` | number | 版本号 |
| `sourceHash` | string | 所有源文件的 SHA-256 哈希 |
| `files` | SkillArtifactFile[] | 所有文件清单 |
| `submittedAt` | ISO8601 | 提交时间 |
| `submittedBy` | ActorRef | 提交者 |
| `scriptDescriptors` | SkillScriptDescriptor[] | 脚本描述符 |
| `derived` | SkillArtifactDerived? | 派生产物（Profile/Capsule/Manifest） |

### SkillArtifactFile（工件文件）

| 字段 | 类型 | 说明 |
|------|------|------|
| `path` | string | 文件路径 |
| `kind` | `'skill-markdown' \| 'reference' \| 'asset' \| 'script'` | 文件类型 |
| `sha256` | string | 文件内容哈希 |
| `sizeBytes` | number | 文件大小 |
| `mediaType` | string | IANA 媒体类型 |
| `source` | `'references/' \| 'assets/' \| 'scripts/' \| 'SKILL.md'` | 源目录 |
| `includeInDerivation` | boolean | 是否参与派生 |
| `activationOnly` | boolean | 是否仅用于激活 |

### SkillCapsule（技能胶囊）

从 SKILL.md 和 references/ 派生的精炼知识单元，用于检索。

| 字段 | 类型 | 说明 |
|------|------|------|
| `capsuleId` | EntityId | 胶囊 ID |
| `artifactId` | EntityId | 父工件 ID |
| `revision` | number | 版本号 |
| `sourcePaths` | string[] | 源文件路径 |
| `content` | string | 精炼内容（≤5000 字符） |
| `situation` | string | 情境描述 |
| `problem` | string | 问题描述 |
| `goal` | string | 目标/解决方案 |
| `errorText` | string? | 错误文本（可选） |
| `contextualPrefix` | string? | LLM 生成的上下文前缀，用于提升检索效果（≤300 字符） |
| `labels` | Label[] | 标签 |
| `scope` | Scope | 继承自工件 |
| `requiredLevel` | SecurityLevel | 继承自工件 |

### SkillProfile（技能画像）

从 SKILL.md 和 references/ 导出的文摘，用于模型上下文。

| 字段 | 类型 | 说明 |
|------|------|------|
| `artifactId` | EntityId | 工件 ID |
| `revision` | number | 版本号 |
| `sourceHash` | string | 源文件哈希 |
| `title` | string | 标题 |
| `description` | string? | 描述 |
| `summary` | string | 文摘 |
| `keywords` | Label[] | 关键词 |
| `prerequisites` | string[] | 前置条件 |
| `referencePaths` | string[] | 引用的文件路径 |

---

## CandidateSubmission（候选提交）

异步摄取管道的入口实体。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | EntityId | 唯一标识 |
| `sourceType` | `'trap' \| 'skill'` | 来源类型 |
| `submittedBy` | EntityId | 提交者 |
| `teamId` | EntityId? | 团队 ID |
| `status` | CandidateStatus | 处理状态 |
| `originalPayload` | CandidatePayload | 原始载荷 |
| `analysisSnapshot` | AnalysisSnapshot? | 分析快照 |
| `duplicateCase` | DuplicateCase? | 去重案例 |
| `receivedAt` | ISO8601 | 接收时间 |
| `queuedAt` | ISO8601? | 入队时间 |
| `analyzingAt` | ISO8601? | 分析开始时间 |
| `completedAt` | ISO8601? | 完成时间 |
| `lastError` | string? | 最后错误信息 |
| `retryCount` | number | 重试次数 |
| `manualResult` | ManualResult? | 人工裁定结果 |

> **Round 5 更新**：`analysisSnapshot`、`duplicateCase`（含 `matches[]`）、`manualResult` 已从 JSONB 列拆分为结构化子表（`candidate_analyses`、`candidate_duplicate_cases`、`candidate_duplicate_matches`、`candidate_manual_results`）。JSONB 列保留为读优化缓存，与结构化表同步。候选状态、来源类型已补齐 `CHECK` 约束。
>
> **Phase 1 (Round 10) 更新**：候选处理状态改为**写后异步推进**。`POST /v1/candidates` 入口仅负责落库和登记后台队列任务（`status → queued`），分析、去重和索引由 `TaskWorker` 后台消费 `task_queue` 完成。`store_snapshot` 不再作为候选处理兜底路径。

### CandidateStatus（候选状态）

```
received → queued → analyzing → duplicate_detected / ready_for_review → resolved
                                    ↓
                                  error
```

### DuplicateCase（去重案例）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | EntityId | 唯一标识 |
| `candidateId` | EntityId | 关联候选 |
| `detectedAt` | ISO8601 | 检测时间 |
| `detectionVersion` | string | 算法版本 |
| `matches` | DuplicateMatch[] | 所有匹配项 |
| `highestSimilarity` | number | 最高相似度 |
| `hasExactDuplicate` | boolean | 是否有完全重复 |
| `duplicateType` | `'exact' \| 'semantic' \| 'none'` | 重复类型 |

> **Round 5 结构化子表**：`candidate_duplicate_cases` 存储判重主记录，`candidate_duplicate_matches` 存储匹配详情行。`highestSimilarity` 和 `similarityScore` 在数据库中以整数百分比（0-100）存储。

### EntityLineage（实体血缘）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | EntityId | 唯一标识 |
| `candidateId` | EntityId | 来源候选 |
| `relationshipType` | `'published_as' \| 'merged_into'` | 血缘关系类型 |
| `sourceType` | `'candidate' \| 'trap' \| 'skill'` | 来源实体类型 |
| `sourceId` | EntityId | 来源实体 ID |
| `targetType` | `'trap' \| 'skill'` | 目标实体类型 |
| `targetId` | EntityId | 目标实体 ID |
| `createdAt` | ISO8601 | 记录时间 |
| `notes` | string? | 说明 |

> **Round 5 更新**：`entity_lineage` 表已从 in-memory `store_snapshot` JSONB 迁移为 PostgreSQL 结构化表，支持按来源、目标、候选三个维度查询。

---

## FeedbackEntry（反馈条目）

用户对知识条目的问题反馈，由管理员处理。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | EntityId | 唯一标识 |
| `entryId` | EntityId | 关联的知识条目或工件 |
| `entryType` | `'trap' \| 'skill'` | 条目类型 |
| `problemType` | `'incorrect' \| 'outdated' \| 'context-mismatch' \| 'incomplete' \| 'other'` | 问题分类 |
| `description` | string | 问题描述（10-2000 字符） |
| `context` | string? | 用户操作上下文 |
| `querySeed` | string? | 导致此条目的检索查询 |
| `customAnswers` | FeedbackCustomAnswer[]? | 自定义提示答案 |
| `status` | FeedbackStatus | 处理状态 |
| `submittedBy` | ActorRef | 提交者 |
| `submittedAt` | ISO8601 | 提交时间 |

### FeedbackStatus（反馈状态机）

```
new → triaged → resolved
              → dismissed
```

> **Round 6 更新**：反馈已从 `store_snapshot` JSONB 迁移为 PostgreSQL 结构化表。`feedback_records` 表包含所有反馈主字段，`feedback_custom_answers` 表存储自定义问答对。`entryType`、`problemType`、`status` 已补齐 `CHECK` 约束。索引覆盖 `entryId`、`entryType`、`status`、`problemType`、`submittedByUserId` 维度。

> 源码：`packages/contracts/src/domain/feedback.ts`

---

## DecayMeta（衰减元数据）

附加在 KnowledgeEntry 上的衰减状态追踪。

| 字段 | 类型 | 说明 |
|------|------|------|
| `lastVerifiedAt` | ISO8601 | 最后一次人工验证时间 |
| `decayState` | DecayState | 当前衰减状态 |
| `supersededById` | EntityId? | 取代此条目的条目 ID |
| `decayStateComputedAt` | ISO8601 | 衰减状态最后计算时间 |
| `freshnessType` | `'evergreen' \| 'versioned' \| 'volatile'` | 新鲜度类型（决定衰减曲线） |

### DecayState（衰减状态机）

```
active → review-due → stale → expired
                            → superseded（被新条目取代）
```

> 源码：`packages/contracts/src/domain/decay.ts`

---

## MaintenanceMeta（维护元数据）

附加在 KnowledgeEntry 上的维护责任追踪。

| 字段 | 类型 | 说明 |
|------|------|------|
| `maintainer` | ActorRef? | 当前维护者（null 表示未分配） |
| `reviewBy` | ISO8601? | 计划审核日期（SLA 追踪） |

> 源码：`packages/contracts/src/domain/maintenance.ts`

---

## 检索相关类型

### RetrievalQuery（检索查询）

| 字段 | 类型 | 说明 |
|------|------|------|
| `seed` | string | 查询种子文本 |
| `filters` | RetrievalFilters | 过滤条件 |
| `maxResults` | number | 最大结果数（默认 10） |
| `includeRefinement` | boolean | 是否包含精炼 |
| `includeSummary` | boolean | 是否包含摘要 |
| `mode` | `'semantic' \| 'hybrid' \| 'graph-assisted'` | 检索模式 |

### RetrievalCitation（检索引用）

| 字段 | 类型 | 说明 |
|------|------|------|
| `source` | `{ entryId, scope, shortcut }` | 来源信息 |
| `snippet` | string | 片段文本 |
| `tags` | Label[] | 标签 |
| `recallChannels` | `('semantic' \| 'keyword' \| 'graph')[]` | 命中的通道 |
| `scores` | `{ semantic, keyword, graph, preRerank, final }` | 各通道得分 |

---

## Schema 文件索引

| 文件 | 主要类型 |
|------|----------|
| `domain/common.ts` | EntityId, LifecycleState, Scope, SecurityLevel, Permission, ActorRef |
| `domain/team.ts` | Team, Member, AccessKey |
| `domain/knowledge.ts` | KnowledgeEntry, KnowledgeRevision, KnowledgeSubmission |
| `schema.ts` (DB) | knowledge_entries, knowledge_revisions, lifecycle_events, knowledge_labels, knowledge_boundary_* (×6), knowledge_maintenance_assignments |
| `domain/artifacts.ts` | SkillArtifact, SkillCapsule, SkillProfile, ClientManifest |
| `domain/retrieval.ts` | RetrievalQuery, RetrievalResponse, CapsuleMatch, RetrievalCitation |
| `domain/candidates.ts` | CandidateSubmission, DuplicateCase, CandidateStatus |
| `domain/review.ts` | ReviewDecision, ReviewNote, AgentReviewResult |
| `domain/plans.ts` | TrapFirstPlan, GraphPlan, PlanTrapNode |
| `domain/operations.ts` | Import/Export 相关类型 |
| `domain/feedback.ts` | FeedbackEntry, FeedbackStatus, FeedbackBatchRequest |
| `domain/decay.ts` | DecayMeta, DecayState, DecayConfig, BatchOperationRequest |
| `domain/maintenance.ts` | MaintenanceMeta, MaintenanceAction, MaintenanceEntryListRequest |

---

## 持久化架构（Round 7）

### 当前状态

| 领域 | 读路径 | 写路径 | 存储后端 |
|------|--------|--------|----------|
| Knowledge | `KnowledgeRepository` (PG) | `PgKnowledgeRepository` | `knowledge_entries` / `knowledge_revisions` / `lifecycle_events` / `knowledge_labels` / `knowledge_boundary_*` (6 表) / `knowledge_maintenance_assignments` |
| Artifact | `ArtifactRepository` (PG) | `PgArtifactRepository` | `skill_artifacts` / `artifact_revisions` / `artifact_lifecycle_events` / `skill_artifact_files` / `skill_artifact_script_descriptors` / `skill_artifact_profiles` / `skill_artifact_capsules` / `skill_artifact_client_manifests` / `skill_artifact_manifest_*` |

> **Round 4 更新**：Skill Artifact 已从“仅 PostgreSQL JSONB 聚合”推进到“结构化子表 + JSONB 兼容缓存”模式。`artifact_revisions.files`、`artifact_revisions.script_descriptors` 与 `artifact_revisions.derived` 仍保留为受控缓存列，用于兼容既有读取链路；数据库事实源已经补充到 `skill_artifact_files`、`skill_artifact_script_descriptors`、`skill_artifact_profiles`、`skill_artifact_capsules`、`skill_artifact_client_manifests` 及其 manifest 子表。`PgArtifactRepository` 在写入 revision 时同步维护两套表示，并在读取时优先从结构化子表重建对象。
| Candidate | `CandidateRepository` (PG) | `PgCandidateRepository` | `candidates` + `candidate_analyses` / `candidate_duplicate_cases` / `candidate_duplicate_matches` / `candidate_manual_results` / `candidate_resolution_outcomes` |
| Duplicate | `DuplicateRepository` (PG) | `PgDuplicateRepository` | `candidate_duplicate_cases` / `candidate_duplicate_matches` |
| Lineage | `LineageRepository` (PG) | `PgLineageRepository` | `entity_lineage` |
| Usage Analytics | `UsageAnalyticsRepository` (PG) | `PgUsageAnalyticsRepository` | `usage_events` / `usage_events_daily_rollup` |
| Feedback | `FeedbackRepository` (PG) | `PgFeedbackRepository` | `feedback_records` / `feedback_custom_answers` |
| Retrieval: Vector | `vectorSimilaritySearch()` (PG) | `PgVectorAdapter` | `knowledge_embeddings` (pgvector HNSW) |
| Retrieval: Keyword | `createPgKeywordRecall()` (PG) | `PgKeywordAdapter` | `knowledge_keywords` (text[] GIN) |
| Retrieval: Full-text | — | — | `knowledge_search_documents` (tsvector GIN) |
| Retrieval: Graph | `GraphIndexRepository` (PG) | `PgGraphIndexRepository` | `graph_index_documents` (JSONB nodes/edges) |
| User / Team / Session / AccessKey / Audit 等 | InMemory repo → `store_snapshot` JSONB | InMemory repo → `store_snapshot` JSONB | `store_snapshot` (JSONB 单行) |

### 已删除的兼容层

- `DualWriteKnowledgeRepository` — Round 2 删除，知识写入仅走 PG
- `DualWriteCandidateRepository` — Round 2 删除，候选写入仅走 PG
- `DualWriteArtifactRepository` — 已为死代码，Round 2 清理

### 子记录 ID 生成

知识/工件/候选的子记录 ID（lifecycle event、submission、note 等）已从 `store.nextId(data, prefix)` 计数器模式改为 `randomUUID()`，消除对 `SkillShareerStore` 的同步依赖。
> **Round 4 最终状态**：Skill Artifact 域已完成结构化拆分。`skill_artifacts` 与 `artifact_revisions` 上的 `metadata`、`agent_review`、`maintenance_meta`、`boundary`、`files`、`script_descriptors`、`derived` 仍保留为兼容缓存列，但对应结构化真表已经成为仓储读写与迁移回填的正式事实源。
