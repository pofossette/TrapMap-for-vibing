# TrapMap 架构

> 权威的事实来源和防漂移守卫规则见 [SYSTEM_TRUTH_SOURCES.md](../reference/SYSTEM_TRUTH_SOURCES.md)。

## 系统架构

## 持久化演进边界

Round 0 已对数据库现代化方案完成基线冻结，后续架构演进遵守以下约定：

- 业务主事实进入 PostgreSQL 结构化主表与历史/事件表。
- `store_snapshot` 仅保留给尚未迁移的兼容域，不再是 PG 主读路径用于身份/审计域。
- 双写兼容层只允许短期存在，必须在后续轮次停止双写并删除旧层。
- 检索索引、embedding、capsule、profile、manifest、usage rollup 属于派生层，不得反向成为业务真相。

> 权威的迁移状态记录见 [docs/reference/DATA_MODEL.md](../reference/DATA_MODEL.md)。`store_snapshot` 当前仅作为兼容层，不再接纳新的核心业务主路径。

当前收敛状态：

- Knowledge / Artifact / Candidate / Task Queue 已由 PostgreSQL 主表和 migration 驱动。
- Team / User / Member / Session / AccessKey 及部分辅助域已通过 PostgreSQL 结构化表承载主读写路径。
- 应用启动负责执行 migration，不负责为核心领域动态建表。

### 启动序列

应用启动由 `packages/server/src/bootstrap/run-startup-sequence.ts` 统一编排，严格按以下顺序执行：

1. **Repositories** (`bootstrap-repositories.ts`) — 运行 Drizzle 迁移、创建所有 flat props repo 和统一 `repos` 对象、确保 HNSW 向量索引、注册 graph channel
2. **Candidate Recovery** (`bootstrap-candidate-recovery.ts`) — 查找并重新排队中断的候选（JSON + PG 双路径）
3. **Workers** (`bootstrap-workers.ts`) — 创建并启动 PostgreSQL task worker（仅 PG 模式）
4. **Graph Reconciliation** (`bootstrap-graph-reconciliation.ts`) — 对账图索引
5. **Lifecycle** (`bootstrap-lifecycle.ts`) — 注册 domain event 订阅者、启动 outbox worker（仅 PG 模式）

关键约束：Repos 必须先于 Candidate Recovery 和 Workers 初始化，因为两者依赖 `repos.candidate`。

### 系统分层架构图

```mermaid
flowchart TB
    subgraph 表现层["表现层 (Presentation)"]
        CLI["CLI 客户端<br/>(Commander.js)"]
        HTTP["HTTP 客户端<br/>(curl, Postman)"]
    end

    subgraph 路由层["路由层 (Route Layer - 薄)"]
        Routes["Fastify 路由<br/>auth | teams | members | knowledge<br/>review | retrieval | operations | traps"]
    end

    subgraph 业务逻辑层["业务逻辑层 (Business Logic)"]
        AI["AI 提供商抽象<br/>(OpenAI/Ollama/Compatible)"]
        Gov["治理<br/>(RBAC + 资格)"]
        Ret["检索管道<br/>(v1/v2/v3 模式)"]
        Idx["索引管道<br/>(向量/关键词/图)"]
        Ing["异步入库<br/>(候选 + 重复检测)"]
        Art["工件派生<br/>(胶囊/配置文件/清单)"]
    end

    subgraph 持久层["持久层 (Persistence)"]
        StoreInt["存储接口<br/>(抽象)"]
        JsonStore["JsonStore<br/>(文件级，原子操作)"]
        PgStore["PostgresStore<br/>(PostgreSQL + Drizzle)"]
    end

    表现层 --> 路由层
    路由层 --> 业务逻辑层
    业务逻辑层 --> 持久层
    存储接口 --> JsonStore
    存储接口 --> PgStore
```

### 请求生命周期流程图

```mermaid
sequenceDiagram
    participant 客户端 as CLI/HTTP 客户端
    participant 路由 as 路由处理器
    participant 认证 as 认证中间件
    participant 治理 as 治理层
    participant 服务 as 业务服务
    participant 存储 as 存储接口

    客户端->>路由: HTTP 请求
    路由->>认证: 验证会话/密钥
    认证->>认证: 加载用户上下文
    认证->>治理: 检查权限
    治理->>治理: 验证资格

    alt 权限拒绝
        治理-->>客户端: 403 禁止访问
    else 权限通过
        治理->>服务: 执行业务逻辑
        服务->>存储: 读/写数据
        存储-->>服务: 结果
        服务-->>路由: 响应数据
        路由-->>客户端: HTTP 响应
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
| `traps.ts` | Trap 特定操作（通过共享应用服务） |
| `knowledge.ts` | 知识 CRUD 和提交（通过共享应用服务） |
| `review.ts` | 审核队列表和决策 |
| `retrieval.ts` | 搜索端点（v1, v2, v3） |
| `operations.ts` | 导入/导出，工件编辑 |
| `candidates.ts` | 异步摄取管道 |

**知识/Trap 应用服务**：`knowledge.ts` 和 `traps.ts` 的提交/重提/取代工作流委托给 `lib/knowledge/application-service.ts`。路由 → 应用服务 → 仓库 的分层确保 knowledge 和 trap 路由共享相同的持久化语义，消除了此前 trap 路由缺失治理/生命周期持久化的正确性问题。

**业务逻辑库**：
| 目录 | 用途 |
|------|------|
| `lib/ai/` | AI 提供商抽象 |
| `lib/artifacts/` | 工件派生 |
| `lib/candidates/` | 异步摄取管道 |
| `lib/governance/` | RBAC 和资格 |
| `lib/indexing/` | 多适配器索引 |
| `lib/knowledge/` | 知识应用服务（submit/resubmit/supersede）、仓库接口和 PG 实现 |
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
    subgraph 索引管道["索引管道"]
        状态变更["条目状态变更\nsubmitted → approved"]
        索引状态["索引状态记录\n（每个适配器独立同步）"]
        
        subgraph 多适配器["多适配器"]
            向量["向量适配器\nVector Adapter"]
            关键词["关键词适配器\nKeyword Adapter"]
            图["图适配器\nGraph Adapter"]
        end
        
        一致性检查["一致性检查\n（启动时执行）"]
    end

    状态变更 --> 索引状态
    索引状态 --> 向量
    索引状态 --> 关键词
    索引状态 --> 图
    向量 --> 一致性检查
    关键词 --> 一致性检查
    图 --> 一致性检查
```

**适配器**：
- **Vector**：OpenAI embeddings + 余弦相似度
- **Keyword**：BM25/基于分词的词法匹配
- **Graph**：Graphology DAG 用于关系扩展

### 检索管道

```mermaid
flowchart TB
    subgraph 检索管道["检索管道"]
        请求["请求\n（查询）"]
        验证["验证\n（Zod）"]
        认证["认证上下文\n（会话+团队）"]
        资格["资格过滤\n（审批+团队+等级）"]
        模式分发["模式分发\n（语义|混合|图辅助）"]
        
        subgraph 召回["召回阶段"]
            语义召回["语义召回"]
            关键词召回["关键词召回"]
            图扩展["图扩展"]
        end
        
        合并["合并+重排"]
        组装["组装\n（分桶+引用）"]
        
        subgraph 约束["约束条件"]
            全局约束["全局约束"]
            项目知识["项目知识"]
            团队范围["团队范围"]
        end
    end

    请求 --> 验证
    验证 --> 认证
    认证 --> 资格
    资格 --> 模式分发
    模式分发 --> 语义召回
    模式分发 --> 关键词召回
    模式分发 --> 图扩展
    语义召回 --> 合并
    关键词召回 --> 合并
    图扩展 --> 合并
    合并 --> 组装
    组装 --> 约束
```

### 陷阱优先计划编译 (v3)

```mermaid
flowchart TB
    subgraph 陷阱优先计划["陷阱优先计划编译"]
        查询输入["查询输入"]
        GraphRAG["GraphRAG Lite 封装器"]
        路由["置信度感知路由"]
        
        subgraph 高置信度路径["高置信度路径"]
            陷阱优先["陷阱优先计划\n（类型边+引用）"]
        end
        
        subgraph 低置信度降级路径["低置信度降级路径"]
            受控检索["受控检索响应\n（v1/v2）"]
        end
    end

    查询输入 --> GraphRAG
    GraphRAG --> 路由
    路由 -->|高置信度| 陷阱优先
    路由 -->|低置信度| 受控检索
```

### 异步摄取管道

```mermaid
flowchart TB
    subgraph 异步入库["异步入库管道"]
        候选提交["候选提交"]
        已接收["状态：已接收"]
        已排队["状态：已排队"]
        分析中["状态：分析中\n（指纹检查+语义相似度检查）"]
        
        subgraph 分析结果["分析结果"]
            检测到重复["检测到重复"]
            分析完成["分析完成"]
            待审核["状态：待审核"]
        end
        
        审核员操作["审核员操作\nPOST /candidates/:id/manual-result\n{ resolution: merge|discard|keep_both }"]
        解决方案["解决方案已应用\n（发布/合并）"]
    end

    候选提交 --> 已接收
    已接收 -->|异步处理| 已排队
    已排队 --> 分析中
    分析中 --> 检测到重复
    分析中 --> 分析完成
    分析完成 --> 待审核
    检测到重复 --> 审核员操作
    待审核 --> 审核员操作
    审核员操作 --> 解决方案
```

### 会话与认证

```mermaid
flowchart TB
    subgraph 登录流程["登录流程"]
        登录请求["登录请求"]
        登录接口["POST /v1/auth/login\n{ username, password }"]
        验证凭据["验证凭据"]
        创建会话["创建会话"]
        设置Cookie["设置 Cookie\n并返回会话"]
    end
    
    subgraph 会话检查["会话检查"]
        会话检查节点["会话检查\nGET /v1/auth/session"]
        验证会话["验证会话 ID"]
        加载上下文["加载用户上下文\n（团队、权限、等级）"]
    end
    
    subgraph 权限控制["权限控制"]
        RBAC中间件["RBAC 中间件"]
        权限检查["权限检查\n（knowledge:submit,\nknowledge:review 等）"]
    end

    登录请求 --> 登录接口
    登录接口 --> 验证凭据
    验证凭据 --> 创建会话
    创建会话 --> 设置Cookie
    
    设置Cookie --> 会话检查节点
    会话检查节点 --> 验证会话
    验证会话 --> 加载上下文
    加载上下文 --> RBAC中间件
    RBAC中间件 --> 权限检查
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

```mermaid
flowchart TB
    subgraph Json存储特性["JsonStore 特性"]
        A1["原子写入<br/>写入临时文件，然后重命名"]
        A2["并发访问的文件锁定"]
        A3["启动时自动备份"]
    end
```

### PostgresStore（生产）

```mermaid
flowchart TB
    subgraph Postgres存储特性["PostgresStore 特性"]
        B1["Drizzle ORM schema"]
        B2["连接池"]
        B3["ACID 事务"]
        B4["常用查询的索引"]
    end
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
