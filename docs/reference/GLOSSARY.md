# 术语表

本文档定义 TrapMap 项目中的专用术语及其含义，并标注每个术语在代码中发挥作用的位置和形式。

> **路径前缀**：所有路径相对于项目根目录。
>
> **形式缩写**：`TS` = TypeScript 类型/接口，`Zod` = Zod schema，`DB` = PostgreSQL 表（Drizzle），`Route` = HTTP API 端点，`Impl` = 业务逻辑实现模块。
>
> **Round 4 更新**：知识域的 labels/boundary/maintenance 与 Skill Artifact 域的 metadata/files/script descriptors/profile/capsules/client manifest/boundary/maintenance/agent review 均已从“仅 JSONB 聚合”推进到“结构化 PostgreSQL 真表 + JSONB 兼容缓存”模式。见下文对应条目。

---

## 核心概念

### Trap（陷阱）

工程经验的一种，指团队成员曾经犯过的错误或踩过的坑。TrapMap 名称中的 "Trap" 即指此概念。

**示例**：忘记在生产环境禁用调试日志、数据库连接未配置连接池等。

> Trap 并非独立类型，而是 KnowledgeEntry 的语义变体，在候选管道中通过 `sourceType: 'trap'` 区分。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/candidates.ts:29` | Zod enum (`z.literal('trap')`) | `CandidateSourceSchema` 中的判别值 |
| `packages/contracts/src/domain/candidates.ts:41-47` | Zod schema (`TrapCandidatePayloadSchema`) | Trap 候选提交载荷：scope, labels, shortcut, detail, requiredLevel |
| `packages/contracts/src/domain/plans.ts:29` | Zod enum (`'trap'`) | `graphPlanNodeKindSchema` 中的节点类型 |
| `packages/contracts/src/domain/plans.ts:63-82` | Zod schema (`planTrapNodeSchema`) | 图规划中的 Trap 阻断节点：severity, scope, evidence, score |
| `packages/server/src/routes/traps.ts` | Route | 专用 Trap 别名路由：`POST /v1/traps`、`GET /v1/traps`、`GET /v1/traps/:trapId`、`POST /v1/traps/:trapId/resubmit`、`POST /v1/traps/:trapId/supersede` |

### Skill（技能/技能工件）

已验证可行的工程经验或最佳实践，以结构化目录形式存储。包含 SKILL.md（核心内容）、references/（参考资料）、assets/（资产文件）、scripts/（可执行脚本）。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/artifacts.ts:367` | Zod schema (`skillArtifactSchema`) | 聚合根定义：id, teamId, scope, labels, title, slug, requiredLevel, lifecycleState, owner, latestRevision, history, metadata, agentReview, boundaryMeta, evidenceMeta, maintenanceMeta |
| `packages/contracts/src/domain/artifacts.ts:395` | TS 类型 (`SkillArtifact`) | 推断类型，server 和 CLI 全局使用 |
| `packages/contracts/src/domain/candidates.ts:29` | Zod enum (`z.literal('skill')`) | `CandidateSourceSchema` 中的判别值 |
| `packages/contracts/src/domain/candidates.ts:79-82` | Zod schema (`SkillCandidatePayloadSchema`) | Skill 候选提交载荷：files, metadata |
| `packages/server/src/lib/persistence/schema/artifacts.ts` | DB 表 (`skill_artifacts`) | Skill 工件的行级持久化主表，保留 JSONB 缓存列 |
| `packages/server/src/lib/persistence/schema/artifacts.ts` | DB 表 (`artifact_revisions`) | Skill 修订历史，保留 revision 级派生产物缓存 |
| `packages/server/src/lib/persistence/schema/artifacts.ts` | DB 表 (`skill_artifact_metadata`) | Skill 元数据结构化真表（source kind / submission counters / latest decision） |
| `packages/server/src/lib/persistence/schema/artifacts.ts` | DB 表 (`skill_artifact_files`, `skill_artifact_script_descriptors`) | 文件事实与脚本语义真表 |
| `packages/server/src/lib/persistence/schema/artifacts.ts` | DB 表 (`skill_artifact_profiles`, `skill_artifact_capsules`, `skill_artifact_client_manifests`, `skill_artifact_manifest_*`) | 派生产物结构化真表 |
| `packages/server/src/lib/persistence/schema/artifacts.ts` | DB 表 (`skill_artifact_boundary_*`, `skill_artifact_maintenance_assignments`, `skill_artifact_agent_reviews`) | 工件治理结构化真表 |
| `packages/server/src/routes/operations/artifacts-import.ts:136` | Route | `POST /v1/operations/artifacts/import` — 导入 Skill 工件 |
| `packages/server/src/routes/operations/artifacts-export.ts:91` | Route | `POST /v1/operations/artifacts/export` — 导出 Skill 工件 |
| `packages/server/src/routes/operations/artifacts-activate.ts:22` | Route | `POST /v1/operations/artifacts/activate` — 激活（下载）工件文件 |
| `packages/server/src/routes/operations/skill-review.ts:21` | Route | `GET /v1/operations/artifacts/review-queue` — 审核队列 |
| `packages/server/src/routes/operations/skill-review.ts:89` | Route | `POST /v1/operations/artifacts/:artifactId/review` — 批准/拒绝 |
| `packages/server/src/routes/operations/skill-edit.ts:23` | Route | `POST /v1/operations/artifacts/:artifactId/edit` — 编辑 |
| `packages/server/src/routes/operations/skill-edit.ts:154` | Route | `GET /v1/operations/artifacts/:artifactId/history` — 修订历史 |

### Knowledge Entry / Knowledge（知识条目）

系统中可检索的知识单元，对应 `KnowledgeEntry` 数据实体。可能是 Trap 或经批准的 Skill。

> **Round 3 结构化**：`knowledge_entries` 表已补齐 `CHECK` 约束（`scope`、`lifecycle_state`、`required_level`）。`labels`、`boundary`、`maintenance_meta` 的 JSONB 列保留为读优化缓存，对应结构化子表（见下方位置表）在写入时同步维护。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/knowledge.ts:98-124` | Zod schema (`knowledgeEntrySchema`) | 聚合根定义：id, teamId, scope, labels, shortcut, detail, requiredLevel, lifecycleState, owner, latestRevision, history, metadata, agentReview, boundary, evidenceMeta, maintenanceMeta |
| `packages/contracts/src/domain/knowledge.ts:191` | TS 类型 (`KnowledgeEntry`) | 推断类型 |
| `packages/server/src/lib/persistence/schema/knowledge.ts` | DB 表 (`knowledge_entries`) | 行级持久化主表，含 `CHECK` 约束和组合索引 |
| `packages/server/src/lib/persistence/schema/knowledge.ts` | DB 表 (`knowledge_labels`) | 标签结构化子表，`unique(entry_id, label)` |
| `packages/server/src/lib/persistence/schema/knowledge.ts` | DB 表 (`knowledge_boundary_*` x6, `knowledge_maintenance_assignments`) | 边界六子表 + 维护分配表（Round 3） |
| `packages/server/src/lib/persistence/schema/knowledge.ts` | DB 表 (`knowledge_revisions`) | 版本历史，`unique(entry_id, revision_no)` |
| `packages/server/src/lib/persistence/schema/knowledge.ts` | DB 表 (`lifecycle_events`) | 生命周期事件，`type` 受 `CHECK` 约束 |
| `packages/server/src/routes/knowledge.ts:39` | Route | `POST /v1/knowledge` — 提交新条目 |
| `packages/server/src/routes/knowledge.ts:115` | Route | `GET /v1/knowledge/mine` — 列出当前用户条目 |
| `packages/server/src/routes/knowledge.ts:129` | Route | `GET /v1/knowledge/:entryId` — 获取单条 |
| `packages/server/src/routes/knowledge.ts:226` | Route | `PATCH /v1/knowledge/:entryId` — 更新字段 |

### Pitfall（陷阱/误区）

与 Trap 类似，指工程师容易犯错或存在误解的地方。本文档中的同义词，代码中不作为独立类型建模。

---

## 检索相关

### Retrieval（检索）

在知识库中搜索相关内容的过程。TrapMap 支持多种检索模式：

- **Semantic（语义检索）**：基于向量嵌入的语义相似度匹配
- **Keyword（关键词检索）**：BM25/词法匹配
- **Graph-Assisted（图增强检索）**：利用知识图谱关系扩展检索结果
- **Hybrid（混合检索）**：语义 + 关键词的混合模式

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/retrieval.ts:13` | Zod enum (`retrievalQueryModeSchema`) | 客户端 v1 模式：`['semantic', 'hybrid', 'graph-assisted']` |
| `packages/contracts/src/domain/retrieval.ts:35` | Zod enum (`recallChannels`) | 召回通道类型：`['semantic', 'keyword', 'graph']` |
| `packages/contracts/src/domain/retrieval.ts:392-399` | Zod enum (`retrievalStrategySchema`) | 内部路由策略：`['naive', 'local', 'global', 'hybrid', 'mix', 'auto']` |
| `packages/contracts/src/domain/retrieval.ts:467-469` | Zod enum (`channelsUsed`) | 完整通道分类：`['semantic', 'keyword', 'graph', 'capsule', 'profile', 'plan']` |
| `packages/server/src/lib/retrieval/recall/semantic.ts` | Impl | 语义召回 — 基于嵌入相似度 |
| `packages/server/src/lib/retrieval/recall/keyword.ts` | Impl | 关键词召回 — 词法重叠 |
| `packages/server/src/lib/retrieval/recall/graph-assisted.ts` | Impl | 图增强召回 — 知识图谱扩展 |
| `packages/server/src/lib/retrieval/orchestration/index.ts` | Impl | 检索编排入口 — 召回通道注册、策略路由、结果聚合 |
| `packages/server/src/lib/retrieval/recall/pg-keyword.ts` | Impl | PostgreSQL 关键词召回 |
| `packages/server/src/lib/retrieval/scoring/rerank.ts` | Impl | 结果重排序 |
| `packages/server/src/routes/retrieval.ts:71` | Route | `POST /v1/retrieval/search` — v1 检索（接受 `mode` 参数） |
| `packages/server/src/routes/retrieval.ts` | Route | `POST /v2/retrieval/search` — v2 检索（Capsule + Profile） |
| `packages/server/src/routes/retrieval.ts` | Route | `POST /v3/retrieval/search` — v3 检索（graphPlan + Fallback） |
| `packages/server/src/lib/persistence/schema/retrieval.ts` | DB 表 (`knowledge_embeddings`) | 语义检索的向量索引（pgvector HNSW），labels 为 text[] |
| `packages/server/src/lib/persistence/schema/retrieval.ts` | DB 表 (`knowledge_keywords`) | 关键词检索的词元索引（text[] GIN），tokens 和 field_tokens_* 均为 text[] |
| `packages/server/src/lib/persistence/schema/retrieval.ts` | DB 表 (`knowledge_search_documents`) | 全文检索索引（tsvector GIN），Round 7 新增 |
| `packages/server/src/lib/persistence/schema/retrieval.ts` | DB 表 (`graph_index_documents`) | GraphRAG-lite 图索引持久化，Round 7 新增，替代 store_snapshot 内存存储 |

### Capsule（技能胶囊）

从 Skill 工件中精炼提取的结构化知识单元，包含 situation/problem/goal/errorText 字段，用于检索和展示。

**与 Profile 的区别**：Capsule 用于检索匹配；Profile 用于模型上下文。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/artifacts.ts:155-180` | Zod schema (`skillCapsuleSchema`) | 规范定义：capsuleId, artifactId, revision, sourcePaths, content, situation, problem, goal, errorText, labels, scope, requiredLevel |
| `packages/contracts/src/domain/retrieval.ts:106-137` | Zod schema (`capsuleMatchSchema`) | v2 检索响应中的 Capsule 匹配结果，扩展 score 和 reason 字段 |
| `packages/contracts/src/domain/retrieval.ts:268-277` | Zod schema (`capsuleActivationHintsSchema`) | 每个 Capsule 的激活提示：readNext, assets, scripts |
| `packages/server/src/lib/retrieval/capsules/capsule-recall.ts` | Impl | Capsule 召回：`rankCapsules()`, `getCapsuleRecords()`, `computeContextMatchScore()` |
| `packages/server/src/lib/retrieval/response/assembly.ts` | Impl | `buildCapsuleMatch()` — 将 capsule 候选装配为检索响应匹配结果 |
| `packages/server/src/lib/retrieval/capsules/intent.ts` | Impl | `parseSeedIntent()` + `parseSeedIntentWithLLM()` — 将查询解析为 situation/problem/goal/errorText，LLM 路径额外产出 category/semanticQuery/parseMethod |
| `packages/server/src/lib/cache/query-embedding-cache.ts` | Impl | `query-embedding` — 检索 query embedding 的过程内缓存（TTL 20 分钟，容量上限 300） |
| `packages/server/src/lib/retrieval/capsules/intent-cache.ts` | Impl | `InMemoryIntentCache` — LLM 意图解析结果的过程内缓存（TTL 30 分钟，容量上限 200） |

### IntentCategory（意图分类）

从自然语言查询中提取的语义分类标签，用于可观测性和未来的策略路由。当前阶段不参与评分。

| 值 | 含义 |
|----|------|
| `debugging` | 调试类查询 |
| `configuration` | 配置类查询 |
| `deployment` | 部署类查询 |
| `performance` | 性能类查询 |
| `integration` | 集成类查询 |
| `security` | 安全类查询 |
| `data` | 数据类查询 |
| `testing` | 测试类查询 |
| `general` | 通用/无法分类 |

### semanticQuery（语义优化查询）

由 LLM 生成的、使用专业/技术术语优化的语义搜索查询文本（最长 200 字符），用于 embedding 召回通道以改善"用户语言"到"文档术语"的桥接。

### parseMethod（解析方式标记）

标记意图解析结果的产生方式：
- `regex` — 纯正则确定性解析（存量 baseline，无需外部依赖）
- `llm` — LLM 辅助解析（新增字段 category/semanticQuery）

### Profile（技能画像）

从 SKILL.md 和 references/ 导出的文摘，包含标题、描述、摘要、关键词等，用于模型上下文组装。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/artifacts.ts:125-148` | Zod schema (`skillProfileSchema`) | 派生画像：artifactId, revision, sourceHash, title, description, summary, keywords, labels, prerequisites, referencePaths, contentHash |
| `packages/contracts/src/domain/artifacts.ts:385` | TS 类型 (`SkillProfile`) | 推断类型 |
| `packages/contracts/src/domain/retrieval.ts:144-153` | Zod schema (`profileHintSchema`) | v2 响应中的轻量画像提示：artifactId, title, slug, labels |
| `packages/server/src/lib/retrieval/orchestration/orchestrator.ts:32` | Impl | `buildProfileShortlist` — 编排器中基于画像的排序 |

### Manifest（客户端清单）

Skill 工件的客户端激活元数据，包含 references、assets、scripts 的文件元信息（不含内容体）。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/artifacts.ts:223-236` | Zod schema (`clientManifestSchema`) | 客户端激活清单：artifactId, revision, references[], assets[], scripts[], sourceHash |
| `packages/contracts/src/domain/artifacts.ts:390` | TS 类型 (`ClientManifest`) | 推断类型 |
| `packages/contracts/src/domain/artifacts.ts:186-216` | Zod schema | 单项条目类型：`clientManifestReferenceSchema`, `clientManifestAssetSchema`, `clientManifestScriptSchema` |

### Rerank（重排）

在初步检索结果基础上，使用更精确的模型或策略对结果进行重新排序。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/server/src/lib/retrieval/scoring/rerank.ts` | Impl | 重排序逻辑实现 |
| `packages/contracts/src/domain/retrieval.ts:37` | TS 字段 (`scores.preRerank`) | `retrievalCitationSchema.scores` 中记录重排前分数 |

### RetrievalCache

泛型 LRU+TTL 内存缓存类，提供惰性过期、内置 metrics 和全局 namespace 聚合。是图检索系统各类热数据（意图解析、图状态、图文档、LLM 提取结果）的统一缓存基础设施。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/server/src/lib/cache/retrieval-cache.ts:100` | TS 类 (`RetrievalCache<V>`) | 核心实现：get, set, has, delete, clear, size, stats, values, ns |
| `packages/server/src/lib/cache/retrieval-cache.ts:63` | TS 函数 (`getRetrievalCacheStats`) | 按 namespace 聚合所有存活实例的 metrics |

### namespace（缓存命名空间）

缓存实例标识，用于 metrics 聚合时区分不同缓存。同一 namespace 下的多个实例会被合并统计。当前 namespace 值：`query-embedding`、`intent`、`graph-state`、`graph-docs`、`llm-phase1`、`llm-phase2`。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/server/src/lib/cache/retrieval-cache.ts:21` | TS 字段 (`RetrievalCacheOptions.namespace`) | 构造时指定，默认 `'default'` |
| `packages/server/src/lib/cache/retrieval-cache.ts:63` | TS 函数 (`getRetrievalCacheStats`) | 返回 `Record<string, CacheStats>`，key 为 namespace |

### Hit@K

检索评估指标，考察前 K 个结果中是否包含相关结果。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/evals/retrieval.ts` | Zod schema | 评估用例中的命中判定 |
| `evals/retrieval/` | Impl | 检索评估运行器中计算 Hit@K |

### MRR（Mean Reciprocal Rank）

平均倒数排名，检索评估指标。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/evals/report.ts` | TS 字段 | 评估报告中聚合计算 |

### nDCG（Normalized Discounted Cumulative Gain）

归一化折损累计增益，检索质量评估指标。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/evals/report.ts` | TS 字段 | 评估报告中聚合计算 |

### executionPlan（执行计划）

拓扑排序后的执行序列，包含 rank、nodeId、label、kind、blockedBy 等依赖信息，基于 `mitigates`/`requires`/`order` 边进行 Kahn 拓扑排序生成，客户端无需自行计算执行顺序。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/plans.ts:246` | Zod field (`trapFirstPlanSchema.executionPlan`) | `z.array(executionStepSchema).default([])` |

### ExecutionStep（执行步骤）

执行计划中的单个步骤，关联一个 trap 或 skill 节点。包含 `rank`（拓扑层级）、`nodeId`（节点 ID）、`label`（人类可读标签）、`kind`（`'trap-mitigation'` 或 `'skill'`）、`blockedBy`（前置节点 ID 列表）。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/plans.ts:141` | Zod schema (`executionStepSchema`) | 步骤定义：rank, nodeId, label, kind, blockedBy |
| `packages/contracts/src/domain/plans.ts:154` | TS 类型 (`ExecutionStep`) | 推断类型 |

---

## 生命周期

### Lifecycle State（生命周期状态）

知识条目或技能工件的状态流转：

```
draft → submitted → agent-pass/agent-rejected
                        ↓               ↓
                    approved        rejected
                        ↓               ↓
                   (可更新)      (可 resubmit)

所有状态均可 → deactivated
```

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/common.ts:38-46` | Zod enum (`lifecycleStateSchema`) | 规范枚举：`['draft', 'submitted', 'agent-pass', 'agent-rejected', 'approved', 'rejected', 'deactivated']` |
| `packages/contracts/src/domain/common.ts:81` | TS 类型 (`LifecycleState`) | 推断类型，全项目使用 |
| `packages/server/src/lib/lifecycle/state-machine.ts:23-31` | TS 常量 (`VALID_TRANSITIONS`) | `Record<LifecycleState, LifecycleState[]>` — 完整状态转换映射 |
| `packages/server/src/lib/lifecycle/state-machine.ts:40` | Impl 函数 (`isValidTransition`) | 校验单次转换合法性 |
| `packages/server/src/lib/lifecycle/state-machine.ts:50` | Impl 函数 (`getValidTransitions`) | 列出某状态的所有合法目标 |
| `packages/server/src/lib/lifecycle/state-machine.ts:60` | Impl 函数 (`isTerminalState`) | 判断终态（`deactivated`） |
| `packages/server/src/lib/lifecycle/state-machine.ts:81` | Impl 函数 (`transitionLifecycleState`) | 纯校验 + 变更 |
| `packages/server/src/lib/lifecycle/state-machine.ts:109` | Impl 函数 (`executeTransition`) | 编排器：校验 → 变更 → 发布领域事件 |
| `packages/server/src/lib/lifecycle/transitions.ts:18-44` | TS 常量 (`TRANSITIONS`) | `TransitionDefinition[]` — 完整 (from, to) → event 映射表 |
| `packages/server/src/lib/persistence/schema/knowledge.ts` | DB 表 (`lifecycle_events`) | KnowledgeEntry 生命周期事件，`type` 字段受 `CHECK` 约束（Round 3） |
| `packages/server/src/lib/persistence/schema/artifacts.ts` | DB 表 (`artifact_lifecycle_events`) | SkillArtifact 生命周期事件 |

### Agent Review（AI 预审）

提交后由 AI（LangChain）进行的自动预审，评估重复风险、正确性风险、完整性风险。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/knowledge.ts:19` | Zod enum (`agentReviewStatusSchema`) | `['agent-pass', 'agent-rejected']` |
| `packages/contracts/src/domain/knowledge.ts:21-29` | Zod schema (`agentReviewResultSchema`) | 完整结果：status, duplicateRisk, correctnessRisk, completenessRisk（各 `low/medium/high`）, checkedAt, notes, boundary |
| `packages/contracts/src/domain/knowledge.ts:185` | TS 类型 (`AgentReviewResult`) | 推断类型 |
| `packages/server/src/lib/pre-review.ts` | Impl | `runPreReview()` — 基于 LangChain 的 AI 预审实现 |
| `packages/host-local/src/nest/gateway/candidate-review.controller.ts` | Route | `GET /v1/knowledge/review-queue` — 审核队列；`POST /v1/knowledge/review` — 审核决定 |
| `packages/service-governance-review/src/routes.ts` | Route | 治理审核服务的路由注册 |
| `packages/server/src/routes/operations/skill-review.ts` | Route | `GET /v1/operations/artifacts/review-queue` — Skill 审核队列；`POST /v1/operations/artifacts/:artifactId/review` — Skill 审核决定 |

### Resubmit（重新提交）

被拒绝的知识条目修正后重新提交，保留原有历史。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/knowledge.ts:136-142` | Zod schema (`knowledgeResubmissionSchema`) | 请求体：entryId, labels, shortcut, detail, boundary |
| `packages/contracts/src/domain/knowledge.ts:193` | TS 类型 (`KnowledgeResubmission`) | 推断类型 |
| `packages/contracts/src/domain/knowledge.ts:62` | TS 字段 (`resubmissionOf`) | `knowledgeSubmissionRecordSchema` 中关联原始提交 |
| `packages/server/src/routes/knowledge.ts:154` | Route | `POST /v1/knowledge/:entryId/resubmit` |
| `packages/server/src/routes/traps.ts:161` | Route | `POST /v1/traps/:trapId/resubmit` — Trap 专用别名 |

---

## 摄取管道

### Candidate（候选提交）

异步摄取管道的入口实体，包含 trap（知识条目）或 skill（技能工件）类型的原始载荷。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/candidates.ts:15-23` | Zod enum (`CandidateStatusSchema`) | 管道状态：`['received', 'queued', 'analyzing', 'duplicate_detected', 'ready_for_review', 'resolved', 'error']` |
| `packages/contracts/src/domain/candidates.ts:167-212` | Zod schema (`CandidateSubmissionSchema`) | 完整记录：id, sourceType, submittedBy, status, originalPayload, analysisSnapshot, duplicateCase, manualResult, timestamps |
| `packages/contracts/src/domain/candidates.ts:445` | TS 类型 (`CandidateSubmission`) | 推断类型 |
| `packages/server/src/lib/persistence/schema/candidates.ts` | DB 表 (`candidates`) | 行级持久化主表 |
| `packages/server/src/lib/persistence/schema/candidates.ts` | DB 表 (`candidate_analyses`) | 结构化分析结果子表（Round 5） |
| `packages/server/src/lib/persistence/schema/candidates.ts` | DB 表 (`candidate_manual_results`) | 结构化人工审核结果子表（Round 5） |
| `packages/server/src/lib/persistence/schema/candidates.ts` | DB 表 (`candidate_resolution_outcomes`) | 解决结果子表（Round 5） |
| `packages/server/src/lib/candidates/processor.ts` | Impl | `scheduleCandidateProcessing()`, `processCandidate()`, `processPendingCandidates()` |
| `packages/server/src/routes/candidates.ts:104` | Route | `POST /v1/candidates` — 提交新候选 |
| `packages/server/src/routes/candidates.ts:188` | Route | `GET /v1/candidates/:candidateId` — 查询状态 |
| `packages/server/src/routes/candidates.ts:211` | Route | `GET /v1/candidates` — 列表 |

### Duplicate Case（去重案例）

候选提交进入去重检测后生成案例，记录与现有条目的相似度匹配，供人工裁定。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/candidates.ts:35-36` | Zod enum (`DuplicateMatchTypeSchema`) | 匹配置信分类：`['exact', 'high-overlap', 'semantic-similar']` |
| `packages/contracts/src/domain/candidates.ts:125-138` | Zod schema (`DuplicateMatchSchema`) | 单条匹配：entityType, entityId, entityTitle, similarityScore, matchType, overlapDetails |
| `packages/contracts/src/domain/candidates.ts:144-161` | Zod schema (`DuplicateCaseSchema`) | 完整案例：id, candidateId, detectedAt, detectionVersion, matches[], highestSimilarity, hasExactDuplicate, duplicateType |
| `packages/contracts/src/domain/candidates.ts:444` | TS 类型 (`DuplicateCase`) | 推断类型 |
| `packages/server/src/lib/persistence/schema/candidates.ts` | DB 表 (`candidate_duplicate_cases`) | 判重主记录结构化表（Round 5） |
| `packages/server/src/lib/persistence/schema/candidates.ts` | DB 表 (`candidate_duplicate_matches`) | 匹配详情行结构化表（Round 5） |
| `packages/server/src/lib/candidates/pg-detector.ts` | Impl | `createPgDuplicateDetector()` — PostgreSQL 去重检测 |
| `packages/server/src/lib/duplicates/pg-repository.ts` | Impl | `PgDuplicateRepository` — PG 判重案例 CRUD（Round 5） |
| `packages/server/src/routes/candidates.ts:245` | Route | `GET /v1/duplicates` — 列表 |
| `packages/server/src/routes/candidates.ts:259` | Route | `GET /v1/duplicates/:candidateId` — 查询 |
| `packages/server/src/routes/candidates.ts:275` | Route | `GET /v1/duplicates/:candidateId/bundle` — 离线审核包 |

### Manual Resolution（人工裁定）

去重案例的解决方式：`independent`（候选独立存在）或 `merged`（合并到现有实体）。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/candidates.ts:281` | Zod enum (`ManualResultDecisionSchema`) | `['independent', 'merged']` |
| `packages/contracts/src/domain/candidates.ts:296-300` | Zod schema (`ManualResultSubmissionSchema`) | 请求体：decision, notes, mergedWith? |
| `packages/contracts/src/domain/candidates.ts:306-323` | Zod schema (`ResolutionOutcomeSchema`) | 结果：candidateId, decision, publishedEntityId, mergedIntoEntityId, entityType, resolvedAt, resolvedBy, notes |
| `packages/contracts/src/domain/candidates.ts:358` | TS 类型 (`ResolutionOutcome`) | 推断类型 |
| `packages/server/src/routes/candidates.ts:350` | Route | `POST /v1/candidates/:candidateId/manual-result` — 提交人工审核 |
| `packages/server/src/routes/candidates.ts:401` | Route | `POST /v1/candidates/:candidateId/apply-resolution` — 执行裁定（发布独立或合并） |

---

## 反馈与维护

### Feedback（反馈）

用户对知识条目的问题反馈。状态机：`new` → `triaged` → `resolved` / `dismissed`。当同类反馈达到阈值时，系统自动标记条目进入相应生命周期状态。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/feedback.ts:10-16` | Zod enum (`feedbackProblemTypeSchema`) | 问题分类：`['incorrect', 'outdated', 'context-mismatch', 'incomplete', 'other']` |
| `packages/contracts/src/domain/feedback.ts:52-57` | Zod enum (`feedbackStatusSchema`) | 状态值：`['new', 'triaged', 'resolved', 'dismissed']` |
| `packages/contracts/src/domain/feedback.ts:63-74` | Zod schema (`feedbackRecordSchema`) | 完整记录：id, entryId, entryType, problemType, description, context, querySeed, customAnswers, submittedAt, submittedBy, status, adminNotes |
| `packages/contracts/src/domain/feedback.ts:168` | Zod enum (`feedbackBatchActionSchema`) | 批量操作：`['resolve', 'dismiss', 'triage', 'transition']` |
| `packages/contracts/src/domain/feedback.ts:289-290` | TS 类型 (`FeedbackStatus`, `FeedbackRecord`) | 推断类型 |
| `packages/server/src/routes/feedback.ts:19` | Route | `POST /v1/feedback` — 提交反馈 |
| `packages/server/src/routes/feedback-admin.ts:86` | Route | `GET /v1/operations/feedback` — 反馈队列 |
| `packages/server/src/routes/feedback-admin.ts:195` | Route | `POST /v1/operations/feedback/batch` — 批量操作 |
| `packages/server/src/routes/feedback-admin.ts:407` | Route | `GET /v1/operations/feedback/stats/:entryId` — 条目反馈质量统计 |

### Decay（衰减）

知识条目的新鲜度追踪机制。状态：`active` → `review-due` → `stale` → `expired`（或 `superseded`）。衰减曲线由 freshnessType 决定：`evergreen`（长期有效）、`versioned`（随版本更新）、`volatile`（快速过期）。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/decay.ts:20` | Zod enum (`freshnessTypeSchema`) | 衰减曲线类型：`['evergreen', 'versioned', 'volatile']` |
| `packages/contracts/src/domain/decay.ts:27` | Zod enum (`freshnessDecayModeSchema`) | 衰减模式：`['exponential', 'linear', 'step']` |
| `packages/contracts/src/domain/decay.ts:96` | Zod enum (`decayStateSchema`) | 衰减状态：`['active', 'review-due', 'stale', 'expired', 'superseded']` |
| `packages/contracts/src/domain/decay.ts:104-113` | Zod schema (`decayConfigSchema`) | 配置：reviewDueDays(90), staleDays(180), expireDays(365), enabled |
| `packages/contracts/src/domain/decay.ts:121-132` | Zod schema (`decayMetaSchema`) | 元数据：lastVerifiedAt, decayState, supersededById, decayStateComputedAt, freshnessType |
| `packages/server/src/lib/decay/state-machine.ts` | Impl | `computeDecayState()`, `isTerminalDecayState()`, `requiresAttention()` |
| `packages/server/src/lib/decay/config.ts` | Impl | `loadDecayConfig()`, `validateDecayConfig()` |
| `packages/server/src/routes/decay.ts:78` | Route | `GET /v1/operations/decay/entries` — 列出衰减条目 |
| `packages/server/src/routes/decay.ts:203` | Route | `POST /v1/operations/decay/batch` — 批量操作 |
| `packages/server/src/routes/decay.ts:344` | Route | `POST /v1/operations/decay/search` — 按衰减分面搜索 |

### Maintenance（维护）

知识条目的责任追踪机制。记录维护者（`maintainer`）和计划审核日期（`reviewBy`），支持批量分配、延长审核、标记已验证等操作。

> **Round 3 结构化**：`knowledge_entries.maintenance_meta` JSONB 列已拆为 `knowledge_maintenance_assignments` 表（1:1 关系），支持按 `maintainer_user_id` 和 `review_by` 索引筛选。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/maintenance.ts:22-27` | Zod schema (`maintenanceMetaSchema`) | 字段：maintainer (ActorRef, nullable), reviewBy (ISO timestamp, nullable) |
| `packages/contracts/src/domain/maintenance.ts:36` | Zod enum (`maintenanceActionSchema`) | 批量操作：`['assign-owner', 'extend-review', 'mark-verified']` |
| `packages/contracts/src/domain/maintenance.ts:156` | TS 类型 (`MaintenanceMeta`) | 推断类型 |
| `packages/server/src/lib/persistence/schema/knowledge.ts` | DB 表 (`knowledge_maintenance_assignments`) | 维护分配结构化表（Round 3），`entry_id` 为主键 |
| `packages/server/src/routes/maintenance.ts:84` | Route | `GET /v1/operations/maintenance/entries` — 按维护过滤列出 |
| `packages/server/src/routes/maintenance.ts:225` | Route | `POST /v1/operations/maintenance/batch` — 批量维护操作 |

### Evidence（证据）

知识条目的来源证明元数据。包含来源类型（`sourceType`）和证据级别（`evidenceLevel`）。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/evidence.ts:10-16` | Zod enum (`evidenceSourceTypeSchema`) | 来源类型：`['internal-experience', 'incident', 'doc', 'code', 'external-reference']` |
| `packages/contracts/src/domain/evidence.ts:22-27` | Zod enum (`evidenceLevelSchema`) | 证据级别：`['anecdotal', 'reproduced', 'documented', 'verified-in-prod']` |
| `packages/contracts/src/domain/evidence.ts:33-44` | Zod schema (`evidenceMetaSchema`) | 完整元数据：sourceType, sourceRef, evidenceLevel, verifiedAt, verifiedBy |
| `packages/contracts/src/domain/evidence.ts:62` | TS 类型 (`EvidenceMeta`) | 推断类型 |
| `packages/server/src/routes/evidence.ts:17` | Route | `PATCH /v1/knowledge/:id/evidence` — 更新条目证据 |

### Boundary（边界约束）

知识条目的适用范围约束，定义条目在哪些上下文、平台版本、前置条件下有效。用于边界搜索和检索过滤。

> **Round 3 结构化**：边界已从 `knowledge_entries.boundary` JSONB 列拆分为六个独立子表（见下方 DB 引用），JSONB 列保留为读优化缓存。各子表均含 `entry_id` 索引，支持按维度独立查询和过滤。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/boundary.ts:128-141` | Zod schema (`boundarySchema`) | 统一边界：context[], versions[], prerequisites[], signals[], exclusions[], evidence[] |
| `packages/contracts/src/domain/boundary.ts:152` | TS 类型 (`Boundary`) | 推断类型 |
| `packages/contracts/src/domain/boundary.ts:167-171` | Zod schema (`boundaryContextSchema`) | 运行时查询上下文：contexts[], platform, versions[] |
| `packages/contracts/src/domain/boundary.ts:182-188` | Zod schema (`boundaryExplanationSchema`) | 检索解释：checked, requiredSatisfied, warnings[], boosts[] |
| `packages/server/src/lib/persistence/schema/knowledge.ts` | DB 表 (`knowledge_boundary_contexts/versions/prerequisites/signals/exclusions/evidence`) | 边界六子表（Round 3） |
| `packages/server/src/lib/boundary-extract.ts` | Impl | `extractCandidateBoundaries()` — 基于 LLM 的边界提取 |
| `packages/server/src/routes/admin-boundary-search.ts:27` | Route | `POST /admin/boundary-search` — 管理员边界搜索 |

---

## 权限与安全

### RBAC（基于角色的访问控制）

Role-Based Access Control。TrapMap 使用角色模板（user/admin/system-admin）和细粒度权限列表结合的方式进行访问控制。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/common.ts:9` | Zod enum (`roleTemplateSchema`) | 角色模板：`['user', 'admin', 'system-admin']` |
| `packages/contracts/src/domain/common.ts:20-36` | Zod enum (`permissionSchema`) | 15 项细粒度权限：session:read, team:create/list/select, member:create/update, key:create, knowledge:submit/search/review/update/export/import, audit:read, stats:read |
| `packages/server/src/lib/rbac.ts:9-13` | TS 常量 (`ROLE_TEMPLATE_PERMISSIONS`) | 角色模板 → 权限数组映射 |
| `packages/server/src/lib/rbac.ts:15` | Impl 函数 (`resolveEffectivePermissions`) | 计算有效权限（角色 + 显式授权） |
| `packages/server/src/lib/rbac.ts:22` | Impl 函数 (`hasPermission`) | 权限检查 |
| `packages/server/src/lib/rbac.ts:26` | Impl 函数 (`requirePermission`) | 权限不足时抛出 AppError(403) |
| `packages/server/src/lib/rbac.ts:32` | Impl 函数 (`requireTeamAccess`) | 团队作用域强制 |
| `packages/server/src/lib/rbac.ts:42` | Impl 函数 (`requireHigherLevel`) | 安全等级升级保护 |

### Security Level（安全等级）

0-10 的数值等级，控制对敏感知识条目的访问。数值越高，可访问的内容越敏感。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/common.ts:7` | Zod schema (`securityLevelSchema`) | `z.number().int().min(0).max(10)` |
| `packages/contracts/src/domain/common.ts:76` | TS 类型 (`SecurityLevel`) | 推断类型 |
| `packages/server/src/lib/rbac.ts:42` | Impl 函数 (`requireHigherLevel`) | 安全等级升级守卫 |

### Scope（作用域）

知识的作用域：`global`（全局共享）或 `project`（仅项目内可见）。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/common.ts:11` | Zod enum (`scopeSchema`) | `['global', 'project']` |
| `packages/contracts/src/domain/common.ts:78` | TS 类型 (`Scope`) | 推断类型 |

---

## 评估

### Smoke Test（冒烟测试）

快速、轻量的测试集，用于每次提交时快速验证核心功能是否正常。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/evals/retrieval.ts:26` | Zod enum (`retrievalEvalTierSchema`) | `['smoke', 'core']` 中的 `'smoke'` 值 |
| `evals/retrieval/datasets/smoke/` | 目录 | 冒烟数据集：v1-retrieval-smoke.ts, v2-retrieval-smoke.ts, v3-retrieval-smoke.ts |
| `evals/retrieval/smoke.ts` | Impl | 检索冒烟测试运行器 |
| `evals/summary/smoke.ts` | Impl | 摘要冒烟测试运行器 |

### Core Test（核心测试）

更全面的测试集，覆盖更多边界情况和场景。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/evals/retrieval.ts:26` | Zod enum (`retrievalEvalTierSchema`) | `['smoke', 'core']` 中的 `'core'` 值 |
| `evals/retrieval/datasets/core/` | 目录 | 核心数据集 |
| `evals/retrieval/core.ts` | Impl | 检索核心测试运行器 |
| `evals/summary/core.ts` | Impl | 摘要核心测试运行器 |

### Governance Failure（治理失败）

检索返回了不应返回的结果（如权限不足、安全等级不够、生命周期状态不对）。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/evals/retrieval.ts:162-167` | Zod schema (`retrievalEvalGovernanceExpectationsSchema`) | 治理期望：forbiddenIds[], forbiddenReasons[] (`['cross-team', 'security-level', 'lifecycle']`) |
| `packages/contracts/src/domain/evals/report.ts:252-259` | Zod schema (`baselineGovernanceFailureSchema`) | 基线记录：caseId, endpoint, tier, failureKinds[] |
| `packages/contracts/src/domain/evals/report.ts:259` | TS 类型 (`BaselineGovernanceFailure`) | 推断类型 |
| `packages/contracts/src/domain/evals/report.ts:160` | TS 字段 (`governanceFailureCount`) | 检索报告中的治理失败计数 |
| `evals/retrieval/lib/format.ts:133-134` | Impl | `slice.governanceFailureCount` — 报告输出中展示 |

### Groundedness（接地性）

摘要评估指标，衡量摘要内容是否由检索到的上下文支撑（无幻觉）。分数范围 0-1，默认阈值 0.8。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/evals/report.ts:48` | TS 字段 (`groundednessScore`) | `summaryEvalCaseResultSchema` 中每用例 0-1 分 |
| `packages/contracts/src/domain/evals/report.ts:86` | TS 字段 (`avgGroundedness`) | 评估报告中全用例平均值 |
| `packages/contracts/src/domain/evals/summary.ts:57` | TS 字段 (`minGroundedness`) | `summaryEvalExpectedSchema` 中的阈值，默认 0.8 |
| `packages/contracts/src/domain/evals/report.ts:61` | Zod enum 值 (`'groundedness-below-threshold'`) | `summaryEvalFailureKindSchema` 中的失败分类 |
| `evals/summary/core.ts` | Impl | `calculateGroundednessScore()`, `formatGroundednessReport()` |

### Coverage（覆盖度）

摘要评估指标，衡量摘要是否涵盖了检索上下文中的关键信息。分数范围 0-1，默认阈值 0.7。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/evals/report.ts:49` | TS 字段 (`coverageScore`) | `summaryEvalCaseResultSchema` 中每用例 0-1 分 |
| `packages/contracts/src/domain/evals/report.ts:87` | TS 字段 (`avgCoverage`) | 评估报告中全用例平均值 |
| `packages/contracts/src/domain/evals/summary.ts:59` | TS 字段 (`minCoverage`) | `summaryEvalExpectedSchema` 中的阈值，默认 0.7 |
| `packages/contracts/src/domain/evals/report.ts:62` | Zod enum 值 (`'coverage-below-threshold'`) | `summaryEvalFailureKindSchema` 中的失败分类 |
| `evals/summary/core.ts` | Impl | `calculateCoverageScore()`, `formatCoverageReport()` |

---

## 数据模型

### EntityId

所有实体的唯一标识符，最大 128 字符的字符串。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/common.ts:3` | Zod schema (`entityIdSchema`) | `z.string().min(1).max(128)` |
| `packages/contracts/src/domain/common.ts:75` | TS 类型 (`EntityId`) | 推断类型，全项目使用 |
| `packages/server/src/lib/ids.ts` | Impl | ID 生成工具：`createDuplicateCaseId()`, `createPrefixedId()`, `createQueryId()` |

### ActorRef

操作行为者引用，包含 `id`、`handle`、`securityLevel`。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/common.ts:48-52` | Zod schema (`actorRefSchema`) | `{ id: EntityId, handle: string, securityLevel: SecurityLevel }` |
| `packages/contracts/src/domain/common.ts:82` | TS 类型 (`ActorRef`) | 推断类型 |

### Label（标签）

知识条目的分类标签，格式：`a-z0-9:_/-` 的组合，最大 48 字符。

> **Round 3 结构化**：标签已从 `knowledge_entries.labels` JSONB 列拆为 `knowledge_labels` 表，每行一个 `(entry_id, label)` 对。支持 `unique(entry_id, label)` 唯一约束、AND 语义过滤和按标签聚合。JSONB 列保留为读优化缓存。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/common.ts:13-18` | Zod schema (`labelSchema`) | `z.string().trim().min(1).max(48).regex(/^[a-z0-9:_/-]+$/i)` |
| `packages/contracts/src/domain/common.ts:79` | TS 类型 (`Label`) | 推断类型 |
| `packages/server/src/lib/persistence/schema/knowledge.ts` | DB 表 (`knowledge_labels`) | 标签结构化子表（Round 3） |

---

## 其他

### Skill Directory（技能目录）

Skill 工件的磁盘存储结构：

```
<skill-slug>/
├── SKILL.md           # 核心内容（必选）
├── references/        # 参考资料（可选）
├── assets/            # 资产文件（可选）
└── scripts/          # 可执行脚本（可选）
```

> 代码中对应 `ClientManifest` 的 references[], assets[], scripts[] 字段，以及导入/导出时的文件清单。

### Artifact（工件）

等同于 Skill Artifact，指以目录形式存储的技能知识单元。在代码中统一使用 `SkillArtifact` 类型。

### Fallback（回退）

检索请求无法以首选模式处理时，降级到备选方案的过程（如 GraphRAG-lite 低置信度时回退到 v2 capsule 检索）。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/retrieval.ts:438-440` | Zod enum (`graphPlanFallbackTargetSchema`) | 降级目标：`['v2-capsule', 'v1-graph-assisted']` |
| `packages/contracts/src/domain/retrieval.ts:465` | TS 字段 (`fallbackApplied`) | `routingTraceSchema` 中标记是否触发降级 |
| `packages/contracts/src/domain/retrieval.ts:526-531` | Zod schema (`graphPlanFallbackSchema`) | Capsule 降级或 Entry 降级的联合载荷 |
| `packages/server/src/lib/ai/providers.ts:116` | TS 类 (`FallbackEmbeddings`) | 无 AI Provider 时的确定性哈希嵌入回退 |
| `packages/server/src/lib/ai/providers.ts:223` | TS 类 (`FallbackChat`) | 无 Provider 时的空操作聊天回退 |

### JSON Store

开发/测试环境使用的 JSON 文件存储实现（`JsonStore`）。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/server/src/lib/store/store-interface.ts:3-7` | TS 接口 (`SkillShareerStore`) | 规范存储契约：snapshot(), transact(), nextId() |
| `packages/server/src/lib/store/json-store.ts:29` | TS 类 (`JsonStore`) | 实现 `SkillShareerStore`，基于 JSON 文件 |

### Postgres Store

生产环境使用的 PostgreSQL + Drizzle ORM 存储实现（`PostgresStore`）。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/server/src/lib/persistence/postgres-store.ts:19` | TS 类 (`PostgresStore`) | 实现 `SkillShareerStore`，JSONB + 行级锁 |
| `packages/server/src/lib/persistence/schema/index.ts` | DB 表 (`store_snapshot`) | 单行 JSONB 持久化：key='main', data=StoreData, updatedAt |

> **Round 8 备注**：核心业务域（知识、工件、候选、反馈、统计、检索索引）已通过各自的 `Pg*Repository` 直接访问 PostgreSQL 结构化表。`PostgresStore` 仅用于尚未迁移的域（用户、团队、成员、会话、访问密钥、审计）。

### Single Source of Truth（唯一事实源）

某一业务领域在运行时允许存在且只允许存在一个主事实写入目标。其他索引、缓存、导出和派生产物都不能反向成为业务真相来源。

| 位置 | 形式 | 说明 |
|------|------|------|
| `docs/plans/round4-cross-table-consistency-plan.md` | 实施计划 | 明确 PostgreSQL 收敛目标、禁止长期双真相 |
| `docs/archived/archived-plans/plan-2026-05-21-round4-complete.md` | 归档计划 | Round 0-4 结构化落地方案 |
| `docs/reference/DATA_MODEL.md:1` | 参考文档 | 说明各领域当前主事实源与过渡边界 |
| `packages/server/src/lib/knowledge/repository.ts` | Impl | Knowledge 已在 Round 2 切换到 PG-only 主写 |
| `packages/server/src/lib/artifacts/repository.ts` | Impl | Artifact 已移除 DualWrite，PG 为唯一主写 |
| `packages/server/src/lib/candidates/repository.ts` | Impl | Candidate 已移除 DualWrite，PG 为唯一主写 |

### DualWrite（双写兼容层）

迁移期的兼容策略：同一业务操作同时写入 PostgreSQL 真表和旧快照/旧仓库，以支持逐步切换。该策略只允许短期存在，必须带明确删除轮次。**Round 2 已全部删除，不再作为后续域迁移的策略。**

| 位置 | 形式 | 说明 |
|------|------|------|
| `docs/plans/round4-cross-table-consistency-plan.md` | 实施计划 | Round 4+ 跨表一致性增强与端到端测试补齐 |
| `docs/reference/DATA_MODEL.md:422-428` | 参考文档 | 记录哪些 DualWrite 仓库已删除 |
| `docs/architecture/ARCHITECTURE.md` | 架构文档 | 描述当前 PG-only 与遗留 `store_snapshot` 的职责边界 |

### Migration Baseline（迁移基线）

Round 0 冻结后的数据库演进约定：先定目标模型和命名规范，再写 migration、回填、核对和删除旧层，禁止绕过目标模型继续引入临时持久化方案。

| 位置 | 形式 | 说明 |
|------|------|------|
| `docs/plans/round4-cross-table-consistency-plan.md` | 实施计划 | Round 4+ 后续增强的总体实施策略与阶段划分 |
| `packages/server/src/lib/persistence/migration-runner.ts` | Impl | 应用启动时统一执行 Drizzle migration |
| `packages/server/drizzle/` | Migration 目录 | DDL、索引、快照和迁移顺序的唯一入口 |

### Activation Policy（激活策略）

脚本执行策略的四状态模型：`blocked`（禁止）→ `reference-only`（仅可读）→ `needs-approval`（需批准）→ `client-executable`（可执行）。客户端只能收紧策略，不能放松。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/artifacts.ts:33-38` | Zod enum (`scriptActivationPolicySchema`) | 四状态模型：`['blocked', 'reference-only', 'needs-approval', 'client-executable']` |
| `packages/contracts/src/domain/artifacts.ts:43` | Zod enum (`legacyScriptActivationPolicySchema`) | 旧版三状态（向后兼容）：`['manual', 'auto', 'blocked']` |
| `packages/contracts/src/domain/artifacts.ts:48-51` | Zod union (`compatibleScriptActivationPolicySchema`) | 兼容新旧值的联合类型 |
| `packages/contracts/src/domain/artifacts.ts:379` | TS 类型 (`ScriptActivationPolicy`) | 推断类型 |
| `packages/server/src/lib/activation-policy.ts:33` | Impl 函数 (`mapLegacyPolicyToFourState`) | manual→needs-approval, auto→client-executable |
| `packages/server/src/lib/activation-policy.ts:59` | Impl 函数 (`getDefaultActivationPolicy`) | 从描述符计算默认策略 |
| `packages/server/src/lib/activation-policy.ts:90` | Impl 函数 (`buildScriptPolicyMetadata`) | 将描述符塑形为策略感知元数据 |
| `packages/server/src/lib/activation-policy.ts:123` | Impl 函数 (`buildActivationHints`) | 批量清单脚本的激活提示 |

### Entity Lineage（实体谱系）

候选提交从接收到发布为正式实体的完整追踪链，记录每一步的状态转换和关联实体。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/contracts/src/domain/candidates.ts:329-348` | Zod schema (`EntityLineageSchema`) | 记录：id, candidateId, relationshipType (`published_as`/`merged_into`), sourceType, sourceId, targetType, targetId, createdAt, notes |
| `packages/contracts/src/domain/candidates.ts:358` | TS 类型 (`EntityLineage`) | 推断类型 |
| `packages/server/src/lib/persistence/schema/candidates.ts` | DB 表 (`entity_lineage`) | PostgreSQL 结构化表（Round 5），支持按候选、来源、目标三维度查询 |
| `packages/server/src/lib/lineage/pg-repository.ts` | Impl | `PgLineageRepository` — PG 血缘 CRUD（Round 5） |
| `packages/server/src/lib/lineage/index.ts` | Impl | `createLineageRepository()`, `LineageRepository` 接口 |

### Tool Profile（工具配置）

CLI 输出渲染的目标工具类型：`claude-code`（XML 输出）、`codex`（JSON 输出）、`opencode`（Markdown 输出）、`generic`（纯文本输出）。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/cli/src/lib/config.ts:27` | TS 类型 (`OutputToolProfile`) | `'claude-code' | 'codex' | 'opencode' | 'generic'` |
| `packages/cli/src/lib/config.ts:33-40` | TS 接口 (`OutputProfile`) | 完整配置：tool, modelHint, renderMode, graphPlanMode, verbosity, includeRawHints |
| `packages/cli/src/lib/config.ts:24` | TS 字段 (`outputProfile`) | `CliState` 中持久化的 CLI 配置 |

### Render Kind（渲染类型）

CLI 输出适配层的渲染分类：`retrieval-v1`、`retrieval-v2`、`graph-plan`、`skill-lookup`、`artifact-export`、`command-result`、`generic`。

| 位置 | 形式 | 说明 |
|------|------|------|
| `packages/cli/src/lib/output-profile.ts:18-25` | TS 类型 (`RenderKind`) | 7 种渲染分类的联合类型 |
| `packages/cli/src/lib/output-profile.ts:883` | Impl 函数 (`resolveRenderKind`) | 透传解析器（恒等映射） |
| `packages/cli/src/lib/output-profile.ts:915` | Impl 函数 (`resolveRenderer`) | 按 tool+kind 分派到具体渲染器 |
