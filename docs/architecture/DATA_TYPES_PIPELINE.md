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
        B4["CapsuleMatch<br/>capsuleId, artifactId<br/>content, situation, problem, goal<br/>contextualPrefix (可选)<br/>score = problem×0.30 + situation×0.21<br/>+ goal×0.17 + keyword×0.17<br/>+ context×0.15, × stackPathBoost<br/>reason, conflicts"]
        
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
| **发布（skill）** | → `SkillArtifact` → `SkillProfile` / `SkillCapsule` / `ClientManifest` | 技能工件，派生三种产物。Capsule 支持可选的 `contextualPrefix`（Contextual Enrichment，见 ARTIFACTS.md） |
| **检索 v1** | `RetrievalQuery` → `RetrievalResponse` + `RetrievalCitation` | 条目级检索 |
| **检索 v2** | `RetrievalV2Query` → `CapsuleMatch` + `ProfileHint` + `ActivationHints` | 胶囊级检索 |
| **检索 v3** | `GraphPlanSearchQuery` → `TrapFirstPlan` + `RoutingTrace` | GraphRAG-lite 图计划检索 |
| **反馈** | `FeedbackEntry` → `QualityScore` → `DecayMeta` → `MaintenanceMeta` | 反馈驱动衰减和维护 |

---

## 附录 A：GraphRAG-lite 图构建与检索详解

本节详细说明 TrapMap 内部 GraphRAG-lite 图的构建方式、节点/边类型、数据插入更新流程，以及 v1 和 v3 检索管道如何使用图结构。

> 注意：本文档中的"图"均指 **TrapMap 内部域图**（存储于 `StoreData.graphIndexDocuments[]`），而非 `graphify-out/` 中的代码知识图。

### A.1 图数据结构

#### 节点类型（GraphNodeKind）

```mermaid
flowchart LR
    subgraph 核心节点
        trap["trap — 知识条目 KnowledgeEntry 的根节点"]
        skill["skill — 技能工件 SkillArtifact 的根节点"]
    end
    subgraph 内容节点
        cue["cue — 错误症状/警告信号（如 'error', 'timeout'）"]
        tool["tool — 工具/框架（如 'docker', 'typescript'）"]
        environment["environment — 运行环境（如 'production', 'ci'）"]
        prerequisite["prerequisite — 前置条件（从 'requires' 文本提取）"]
        mitigation["mitigation — 修复方案（从 'fix:' / 'mitigate:' 文本提取）"]
    end
    subgraph 边界节点
        boundary_context["boundary-context — 上下文标签（如 'frontend', 'production'）"]
        boundary_version["boundary-version — 版本约束（如 'react@>=16.8.0'）"]
        boundary_platform["boundary-platform — 平台标识（如 'linux', 'docker'）"]
    end
```

#### 边类型（GraphRelationType）与强度（GraphRelationStrength）

```mermaid
flowchart LR
    subgraph 边类型 GraphRelationType
        direction LR
        risk_blocks["risk-blocks｜视文本｜trap → cue：陷阱触发的症状"]
        co_occurs["co-occurs-with｜soft｜trap → tool/env：陷阱涉及的工具或环境"]
        requires["requires｜hard｜trap → prerequisite：必须满足的前置条件"]
        mitigates_edge["mitigates｜视文本｜mitigation → trap：修复方案对应的陷阱"]
        order["order｜soft｜prerequisite[i] → prerequisite[i+1]：顺序"]
        applies_in["applies-in｜soft｜trap → boundary-context：适用上下文"]
        requires_version["requires-version｜hard｜trap → boundary-version：版本依赖"]
        excludes_context["excludes-context｜soft｜trap → boundary-platform：排除的平台"]
        excludes_version["excludes-version｜soft｜trap → boundary-version：不兼容的版本"]
    end
```

强度判定规则（LLM 驱动 + 规则 fallback）：

| 路径 | 规则 |
|------|------|
| **主路径（LLM 提取）** | LLM 直接输出 hard/soft，语义理解否定句和句级作用域。例如 "does NOT require X" 不生成 requires 边；"must" 仅影响当前句的边 |
| **requires / prerequisite** | 始终 hard |
| **risk-blocks** | 文本含 "must/blocked/requires/mandatory" 时 hard，否则 soft |
| **mitigates** | 文本含 "to mitigate ... must" 模式时 hard，否则 soft |
| **requires-version** | 始终 hard |
| **其余** | soft |

> 硬边参与 DAG 环路检测（仅 requires, risk-blocks, requires-version + strength=hard）

#### 持久化记录（GraphIndexDocumentRecord）

```
GraphIndexDocumentRecord {
  id:          "graphdoc_trap_{sourceId}_r{revision}"
  sourceType:  "trap" | "skill"
  sourceId:    来源实体 ID（entryId 或 artifactId）
  revision:    来源修订号
  contentHash: SHA-256(nodes + edges)
  teamId:      null | teamId
  scope:       "global" | "team"
  requiredLevel: 安全等级
  nodes:       GraphNodeRecord[]
  edges:       GraphEdgeRecord[]
}
```

每个 `GraphIndexDocumentRecord` 按 `{sourceType, sourceId}` 做 upsert —— 同一来源只保留最新修订。

### A.2 图构建流程（数据插入与更新）

图构建由**生命周期状态变更**触发，统一走 `syncKnowledgeIndex()` 管道。

#### A.2.1 管道总览

```mermaid
flowchart TB
    A["KnowledgeEntry / SkillArtifact"] --> B{"lifecycleState 变更"}
    B -->|"approved / deactivated"| C["determineIndexAction → 'upsert'"]
    B -->|"deactivated"| D["determineIndexAction → 'remove'"]
    C --> E["syncKnowledgeIndex()"]
    D --> F["removeGraphIndexDocumentsForSource()"]
    E --> G["normalizeKnowledgeIndexDocument()\n→ canonicalText, contentHash, tokens, boundary"]
    G --> H{"needsSync()?\nrevision + contentHash 未变 → 跳过"}
    H --> I["vector ｜ keyword ｜ graph\n三个适配器并行"]
    I --> J["graphIndexAdapter.sync(document, store)"]
```

#### A.2.2 Trap 侧图构建（详细流程）

以一条 KnowledgeEntry 为例说明完整的图构建过程。提取由**两阶段 LLM** 驱动（详见 `HYBRID_GRAPH_EXTRACTION.md`），规则引擎保留为 fallback。

**示例输入**：
```
KnowledgeEntry:
  id: "entry-001"
  shortcut: "Docker build fails with COPY error in multi-stage Dockerfile"
  detail: "When using multi-stage Dockerfile with COPY --from, the build
           fails with 'cannot copy' error. To fix: ensure source path
           exists in the referenced stage. Requires: Docker 17.05+"
  labels: ["docker", "build", "ci"]
  boundary:
    context: ["ci", "production"]
    versions: [{package: "docker", range: ">=17.05.0"}]
    exclusions: [{kind: "platform", description: "windows"}]
```

**构建流程（LLM 主路径）**：

```mermaid
flowchart TB
    A["graphIndexAdapter.sync(document, store, chat?)"] --> B["extractGraphEntitiesWithLLM(chat, document.canonicalText)"]
    B --> C["Phase 1: planExtraction(chat, text)\n文本 <= 2000 chars → 单段 plan（跳过 Phase 2）\n文本 > 2000 chars → LLM 返回 ExtractionPlan\n缓存: contentHash → ExtractionPlan"]
    C --> D["Phase 2: extractSegmentEntities(chat, segment)\n对每个 segment 并行调用（maxConcurrent=3）\nLLM 输出 nodes[] + edges[]（Zod 校验）\n合并所有段结果（按 label 去重）\n缓存: contentHash → LlmExtractionResult"]
    D --> E["Gleaning: 二次提取追问\n首次结果 + gleaning 结果 → 并集合并"]
    E --> F["返回 LlmExtractionResult\nnodes: trap / tool / cue / environment / prerequisite / mitigation\nedges: risk-blocks / co-occurs-with / requires / mitigates"]
    B --> G["注入 trap 根节点 + nodeId 映射\n→ kind: trap, id: trap:entry-001"]
    B --> H["extractBoundaryGraphEntities()\n纯代码路径"]
    F --> I["合并 LLM 结果 + boundary 结果\n→ buildTrapGraphDocument()"]
    G --> I
    H --> I
    I --> J["assertNoHardDependencyCycles()\n+ upsertGraphIndexDocument()"]
```

LLM 不可用时的降级路径：LLM 失败 → 缓存命中 → 使用缓存 → 无缓存 → `extractTrapGraphEntities()` 规则引擎 fallback

**LLM 提取的优势**（相比规则引擎）：
- 理解否定句："does NOT require X" 不会生成 requires 边
- 句级作用域：单个 "must" 仅影响当前句的边
- 识别新技术：无需维护关键词列表即可识别 Cloudflare Workers、Turbopack 等
- 更精确的症状/工具分类：语义理解替代子串匹配

**生成的图文档**（LLM 结果经过 nodeId 映射 + boundary 合并后）：

```
GraphIndexDocumentRecord {
  id: "graphdoc_trap_entry-001_r1"
  sourceType: "trap"
  nodes: [
    { id: "trap:entry-001",                kind: "trap" },
    { id: "tool:docker",                   kind: "tool" },
    { id: "cue:error",                     kind: "cue" },
    { id: "cue:fail",                      kind: "cue" },
    { id: "env:ci",                        kind: "environment" },
    { id: "env:production",                kind: "environment" },
    { id: "env:docker-17.05",              kind: "environment" },
    { id: "prereq:docker-17.05+",          kind: "prerequisite" },
    { id: "mit:ensure-source-path-...",     kind: "mitigation" },
    { id: "boundary-ctx:ci",               kind: "boundary-context" },
    { id: "boundary-ctx:production",       kind: "boundary-context" },
    { id: "boundary-ver:docker@>=17.05.0", kind: "boundary-version" },
    { id: "boundary-plat:windows",         kind: "boundary-platform" },
  ]
  edges: [
    { src: "trap:entry-001", tgt: "cue:error",     type: "risk-blocks",      strength: "hard" },
    { src: "trap:entry-001", tgt: "cue:fail",       type: "risk-blocks",      strength: "hard" },
    { src: "trap:entry-001", tgt: "tool:docker",    type: "co-occurs-with",   strength: "soft" },
    { src: "trap:entry-001", tgt: "env:ci",         type: "co-occurs-with",   strength: "soft" },
    { src: "trap:entry-001", tgt: "env:production", type: "co-occurs-with",   strength: "soft" },
    { src: "trap:entry-001", tgt: "prereq:docker-17.05+", type: "requires",  strength: "hard" },
    { src: "mit:ensure-...",  tgt: "trap:entry-001", type: "mitigates",      strength: "soft" },
    { src: "trap:entry-001", tgt: "boundary-ctx:ci",        type: "applies-in",       strength: "soft" },
    { src: "trap:entry-001", tgt: "boundary-ctx:production", type: "applies-in",      strength: "soft" },
    { src: "trap:entry-001", tgt: "boundary-ver:docker@>=17.05.0", type: "requires-version", strength: "hard" },
    { src: "trap:entry-001", tgt: "boundary-plat:windows",  type: "excludes-context", strength: "soft" },
  ]
}
```

**持久化前环路检测**：

```
store.transact(data => {
  existingDocs = data.graphIndexDocuments.filter(d => d != current)
  existingDocs.push(candidateDoc)

  projectHardDependencyGraph(existingDocs)   ← 仅保留
    ├─ relationType ∈ {requires, risk-blocks, requires-version}
    └─ strength == "hard"

  hasCycle(dag)?  → throw "hard dependency cycle detected"

  upsertGraphIndexDocument(data, candidateDoc)  ← 按 sourceType+sourceId 覆盖
})
```

#### A.2.3 Skill 侧图构建

Skill 图构建使用与 Trap 侧相同的 LLM 提取入口 `extractGraphEntitiesWithLLM()`，但数据来源不同：

```mermaid
flowchart TB
    A["SkillArtifact approved"] --> B["runSkillIndexEvent(chat?)"]
    B --> C["extractGraphEntitiesWithLLM(chat, profile + capsules text)\n安全约束：仅读 profile.summary/keywords + capsules 的\nsituation/problem/goal/content/labels，绝不读 asset/script 内容"]
    C --> D["从 profile.summary 提取 tool, environment 节点"]
    C --> E["从 profile.keywords 提取 tool 节点"]
    C --> F["从 capsules[].situation 提取 cue 节点"]
    C --> G["从 capsules[].problem 提取 cue 节点"]
    C --> H["从 capsules[].goal 提取 mitigation 节点"]
    C --> I["从 capsules[].labels 提取 tool, environment 节点"]
    D --> J["生成 skill 根节点\n{ kind: skill, id: skill:artifactId }"]
    E --> J
    F --> J
    G --> J
    H --> J
    I --> J
    J --> K["buildSkillGraphDocument()\n→ GraphIndexDocumentRecord { sourceType: skill }"]
    K --> L["assertNoHardDependencyCycles()"]
    L --> M["upsertGraphIndexDocument()"]
```

LLM 不可用时：退化为 `extractSkillGraphPrimitives()` 规则引擎（关键词匹配 + 正则提取），保持向后兼容。

#### A.2.4 启动时一致性对账

```mermaid
flowchart TB
    A["reconcileKnowledgeIndexes() ← 服务启动时"] --> B["遍历所有 knowledgeEntries（批次大小 50）"]
    B --> C{"approved?"}
    C -->|"是"| D["syncKnowledgeIndex(entry, chat?)\nchat 透传给 LLM 提取"]
    C -->|"否"| E["removeGraphIndexDocumentsForSource(entry.id)"]
    A --> F["遍历所有 skillArtifacts（批次大小 50）"]
    F --> G{"approved?"}
    G -->|"是"| H["artifactGraphIndexAdapter.sync(artifact, chat?)"]
    G -->|"否"| I["removeGraphIndexDocumentsForSource(artifact.id)"]

    J["promptVersion 变化"] --> K["触发全量缓存失效 + 后台重建"]
```

### A.3 查询时图组装

检索时将所有 `GraphIndexDocumentRecord` 组装为 graphology 有向多重图：

```mermaid
flowchart TB
    A["buildGraphRuntimeSnapshot(graphIndexDocuments)"] --> B["buildGraphFromDocuments(documents)\n→ Graphology directed multigraph\n→ 节点按 nodeId 去重（mergeNode）\n→ 边按 edgeId 去重（mergeEdgeWithKey）"]
    A --> C["预计算 5 个查找索引"]
    C --> D["documentsBySourceId: sourceId → document"]
    C --> E["nodeIdsByNormalizedLabel: label → nodeIds"]
    C --> F["sourceIdsByNormalizedLabel: label → sourceIds"]
    C --> G["sourceIdsByNodeId: nodeId → sourceIds"]
    C --> H["nodeIdsBySourceId: sourceId → nodeIds"]
```

**示例**：上文 entry-001 + 另一条 entry-002（含 "docker timeout in CI"）组装后：

```mermaid
flowchart LR
    entry001["trap:entry-001"] -->|"risk-blocks"| cue_error["cue:error"]
    entry001 -->|"risk-blocks"| cue_fail["cue:fail"]
    entry001 -->|"co-occurs"| tool_docker["tool:docker"]
    entry002["trap:entry-002"] -->|"co-occurs"| tool_docker
    entry001 -->|"requires"| prereq["prereq:docker-17.05+"]
    entry001 -->|"applies-in"| ctx_ci["boundary-ctx:ci"]
    entry002 -->|"applies-in"| ctx_ci
    entry002 -->|"risk-blocks"| cue_timeout["cue:timeout"]
    mit["mit:ensure-source..."] -->|"mitigates"| entry001
```

查找索引示例：

| 索引 | 键 | 值 |
|------|----|----|
| `nodeIdsByNormalizedLabel` | `"docker"` | `{"tool:docker"}` |
| `sourceIdsByNodeId` | `"tool:docker"` | `{"entry-001", "entry-002"}` |
| `sourceIdsByNormalizedLabel` | `"error"` | `{"entry-001"}` |

### A.4 v1 Graph-Assisted 检索详解

v1 将图作为**辅助通道**（权重 20%），与语义通道和关键词通道并行后融合。

```mermaid
flowchart TB
    A["POST /v1/retrieval/search\nseed: docker COPY fails in CI, mode: graph-assisted"] --> B["1. 权限过滤\n→ eligibleEntries（approved, team, level）"]
    B --> C["semanticRecall() ← 向量相似度"]
    B --> D["keywordRecall() ← BM25 关键词"]
    B --> E["graphAssistedRecall() ← 图辅助"]
    E --> E1["extractQueryEntities()\n→ {docker, fail}"]
    E1 --> E2["buildGraphRuntimeSnapshot(graphDocuments)"]
    E2 --> E3["expandSourcesOneHop(runtime, entities)\n直接匹配: sourceIdsByNormalizedLabel\n一跳扩展: neighbors → candidateSourceIds"]
    E3 --> E4["对每个候选计分\n直接实体匹配: base 0.7 + relationStrength × 0.01\n仅关系匹配: base 0.3 + relationStrength × 0.01"]
    C --> F["3. 通道融合\nmergeCandidatesWithGraph(semantic, keyword, graph)\ngraph 权重 = 0.2\n最终分 = 0.8 × (semantic + keyword 融合分) + 0.2 × graph 分"]
    D --> F
    E4 --> F
    F --> G["4. 重排序 → RetrievalResponse"]
```

**图在 v1 中的作用示意**：

| 通道 | entry-001 | entry-002 | entry-003 | entry-005 |
|------|-----------|-----------|-----------|-----------|
| 语义通道 | 0.85 | — | 0.72 | 0.61 |
| 关键词通道 | 0.90 | 0.78 | — | — |
| 图通道 | 0.73（直接匹配 docker + fail = 2 项） | 0.30（仅通过 tool:docker 邻居关系连接） | — | — |
| **融合后** | **0.844**（图提升） | **0.684**（图小幅提升） | **0.576** | **0.488** |

### A.5 v3 Graph Plan 检索详解

v3 将图作为**主干机制**，构建结构化执行计划（TrapFirstPlan），而非简单评分列表。

```mermaid
flowchart TB
    A["POST /v3/retrieval/search\nseed: 部署 Docker 到生产环境, skillBudget: 3"] --> B["1. parseSeedIntent(seed)\n→ situation + tokens"]
    B --> C["2. 获取治理合格候选\ntrapCandidates = filterEligibleEntries()\nskillCandidates = rankCapsules(intent, 3× budget)"]
    C --> D["3. 加载图: graphDocs = graphIndexRepo.listAll()"]
    D --> E["4. extractSeedNodeIds(trapCandidates, skillCandidates, graphDocs)\n遍历 trap 候选 → kind=trap 节点\n遍历 skill 候选 → kind=skill 节点"]
    E --> F["5. buildLocalExpansionView()\n从种子节点做有界 BFS，最多 2 跳\ndepth 0: trap:entry-001, trap:entry-002, skill:artifact-A\ndepth 1: cue, tool, environment 节点\ndepth 2: prereq, boundary 节点"]
    F --> G["6. findBlockingTraps(subgraph)\n遍历 edge.type == risk-blocks → 收集 trap 节点\n治理检查: requiredLevel <= auth.securityLevel\n按 severity 排序: hard 优先"]
    G --> H["7. findMitigatingSkills(subgraph)\nedge.type == mitigates 且 target ∈ blockingTraps\n→ mitigatingSkillNodeIds"]
    H --> I["8. applySkillBudget(budget=3)\nmitigating 技能: +0.5 加分 → 优先排入\n非 mitigating: 按 finalScore 补齐"]
    I --> J["9. buildPlanEdges()\n仅保留计划节点之间的边\ntype ∈ {risk-blocks, mitigates, requires, order}"]
    J --> K["10. assessGraphPlanReadiness(plan)\nskills>0: +0.4, traps>0: +0.25\nhasStructure: +0.2, hasEvidence: +0.15"]
    K --> L{"score >= 0.65\n且 skillCount > 0?"}
    L -->|"是"| M["返回 GraphPlanSearchResponse\n含 TrapFirstPlan + RoutingTrace"]
    L -->|"skillCount == 0"| N["fallback v1-graph-assisted"]
    L -->|"trapCount == 0"| O["fallback v2-capsule"]
```

**v3 输出的 TrapFirstPlan 可视化**：

```mermaid
flowchart TB
    subgraph blockingTraps["blockingTraps"]
        T1["trap:entry-001\nseverity: hard\nDocker build fails with COPY error"]
        T1 -->|"risk-blocks"| CE["cue:error"]
        T1 -->|"risk-blocks"| CF["cue:fail"]
    end

    subgraph recommendedSkills["recommendedSkills"]
        S1["skill:artifact-A\nscore: 0.85\nsituation: Docker deploy playbook"]
    end

    S1 -->|"mitigates"| T1
    T1 -->|"requires"| PR["prereq:docker-17.05+"]
```

| 边 | 源 | 目标 | 类型 | 强度 |
|----|----|----|------|------|
| 1 | trap:entry-001 | cue:error | risk-blocks | hard |
| 2 | trap:entry-001 | cue:fail | risk-blocks | hard |
| 3 | skill:artifact-A | trap:entry-001 | mitigates | soft |
| 4 | trap:entry-001 | prereq:docker-17.05+ | requires | hard |

### A.6 v1 vs v3 图使用对比

| 维度 | v1 Graph-Assisted | v3 Graph Plan |
|------|-------------------|---------------|
| 图的角色 | 辅助通道（20% 权重） | 主干机制（决定计划结构） |
| 扩展深度 | 1 跳（expandSourcesOneHop） | 有界 BFS 最多 2 跳（buildLocalExpansionView） |
| 输出格式 | 评分条目列表（RecallCandidate[]） | TrapFirstPlan（结构化计划，含 traps + skills + edges） |
| 数据源 | KnowledgeEntry only | KnowledgeEntry + SkillArtifact |
| 边类型使用 | 所有边类型参与遍历 | 仅 risk-blocks, mitigates, requires, order 参与计划 |
| Skill 集成 | 无（仅条目级） | mitigating skill +0.5 加分，有 skill budget（默认 3） |
| 置信度评估 | 无 | 显式评分: skills(0.4) + traps(0.25) + structure(0.2) + evidence(0.15) |
| 降级策略 | 本身就是降级目标 | score < 0.65 → fallback v2-capsule 或 v1-graph |
| 评分方式 | 直接匹配 0.7 + 关系匹配 0.3 + 关系强度 × 0.01 | 图结构决定计划；置信度阈值 0.65 |
| 环路保护 | 共享同一套 DAG 检测 | 共享同一套 DAG 检测 |

### A.7 关键源文件索引

| 职责 | 文件路径 |
|------|---------|
| 节点/边类型定义 | `packages/server/src/lib/indexing/graph-lite/documents.ts` |
| graphology 组装与扩展 | `packages/server/src/lib/indexing/graph-lite/graphology.ts` |
| 文档 CRUD | `packages/server/src/lib/indexing/graph-lite/store.ts` |
| GraphIndexRepository 接口 | `packages/server/src/lib/graph-index/repository.ts` |
| **LLM 实体提取（主路径）** | **`packages/server/src/lib/indexing/graph-lite/llm-extract.ts`** |
| **LLM 提取缓存** | **`packages/server/src/lib/indexing/graph-lite/llm-cache.ts`** |
| Trap 实体提取（规则引擎 fallback） | `packages/server/src/lib/retrieval/recall/graph-extract.ts` |
| **LLM 重复判定** | **`packages/server/src/lib/candidates/llm-dedup.ts`** |
| **LLM 冲突判定** | **`packages/server/src/lib/conflict/llm-conflict.ts`** |
| **图提取 Zod Schema** | **`packages/contracts/src/domain/graph-extraction.ts`** |
| 边界约束提取 | `packages/server/src/lib/indexing/boundary-extract.ts` |
| Skill 实体提取 | `packages/server/src/lib/indexing/skill-events.ts` |
| Trap 图适配器 | `packages/server/src/lib/indexing/adapters/graph.ts` |
| Skill 图适配器 | `packages/server/src/lib/indexing/adapters/artifact-graph.ts` |
| 图文档构建器 | `packages/server/src/lib/indexing/adapters/graph-builders.ts` |
| 索引管道编排 | `packages/server/src/lib/indexing/pipeline.ts` |
| v1 图辅助召回 | `packages/server/src/lib/retrieval/recall/graph-assisted.ts` |
| v1 召回协调器 | `packages/server/src/lib/retrieval/orchestration/recall-coordinator.ts` |
| v3 计划编译器 | `packages/server/src/lib/retrieval/graph-plan/plan-compiler.ts` |
| v3 搜索入口 | `packages/server/src/lib/retrieval/graph-plan/graph-plan-search.ts` |

> **LLM 图提取架构详解**见 [`HYBRID_GRAPH_EXTRACTION.md`](HYBRID_GRAPH_EXTRACTION.md)。

## 相关文档

- [数据模型定义](../reference/DATA_MODEL.md) - 实体字段详情
- [数据流图](FLOW.md) - 知识提交和检索的详细流程
- [异步摄取管道](components/INGESTION.md) - CandidateSubmission 处理细节
- [知识生命周期](components/KNOWLEDGE_LIFECYCLE.md) - 状态机转换详情
- [检索系统](components/RETRIEVAL.md) - v1/v2/v3 检索算法详情
- [工件系统](components/ARTIFACTS.md) - SkillArtifact 派生详情
- [GraphRAG-lite 检索](GRAPH_RETRIEVAL.md) - 图检索系统完整文档
- [LLM 图提取架构](HYBRID_GRAPH_EXTRACTION.md) - 两阶段 LLM 图实体提取、重复/冲突检测增强
