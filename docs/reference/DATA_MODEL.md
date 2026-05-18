# 数据模型

本文档描述 TrapMap 系统的核心数据实体及其关系。所有 Schema 定义位于 `packages/contracts/src/domain/`。

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

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | EntityId | 唯一标识 |
| `teamId` | EntityId? | 所属团队（null 表示全局） |
| `scope` | Scope | 作用域 |
| `labels` | Label[] | 标签列表 |
| `shortcut` | string | 简短摘要（≤280 字符） |
| `detail` | string | 详细内容（≤10000 字符） |
| `requiredLevel` | SecurityLevel | 访问所需安全等级 |
| `lifecycleState` | LifecycleState | 当前状态 |
| `owner` | ActorRef | 所有者 |
| `latestRevision` | KnowledgeRevision | 最新版本 |
| `history` | KnowledgeRevision[] | 所有版本历史 |
| `metadata` | KnowledgeMetadata | 元数据（提交次数等） |
| `latestSubmission` | KnowledgeSubmissionRecord? | 最新提交记录 |
| `submissionHistory` | KnowledgeSubmissionRecord[] | 所有提交历史 |
| `agentReview` | AgentReviewResult? | AI 预审结果 |
| `reviewHistory` | ReviewDecision[] | 审核决定历史 |
| `reviewNotes` | ReviewNote[] | 审核备注 |
| `lifecycleHistory` | KnowledgeLifecycleEvent[] | 生命周期事件 |
| `createdAt` | ISO8601 | 创建时间 |
| `updatedAt` | ISO8601 | 更新时间 |

### KnowledgeRevision（知识版本）

| 字段 | 类型 | 说明 |
|------|------|------|
| `revision` | number | 版本号（递增） |
| `submittedAt` | ISO8601 | 提交时间 |
| `submittedBy` | ActorRef | 提交者 |
| `shortcut` | string | 版本级简短摘要 |
| `detail` | string | 版本级详细内容 |
| `labels` | Label[] | 标签 |
| `reviewNotes` | ReviewNote[] | 此版本的审核备注 |

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
| `metadata` | SkillArtifactMetadata | 元数据 |
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
| `domain/artifacts.ts` | SkillArtifact, SkillCapsule, SkillProfile, ClientManifest |
| `domain/retrieval.ts` | RetrievalQuery, RetrievalResponse, CapsuleMatch, RetrievalCitation |
| `domain/candidates.ts` | CandidateSubmission, DuplicateCase, CandidateStatus |
| `domain/review.ts` | ReviewDecision, ReviewNote, AgentReviewResult |
| `domain/plans.ts` | TrapFirstPlan, GraphPlan, PlanTrapNode |
| `domain/operations.ts` | Import/Export 相关类型 |
| `domain/feedback.ts` | FeedbackEntry, FeedbackStatus, FeedbackBatchRequest |
| `domain/decay.ts` | DecayMeta, DecayState, DecayConfig, BatchOperationRequest |
| `domain/maintenance.ts` | MaintenanceMeta, MaintenanceAction, MaintenanceEntryListRequest |
