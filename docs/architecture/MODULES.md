# TrapMap 模块详解

## 包：`@trapmap/contracts`

**位置**：`packages/contracts`

**用途**：共享 Zod schema，在 CLI 和服务器之间提供运行时验证的 TypeScript 类型。

### 领域 Schema

#### `domain/common.ts`
整个系统使用的核心共享类型。

```typescript
// 实体标识
type EntityId = string  // UUID v4

// 安全等级（0-10）
type SecurityLevel = number  // 0 = 公开, 10 = 最高机密

// RBAC 权限
type Permission =
  | 'knowledge:submit'
  | 'knowledge:search'
  | 'knowledge:review'
  | 'knowledge:update'
  | 'knowledge:import'
  | 'knowledge:export'
  | 'audit:read'
  | 'team:create'
  | 'team:list'
  | 'team:select'
  | 'member:create'
  | 'member:update'
  | 'member:key:create'

// 生命周期状态
type LifecycleState =
  | 'draft'
  | 'submitted'
  | 'agent-pass'
  | 'agent-rejected'
  | 'approved'
  | 'rejected'
  | 'deactivated'

// 操作者引用（谁做了某事）
interface ActorRef {
  actorId: EntityId
  actorName: string
  teamId?: EntityId
}

// 分页查询
interface PaginatedQuery {
  limit?: number
  cursor?: string
  filter?: Record<string, unknown>
}
```

#### `domain/knowledge.ts`
知识条目、提交和修订 schema。

```typescript
interface KnowledgeEntry {
  id: EntityId
  title: string
  content: string
  format: 'markdown' | 'json' | 'yaml'
  requiredLevel: SecurityLevel
  lifecycleState: LifecycleState

  // 元数据
  createdAt: string  // ISO 8601
  updatedAt: string
  createdBy: ActorRef
  submittedBy?: ActorRef
  approvedBy?: ActorRef
  teamId?: EntityId

  // 关系
  capsuleIds: EntityId[]
  trapIds: EntityId[]

  // 审核
  reviewHistory: ReviewRecord[]
  agentReviewResult?: AgentReviewResult

  // 索引状态
  indexState: KnowledgeIndexStateRecord
}

interface KnowledgeSubmission {
  title: string
  content: string
  format?: 'markdown' | 'json' | 'yaml'
  requiredLevel?: SecurityLevel
  teamId?: EntityId
  capsuleIds?: EntityId[]
  trapIds?: EntityId[]
}

interface KnowledgeRevision {
  id: EntityId
  entryId: EntityId
  content: string
  reason: string
  createdAt: string
  createdBy: ActorRef
}
```

#### `domain/artifacts.ts`
技能工件、胶囊、配置文件和客户端清单（阶段 12+）。

```typescript
interface SkillArtifact {
  id: EntityId
  name: string
  version: string
  sourceFiles: SourceFile[]

  // 派生输出（派生时填充）
  profile?: SkillProfile
  capsules?: SkillCapsule[]
  clientManifest?: ClientManifest

  // 治理
  scope: 'global' | 'project' | 'team'
  requiredLevel: SecurityLevel

  // 元数据
  createdAt: string
  createdBy: ActorRef
  lineage: ArtifactLineage
}

interface SkillCapsule {
  id: EntityId
  artifactId: EntityId
  name: string
  content: string  // 精炼的、可操作的内容
  activationHint?: string  // 阶段 15 激活提示
  governanceInherited: boolean
}

interface SkillProfile {
  id: EntityId
  artifactId: EntityId
  distilledText: string  // 压缩表示
  keywords: string[]
}

interface ClientManifest {
  id: EntityId
  artifactId: EntityId
  metadata: {
    name: string
    version: string
    capabilities: string[]
    requirements: string[]
  }
}
```

#### `domain/retrieval.ts`
检索查询、响应和路由 schema。

```typescript
interface RetrievalQuery {
  query: string
  mode: 'semantic' | 'hybrid' | 'graph-assisted'
  limit?: number
  filter?: RetrievalFilter
}

interface RetrievalFilter {
  approvalStatus?: 'approved' | 'submitted' | 'agent-pass'
  teamId?: EntityId
  requiredLevel?: { lte?: SecurityLevel }
  trapIds?: EntityId[]
  capsuleIds?: EntityId[]
}

interface RetrievalResponse {
  query: string
  mode: string
  results: RetrievalResult[]
  trace?: RoutingTrace
}

interface CapsuleMatch {
  capsuleId: EntityId
  score: number
  content: string
  activationHint?: string
}

interface RoutingTrace {
  provider: 'semantic' | 'keyword' | 'graph'
  confidence: number
  fallback: boolean
}
```

#### `domain/plans.ts`
陷阱优先计划和图计划 schema（阶段 37/GraphRAG-lite）。

```typescript
interface TrapFirstPlan {
  planId: EntityId
  query: string
  traps: PlanTrapNode[]
  skills: PlanSkillNode[]
  edges: PlanEdge[]
  citations: Citation[]
}

interface PlanTrapNode {
  id: EntityId
  name: string
  description: string
  blockers: string[]  // 这个陷阱阻止什么
  priority: number
}

interface PlanSkillNode {
  id: EntityId
  name: string
  description: string
  inputRequirements: string[]
  outputGuarantees: string[]
}

interface PlanEdge {
  source: EntityId
  target: EntityId
  edgeType: 'prerequisite' | 'provides' | 'blocks'
}
```

#### `domain/candidates.ts`
异步摄取管道 schema。

```typescript
interface CandidateSubmission {
  id: EntityId
  content: string
  source: string
  fingerprint?: string
  status: CandidateStatus
  submittedAt: string
  submittedBy: ActorRef
}

type CandidateStatus =
  | 'received'
  | 'queued'
  | 'analyzing'
  | 'duplicate_detected'
  | 'ready_for_review'
  | 'resolved'

interface DuplicateCase {
  candidateId: EntityId
  candidate2Id: EntityId
  matchType: 'fingerprint' | 'semantic'
  similarity?: number
  resolved: boolean
}

interface EntityLineage {
  entityId: EntityId
  candidateIds: EntityId[]
}
```

---

## 包：`@trapmap/server`

**位置**：`packages/server`

**用途**：Fastify API 服务器，业务逻辑编排。

### 路由

#### `routes/auth.ts`
认证端点。

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/v1/auth/login` | 用户名/密码登录 |
| GET | `/v1/auth/session` | 获取当前会话 |
| POST | `/v1/auth/logout` | 登出并使会话失效 |

#### `routes/teams.ts`
团队管理端点。

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/v1/teams` | 创建新团队 |
| GET | `/v1/teams` | 列出所有团队 |
| POST | `/v1/teams/select` | 设置活动团队 |

#### `routes/members.ts`
成员管理端点。

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/v1/members` | 创建成员 |
| PATCH | `/v1/members/:memberId` | 更新成员 |

#### `routes/knowledge.ts`
知识 CRUD 和提交。

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/v1/knowledge` | 提交新知识条目 |
| GET | `/v1/knowledge/mine` | 列出用户自己的条目 |
| GET | `/v1/knowledge/:entryId` | 按 ID 获取条目 |
| POST | `/v1/knowledge/:entryId/resubmit` | 重新提交被拒绝的条目 |
| PATCH | `/v1/knowledge/:entryId` | 更新条目 |

#### `routes/review.ts`
审核队列表和决策。

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/v1/knowledge/review-queue` | 获取审核队列 |
| POST | `/v1/knowledge/review` | 提交审核决策 |

#### `routes/retrieval.ts`
搜索端点。

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/v1/retrieval/search` | v1 语义搜索 |
| POST | `/v3/retrieval/search` | v2 胶囊搜索 |
| POST | `/v3/retrieval/plan` | v3 陷阱优先计划 |
| POST | `/v1/retrieval/skills/search-by-content` | 按内容搜索技能 |

#### `routes/operations.ts`
导入/导出和工件操作。

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/v1/operations/audit` | 获取审计日志 |
| POST | `/v1/operations/import` | 导入知识 |
| POST | `/v1/operations/export` | 导出知识 |
| POST | `/v1/operations/knowledge/:entryId/deactivate` | 停用条目 |
| POST | `/v1/operations/artifacts/:artifactId/edit` | 编辑工件 |
| GET | `/v1/operations/artifacts/:artifactId/history` | 获取工件历史 |
| GET | `/v1/operations/artifacts/review-queue` | 获取工件审核队列 |
| POST | `/v1/operations/artifacts/:artifactId/review` | 审核工件 |

#### `routes/candidates.ts` + `routes/candidates/`
异步摄取端点。`candidates.ts` 是兼容性 barrel，实际路由按职责分模块：

| 模块 | 方法 | 路径 | 描述 |
|------|------|------|------|
| `submit.ts` | POST | `/v1/candidates` | 提交新候选 |
| `query.ts` | GET | `/v1/candidates` | 列出候选 |
| `query.ts` | GET | `/v1/candidates/:candidateId` | 获取候选状态 |
| `duplicates.ts` | GET | `/v1/duplicates` | 列出重复案例 |
| `duplicates.ts` | GET | `/v1/duplicates/:candidateId` | 获取候选重复案例 |
| `duplicates.ts` | GET | `/v1/duplicates/:candidateId/bundle` | 获取重复包 |
| `resolution.ts` | POST | `/v1/candidates/:candidateId/manual-result` | 人工重复解决 |
| `resolution.ts` | POST | `/v1/candidates/:candidateId/apply-resolution` | 应用解决结果 |

#### `routes/traps.ts`
Trap 特定端点。

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/v1/traps` | 创建陷阱 |
| GET | `/v1/traps` | 列出陷阱 |
| GET | `/v1/traps/:trapId` | 按 ID 获取陷阱 |
| POST | `/v1/traps/:trapId/resubmit` | 重新提交陷阱 |

### 业务逻辑（`src/lib/`）

#### `lib/ai/`
AI 提供商抽象层。

**文件**：
- `index.ts` - 主导出，工厂函数
- `types.ts` - 提供商类型和接口
- `openai.ts` - OpenAI 提供商实现
- `openai-compatible.ts` - OpenAI 兼容提供商
- `ollama.ts` - Ollama 提供商实现

**接口**：
```typescript
interface AIProvider {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>
  embed(texts: string[]): Promise<EmbeddingResponse>
  chatStream?(): Promise<StreamingChatResponse>
}
```

#### `lib/artifacts/`
工件派生逻辑。

**文件**：
- `capsule.ts` - 从源文件提取胶囊
- `profile.ts` - 从源创建精炼配置文件
- `manifest.ts` - 生成客户端清单

#### `lib/candidates/`
异步摄取管道。

**文件**：
- `detector.ts` - 重复检测（指纹 + 语义）
- `processor.ts` - 后台处理逻辑
- `reconciler.ts` - 启动时协调
- `services/submission-service.ts` - 候选创建与入队
- `services/query-service.ts` - 候选与重复查询聚合
- `services/resolution-service.ts` - 人工结果附加与解决编排

#### `lib/governance/`
RBAC 和资格检查。

**文件**：
- `rbac.ts` - 权限检查
- `eligibility.ts` - 基于角色/等级的是否可执行判断
- `permissions.ts` - 权限定义

#### `lib/indexing/`
多适配器索引。

**文件**：
- `index.ts` - 主索引编排器
- `state.ts` - 索引状态跟踪
- `adapters/` - 各适配器实现
  - `vector.ts` - 向量/embedding 索引
  - `keyword.ts` - 关键词/BM25 索引
  - `graph.ts` - 使用 graphology 的图索引

**文件**：
- `graph-lite/` - GraphRAG-lite 包装器
  - `index.ts` - 图构建和查询
  - `graph.ts` - DAG 操作

#### `lib/retrieval/`
检索管道编排器。

**文件**：
- `recall/` - Recall 实现
  - `semantic.ts` - 语义 Recall
  - `keyword.ts` - 关键词 Recall
  - `graph-assisted.ts` - 图辅助 Recall
- `plan-compiler.ts` - 陷阱优先计划编译
- `graph-plan-search.ts` - GraphRAG-lite 包装器

#### `lib/persistence/`
存储实现。

**文件**：
- `schema.ts` - Drizzle PostgreSQL schema barrel（重导出 `schema/` 子模块）
- `schema/` - 按领域拆分的 schema 定义（auth, knowledge, artifacts, candidates, retrieval, queue）
- `postgres-store.ts` - PostgreSQL 存储
- `create-store.ts` - 存储工厂
- 文件级 JSON 存储实现位于 `lib/store.ts`

---

## 包：`@trapmap/cli`

**位置**：`packages/cli`

**用途**：基于 Commander.js 的终端客户端。

### 命令

#### `auth/`
```bash
trapmap login <username> <password>
trapmap logout
trapmap session
```

#### `team/`
```bash
trapmap team create <name>
trapmap team list
trapmap team select <teamId>
```

#### `member/`
```bash
trapmap member create --username <username> --password <password> [--role <role>]
trapmap member update <memberId> [--role <role>] [--level <level>]
```

#### `knowledge/`
```bash
trapmap knowledge submit --title <title> --content <content> [--format markdown|json|yaml] [--level <level>]
trapmap knowledge resubmit <entryId> --content <content>
trapmap knowledge inspect <entryId>
trapmap knowledge list [--state <state>] [--limit <limit>]
```

#### `trap/`
```bash
trapmap trap create --name <name> --description <description>
trapmap trap list
trapmap trap get <trapId>
trapmap trap resubmit <trapId> --content <content>
```

#### `retrieval/`
```bash
trapmap search <query> [--mode semantic|hybrid|graph-assisted] [--limit <limit>]
trapmap search:v2 <query> [--limit <limit>]  # 胶囊搜索
trapmap search:plan <query>                   # 陷阱优先计划
```

#### `review/`
```bash
trapmap review queue [--limit <limit>]
trapmap review approve <entryId> [--notes <notes>]
trapmap review reject <entryId> --notes <notes>
```

#### `operations/`
```bash
trapmap import <file>
trapmap export [--format json|yaml] [--filter <filter>]
trapmap audit [--limit <limit>] [--actor <actorId>]
```

### 工具

| 文件 | 用途 |
|------|------|
| `config.ts` | CLI 状态（会话、团队、输出配置） |
| `http.ts` | 带认证的 HTTP 客户端 |
| `input.ts` | 用户提示和选择 |
| `output.ts` | 表格、JSON、颜色输出 |
| `activation-policy.ts` | 脚本激活策略 |
| `skill-artifact-export.ts` | 技能工件导出 |

---

## 评估系统（`evals/`）

### `evals/retrieval/`

**测试用例**（`datasets/`）：
- `smoke/` - 快速冒烟测试（5-10 个用例）
- `core/` - 综合核心测试（20+ 用例）

**测试结构**：
```typescript
interface RetrievalTestCase {
  id: string
  query: string
  expected: {
    minResults: number
    governanceEnforced: boolean
    relevanceThreshold: number
  }
  tier: 'smoke' | 'core'
}
```

**运行器**（`runner.ts`）：
- 按层加载测试用例
- 执行检索查询
- 验证治理和相关性
- 计算指标：Hit@K, MRR, nDCG

### `evals/summary/`

**测试用例**：
- 带 `requiredFacts` - 必须出现在摘要中
- 带 `forbiddenClaims` - 不得出现

**运行器**：
- 基于评判的 groundedness 检查
- 覆盖率验证
- 幻觉检测

---

## 脚本（`scripts/`）

| 脚本 | 用途 |
|------|------|
| `deploy.sh` | 生产部署 |

---

## 配置文件

| 文件 | 用途 |
|------|------|
| `tsconfig.base.json` | 基础 TypeScript 配置 |
| `biome.json` | Biome 格式化/linting |
| `vitest.config.ts` | Vitest 测试配置 |
| `docker-compose.yml` | Docker 部署 |
| `.env.example` | 环境变量模板 |
| `.env.production.example` | 生产环境变量模板 |
