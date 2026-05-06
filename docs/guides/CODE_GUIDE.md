# TrapMap 代码导读

面向新贡献者的源码导航。按**阅读顺序**组织，帮助你从入口出发逐步理解整个系统。

---

## 建议阅读顺序

```
contracts → server (app → routes → lib) → cli → evals
```

先理解数据模型（contracts），再看服务端如何编排业务逻辑，最后看客户端如何消费 API 和评估系统如何验证质量。

---

## 1. 共享契约层 — `packages/contracts`

**切入点**：`src/index.ts`

所有跨包类型和 Zod 验证 schema 的唯一来源。CLI 和 Server 都从这里导入类型，保证前后端契约一致。

### 核心领域模型

| 文件 | 关注点 |
|------|--------|
| `domain/common.ts` | 基础类型：`EntityId`、`SecurityLevel`(0-10)、`Permission`(RBAC)、`LifecycleState`、`ActorRef`、`PaginatedQuery` |
| `domain/knowledge.ts` | 知识条目的完整生命周期 schema |
| `domain/review.ts` | 审核决策（approve/reject + 备注） |
| `domain/retrieval.ts` | 检索请求/响应/结果 schema，支持 v1/v2/v3 三个版本 |
| `domain/candidates.ts` | 异步摄取管道的候选条目 schema |
| `domain/artifacts.ts` | Skill 工件（capsule/profile/manifest）schema |
| `domain/auth.ts` | 登录、会话、访问密钥 |
| `domain/team.ts` | 团队与成员关系 |
| `domain/operations.ts` | 批量导入/导出 schema |

### 阅读建议

从 `common.ts` 开始，它定义了贯穿全局的基础类型。`LifecycleState` 尤其关键——知识条目的状态流转是整个业务的核心驱动。

---

## 2. 服务端 — `packages/server`

### 2.1 应用启动 — `src/app.ts`

从 `createApp()` 开始读。它按顺序完成：

1. 加载配置（端口、AI provider、存储后端）
2. 初始化 store（`JsonStore` 或 `PostgresStore`）
3. 注册 AI provider 和 embeddings
4. 注册所有路由
5. 配置启动钩子（候选恢复、图索引对账）

`src/index.ts` 只是调用 `createApp()` 并启动 Fastify 监听，可以快速扫过。

### 2.2 路由层 — `src/routes/`

路由是**薄层**，只做请求验证、权限检查和转发到业务逻辑。按功能域组织：

| 路由文件 | 前缀 | 核心逻辑调用 |
|----------|------|-------------|
| `auth.ts` | `/v1/auth` | 会话管理、密钥认证 |
| `teams.ts` | `/v1/teams` | 团队 CRUD |
| `members.ts` | `/v1/members` | 成员管理、角色分配 |
| `knowledge.ts` | `/v1/knowledge` | 条目提交、查询、更新 |
| `review.ts` | `/v1/knowledge/review` | 审核队列、approve/reject |
| `retrieval.ts` | `/v1/retrieval` | 多版本检索入口 |
| `candidates.ts` | `/v1/candidates` | 异步摄取状态 |
| `operations.ts` | `/v1/operations` | 批量导入/导出 |
| `traps.ts` | `/v1/traps` | Trap 级别操作 |
| `retrieval.ts` | `/v1/retrieval/skills/search-by-content` | Skill 内容检索 |

### 2.3 业务逻辑 — `src/lib/`

这是系统最复杂的部分。

#### AI 抽象 — `lib/ai/`

```
lib/ai/
├── index.ts          # AI 初始化入口
├── provider-config.ts # Provider 配置（模型名、端点）
├── providers.ts      # 多 provider 支持 + fallback 链
└── providers.test.ts # Provider 测试
```

支持 OpenAI、OpenAI 兼容端点（如 vLLM）和 Ollama。核心概念是 **fallback 链**：主 provider 失败时自动切换到备用 provider。

#### 存储抽象 — `lib/store.ts` 与 `lib/persistence/`

```
lib/store.ts
├── SkillShareerStore 接口与 JsonStore 文件存储
└── 领域记录类型

lib/persistence/
├── create-store.ts   # 根据配置选择存储实现
├── postgres-store.ts # PostgreSQL + Drizzle ORM（生产用）
└── schema.ts         # Drizzle schema
```

`SkillShareerStore` 是统一存储接口。`createSkillShareerStore()` 根据 `TRAPMAP_DATABASE_URL`
选择 PostgreSQL，否则使用 JSON 文件存储。

#### 检索管道 — `lib/retrieval/`

检索系统是 TrapMap 的核心差异化能力：

- **v1**：基于条目的检索（语义 / 混合 / 图辅助三种模式）
- **v2**：原生胶囊检索，带激活提示
- **v3**：GraphRAG-lite，带陷阱优先计划编译

关键文件从请求进入 → 索引查询 → 结果排序 → 响应构建的完整流程。

#### 索引适配器 — `lib/indexing/`

三种可插拔的索引后端：

| 适配器 | 技术 | 用途 |
|--------|------|------|
| Vector | OpenAI embeddings | 语义相似度搜索 |
| Keyword | BM25 | 精确关键词匹配 |
| Graph | Graphology | 关系感知检索（知识图谱） |

#### Embeddings — `lib/embeddings.ts`

统一的 embedding 生成接口。负责将文本转换为向量，供 vector 索引使用。

### 2.4 配置 — `src/config.ts`

从环境变量构建运行时配置。关键变量见 `docs/operations/ENVIRONMENT.md`。

---

## 3. 客户端 — `packages/cli`

### 3.1 入口 — `src/index.ts`

Commander.js 应用入口。**注意**：命令不是静态注册的——根据用户权限和 `SecurityLevel` 动态显示/隐藏命令。

### 3.2 命令 — `src/commands/`

每个命令文件导出一个 `register(app)` 函数。命令结构统一：

```typescript
// 典型的命令注册模式
export function register(app: Command) {
  app.command('submit')
    .description('提交新知识条目')
    .argument('<content>', '知识内容')
    .option('--title <title>', '标题')
    .action(async (content, options) => {
      const session = await loadCliState();
      const response = await httpClient.post('/v1/knowledge', { content, ...options });
      formatOutput(response);
    });
}
```

### 3.3 基础设施 — `src/lib/`

| 文件 | 职责 |
|------|------|
| `config.ts` | CLI 状态管理：加载/保存会话、当前团队、输出格式 |
| `http.ts` | HTTP 客户端：自动注入认证头、处理错误 |
| `input.ts` | 用户输入：交互式提示、选择器 |
| `output.ts` | 输出格式化：表格渲染、JSON 模式、ANSI 颜色 |

CLI 是 Server 的薄包装——核心逻辑全在 Server 端。读 CLI 代码主要关注**用户交互流程**和**API 调用模式**。

---

## 4. 评估系统 — `evals/`

评估框架用于量化检索质量和摘要准确性，是 CI 质量门禁的核心。

### 结构

```
evals/
├── retrieval/              # 检索质量评估
│   ├── datasets/           # 黄金数据集和场景 fixture
│   └── lib/                # 评估指标库
├── summary/                # 摘要质量评估
│   └── judge/              # LLM-as-Judge 评判系统
├── fixtures/               # 测试陷阱数据
├── scripts/
│   └── eval-ci.ts          # CI 评估运行器
└── tsconfig.json
```

### 关键概念

| 指标 | 含义 |
|------|------|
| Hit@K | 前 K 个结果中是否包含相关条目 |
| MRR | 平均倒数排名 |
| nDCG | 归一化折损累计增益 |
| Recall@K | 前 K 个结果中相关条目的召回率 |

### 运行

```bash
pnpm eval:smoke    # 快速冒烟测试（~10s）
pnpm eval:core     # 完整评估（~60s）
pnpm eval:ci       # CI 回归检测
```

---

## 5. 关键数据流

### 知识提交流程

```
CLI knowledge submit
  → POST /v1/knowledge
  → Server: 验证 + AI 预审
  → 候选创建（异步）
  → 重复检测（指纹 + 语义）
  → 管理员审核 approve/reject
  → 索引更新（vector + keyword + graph）
```

对应代码路径：`cli/commands/knowledge.ts` → `server/routes/knowledge.ts` → `server/lib/` → `server/lib/store.ts` / `server/lib/persistence/`

### 检索流程

```
CLI retrieval search "如何处理 N+1"
  → POST /v1/retrieval/search
  → Server: 查询解析 + 模式选择
  → 多路召回（vector + keyword + graph）
  → 排序 + 过滤
  → 生成引用 + 返回结果
```

对应代码路径：`cli/commands/retrieval.ts` → `server/routes/retrieval.ts` → `server/lib/retrieval/`

---

## 6. 安全模型要点

- **SecurityLevel**：0-10 整数，知识条目标记所需等级，用户必须 >= 该等级才能访问
- **RBAC**：细粒度权限控制（`knowledge:submit`、`knowledge:review` 等 14 个权限）
- **生命周期**：`draft → submitted → agent-pass → approved → deactivated`，每个状态转换都有权限约束
- 详见 `docs/operations/SECURITY.md`

---

## 7. 配置入口速查

| 场景 | 文件 |
|------|------|
| 环境变量 | `.env`（模板见 `.env.example`） |
| Server 配置 | `packages/server/src/config.ts` |
| CLI 配置 | `packages/cli/src/lib/config.ts` |
| AI Provider | `packages/server/src/lib/ai/provider-config.ts` |
| TypeScript | `tsconfig.base.json`（各包继承） |
| 代码规范 | `biome.json` |
| 测试 | `vitest.config.ts` |
| Docker | `docker-compose.yml` |
| pnpm workspace | `pnpm-workspace.yaml` |

---

## 8. 调试技巧

1. **JSON Store 调试**：开发模式下数据存储在 JSON 文件中，可以直接查看文件内容
2. **RAG 日志**：检索管道日志记录完整的召回-排序-输出过程，用于调试检索质量
3. **用户操作日志**：JSON Lines 格式，记录所有 API 调用，带轮转策略
4. **审计日志**：通过 `audit:read` 权限查看完整操作历史
