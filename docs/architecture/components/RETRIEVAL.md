# 检索系统 (Retrieval System)

## 概述

TrapMap 提供多版本检索能力，支持从简单的语义搜索到复杂的 GraphRAG-lite 陷阱优先计划生成。检索系统是 TrapMap 的核心功能，负责从索引知识库中高效召回相关条目。

## 版本演进

| 版本 | 模式 | 核心能力 |
|------|------|----------|
| v1 | Entry-based | 语义/混合/图辅助三种模式 |
| v2 | Capsule-native | 原生胶囊检索，支持激活提示 |
| v3 | Plan-first | GraphRAG-lite，陷阱优先计划编译 |

## v1 检索 (Entry-based Retrieval)

### 支持的检索模式

| 模式 | 描述 | 底层算法 |
|------|------|----------|
| `semantic` | 纯语义检索 | OpenAI embedding + 余弦相似度 |
| `hybrid` | 语义 + 关键词混合 | embedding merge BM25 |
| `graph-assisted` | 混合 + 图扩展 | embedding + graphology DAG |

### v1 语义检索流程（Mermaid）

```mermaid
flowchart TB
    A[查询] --> B[验证]
    B --> C[认证上下文]
    C --> D[资格过滤]
    D --> E[生成嵌入向量]
    E --> F[向量相似度]
    F --> G[Top-K 结果]
    G --> H[组装]
    H --> I[响应]
```

### v1 混合检索流程（Mermaid）

```mermaid
flowchart TB
    A[查询] --> B[验证与认证]
    B --> C{并行处理}

    C -->|语义路径| D1[生成 Embedding]
    D1 --> D2[向量相似度]
    D2 --> D3[Top-K 语义结果]

    C -->|关键词路径| E1[分词]
    E1 --> E2[BM25 评分]
    E2 --> E3[Top-K 关键词结果]

    D3 --> F[分数融合<br/>(RRF)]
    E3 --> F
    F --> G[合并与重排]
    G --> H[组装]
    H --> I[响应]
```

### v3 陷阱优先计划编译（Mermaid）

```mermaid
flowchart TB
    A[查询] --> B[GraphRAG-lite]
    B --> C[识别陷阱节点]
    C --> D[查找相关技能]
    D --> E[构建图边]
    E --> F{置信度检查}

    F -->|>= 0.7| G[编译计划]
    F -->|< 0.7| H[降级到 v2]

    G --> I[拓扑排序]
    I --> J[生成引用]
    J --> K[返回计划]

    H --> L[返回胶囊]
```

### 语义检索流程 (Semantic Mode)

```mermaid
flowchart TB
    subgraph 查询输入["查询输入"]
        A["POST /v1/retrieval/search\n{ query, mode: 'semantic' }"]
    end

    subgraph 验证["查询验证"]
        B["query: 非空字符串\nlimit: 可选，默认 10\nfilter: 可选"]
    end

    subgraph 认证["认证上下文"]
        C["会话验证\n加载用户安全等级\n加载用户团队成员身份"]
    end

    subgraph 资格过滤["资格过滤"]
        D["1. approvalStatus = 'approved'\n2. teamId IN [用户团队] 或全局\n3. requiredLevel <= 用户等级"]
    end

    subgraph 嵌入生成["嵌入生成"]
        E["text-embedding-3-small（1536 维）\nTTL 内相同查询缓存嵌入向量"]
    end

    subgraph 向量搜索["向量相似度搜索"]
        F["SELECT entry_id, embedding_vector <-> query_embedding\nWHERE entry_id IN eligible_entries\nORDER BY distance\nLIMIT limit"]
    end

    subgraph 结果组装["结果组装"]
        G["构建分桶（全局 vs 项目）\n附加引用\n生成路由追踪"]
    end

    subgraph 响应["响应"]
        H["{ query, mode, results, trace }"]
    end

    查询输入 --> 验证 --> 认证 --> 资格过滤 --> 嵌入生成 --> 向量搜索 --> 结果组装 --> 响应
```

### 混合检索流程 (Hybrid Mode)

```mermaid
flowchart TB
    subgraph 查询输入["查询输入"]
        A["POST /v1/retrieval/search\n{ query, mode: 'hybrid' }"]
    end

    subgraph 并行处理["并行处理"]
        subgraph 语义路径["语义路径"]
            B1["嵌入生成"]
            B2["向量相似度"]
            B3["Top-K 结果"]
        end

        subgraph 关键词路径["关键词路径"]
            C1["查询分词"]
            C2["BM25 评分"]
            C3["Top-K 排名"]
        end

        subgraph 分数融合["分数融合（RRF）"]
            D["score = 1/(2k+r)\n倒数排名融合"]
        end

        subgraph 重排["合并与重排"]
            E["去重\n归一化\n按分数排序"]
        end
    end

    subgraph 响应["响应"]
        F["{ query, mode, results, trace }"]
    end

    查询输入 --> 语义路径
    查询输入 --> 关键词路径
    B1 --> B2 --> B3 --> 分数融合
    C1 --> C2 --> C3 --> 分数融合
    分数融合 --> 重排 --> 响应
```

### 图辅助检索流程 (Graph-assisted Mode)

```mermaid
flowchart TB
    subgraph 查询输入["查询输入"]
        A["POST /v1/retrieval/search\n{ query, mode: 'graph-assisted' }"]
    end

    subgraph 基础检索["基础检索（混合）"]
        B["同混合检索流程\n返回 Top-K 候选条目"]
    end

    subgraph 图扩展["图扩展"]
        subgraph 遍历["对每个候选条目"]
            C1["通过 trapIds/capsuleIds 查找相关条目"]
            C2["遍历 graphology DAG"]
            C3["扩展 N 跳"]
        end

        subgraph 构建集合["构建扩展集合"]
            D1["直接邻居（1 跳）"]
            D2["传递关系（2 跳）"]
            D3["前置条件链"]
        end
    end

    subgraph 分数重加权["分数重加权"]
        E["original_score × boost_factor\n\nboost_factor 基于：\n- 距查询的距离（越近越高）\n- 关系类型（prerequisite > provides > blocks）\n- 图中心性"]
    end

    subgraph 最终结果["最终结果"]
        F["{ query, mode, results, trace }"]
    end

    查询输入 --> 基础检索 --> 图扩展
    遍历 --> 构建集合 --> 分数重加权 --> 最终结果
```

---

## v2 检索 (Capsule-native Retrieval)

### 与 v1 的区别

| 特性 | v1 | v2 |
|------|-----|-----|
| 检索单元 | KnowledgeEntry | SkillCapsule |
| 治理继承 | entry.requiredLevel | capsule.governanceInherited |
| 激活提示 | 无 | capsule.activationHint |
| 种子输入 | query only | query only |
| 返回格式 | entries | capsules with activation hints |

### 请求/响应示例

**请求**:
```typescript
POST /v3/retrieval/search
{
  query: "authentication setup for microservices",
  capsuleFilter?: {
    artifactId?: EntityId
    governanceInherited?: boolean
  }
}
```

**响应**:
```typescript
{
  query: "authentication setup for microservices",
  mode: "capsule-native",
  capsules: [
    {
      capsuleId: "capsule-1",
      artifactId: "artifact-1",
      name: "OAuth2 Setup",
      content: "To set up OAuth2 in Node.js...",
      activationHint: "Use when implementing user authentication",
      score: 0.92
    },
    {
      capsuleId: "capsule-2",
      artifactId: "artifact-2",
      name: "JWT Validation",
      content: "JWT validation steps...",
      activationHint: "Use when you need to validate access tokens",
      score: 0.87
    }
  ],
  trace: {
    provider: "semantic",
    confidence: 0.85,
    capsuleCount: 2
  }
}
```

### 胶囊检索流程

```mermaid
flowchart TB
    subgraph 胶囊检索["胶囊原生检索流程"]
        A["查询输入"]
        
        subgraph 资格过滤["资格过滤"]
            B["- capsule.governanceInherited = true\n- 用户等级 >= artifact.requiredLevel\n- （工件可访问时胶囊可用）"]
        end

        subgraph 语义搜索["语义搜索"]
            C["- 搜索胶囊内容（非条目内容）\n- 使用胶囊专用索引"]
        end

        subgraph 胶囊组装["胶囊组装"]
            D["- 附加父工件元数据\n- 包含 activationHint\n- 计算治理继承确认"]
        end

        A --> 资格过滤 --> 语义搜索 --> 胶囊组装
    end
```

---

## v3 检索 (Trap-first Plan Compilation)

### 概念

v3 检索生成可执行的陷阱优先计划，而不是简单的结果列表。计划由以下组件构成：

```typescript
interface TrapFirstPlan {
  planId: EntityId
  query: string
  
  // 陷阱节点（需要解决或满足的条件）
  traps: PlanTrapNode[]
  
  // 技能节点（可用于解决问题的技能）
  skills: PlanSkillNode[]
  
  // 边（节点间关系）
  edges: PlanEdge[]
  
  // 引用（用于生成计划的源条目）
  citations: Citation[]
}
```

### 陷阱 vs 技能

| 概念 | 定义 | 示例 |
|------|------|------|
| Trap (陷阱) | 需要满足的前提条件或需要解决的障碍 | "需要 Node.js 18+", "数据库需要已迁移" |
| Skill (技能) | 可用于解决问题的知识单元 | "OAuth2 实现指南", "数据库迁移脚本" |

### 计划编译流程

```mermaid
flowchart TB
    subgraph 陷阱优先计划["陷阱优先计划编译流程"]
        subgraph 查询["查询输入"]
            A["POST /v3/retrieval/plan\n{ query: '如何为新服务添加认证' }"]
        end

        subgraph 图检索["GraphRAG-lite 封装器"]
            B["- 构建查询嵌入向量\n- 查询陷阱图\n- 识别相关陷阱节点\n- 识别前置条件链"]
        end

        subgraph 陷阱识别["陷阱识别"]
            C["对每个相关条目:\n1. 从内容中提取陷阱条件\n2. 分类为阻塞器或前置条件\n3. 评分对查询的重要性\n\n输出: PlanTrapNode[]"]
        end

        subgraph 技能映射["技能映射"]
            D["对每个已识别陷阱:\n1. 查找解决陷阱的技能\n2. 映射陷阱 → 技能（提供/阻塞关系）\n3. 验证技能适用性\n\n输出: PlanSkillNode[], PlanEdge[]"]
        end

        subgraph 拓扑排序["拓扑排序"]
            E["按依赖排序节点:\n1. 无入边 = 可立即开始\n2. 遵循前置条件关系\n3. 优先处理阻塞器（高优先级陷阱）"]
        end

        subgraph 引用生成["引用生成"]
            F["为每个节点附加源片段:\n- entryId: 源知识条目\n- snippet: 相关文本段落\n- relevance_score: 与节点的相关度"]
        end

        subgraph 置信度评分["置信度评分"]
            G["confidence = f(\n  trap_coverage,\n  skill_coverage,\n  graph_coherence\n)"]
        end

        subgraph 响应["响应"]
            H["{ planId, query, traps, skills, edges, citations, confidence }"]
        end

        查询 --> GraphRAG --> 陷阱识别 --> 技能映射 --> 拓扑排序 --> 引用生成 --> 置信度评分 --> 响应
    end
```

### 置信度感知路由

```typescript
interface PlanCompilationResult {
  // If confidence >= threshold (0.7):
  plan: TrapFirstPlan
  confidence: number
  routing: 'plan'
  
  // If confidence < threshold:
  fallback: CapsuleMatch[]  // v2 capsule results
  confidence: number
  routing: 'fallback'
}
```

### 计划示例

**查询**: "how to add OAuth2 authentication to my service"

**生成的计划**:
```json
{
  "planId": "plan-123",
  "query": "how to add OAuth2 authentication to my service",
  "traps": [
    {
      "id": "trap-1",
      "name": "Requires HTTPS",
      "description": "OAuth2 requires HTTPS in production",
      "blockers": ["production-deployment"],
      "priority": 1
    },
    {
      "id": "trap-2", 
      "name": "Needs identity provider",
      "description": "Must have OAuth2 provider (Auth0, Okta, etc)",
      "blockers": ["oauth2-implementation"],
      "priority": 2
    }
  ],
  "skills": [
    {
      "id": "skill-1",
      "name": "HTTPS Setup Guide",
      "description": "How to configure HTTPS with nginx",
      "inputRequirements": ["nginx-installed"],
      "outputGuarantees": ["https-configured"]
    },
    {
      "id": "skill-2",
      "name": "Auth0 Integration",
      "description": "Step-by-step Auth0 OAuth2 integration",
      "inputRequirements": ["https-configured", "auth0-account"],
      "outputGuarantees": ["oauth2-implemented"]
    }
  ],
  "edges": [
    { "source": "skill-1", "target": "trap-1", "edgeType": "blocks" },
    { "source": "skill-2", "target": "trap-2", "edgeType": "blocks" },
    { "source": "trap-1", "target": "trap-2", "edgeType": "prerequisite" }
  ],
  "citations": [
    {
      "entryId": "entry-456",
      "nodeId": "trap-1",
      "snippet": "Production OAuth2 requires valid HTTPS...",
      "relevanceScore": 0.95
    }
  ],
  "confidence": 0.82
}
```

---

## 检索过滤器

所有检索版本支持过滤器：

```typescript
interface RetrievalFilter {
  // 审批状态过滤
  approvalStatus?: 'approved' | 'submitted' | 'agent-pass'
  
  // 团队过滤
  teamId?: EntityId
  
  // 安全等级过滤
  requiredLevel?: {
    lte?: SecurityLevel  // less than or equal
    gte?: SecurityLevel  // greater than or equal
  }
  
  // 实体引用过滤
  trapIds?: EntityId[]
  capsuleIds?: EntityId[]
  
  // 日期范围
  createdAt?: {
    gte?: string  // ISO 8601
    lte?: string
  }
}
```

---

## 评分机制

### 向量相似度

使用余弦相似度：

```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const normB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dotProduct / (normA * normB);
}
```

### RRF (Reciprocal Rank Fusion)

混合检索使用 RRF 融合多路检索结果：

```typescript
function reciprocalRankFusion(
  rankings: Array<Array<{ id: string; rank: number }>>,
  k: number = 60
): Array<{ id: string; score: number }> {
  const scores: Record<string, number> = {};
  
  for (const ranking of rankings) {
    for (let i = 0; i < ranking.length; i++) {
      const id = ranking[i].id;
      scores[id] = (scores[id] || 0) + 1 / (k + i + 1);
    }
  }
  
  return Object.entries(scores)
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
```

### BM25 评分

关键词检索使用 BM25：

```typescript
function bm25(
  documents: string[],
  query: string,
  k1: number = 1.5,
  b: number = 0.75
): Array<{ docIndex: number; score: number }> {
  // Tokenize documents and query
  const tokenizedDocs = documents.map(doc => tokenize(doc));
  const tokenizedQuery = tokenize(query);
  
  // Calculate IDF for each term
  const idf = calculateIDF(tokenizedDocs, tokenizedQuery);
  
  // Calculate BM25 score for each document
  return tokenizedDocs.map((doc, index) => ({
    docIndex: index,
    score: calculateBM25(doc, tokenizedQuery, idf, k1, b)
  })).sort((a, b) => b.score - a.score);
}
```

---

## 路由追踪 (Routing Trace)

每个检索响应包含路由追踪：

```typescript
interface RoutingTrace {
  // 实际使用的检索提供者
  provider: 'semantic' | 'keyword' | 'graph'
  
  // 置信度分数 (0-1)
  confidence: number
  
  // 是否使用了回退
  fallback: boolean
  
  // 额外信息
  metadata?: {
    embeddingCacheHit?: boolean
    graphExpansionDepth?: number
    candidateCount?: number
  }
}
```

---

## 性能优化

### Embedding 缓存

```typescript
const embeddingCache = new LRUCache<string, number[]>({
  max: 1000,
  ttl: 1000 * 60 * 5  // 5 minutes
});

async function getEmbedding(text: string): Promise<number[]> {
  const cacheKey = hashText(text);
  
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey)!;
  }
  
  const embedding = await aiProvider.embed([text]);
  embeddingCache.set(cacheKey, embedding[0]);
  
  return embedding[0];
}
```

### 批处理

```typescript
async function batchEmbed(
  texts: string[],
  batchSize: number = 100
): Promise<number[][]> {
  const results: number[][] = [];
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const embeddings = await aiProvider.embed(batch);
    results.push(...embeddings);
  }
  
  return results;
}
```

### 向量索引优化

使用 PostgreSQL 的 `pg_vector` 扩展或专门的向量数据库：

```sql
-- 索引配置
CREATE INDEX ON knowledge_entries 
USING ivfflat (embedding_vector vector_cosine_ops)
WITH (lists = 100);
```
