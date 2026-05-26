# TrapMap 数据流图

## 1. 知识提交流程

```mermaid
flowchart TB
    subgraph 用户输入["用户输入"]
        CLI["CLI: trapmap knowledge submit\n--title '...' --content '...'"]
        API["API: POST /v1/knowledge"]
    end
    
    subgraph 输入验证["输入验证（Zod）"]
        Title["title: 必填，非空"]
        Content["content: 必填，非空"]
        Format["format: 可选，默认 'markdown'"]
        RequiredLevel["requiredLevel: 可选，默认 0"]
    end
    
    subgraph 授权检查["授权检查"]
        Session["有效会话"]
        Permission["权限: knowledge:submit"]
        Team["团队成员身份（团队作用域）"]
    end
    
    subgraph 重复检测["重复检测（可选）"]
        Fingerprint["指纹匹配"]
        Semantic["语义相似度检查"]
        DupReturn["如果发现重复则返回"]
    end
    
    subgraph 存储事务["存储事务"]
        CreateEntry["创建 KnowledgeEntry\nlifecycleState: 'submitted'"]
        RecordActor["记录 submittedBy 参与者"]
        AssignId["分配 EntityId（UUID v4）"]
        SetTime["设置 createdAt/updatedAt"]
    end
    
    subgraph 审计事件["审计事件记录"]
        AuditEvent["event: 'knowledge.submitted'"]
        AuditFields["actorId, teamId, entryId, timestamp"]
    end
    
    subgraph 智能体审核["智能体审核（异步）"]
        Correctness["正确性风险评估"]
        DupRecheck["重复重新检查"]
        StateTransform["转换: submitted → agent-pass 或 agent-rejected"]
    end
    
    subgraph 提交后索引["提交后索引"]
        VectorEmb["向量 embedding\n（仅 approved 时触发）"]
        KeywordExtract["关键词提取"]
        GraphRelation["图关系"]
        UpdateIndex["更新 KnowledgeIndexStateRecord"]
    end
    
    subgraph 响应["响应"]
        RespBody["{ id, title, lifecycleState: 'submitted', createdAt }"]
    end

    用户输入 --> 输入验证
    输入验证 --> 授权检查
    授权检查 --> 重复检测
    重复检测 --> 存储事务
    存储事务 --> 审计事件
    审计事件 --> 智能体审核
    智能体审核 --> 提交后索引
    提交后索引 --> 响应
```

### 知识提交流程（Mermaid）

```mermaid
sequenceDiagram
    participant 用户 as 用户
    participant CLI as CLI/API
    participant 路由 as 路由处理器
    participant 存储 as 存储
    participant 智能体 as 智能体审核
    participant 索引 as 索引管道

    用户->>CLI: 提交知识
    CLI->>路由: POST /v1/knowledge
    路由->>路由: Zod 验证
    路由->>路由: 权限检查
    路由->>存储: 创建条目（submitted）
    存储-->>路由: entryId
    路由-->>CLI: 201 Created
    CLI-->>用户: 提交成功

    路由->>智能体: 异步审核
    智能体->>智能体: 正确性评估
    智能体->>智能体: 重复检测
    智能体->>存储: 更新状态（agent-pass/rejected）

    Note over 智能体,存储: 如果 agent-pass，等待人工审批

    路由->>存储: 人工审核通过 → 更新状态（approved）
    存储->>索引: 触发索引（仅 approved 状态）
    索引->>索引: 生成嵌入向量
    索引->>索引: 提取关键词
    索引->>存储: 更新索引状态
```

## 2. 检索查询流程 (v1 语义)

```mermaid
flowchart TB
    subgraph 查询输入["查询输入"]
        CLIQuery["CLI: trapmap search\n\"如何配置认证\"\n--mode semantic"]
        APIQuery["API: POST /v1/retrieval/search"]
    end
    
    subgraph 查询验证["查询验证（Zod）"]
        Query["query: 必填，非空"]
        Mode["mode: 'semantic' ／ 'hybrid' ／ 'graph-assisted'"]
        Limit["limit: 可选，默认 10"]
        Filter["filter: 可选"]
    end
    
    subgraph 认证上下文["认证上下文构建"]
        VerifySession["验证会话 cookie/token"]
        LoadUser["加载用户实体及权限"]
        GetTeam["获取活动团队（如果有）"]
        GetLevel["获取用户安全等级"]
    end
    
    subgraph 资格过滤["资格过滤"]
        Approval["approvalStatus: 'approved'（检索必需）"]
        TeamFilter["teamId: 用户的团队或全局条目"]
        LevelCheck["requiredLevel: user.level >= entry.requiredLevel"]
    end
    
    subgraph 模式分支["模式分支"]
        SemanticMode["模式：语义检索"]
        HybridMode["模式：混合检索"]
        GraphMode["模式：图辅助检索"]
    end
    
    subgraph 搜索执行["搜索执行"]
        Embedding["生成嵌入向量\n(OpenAI)"]
        VectorSearch["向量相似度搜索"]
        BM25["BM25 关键词评分"]
        GraphExpand["图扩展\n(graphology DAG)"]
    end
    
    subgraph 合并组装["合并与组装"]
        Merge["合并+重排\n- 分数归一化\n- 去重\n- 相关性排序"]
        Assembly["组装\n- 全局分桶\n- 项目分桶\n- 引用\n- 路由追踪"]
    end
    
    subgraph 约束应用["约束应用"]
        Global["全局约束已应用"]
        Project["项目知识已限定范围"]
    end

    查询输入 --> 查询验证
    查询验证 --> 认证上下文
    认证上下文 --> 资格过滤
    资格过滤 --> 模式分支
    模式分支 --> SemanticMode
    模式分支 --> HybridMode
    模式分支 --> GraphMode
    SemanticMode --> Embedding
    HybridMode --> Embedding
    HybridMode --> BM25
    GraphMode --> Embedding
    Embedding --> VectorSearch
    VectorSearch --> Merge
    BM25 --> Merge
    GraphMode --> GraphExpand
    GraphExpand --> Merge
    Merge --> Assembly
    Assembly --> Global
    Assembly --> Project
```

> **Phase 2 更新**：检索管线从 `buildRetrievalReadModel()`（由 `repos.knowledge` 和 `repos.artifact` 支撑）读取知识条目和技能工件，不再依赖已弃用的 `store.snapshot()` 兼容数据。冲突关系暂时仍从 store snapshot 读取，待引入专用 ConflictRepository 后迁移。

### 检索查询流程（Mermaid）

```mermaid
flowchart TB
    A[查询输入] --> B[查询验证]
    B --> C[认证上下文构建]
    C --> D[资格过滤]

    D --> E{模式选择}
    E -->|semantic| F1[生成嵌入向量]
    E -->|hybrid| F2[生成嵌入向量]
    E -->|hybrid| F3[BM25 评分]
    E -->|graph-assisted| F4[生成嵌入向量]

    F1 --> G1[向量相似度搜索]
    F2 --> G1
    F3 --> G2[关键词结果]
    F4 --> G1
    F4 --> G3[图扩展]

    G1 --> H[合并+重排]
    G2 --> H
    G3 --> H

    H --> I[结果组装]
    I --> J[全局约束]
    I --> K[项目知识]
    I --> L[引用+追踪]

    J --> M[响应]
    K --> M
    L --> M
```

## 3. 审核决策流程

```mermaid
flowchart TB
    subgraph 审核者输入["审核者输入"]
        CLIReview["CLI: trapmap review approve\n<entryId> [--notes '...']"]
        APIReview["API: POST /v1/knowledge/review"]
    end
    
    subgraph 请求验证["请求验证"]
        EntryId["entryId: 必填，有效的 EntityId"]
        Decision["decision: 必填，'approved' | 'rejected'"]
        Notes["notes: 可选，拒绝时必填"]
    end
    
    subgraph 会话权限["会话 & RBAC 检查"]
        Session["有效会话"]
        Permission["权限: knowledge:review"]
        LevelCheck["安全等级 >= 条目 requiredLevel"]
    end
    
    subgraph 条目验证["条目验证"]
        EntryExists["条目存在"]
        ReviewableState["条目处于可审核状态\n（submitted, agent-pass）"]
        NotReviewed["条目尚未被审核"]
    end
    
    subgraph 存储事务["存储事务"]
        CreateReview["创建 ReviewRecord"]
        UpdateState["更新 entry.lifecycleState\napproved 或 rejected"]
        SetReviewer["设置 entry.approvedBy/rejectedBy"]
        AppendHistory["追加到 entry.reviewHistory"]
        UpdateTime["更新 entry.updatedAt"]
    end
    
    subgraph 审计事件["审计事件记录"]
        AuditEvent["event: 'knowledge.reviewed'"]
        AuditFields["actorId, entryId, decision, notes"]
    end
    
    subgraph 提交后索引["提交后索引（如果批准）"]
        VectorIndex["添加到向量索引"]
        KeywordIndex["添加到关键词索引"]
        GraphIndex["添加到图索引（关系）"]
        UpdateIndexState["更新所有适配器的索引状态"]
    end
    
    subgraph 响应["响应"]
        RespBody["{ entryId, lifecycleState,\nreviewedBy, reviewedAt }"]
    end

    审核者输入 --> 请求验证
    请求验证 --> 会话权限
    会话权限 --> 条目验证
    条目验证 --> 存储事务
    存储事务 --> 审计事件
    审计事件 --> 提交后索引
    提交后索引 --> 响应
```

## 4. 异步摄取管道流程

```mermaid
flowchart TB
    subgraph 候选提交["候选提交"]
        PostCandidate["POST /v1/candidates\n{ content, source, submittedBy }"]
    end
    
    subgraph 已接收状态["状态：已接收"]
        CreateCandidate["创建 CandidateSubmission\nstatus: 'received'"]
        AssignEntityId["分配 EntityId"]
        RecordMeta["记录 submittedAt, submittedBy"]
    end
    
    subgraph 后台处理器["后台处理器（异步）"]
        PickUp["拾取 status: 'received' 的候选项"]
        UpdateQueued["更新状态为 'queued'"]
        Enqueue["加入处理队列"]
    end
    
    subgraph 处理阶段["处理阶段"]
        UpdateAnalyzing["更新状态为 'analyzing'"]
        GenFingerprint["生成指纹（内容的哈希）"]
        GenEmbedding["生成嵌入向量（用于语义相似度）"]
        CheckFingerprint["检查与现有条目的指纹匹配"]
        CheckSemantic["检查与现有条目的语义相似度"]
    end
    
    subgraph 分析结果["分析结果"]
        DuplicateDetected["检测到重复\n- similarity > 阈值\n- matchType: fingerprint 或 semantic\n- status: duplicate_detected"]
        AnalysisComplete["分析完成\n- 唯一内容\n- status: ready_for_review"]
    end
    
    subgraph 审核员操作["需要审核员操作"]
        GetBundle["GET /v1/duplicates/:candidateId/bundle"]
        ShowDup["显示候选和重复项"]
        AllowResolve["允许人工解决"]
    end
    
    subgraph 人工解决["人工解决"]
        PostResolve["POST /v1/candidates/:id/manual-result"]
        Resolution["{ resolution: 'merge' | 'discard' | 'keep_both' }"]
        Merge["merge: 合并内容，发布为单个条目"]
        Discard["discard: 拒绝候选"]
        KeepBoth["keep_both: 将两者都发布为独立条目"]
    end
    
    subgraph 解决方案已应用["解决方案已应用"]
        StatusResolved["status: 'resolved'"]
        CreateEntry["创建 trap 或 skill 条目（如果是发布）"]
        LinkLineage["通过 EntityLineage 链接候选到实体"]
        RecordDuplicateCase["在 DuplicateCase 中记录解决方案"]
    end

    候选提交 --> 已接收状态
    已接收状态 --> 后台处理器
    后台处理器 --> 处理阶段
    处理阶段 --> DuplicateDetected
    处理阶段 --> AnalysisComplete
    DuplicateDetected --> 审核员操作
    AnalysisComplete --> 审核员操作
    审核员操作 --> 人工解决
    人工解决 --> 解决方案已应用
```

## 5. 陷阱优先计划编译流程 (v3)

```mermaid
flowchart TB
    subgraph 查询输入["查询输入"]
        CLIQuery["CLI: trapmap search:plan\n\"如何为新服务实现认证\""]
        APIQuery["API: POST /v3/retrieval/plan"]
    end
    
    subgraph GraphRAG封装器["GraphRAG-lite 包装器"]
        BuildEmbed["构建查询嵌入向量"]
        QueryGraph["查询图结构"]
        IdentifyTraps["识别与查询相关的陷阱节点"]
    end
    
    subgraph 置信度路由["置信度感知路由"]
        CalcConfidence["计算计划完成置信度分数"]
        Threshold["阈值: 0.7（可配置）"]
    end
    
    subgraph 高置信度["高置信度（>= 阈值）"]
        PlanCompiler["计划编译器"]
        TopoSort["陷阱的拓扑排序"]
        SurfaceBlockers["表面阻塞项"]
        RecommendSkills["推荐技能"]
    end
    
    subgraph 低置信度["低置信度（< 阈值）"]
        GovernedFallback["治理回退"]
        UseV1V2["使用 v1/v2 检索"]
        ReturnCapsule["返回胶囊匹配"]
        NoPlan["无计划"]
    end
    
    subgraph 计划组装["计划组装"]
        PlanNodes["PlanTrapNode[]（计划陷阱节点列表）"]
        SkillNodes["PlanSkillNode[]（计划技能节点列表）"]
        PlanEdges["PlanEdge[]（计划边列表）"]
        Citations["Citation[]（引用列表）"]
    end
    
    subgraph 响应["响应"]
        RespBody["{ planId, query,\ntraps: [{ id, name, description, blockers, priority }],\nskills: [{ id, name, description, inputRequirements }],\nedges: [{ source, target, edgeType }],\ncitations: [{ entryId, snippet }] }"]
    end

    查询输入 --> GraphRAG封装器
    GraphRAG封装器 --> 置信度路由
    置信度路由 -->|>= 0.7| 高置信度
    置信度路由 -->|< 0.7| 低置信度
    高置信度 --> PlanCompiler
    PlanCompiler --> TopoSort
    TopoSort --> SurfaceBlockers
    SurfaceBlockers --> RecommendSkills
    RecommendSkills --> 计划组装
    低置信度 --> GovernedFallback
    GovernedFallback --> UseV1V2
    UseV1V2 --> ReturnCapsule
    ReturnCapsule --> NoPlan
    NoPlan --> 响应
    计划组装 --> 响应
```

## 6. 会话认证流程

```mermaid
flowchart TB
    subgraph 登录请求["登录请求"]
        PostLogin["POST /v1/auth/login\n{ username, password }"]
    end
    
    subgraph 凭证验证["凭证验证"]
        FindUser["按用户名查找用户"]
        VerifyPassword["验证密码（bcrypt）"]
        LoadPermissions["加载用户实体及权限和等级"]
    end
    
    subgraph 验证结果["验证结果"]
        InvalidCreds["无效凭证"]
        ValidCreds["有效凭证"]
    end
    
    subgraph 会话创建["会话创建"]
        GenerateSessionId["生成会话 ID"]
        StoreSessionData["存储会话数据\n(userId, teamId,\npermissions, level)"]
        SetExpiry["设置过期时间"]
    end
    
    subgraph 设置Cookie["设置 Cookie 头"]
        CookieHeader["Session-ID=xxx;\nHttpOnly; Secure;\nSameSite=Strict"]
    end
    
    subgraph 响应["响应"]
        RespBody["{ user, permissions,\nactiveTeam }"]
    end

    登录请求 --> 凭证验证
    凭证验证 --> InvalidCreds
    凭证验证 --> ValidCreds
    ValidCreds --> 会话创建
    会话创建 --> GenerateSessionId
    GenerateSessionId --> StoreSessionData
    StoreSessionData --> SetExpiry
    SetExpiry --> 设置Cookie
    设置Cookie --> 响应
```

## 7. 索引管道流程

```mermaid
flowchart TB
    subgraph 状态转换["条目状态转换"]
        SubmittedToApproved["submitted → agent-pass → approved"]
        DirectApproved["或: draft → approved（直接审批）"]
    end
    
    subgraph 索引触发["索引触发"]
        StateApproved["状态转换为 'approved'"]
        ContentReady["条目内容已准备好索引"]
    end
    
    subgraph 适配器处理["每个适配器处理\n检查 KnowledgeIndexStateRecord"]
        VectorAdapter["向量适配器\n1. 生成嵌入向量（OpenAI）\n2. 存储向量附 entryId\n3. 存储元数据"]
        KeywordAdapter["关键词适配器\n1. 提取关键词\n2. 构建 BM25 索引\n3. 存储引用"]
        GraphAdapter["图适配器\n1. 解析关系\n2. 构建 DAG 节点/边\n3. 存储在 graphology"]
    end
    
    subgraph 更新索引状态["更新索引状态记录"]
        AdapterSync["adapter 类型: 'vector'（向量）/'keyword'（关键词）/'graph'（图）"]
        StatusSync["status: synced（已同步）"]
        IndexedAt["indexedAt: ts"]
    end
    
    subgraph 协调["协调（启动时）"]
        Compare["比较存储条目与索引状态"]
        DetectMissing["检测索引中缺失的条目"]
        Reindex["重新索引缺失的条目"]
        CleanupOrphan["清理孤立的索引条目"]
    end

    状态转换 --> 索引触发
    索引触发 --> 适配器处理
    适配器处理 --> VectorAdapter
    适配器处理 --> KeywordAdapter
    适配器处理 --> GraphAdapter
    VectorAdapter --> 更新索引状态
    KeywordAdapter --> 更新索引状态
    GraphAdapter --> 更新索引状态
    更新索引状态 --> 协调
```

## 8. 工件派生流程（阶段 12+）

```mermaid
flowchart TB
    subgraph 源工件["带源文件的 SkillArtifact"]
        ArtifactData["{ name, version, sourceFiles: [{ path, content }], scope, level }"]
    end
    
    subgraph 派生请求["派生请求"]
        PostDerive["POST /v1/operations/artifacts/:id/derive"]
        Outputs["{ outputs: ['profile', 'capsules', 'manifest'] }"]
    end
    
    subgraph 配置文件派生["配置文件派生"]
        AISummary["AI 汇总源文件"]
        ExtractKeywords["提取关键词（AI 或规则）"]
        CreateProfile["创建 SkillProfile { distilledText, keywords }"]
    end
    
    subgraph 胶囊提取["胶囊提取"]
        ChunkFiles["将源文件分块为逻辑单元"]
        PerChunk["对每个块:\n- 精炼为可操作内容\n- 生成激活提示（阶段 15）\n- 创建 SkillCapsule"]
        SetInherited["设置 governanceInherited: true"]
    end
    
    subgraph 清单生成["清单生成"]
        ExtractMeta["从工件提取元数据"]
        ParseFeatures["从源解析功能"]
        ParseRequirements["从源解析需求"]
        CreateManifest["创建 ClientManifest"]
    end
    
    subgraph 存储索引["存储和索引"]
        UpdateArtifact["用派生输出更新工件"]
        IndexCapsules["索引胶囊（向量 + 关键词 + 图）"]
        RecordAudit["记录派生审计事件"]
    end

    源工件 --> 派生请求
    派生请求 --> 配置文件派生
    配置文件派生 --> AISummary
    AISummary --> ExtractKeywords
    ExtractKeywords --> CreateProfile
    CreateProfile --> 胶囊提取
    胶囊提取 --> ChunkFiles
    ChunkFiles --> PerChunk
    PerChunk --> SetInherited
    SetInherited --> 清单生成
    清单生成 --> ExtractMeta
    ExtractMeta --> ParseFeatures
    ParseFeatures --> ParseRequirements
    ParseRequirements --> CreateManifest
    CreateManifest --> 存储索引
    存储索引 --> UpdateArtifact
    UpdateArtifact --> IndexCapsules
    IndexCapsules --> RecordAudit
```
