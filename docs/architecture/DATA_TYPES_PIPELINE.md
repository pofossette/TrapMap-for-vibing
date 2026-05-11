# 数据类型串联图

本文档以流程图形式展示 TrapMap 核心数据类型如何在系统中串联，标注每个环节涉及的具体 Zod Schema 类型。

> 与 `DATA_MODEL.md` 的区别：本文档侧重**数据流转路径**和**环节标注**，而非实体定义。
> 与 `FLOW.md` 的区别：本文档覆盖**三条主线**（入库、检索、生命周期），并明确每个阶段的数据类型。

## 主线一：提交 → 审核 → 发布（Ingestion Pipeline）

```mermaid
flowchart TB
    subgraph 阶段1["阶段 1：用户提交"]
        A1["CLI / Web Client"]
        A2["CandidateSubmission<br/>sourceType: trap/skill<br/>status: received"]
        A3["POST /v1/candidates<br/>createCandidateSubmission()<br/>scheduleCandidateProcessing()"]
        
        A1 --> A2
        A2 --> A3
    end

    subgraph 阶段2["阶段 2：异步分析"]
        B1["status: received → queued → analyzing"]
        B2["AnalysisSnapshot<br/>fingerprint (SHA-256)<br/>keywords, tokens"]
        B3["DuplicateCase<br/>DuplicateMatch[]<br/>duplicateType: exact/semantic/none"]
        B4["status 分支:<br/>duplicate_detected → 等待人工裁定<br/>ready_for_review → 进入审核流程"]
        
        B1 --> B2
        B2 --> B3
        B3 --> B4
    end

    subgraph 阶段3["阶段 3：人工裁定（仅去重分支）"]
        C1["GET /v1/duplicates/:candidateId/bundle<br/>DuplicateJobBundleResponse"]
        C2["ManualResultSubmission<br/>decision: independent/merged"]
        C3["ResolutionOutcome + EntityLineage<br/>publishedEntityId / mergedIntoEntityId"]
        
        C1 --> C2
        C2 --> C3
    end

    subgraph 阶段4["阶段 4：AI 预审 + 人工审核"]
        D1["AgentReviewResult<br/>status: agent-pass/agent-rejected"]
        D2["ReviewDecision<br/>decision: approve/reject"]
        D3["LifecycleState 状态机:<br/>draft → submitted → agent-pass → approved ✓<br/>→ agent-rejected → rejected ✗"]
        
        D1 --> D2
        D2 --> D3
    end

    subgraph 阶段5["阶段 5：发布为正式实体"]
        E1["KnowledgeEntry<br/>latestRevision, history<br/>metadata, lifecycleHistory"]
        E2["SkillArtifact<br/>history, derived<br/>profile, capsules, clientManifest"]
        
        D3 --> E1
        D3 --> E2
    end

    阶段1 --> 阶段2
    阶段2 --> 阶段3
    阶段3 --> 阶段4
    阶段4 --> 阶段5
```

## 主线二：检索 → 返回（Retrieval Pipeline）

```mermaid
flowchart TB
    subgraph V1["v1 传统知识条目检索"]
        A1["RetrievalQuery<br/>seed, filters, mode<br/>includeRefinement, includeSummary"]
        A2["POST /v1/retrieval/search<br/>searchKnowledge()"]
        A3["RetrievalResponse<br/>globalConstraints[], projectKnowledge[]<br/>refinementSummary, summary"]
        A4["RetrievalCitation<br/>source, snippet, scores<br/>recallChannels"]
        
        A1 --> A2
        A2 --> A3
        A3 --> A4
    end

    subgraph V2["v2 胶囊优先检索"]
        B1["RetrievalV2Query<br/>seed（唯一必填）"]
        B2["POST /v2/retrieval/search<br/>searchKnowledgeV2()"]
        B3["RetrievalV2ResponseWithHints<br/>capsules[], profileHints[]<br/>activationHints[]"]
        B4["CapsuleMatch<br/>capsuleId, artifactId<br/>content, situation, problem, goal<br/>score, reason, conflicts"]
        
        B1 --> B2
        B2 --> B3
        B3 --> B4
    end

    subgraph 技能查找["SKED 按内容搜索 Skill 工件"]
        C1["SkillLookupQuery<br/>text, maxResults"]
        C2["POST /v1/skills/search-by-content<br/>searchSkillsByContent()"]
        C3["SkillLookupResponse<br/>matches: SkillLookupResultItem[]"]
        
        C1 --> C2
        C2 --> C3
    end

    subgraph V3["v3 GraphRAG-lite 计划检索"]
        D1["GraphPlanSearchQuery<br/>rawPlanQuery"]
        D2["POST /v1/retrieval/graph-plan<br/>searchKnowledgeGraphPlan()<br/>compileTrapFirstPlan()"]
        D3["TrapFirstPlan<br/>trapNodes[], edges[]<br/>blockerEvidence[]"]
        D4["RoutingTrace<br/>selectedMode, routeFamily<br/>routingReason, confidenceScore"]
        
        D1 --> D2
        D2 --> D3
        D2 --> D4
    end
```

## 主线三：反馈 → 衰减 → 维护（Lifecycle Management）

```mermaid
flowchart TB
    subgraph 用户反馈["用户反馈"]
        F1["FeedbackEntry<br/>entryId, entryType<br/>problemType: incorrect/outdated/etc<br/>status: new"]
        F2["POST /v1/feedback"]
        F3["FeedbackStatus 状态机:<br/>new → triaged → resolved/dismissed"]
        F4["FeedbackBatchRequest<br/>action, feedbackIds<br/>dryRun（预览模式）"]
        F5["QualityScore<br/>totalFeedback<br/>qualityScore（0-1）"]
        
        F1 --> F2
        F2 --> F3
        F3 --> F4
        F4 --> F5
    end

    subgraph 衰减管理["衰减管理（Decay）"]
        D1["DecayMeta<br/>lastVerifiedAt, decayState<br/>freshnessType: evergreen/versioned/volatile<br/>supersededById（可选）"]
        D2["DecayState 状态机:<br/>active → review-due → stale → expired/superseded"]
        D3["自动触发规则:<br/>3 条 outdated 反馈/30天 → stale<br/>5 条 incorrect 反馈/30天 → review-due"]
        
        D1 --> D2
        D2 --> D3
    end

    subgraph 维护管理["维护管理（Maintenance）"]
        M1["MaintenanceMeta<br/>maintainer: ActorRef?<br/>reviewBy: ISO8601?"]
        
        D3 --> M1
    end

    用户反馈 --> 衰减管理
```

## 全局关系图

```mermaid
flowchart TB
    subgraph 身份认证["身份认证 & 权限"]
        Team["Team"]
        Member["Member"]
        AccessKey["AccessKey"]
        
        Team --> Member
        Member --> AccessKey
    end

    subgraph 知识入库["知识入库入口"]
        Candidate["CandidateSubmission<br/>(trap 或 skill)"]
        Analysis["AnalysisSnapshot<br/>(内容指纹)"]
        Duplicate["DuplicateCase<br/>DuplicateMatch<br/>ManualResult<br/>ResolutionOutcome<br/>EntityLineage"]
        
        Candidate --> Analysis
        Analysis --> Duplicate
    end

    subgraph 审核["审核"]
        AgentReview["AgentReviewResult"]
        ReviewDecision["ReviewDecision"]
        
        Duplicate --> AgentReview
        AgentReview --> ReviewDecision
    end

    subgraph 发布["发布为正式实体"]
        subgraph Trap实体["Trap 类型"]
            KnowledgeEntry["KnowledgeEntry"]
            KnowledgeRevision["KnowledgeRevision"]
            
            KnowledgeEntry --> KnowledgeRevision
        end

        subgraph Skill实体["Skill 类型"]
            SkillArtifact["SkillArtifact"]
            SkillRevision["SkillRevision"]
            SkillProfile["SkillProfile"]
            SkillCapsule["SkillCapsule[]"]
            ClientManifest["ClientManifest"]
            
            SkillArtifact --> SkillRevision
            SkillRevision --> SkillProfile
            SkillRevision --> SkillCapsule
            SkillRevision --> ClientManifest
        end
        
        ReviewDecision --> KnowledgeEntry
        ReviewDecision --> SkillArtifact
    end

    subgraph 检索层["检索层"]
        V1检索["v1: RetrievalQuery → RetrievalResponse<br/>RetrievalCitation（引用溯源）"]
        V2检索["v2: RetrievalV2Query → RetrievalV2Response<br/>CapsuleMatch + ProfileHint<br/>+ CapsuleActivationHints"]
        SKED检索["SKED: SkillLookupQuery → SkillLookupResp<br/>(SkillArtifact 级别)"]
        Graph检索["Graph: GraphPlanSearchQuery<br/>→ TrapFirstPlan + RoutingTrace"]
        
        KnowledgeEntry --> V1检索
        SkillCapsule --> V2检索
        SkillArtifact --> SKED检索
        KnowledgeEntry --> Graph检索
    end

    subgraph 反馈生命周期["反馈 & 生命周期管理"]
        Feedback["FeedbackEntry → FeedbackBatchRequest"]
        Quality["QualityScore"]
        Decay["DecayMeta（DecayState 状态机）"]
        Maintenance["MaintenanceMeta（维护责任人 + SLA）"]
        
        Feedback --> Quality
        Quality --> Decay
        Decay --> Maintenance
    end

    身份认证 --> 知识入库
    发布 --> 检索层
    检索层 --> 反馈生命周期
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
