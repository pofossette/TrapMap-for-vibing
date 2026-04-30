# 索引管道 (Indexing Pipeline)

## 概述

TrapMap 使用多适配器索引架构，支持三种索引类型：向量索引、关键词索引和图索引。索引管道负责在知识条目状态变更时同步更新各索引，并提供启动时的协调一致性检查。

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Indexing Pipeline Architecture                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Index Trigger Events                         │   │
│  │                                                                    │ │
│  │  1. Entry lifecycleState → 'approved'                           │   │
│  │  2. Entry content updated (if approved)                        │   │
│  │  3. Entry deactivated                                          │   │
│  │  4. Reconciliation on startup                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                         │
│                              ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    Index Orchestrator                           │   │
│  │                                                                    │ │
│  │  - Load index state from KnowledgeIndexStateRecord             │   │
│  │  - Determine which adapters need processing                    │   │
│  │  - Execute adapters in parallel or sequential                  │   │
│  │  - Update index state on completion                            │   │
│  │  - Handle failures and retries                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                         │
│          ┌───────────────────┼───────────────────┐                   │
│          ▼                   ▼                   ▼                    │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐            │
│  │   Vector   │     │   Keyword  │     │    Graph    │            │
│  │  Adapter   │     │   Adapter   │     │   Adapter   │            │
│  │            │     │            │     │            │            │
│  │ Embedding  │     │ BM25 Index │     │ Graphology │            │
│  │  Storage   │     │  Builder   │     │    DAG     │            │
│  └─────────────┘     └─────────────┘     └─────────────┘            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 索引状态记录

每个条目维护详细的索引状态：

```typescript
interface KnowledgeIndexStateRecord {
  entryId: EntityId
  adapters: {
    [adapterName: string]: AdapterIndexState
  }
  lastReconciledAt?: string
}

interface AdapterIndexState {
  status: 'pending' | 'synced' | 'failed' | 'disabled'
  indexedAt?: string
  error?: string
  retryCount: number
  documentVersion: number  // 跟踪内容版本变化
}
```

---

## Vector Adapter (向量适配器)

### 功能

将知识条目内容转换为 OpenAI embeddings 并存储，支持余弦相似度检索。

### 流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Vector Adapter Flow                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Entry Approved                                                          │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Text Preparation                             │   │
│  │  - Concatenate title + content                                  │   │
│  │  - Truncate to max tokens (8192 tokens ≈ 32K chars)            │   │
│  │  - Preserve formatting hints for embedding                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Embedding Generation                         │   │
│  │  - Model: text-embedding-3-small (1536 dimensions)             │   │
│  │  - Cache embedding for same text within TTL                    │   │
│  │  - Normalize vector to unit length                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Vector Storage                              │   │
│  │  - Store in PostgreSQL with pg_vector                         │   │
│  │  - Link to entryId                                             │   │
│  │  - Include metadata (createdAt, version)                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Index State Update                           │   │
│  │  - status: 'synced'                                            │   │
│  │  - indexedAt: current timestamp                                │   │
│  │  - documentVersion: incremented                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 实现细节

```typescript
class VectorAdapter implements IndexAdapter {
  private embeddingModel = 'text-embedding-3-small';
  
  async index(entry: KnowledgeEntry): Promise<void> {
    // 1. Prepare text
    const text = this.prepareText(entry);
    
    // 2. Generate embedding
    const embedding = await this.getEmbedding(text);
    
    // 3. Store vector
    await this.storeVector({
      entryId: entry.id,
      embedding,
      version: entry.version
    });
    
    // 4. Update state
    await this.updateIndexState(entry.id, {
      status: 'synced',
      indexedAt: new Date().toISOString()
    });
  }
  
  async remove(entryId: EntityId): Promise<void> {
    await this.deleteVector(entryId);
    await this.updateIndexState(entryId, { status: 'pending' });
  }
  
  async similaritySearch(
    queryEmbedding: number[],
    limit: number
  ): Promise<Array<{ entryId: EntityId; score: number }>> {
    // Use PostgreSQL vector similarity
    return this.pool.query(`
      SELECT entry_id, 
             1 - (embedding_vector <=> $1) as similarity
      FROM knowledge_vectors
      ORDER BY embedding_vector <=> $1
      LIMIT $2
    `, [queryEmbedding, limit]);
  }
}
```

### PostgreSQL Schema

```sql
CREATE TABLE knowledge_vectors (
  entry_id UUID PRIMARY KEY REFERENCES knowledge_entries(id),
  embedding_vector VECTOR(1536) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON knowledge_vectors 
USING ivfflat (embedding_vector vector_cosine_ops)
WITH (lists = 100);
```

---

## Keyword Adapter (关键词适配器)

### 功能

使用 BM25 算法建立关键词索引，支持精确的词项匹配检索。

### BM25 算法

BM25 (Best Matching 25) 是经典的信息检索排序算法：

```
score(D, Q) = Σ IDF(qi) × (tf(ti,D) × (k1 + 1)) 
                          / (tf(ti,D) + k1 × (1 - b + b × |D|/avgdl))
```

其中：
- `tf(ti,D)` = 词项 ti 在文档 D 中的频率
- `|D|` = 文档 D 的长度
- `avgdl` = 平均文档长度
- `k1` = 词频饱和参数 (通常 1.5)
- `b` = 文档长度归一化参数 (通常 0.75)
- `IDF(qi)` = 逆文档频率

### 流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Keyword Adapter Flow                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Entry Approved                                                          │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Tokenization                               │   │
│  │  - Lowercase                                                    │   │
│  │  - Remove punctuation                                          │   │
│  │  - Split on whitespace                                         │   │
│  │  - Remove stop words (the, a, is, etc.)                       │   │
│  │  - Stem tokens (run → run, running → run)                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    TF-IDF Calculation                           │   │
│  │  - Calculate term frequency (TF)                               │   │
│  │  - Calculate inverse document frequency (IDF)                  │   │
│  │  - Build BM25 per-document scores                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Inverted Index Build                        │   │
│  │  - Map term → [docId, tf] pairs                               │   │
│  │  - Store in PostgreSQL                                        │   │
│  │  - Maintain document frequencies                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Index State Update                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 实现细节

```typescript
class KeywordAdapter implements IndexAdapter {
  private stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    // ... more stop words
  ]);
  
  async index(entry: KnowledgeEntry): Promise<void> {
    // 1. Tokenize
    const tokens = this.tokenize(entry.content);
    
    // 2. Calculate TF
    const tf = this.calculateTermFrequency(tokens);
    
    // 3. Calculate IDF for this document's terms
    // (IDF is global, calculated across all documents)
    const idf = await this.calculateIDF(Object.keys(tf));
    
    // 4. Build inverted index entries
    const indexEntries: IndexEntry[] = [];
    for (const [term, termFreq] of Object.entries(tf)) {
      indexEntries.push({
        entryId: entry.id,
        term,
        tf: termFreq,
        idf: idf[term] || 0,
        bm25Score: this.calculateBM25Term(tf, termFreq, idf[term])
      });
    }
    
    // 5. Store inverted index
    await this.storeInvertedIndex(indexEntries);
    
    // 6. Update state
    await this.updateIndexState(entry.id, { status: 'synced' });
  }
  
  tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2)
      .filter(token => !this.stopWords.has(token))
      .map(token => this.stemmer.stem(token));
  }
}
```

### PostgreSQL Schema

```sql
CREATE TABLE keyword_index (
  entry_id UUID REFERENCES knowledge_entries(id),
  term TEXT NOT NULL,
  term_frequency INTEGER NOT NULL,
  idf REAL NOT NULL,
  bm25_score REAL NOT NULL,
  PRIMARY KEY (entry_id, term)
);

CREATE INDEX idx_term ON keyword_index(term);
CREATE INDEX idx_bm25 ON keyword_index(bm25_score DESC);
```

---

## Graph Adapter (图适配器)

### 功能

使用 Graphology 库构建知识条目之间的关系图，支持基于关系的扩展检索。

### Graphology DAG

使用有向无环图 (DAG) 表示知识条目间的关系：

```typescript
import Graph from 'graphology';

class KnowledgeGraph {
  private graph: Graph;
  
  // 节点类型
  // - entry: 知识条目
  // - trap: 陷阱/前提条件
  // - skill: 技能
  
  // 边类型
  // - prerequisite: A 是 B 的前提
  // - provides: A 提供 B
  // - blocks: A 阻止 B
  // - relates: A 与 B 相关
}
```

### 流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Graph Adapter Flow                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Entry Approved                                                          │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Relationship Extraction                     │   │
│  │  - Parse content for trap/skill mentions                     │   │
│  │  - Extract explicit relationships (see also...)              │   │
│  │  - Infer implicit relationships (similar topics)             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Graph Construction                           │   │
│  │  1. Add/update entry node                                       │   │
│  │  2. Add/update relationship edges                             │   │
│  │  3. Validate DAG (no cycles)                                   │   │
│  │  4. Update transitive closures                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Graph Persistence                             │   │
│  │  - Serialize graphology state to PostgreSQL                    │   │
│  │  - Store nodes and edges tables                               │   │
│  │  - Maintain adjacency lists                                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Index State Update                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 关系类型

```typescript
type RelationshipType = 
  | 'prerequisite'   // A 是 B 的前提条件
  | 'provides'      // A 提供 B 需要的内容
  | 'blocks'        // A 阻止 B
  | 'relates'       // A 与 B 相关
  | 'instanceof';   // A 是 B 类型的一个实例
```

### 实现细节

```typescript
class GraphAdapter implements IndexAdapter {
  private graph: Graph;
  
  async index(entry: KnowledgeEntry): Promise<void> {
    // 1. Extract relationships
    const relationships = await this.extractRelationships(entry);
    
    // 2. Add entry node
    this.graph.addNode(entry.id, {
      type: 'entry',
      label: entry.title,
      metadata: {
        requiredLevel: entry.requiredLevel,
        trapIds: entry.trapIds,
        capsuleIds: entry.capsuleIds
      }
    });
    
    // 3. Add/update edges
    for (const rel of relationships) {
      if (this.graph.hasEdge(rel.source, rel.target)) {
        // Update existing edge
        this.graph.setEdgeAttribute(
          rel.source, rel.target, 
          'type', rel.type
        );
      } else {
        // Add new edge
        this.graph.addEdge(rel.source, rel.target, {
          type: rel.type,
          createdAt: new Date().toISOString()
        });
      }
    }
    
    // 4. Validate DAG
    if (!this.isDAG()) {
      throw new Error(`Cycle detected after indexing entry ${entry.id}`);
    }
    
    // 5. Persist
    await this.persistGraph();
    
    // 6. Update state
    await this.updateIndexState(entry.id, { status: 'synced' });
  }
  
  async expand(entryId: EntityId, hops: number = 2): Promise<EntityId[]> {
    const visited = new Set<EntityId>();
    const queue: Array<{ id: EntityId; depth: number }> = [
      { id: entryId, depth: 0 }
    ];
    
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      
      if (visited.has(id) || depth > hops) continue;
      visited.add(id);
      
      // Get neighbors (both in and out edges)
      const neighbors = [
        ...this.graph.neighbors(id),
        ...this.graph.inNeighbors(id)
      ];
      
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push({ id: neighbor, depth: depth + 1 });
        }
      }
    }
    
    return Array.from(visited);
  }
}
```

### PostgreSQL Schema

```sql
CREATE TABLE graph_nodes (
  entry_id UUID PRIMARY KEY REFERENCES knowledge_entries(id),
  node_type TEXT NOT NULL,
  label TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE graph_edges (
  source_id UUID REFERENCES knowledge_entries(id),
  target_id UUID REFERENCES knowledge_entries(id),
  edge_type TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (source_id, target_id, edge_type)
);

CREATE INDEX idx_edges_source ON graph_edges(source_id);
CREATE INDEX idx_edges_target ON graph_edges(target_id);
CREATE INDEX idx_edges_type ON graph_edges(edge_type);
```

---

## 协调 (Reconciliation)

启动时执行一致性协调，确保索引与存储数据一致。

### 协调流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Reconciliation Flow                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Server Startup                                                         │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Load All Entries                              │   │
│  │  - Load all APPROVED entries from store                          │   │
│  │  - Load all index state records                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Compare State                                 │   │
│  │                                                                    │ │
│  │  For each entry:                                                  │   │
│  │  1. entry in store but not in index → needs indexing             │   │
│  │  2. entry indexed but store says not approved → needs removal   │   │
│  │  3. entry version mismatch → needs re-indexing                  │   │
│  │  4. index state shows failed → retry                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Execute Corrections                          │   │
│  │                                                                    │ │
│  │  - Batch index missing entries                                   │   │
│  │  - Batch remove orphaned index entries                          │   │
│  │  - Retry failed entries with backoff                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Update Reconciliation Timestamp               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 实现细节

```typescript
async function reconcile(): Promise<ReconciliationReport> {
  const report: ReconciliationReport = {
    missing: [],
    orphaned: [],
    versionMismatch: [],
    retried: [],
    timestamp: new Date().toISOString()
  };
  
  // Load all approved entries
  const entries = await store.listKnowledgeEntries({
    filter: { lifecycleState: 'approved' }
  });
  const entryIds = new Set(entries.map(e => e.id));
  
  // Load all index states
  const indexStates = await store.listIndexStates();
  const indexedIds = new Set(indexStates.map(s => s.entryId));
  
  // Find missing (in store but not indexed)
  for (const entry of entries) {
    const state = indexStates.find(s => s.entryId === entry.id);
    if (!state || state.adapters.vector.status !== 'synced') {
      report.missing.push(entry.id);
    } else if (state.adapters.vector.documentVersion < entry.version) {
      report.versionMismatch.push(entry.id);
    }
  }
  
  // Find orphaned (indexed but not in store or not approved)
  for (const indexedId of indexedIds) {
    if (!entryIds.has(indexedId)) {
      report.orphaned.push(indexedId);
    }
  }
  
  // Execute corrections
  await Promise.all([
    ...report.missing.map(id => indexEntry(id)),
    ...report.orphaned.map(id => removeFromIndex(id)),
    ...report.versionMismatch.map(id => reindexEntry(id))
  ]);
  
  return report;
}
```

---

## 失败处理

### 重试策略

```typescript
interface RetryConfig {
  maxRetries: number;        // 最大重试次数
  initialDelayMs: number;    // 初始延迟
  maxDelayMs: number;        // 最大延迟
  backoffMultiplier: number; // 退避乘数
}

const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2
};

async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = defaultRetryConfig
): Promise<T> {
  let lastError: Error | undefined;
  let delay = config.initialDelayMs;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < config.maxRetries) {
        await sleep(delay);
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
      }
    }
  }
  
  throw lastError;
}
```

### 死信处理

连续失败达最大次数后，标记为 `failed` 并记录错误：

```typescript
await this.updateIndexState(entryId, {
  status: 'failed',
  error: error.message,
  retryCount: state.retryCount + 1
});
```

可由管理员手动触发重试：
```bash
POST /v1/operations/reindex/:entryId
```

---

## 并行执行

索引管道支持并行执行多个适配器：

```typescript
async indexAllAdapters(entry: KnowledgeEntry): Promise<void> {
  const results = await Promise.allSettled([
    this.vectorAdapter.index(entry),
    this.keywordAdapter.index(entry),
    this.graphAdapter.index(entry)
  ]);
  
  // Handle individual adapter failures
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      const adapterName = ['vector', 'keyword', 'graph'][i];
      console.error(`Adapter ${adapterName} failed:`, result.reason);
      // Continue with other adapters
    }
  }
}
```
