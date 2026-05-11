# TrapMap 架构

## 系统架构

### 系统分层架构图

```mermaid
flowchart TB
    subgraph Presentation["表现层 (Presentation)"]
        CLI["CLI Client<br/>(Commander.js)"]
        HTTP["HTTP Clients<br/>(curl, Postman)"]
    end

    subgraph Route["路由层 (Route Layer - 薄)"]
        Routes["Fastify Routes<br/>auth | teams | members | knowledge<br/>review | retrieval | operations | traps"]
    end

    subgraph Business["业务逻辑层 (Business Logic)"]
        AI["AI Provider Abstraction<br/>(OpenAI/Ollama/Compatible)"]
        Gov["Governance<br/>(RBAC + Eligibility)"]
        Ret["Retrieval Pipeline<br/>(v1/v2/v3 modes)"]
        Idx["Indexing Pipeline<br/>(Vector/Keyword/Graph)"]
        Ing["Async Ingestion<br/>(Candidates + Duplicates)"]
        Art["Artifact Derivation<br/>(Capsule/Profile/Manifest)"]
    end

    subgraph Persistence["持久层 (Persistence)"]
        StoreInt["Store Interface<br/>(Abstract)"]
        JsonStore["JsonStore<br/>(File-level, atomic)"]
        PgStore["PostgresStore<br/>(PostgreSQL + Drizzle)"]
    end

    Presentation --> Route
    Route --> Business
    Business --> Persistence
    StoreInt --> JsonStore
    StoreInt --> PgStore
```

### 请求生命周期流程图

```mermaid
sequenceDiagram
    participant Client as CLI/HTTP Client
    participant Route as Route Handler
    participant Auth as Auth Middleware
    participant Gov as Governance Layer
    participant Service as Business Service
    participant Store as Store Interface

    Client->>Route: HTTP Request
    Route->>Auth: Validate Session/Key
    Auth->>Auth: Load User Context
    Auth->>Gov: Check Permissions
    Gov->>Gov: Verify Eligibility

    alt Permission Denied
        Gov-->>Client: 403 Forbidden
    else Permission Granted
        Gov->>Service: Execute Business Logic
        Service->>Store: Read/Write Data
        Store-->>Service: Result
        Service-->>Route: Response Data
        Route-->>Client: HTTP Response
    end
```

## 模块划分

### 1. CLI 包 (`packages/cli`)

**职责**：所有用户交互的终端客户端

**命令**：
```
auth/          login, logout, session
team/          create, list, select
member/        create, update
knowledge/     submit, resubmit, inspect, list
trap/          trap 特定操作
retrieval/     search (v1, v2, v3), plan
review/        queue, approve, reject
operations/    import, export, edit
skill/         skill 操作
audit/         审计日志查看
```

**关键组件**：
- `config.ts` - CLI 状态管理（会话、团队、输出格式）
- `http.ts` - 带认证头注入的 HTTP 客户端
- `input.ts` - 用户输入处理（提示、选择）
- `output.ts` - 格式化输出（表格、JSON、ANSI 颜色）

### 2. Server 包 (`packages/server`)

**职责**：Fastify API 服务器，业务逻辑编排

**路由处理器**：
| 文件 | 端点类别 |
|------|---------|
| `auth.ts` | 认证（登录/登出/会话） |
| `teams.ts` | 团队 CRUD 和选择 |
| `members.ts` | 成员管理 |
| `access-keys.ts` | 访问密钥发放 |
| `traps.ts` | Trap 特定操作 |
| `knowledge.ts` | 知识 CRUD 和提交 |
| `review.ts` | 审核队列表和决策 |
| `retrieval.ts` | 搜索端点（v1, v2, v3） |
| `operations.ts` | 导入/导出，工件编辑 |
| `candidates.ts` | 异步摄取管道 |

**业务逻辑库**：
| 目录 | 用途 |
|------|------|
| `lib/ai/` | AI 提供商抽象 |
| `lib/artifacts/` | 工件派生 |
| `lib/candidates/` | 异步摄取管道 |
| `lib/governance/` | RBAC 和资格 |
| `lib/indexing/` | 多适配器索引 |
| `lib/retrieval/` | 检索管道 |
| `lib/persistence/` | 存储实现 |

### 3. Contracts 包 (`packages/contracts`)

**职责**：共享 Zod schema 和 TypeScript 类型

**领域 Schema**：
```
domain/
├── common.ts       # EntityId, SecurityLevel, Permission, LifecycleState
├── auth.ts         # 认证类型
├── team.ts         # Team, Member, AccessKey
├── knowledge.ts    # KnowledgeEntry, KnowledgeSubmission, KnowledgeRevision
├── artifacts.ts    # SkillArtifact, SkillCapsule, SkillProfile, ClientManifest
├── retrieval.ts    # RetrievalQuery, RetrievalResponse, CapsuleMatch
├── review.ts       # ReviewQueue, ReviewDecision
├── candidates.ts   # CandidateSubmission, DuplicateCase
└── plans.ts        # TrapFirstPlan, GraphPlan, PlanTrapNode
```

### 4. Evals 包 (`evals/`)

**职责**：评估数据集和自动化测试运行器

**结构**：
```
evals/
├── retrieval/      # 检索评估
│   ├── cases/     # 测试用例（smoke + core 层）
│   ├── runner.ts   # 评估运行器
│   └── README.md  # 评估标准
└── summary/       # 摘要评估
    ├── cases/     # 带 required/forbidden 的测试用例
    └── runner.ts  # 基于评判的运行器
```

## 技术细节

### AI 提供商抽象

```typescript
// 支持的提供商
type AIProvider = 'openai' | 'openai-compatible' | 'ollama'

// 提供商配置通过环境变量
AI_PROVIDER=openai
AI_BASE_URL=https://api.openai.com/v1  // 兼容提供商使用
AI_API_KEY=sk-...
AI_CHAT_MODEL=gpt-4o
AI_EMBEDDING_MODEL=text-embedding-3-small
```

`packages/server/src/lib/ai/` 中的抽象层标准化：
- 聊天补全（系统提示、消息、参数）
- Embeddings 生成（文本 → 向量）
- 流式响应

### 多适配器索引

```mermaid
flowchart TB
    subgraph IndexingPipeline["索引管道"]
        StateChange["条目状态变更\nsubmitted → approved"]
        IndexState["索引状态记录\n（每个适配器独立同步）"]
        
        subgraph Adapters["多适配器"]
            Vector["向量适配器\nVector Adapter"]
            Keyword["关键词适配器\nKeyword Adapter"]
            Graph["图适配器\nGraph Adapter"]
        end
        
        Reconcile["一致性检查\n（启动时执行）"]
    end

    StateChange --> IndexState
    IndexState --> Vector
    IndexState --> Keyword
    IndexState --> Graph
    Vector --> Reconcile
    Keyword --> Reconcile
    Graph --> Reconcile
```

**适配器**：
- **Vector**：OpenAI embeddings + 余弦相似度
- **Keyword**：BM25/基于分词的词法匹配
- **Graph**：Graphology DAG 用于关系扩展

### 检索管道

```mermaid
flowchart TB
    subgraph RetrievalPipeline["检索管道"]
        Request["请求\n（查询）"]
        Validate["验证\n（Zod）"]
        Auth["认证上下文\n（会话+团队）"]
        Eligibility["资格过滤\n（审批+团队+等级）"]
        ModeDispatch["模式分发\n（语义|混合|图辅助）"]
        
        subgraph Recall["召回阶段"]
            Semantic["语义召回"]
            KeywordRecall["关键词召回"]
            GraphExpand["图扩展"]
        end
        
        Merge["合并+重排"]
        Assembly["组装\n（分桶+引用）"]
        
        subgraph Constraints["约束条件"]
            Global["全局约束"]
            Project["项目知识"]
            Team["团队范围"]
        end
    end

    Request --> Validate
    Validate --> Auth
    Auth --> Eligibility
    Eligibility --> ModeDispatch
    ModeDispatch --> Semantic
    ModeDispatch --> KeywordRecall
    ModeDispatch --> GraphExpand
    Semantic --> Merge
    KeywordRecall --> Merge
    GraphExpand --> Merge
    Merge --> Assembly
    Assembly --> Constraints
```

### 陷阱优先计划编译 (v3)

```mermaid
flowchart TB
    subgraph TrapFirstPlan["陷阱优先计划编译"]
        Query["查询输入"]
        GraphRAG["GraphRAG Lite 封装器"]
        Routing["置信度感知路由"]
        
        subgraph HighPath["高置信度路径"]
            TrapFirst["陷阱优先计划\n（类型边+引用）"]
        end
        
        subgraph LowPath["低置信度降级路径"]
            Governed["受控检索响应\n（v1/v2）"]
        end
    end

    Query --> GraphRAG
    GraphRAG --> Routing
    Routing -->|高置信度| TrapFirst
    Routing -->|低置信度| Governed
```

### 异步摄取管道

```mermaid
flowchart TB
    subgraph AsyncIngestion["异步摄取管道"]
        Submitted["候选提交"]
        Received["状态：已接收"]
        Queued["状态：已排队"]
        Analyzing["状态：分析中\n（指纹检查+语义相似度检查）"]
        
        subgraph AnalysisResult["分析结果"]
            Duplicate["检测到重复"]
            AnalysisComplete["分析完成"]
            ReadyForReview["状态：待审核"]
        end
        
        ReviewerAction["审核员操作\nPOST /candidates/:id/manual-result\n{ resolution: merge|discard|keep_both }"]
        Resolution["解决方案已应用\n（发布/合并）"]
    end

    Submitted --> Received
    Received -->|异步处理| Queued
    Queued --> Analyzing
    Analyzing --> Duplicate
    Analyzing --> AnalysisComplete
    AnalysisComplete --> ReadyForReview
    Duplicate --> ReviewerAction
    ReadyForReview --> ReviewerAction
    ReviewerAction --> Resolution
```

### 会话与认证

```mermaid
flowchart TB
    subgraph LoginFlow["登录流程"]
        Login["登录请求"]
        PostLogin["POST /v1/auth/login\n{ username, password }"]
        Validate["验证凭据"]
        CreateSession["创建会话"]
        SetCookie["设置 Cookie\n并返回会话"]
    end
    
    subgraph SessionCheck["会话检查"]
        SessionCheckNode["会话检查\nGET /v1/auth/session"]
        ValidateSession["验证会话 ID"]
        LoadContext["加载用户上下文\n（团队、权限、等级）"]
    end
    
    subgraph RBAC["权限控制"]
        RBACMiddleware["RBAC 中间件"]
        PermissionCheck["权限检查\n（knowledge:submit,\nknowledge:review 等）"]
    end

    Login --> PostLogin
    PostLogin --> Validate
    Validate --> CreateSession
    CreateSession --> SetCookie
    
    SetCookie --> SessionCheckNode
    SessionCheckNode --> ValidateSession
    ValidateSession --> LoadContext
    LoadContext --> RBACMiddleware
    RBACMiddleware --> PermissionCheck
```

## 持久化架构

### 存储接口

```typescript
interface Store {
  // 事务支持原子操作
  transact<T>(fn: (tx: Transaction) => T): Promise<T>;

  // 知识条目
  createKnowledgeEntry(entry: KnowledgeEntry): Promise<void>;
  getKnowledgeEntry(id: EntityId): Promise<KnowledgeEntry | null>;
  updateKnowledgeEntry(id: EntityId, updates: Partial<KnowledgeEntry>): Promise<void>;
  listKnowledgeEntries(query: PaginatedQuery): Promise<KnowledgeEntry[]>;

  // 团队
  createTeam(team: Team): Promise<void>;
  getTeam(id: EntityId): Promise<Team | null>;
  listTeams(): Promise<Team[]>;

  // ... etc
}
```

### JsonStore（开发）

```
.json data file
├── 原子写入（写入临时文件，然后重命名）
├── 并发访问的文件锁定
└── 启动时自动备份
```

### PostgresStore（生产）

```
PostgreSQL
├── Drizzle ORM schema
├── 连接池
├── ACID 事务
└── 常用查询的索引
```

## 环境配置

### 必需变量

| 变量 | 描述 |
|------|------|
| `OPENAI_API_KEY` | OpenAI API 密钥 |
| `TRAPMAP_SYSTEM_ADMIN_KEY` | 管理员密钥 |

### 可选变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `TRAPMAP_DATABASE_URL` | (无) | PostgreSQL 连接字符串 |
| `TRAPMAP_DATA_FILE` | `.data/skill-shareer.json` | JSON 存储路径 |
| `HOST` | `0.0.0.0` | 服务器绑定主机 |
| `PORT` | `4000` | 服务器端口 |
| `AI_PROVIDER` | `openai` | AI 提供商类型 |
| `AI_BASE_URL` | (无) | 兼容提供商的 Base URL |
| `AI_API_KEY` | (无) | 兼容提供商的 API 密钥 |
| `AI_CHAT_MODEL` | `gpt-4o` | 聊天模型名称 |
| `AI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding 模型名称 |

## 部署

### Docker Compose

```yaml
services:
  app:
    build: .
    ports:
      - "4000:4000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - TRAPMAP_SYSTEM_ADMIN_KEY=${TRAPMAP_SYSTEM_ADMIN_KEY}
      - TRAPMAP_DATABASE_URL=postgresql://...
    depends_on:
      - postgres
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
      interval: 30s
      timeout: 10s

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: trapmap
      POSTGRES_USER: trapmap
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

## 健康检查

```bash
curl http://localhost:4000/health
# 响应：
{
  "status": "ok",
  "product": "trapmap",
  "packages": ["cli", "server", "contracts"]
}
```
