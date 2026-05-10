# 数据类型串联图

本文档以流程图形式展示 TrapMap 核心数据类型如何在系统中串联，标注每个环节涉及的具体 Zod Schema 类型。

> 与 `DATA_MODEL.md` 的区别：本文档侧重**数据流转路径**和**环节标注**，而非实体定义。
> 与 `FLOW.md` 的区别：本文档覆盖**三条主线**（入库、检索、生命周期），并明确每个阶段的数据类型。

## 主线一：提交 → 审核 → 发布（Ingestion Pipeline）

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        阶段 1：用户提交                                  │
│                                                                         │
│  CLI / Web Client                                                       │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────┐                                            │
│  │ CandidateSubmission     │ ◄── 入口实体，异步管道的起点                  │
│  │  sourceType: trap/skill │                                            │
│  │  originalPayload        │     包含 TrapCandidatePayload 或              │
│  │  status: received       │     SkillCandidatePayload                   │
│  └────────┬────────────────┘                                            │
│           │                                                             │
│           ▼                                                             │
│  POST /v1/candidates  (routes/candidates.ts)                            │
│  → createCandidateSubmission()                                          │
│  → scheduleCandidateProcessing()  (fire-and-forget)                     │
└───────────┬─────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        阶段 2：异步分析                                   │
│                                                                         │
│  status: received → queued → analyzing                                  │
│           │                                                             │
│           ▼                                                             │
│  ┌──────────────────────────┐                                           │
│  │ AnalysisSnapshot         │ ◄── 分析快照，存储规范化后的内容指纹          │
│  │  fingerprint (SHA-256)   │     提取 keywords / tokens 用于相似度匹配    │
│  │  keywords, tokens        │                                           │
│  └──────────┬───────────────┘                                           │
│             │                                                           │
│             ▼                                                           │
│  ┌──────────────────────────┐                                           │
│  │ DuplicateCase            │ ◄── 去重案例                                │
│  │  DuplicateMatch[]        │     与已有 KnowledgeEntry / SkillArtifact   │
│  │  highestSimilarity       │     比较，计算相似度                         │
│  │  duplicateType           │     exact / semantic / none                │
│  │  (exact / semantic /none)│                                           │
│  └──────────┬───────────────┘                                           │
│             │                                                           │
│             ▼                                                           │
│  status 分支:                                                           │
│    ├─ duplicate_detected  → 等待人工裁定                                 │
│    └─ ready_for_review    → 进入审核流程                                 │
└───────────┬─────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        阶段 3：人工裁定（仅去重分支）                       │
│                                                                         │
│  GET /v1/duplicates/:candidateId/bundle                                 │
│  → DuplicateJobBundleResponse  (完整包供离线审核)                         │
│       │                                                                 │
│       ▼                                                                 │
│  POST /v1/candidates/:id/manual-result                                  │
│  ┌──────────────────────────┐                                           │
│  │ ManualResultSubmission   │ ◄── 人工决定                                │
│  │  decision: independent   │     independent = 独立，继续审核             │
│  │            merged        │     merged = 合并到已有实体，拒绝             │
│  │  mergedWith (可选)        │                                           │
│  └──────────┬───────────────┘                                           │
│             │                                                           │
│             ▼                                                           │
│  POST /v1/candidates/:id/apply-resolution                               │
│  ┌──────────────────────────┐    ┌──────────────────────────┐           │
│  │ ResolutionOutcome        │    │ EntityLineage            │           │
│  │  publishedEntityId       │    │  candidateId → targetId  │           │
│  │  mergedIntoEntityId      │    │  relationshipType        │           │
│  └──────────────────────────┘    │  published_as/merged_into│           │
│                                  └──────────────────────────┘           │
└───────────┬─────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        阶段 4：AI 预审 + 人工审核                          │
│                                                                         │
│  ┌──────────────────────────┐                                           │
│  │ AgentReviewResult        │ ◄── AI 预审结果                             │
│  │  status: agent-pass/     │     三个维度：duplicateRisk,                │
│  │          agent-rejected  │     correctnessRisk, completenessRisk      │
│  └──────────┬───────────────┘                                           │
│             │                                                           │
│             ▼                                                           │
│  ┌──────────────────────────┐                                           │
│  │ ReviewDecision           │ ◄── 人工审核决定                             │
│  │  decision: approve/reject│     由 reviewer 做出                        │
│  │  notes                   │                                           │
│  └──────────┬───────────────┘                                           │
│             │                                                           │
│             ▼                                                           │
│  LifecycleState 状态机:                                                  │
│  draft → submitted → agent-pass → approved ✓                            │
│                      → agent-rejected → rejected ✗                      │
│                                  (可 resubmit)                           │
└───────────┬─────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        阶段 5：发布为正式实体                              │
│                                                                         │
│  sourceType = "trap" 时:                                                │
│  ┌─────────────────────────────────────────────┐                        │
│  │ KnowledgeEntry                              │                        │
│  │  latestRevision: KnowledgeRevision          │ ◄── 知识条目              │
│  │  history: KnowledgeRevision[]               │     可检索单元             │
│  │  metadata: KnowledgeMetadata                │     带版本历史             │
│  │  lifecycleHistory: KnowledgeLifecycleEvent[]│                        │
│  └─────────────────────────────────────────────┘                        │
│                                                                         │
│  sourceType = "skill" 时:                                               │
│  ┌─────────────────────────────────────────────┐                        │
│  │ SkillArtifact                               │                        │
│  │  history: SkillArtifactRevision[]           │                        │
│  │    └─ derived: SkillArtifactDerived         │                        │
│  │         ├─ profile: SkillProfile            │ ◄── 技能画像（文摘）       │
│  │         ├─ capsules: SkillCapsule[]         │ ◄── 技能胶囊（精炼知识）    │
│  │         └─ clientManifest: ClientManifest   │ ◄── 客户端清单（激活用）    │
│  │  metadata: SkillArtifactMetadata            │                        │
│  └─────────────────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────┘
```

## 主线二：检索 → 返回（Retrieval Pipeline）

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        检索请求入口                                       │
│                                                                         │
│  ┌──────────────────────────┐                                           │
│  │ RetrievalQuery (v1)      │ ◄── 传统知识条目检索                         │
│  │  seed, filters, mode     │     mode: semantic/hybrid/graph-assisted   │
│  │  includeRefinement       │                                           │
│  │  includeSummary          │                                           │
│  └──────────┬───────────────┘                                           │
│             │                                                           │
│             ▼                                                           │
│  POST /v1/retrieval/search                                              │
│  → searchKnowledge()                                                    │
│             │                                                           │
│             ▼                                                           │
│  ┌──────────────────────────┐                                           │
│  │ RetrievalResponse        │ ◄── 返回两类结果                             │
│  │  globalConstraints[]     │     全局约束 + 项目知识                      │
│  │  projectKnowledge[]      │     每项含 RetrievalCitation（引用溯源）      │
│  │  refinementSummary       │                                           │
│  │  summary                 │                                           │
│  └──────────────────────────┘                                           │
│                                                                         │
│  ┌──────────────────────────┐                                           │
│  │ RetrievalCitation        │ ◄── 每个命中的引用                           │
│  │  source: {entryId,...}   │     包含 snippet, scores, recallChannels   │
│  │  scores: {semantic,      │                                           │
│  │           keyword,graph, │                                           │
│  │           preRerank,     │                                           │
│  │           final}         │                                           │
│  └──────────────────────────┘                                           │
│                                                                         │
│  ───────── 分割线 ─────────                                             │
│                                                                         │
│  ┌──────────────────────────┐                                           │
│  │ RetrievalV2Query (v2)    │ ◄── 胶囊优先检索                             │
│  │  seed (唯一必填)          │     服务端解析 seed → situation/problem/   │
│  └──────────┬───────────────┘     goal/errorText                        │
│             │                                                           │
│             ▼                                                           │
│  POST /v2/retrieval/search                                              │
│  → searchKnowledgeV2()                                                  │
│             │                                                           │
│             ▼                                                           │
│  ┌─────────────────────────────────────────────┐                        │
│  │ RetrievalV2ResponseWithHints                │                        │
│  │  capsules: CapsuleMatch[]     ◄── 精炼知识胶囊   │                        │
│  │  profileHints: ProfileHint[]  ◄── 工件元数据    │                        │
│  │  activationHints[]            ◄── 激活提示     │                        │
│  │    ├─ readNext: references    ◄── 推荐阅读     │                        │
│  │    ├─ assets: available       ◄── 可用资源     │                        │
│  │    └─ scripts: capabilities   ◄── 脚本能力     │                        │
│  │  refinementSummary                            │                        │
│  │  summary                                      │                        │
│  └─────────────────────────────────────────────┘                        │
│                                                                         │
│  ┌──────────────────────────┐                                           │
│  │ CapsuleMatch             │ ◄── 单个胶囊匹配                            │
│  │  capsuleId, artifactId   │     继承父工件的 scope 和 requiredLevel     │
│  │  content, situation,     │     包含 score 和 reason（可解释性）         │
│  │  problem, goal           │                                           │
│  │  conflicts (可选)        │     冲突提示                                │
│  │  score, reason           │                                           │
│  └──────────────────────────┘                                           │
│                                                                         │
│  ───────── 分割线 ─────────                                             │
│                                                                         │
│  ┌──────────────────────────┐                                           │
│  │ SkillLookupQuery (SKED)  │ ◄── 按内容搜索 Skill 工件                    │
│  │  text, maxResults        │     返回工件元数据，不包含胶囊内容            │
│  └──────────┬───────────────┘                                           │
│             │                                                           │
│             ▼                                                           │
│  POST /v1/skills/search-by-content                                      │
│  → searchSkillsByContent()                                              │
│             │                                                           │
│             ▼                                                           │
│  ┌──────────────────────────┐                                           │
│  │ SkillLookupResponse      │                                           │
│  │  matches:                │ ◄── 工件级匹配                               │
│  │    SkillLookupResultItem[]│     artifactId, title, slug, score...     │
│  └──────────────────────────┘                                           │
│                                                                         │
│  ───────── 分割线 ─────────                                             │
│                                                                         │
│  ┌──────────────────────────┐                                           │
│  │ GraphPlanSearchQuery     │ ◄── GraphRAG-lite 计划检索                  │
│  │  rawPlanQuery            │     先编译 TrapFirstPlan，再检索             │
│  └──────────┬───────────────┘                                           │
│             │                                                           │
│             ▼                                                           │
│  POST /v1/retrieval/graph-plan                                          │
│  → searchKnowledgeGraphPlan()                                           │
│  → compileTrapFirstPlan()                                               │
│             │                                                           │
│             ▼                                                           │
│  ┌──────────────────────────┐    ┌──────────────────────────┐           │
│  │ TrapFirstPlan            │    │ RoutingTrace             │           │
│  │  trapNodes[]             │    │  selectedMode            │           │
│  │  edges[]                 │    │  routeFamily             │           │
│  │  blockerEvidence[]       │    │  routingReason           │           │
│  └──────────────────────────┘    │  fallbackApplied         │           │
│                                  │  confidenceScore         │           │
│                                  └──────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────────┘
```

## 主线三：反馈 → 衰减 → 维护（Lifecycle Management）

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        用户反馈                                          │
│                                                                         │
│  ┌──────────────────────────┐                                           │
│  │ FeedbackEntry            │ ◄── 用户对 KnowledgeEntry 或 SkillArtifact  │
│  │  entryId, entryType      │     的问题报告                               │
│  │  problemType:            │     incorrect / outdated /                  │
│  │    incorrect/outdated/   │     context-mismatch / incomplete / other   │
│  │    context-mismatch/     │                                           │
│  │    incomplete/other      │                                           │
│  │  status: new             │                                           │
│  └──────────┬───────────────┘                                           │
│             │                                                           │
│             ▼                                                           │
│  POST /v1/feedback                                                      │
│             │                                                           │
│             ▼                                                           │
│  ┌──────────────────────────┐                                           │
│  │ FeedbackStatus 状态机:    │                                           │
│  │  new → triaged → resolved │                                           │
│  │                → dismissed│                                           │
│  └──────────┬───────────────┘                                           │
│             │                                                           │
│             ▼                                                           │
│  管理员批量操作 (POST /v1/admin/feedback/batch):                         │
│  ┌──────────────────────────┐                                           │
│  │ FeedbackBatchRequest     │ ◄── resolve / dismiss / triage / transition│
│  │  action, feedbackIds     │                                           │
│  │  dryRun (预览模式)        │                                           │
│  └──────────────────────────┘                                           │
│             │                                                           │
│             ▼                                                           │
│  ┌──────────────────────────┐                                           │
│  │ QualityScore             │ ◄── 条目质量评分                             │
│  │  totalFeedback           │     基于反馈统计计算                         │
│  │  qualityScore (0-1)      │                                           │
│  └──────────────────────────┘                                           │
└───────────┬─────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        衰减管理（Decay）                                  │
│                                                                         │
│  附加在 KnowledgeEntry 上:                                               │
│  ┌──────────────────────────┐                                           │
│  │ DecayMeta                │                                           │
│  │  lastVerifiedAt          │ ◄── 衰减元数据                               │
│  │  decayState              │     追踪知识新鲜度                           │
│  │  freshnessType:          │     evergreen / versioned / volatile       │
│  │    evergreen/versioned/  │                                           │
│  │    volatile              │                                           │
│  │  supersededById (可选)   │                                           │
│  └──────────┬───────────────┘                                           │
│             │                                                           │
│             ▼                                                           │
│  ┌──────────────────────────┐                                           │
│  │ DecayState 状态机:        │                                           │
│  │  active → review-due     │                                           │
│  │         → stale → expired │ ◄── 知识逐渐过期                            │
│  │               → superseded│ ◄── 被新条目取代                             │
│  └──────────────────────────┘                                           │
│                                                                         │
│  自动触发规则 (LifecycleTriggerRule):                                    │
│    3 条 "outdated" 反馈 / 30天 → stale                                  │
│    5 条 "incorrect" 反馈 / 30天 → review-due                            │
└───────────┬─────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        维护管理（Maintenance）                            │
│                                                                         │
│  附加在 KnowledgeEntry / SkillArtifact 上:                                │
│  ┌──────────────────────────┐                                           │
│  │ MaintenanceMeta          │                                           │
│  │  maintainer: ActorRef?   │ ◄── 维护责任人                               │
│  │  reviewBy: ISO8601?      │ ◄── 计划审核日期（SLA 追踪）                 │
│  └──────────────────────────┘                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

## 全局关系图

```
                    ┌─────────────┐
                    │   Team      │
                    │   Member    │
                    │   AccessKey │
                    └──────┬──────┘
                           │  身份认证 & 权限
                           ▼
              ┌────────────────────────┐
              │  CandidateSubmission   │ ◄── 所有知识的入口
              │  (trap 或 skill)       │
              └───────────┬────────────┘
                          │
              ┌───────────┴────────────┐
              │                        │
              ▼                        ▼
    ┌──────────────────┐    ┌──────────────────────┐
    │ AnalysisSnapshot │    │   DuplicateCase      │
    │ (内容指纹)        │    │   DuplicateMatch     │
    └────────┬─────────┘    │   ManualResult       │
             │              │   ResolutionOutcome  │
             │              │   EntityLineage      │
             │              └──────────┬───────────┘
             ▼                         │
    ┌──────────────────┐               │
    │ AgentReviewResult│               │
    │ ReviewDecision   │               │
    └────────┬─────────┘               │
             │                         │
             ▼                         ▼
    ┌─────────────────────────────────────────────┐
    │              发布为正式实体                     │
    │                                             │
    │  ┌─────────────────┐  ┌──────────────────┐  │
    │  │ KnowledgeEntry  │  │  SkillArtifact   │  │
    │  │ KnowledgeRevision│ │  SkillRevision   │  │
    │  │                 │  │    ↓             │  │
    │  │                 │  │  SkillProfile    │  │
    │  │                 │  │  SkillCapsule[]  │  │
    │  │                 │  │  ClientManifest  │  │
    │  └────────┬────────┘  └────────┬─────────┘  │
    └───────────┼───────────────────┼─────────────┘
                │                   │
                ▼                   ▼
    ┌─────────────────────────────────────────────┐
    │              检索层                            │
    │                                             │
    │  v1: RetrievalQuery → RetrievalResponse     │
    │       (KnowledgeEntry 级别)                  │
    │       RetrievalCitation (引用溯源)            │
    │                                             │
    │  v2: RetrievalV2Query → RetrievalV2Response │
    │       (SkillCapsule 级别)                    │
    │       CapsuleMatch + ProfileHint             │
    │       + CapsuleActivationHints               │
    │                                             │
    │  SKED: SkillLookupQuery → SkillLookupResp   │
    │       (SkillArtifact 级别)                   │
    │                                             │
    │  Graph: GraphPlanSearchQuery                │
    │       → TrapFirstPlan + RoutingTrace        │
    └───────────────────┬─────────────────────────┘
                        │
                        ▼
    ┌─────────────────────────────────────────────┐
    │              反馈 & 生命周期管理                │
    │                                             │
    │  FeedbackEntry → FeedbackBatchRequest       │
    │       ↓                                     │
    │  QualityScore                               │
    │       ↓                                     │
    │  DecayMeta (DecayState 状态机)               │
    │       ↓                                     │
    │  MaintenanceMeta (维护责任人 + SLA)           │
    └─────────────────────────────────────────────┘
```

## 关键串联点总结

| 串联点 | 涉及类型 | 说明 |
|--------|---------|------|
| **入口** | `CandidateSubmission` → `CandidatePayload` | 所有知识（trap/skill）都先作为候选提交 |
| **去重** | `AnalysisSnapshot` → `DuplicateCase` → `DuplicateMatch` | 分析后与已有实体比对 |
| **人工裁定** | `ManualResultSubmission` → `ResolutionOutcome` → `EntityLineage` | 决定独立发布还是合并 |
| **审核** | `AgentReviewResult` → `ReviewDecision` → `LifecycleState` | AI 预审 + 人工审核 |
| **发布（trap）** | → `KnowledgeEntry` + `KnowledgeRevision` | 知识条目，带版本历史 |
| **发布（skill）** | → `SkillArtifact` → `SkillProfile` / `SkillCapsule` / `ClientManifest` | 技能工件，派生三种产物 |
| **检索 v1** | `RetrievalQuery` → `RetrievalResponse` + `RetrievalCitation` | 条目级检索 |
| **检索 v2** | `RetrievalV2Query` → `CapsuleMatch` + `ProfileHint` + `ActivationHints` | 胶囊级检索 |
| **反馈** | `FeedbackEntry` → `QualityScore` → `DecayMeta` → `MaintenanceMeta` | 反馈驱动衰减和维护 |

## 相关文档

- [数据模型定义](../reference/DATA_MODEL.md) - 实体字段详情
- [数据流图](FLOW.md) - 知识提交和检索的详细流程
- [异步摄取管道](components/INGESTION.md) - CandidateSubmission 处理细节
- [知识生命周期](components/KNOWLEDGE_LIFECYCLE.md) - 状态机转换详情
- [检索系统](components/RETRIEVAL.md) - v1/v2/v3 检索算法详情
- [工件系统](components/ARTIFACTS.md) - SkillArtifact 派生详情
