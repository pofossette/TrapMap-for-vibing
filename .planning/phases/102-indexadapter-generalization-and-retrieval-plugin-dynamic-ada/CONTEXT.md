# Phase 102: IndexAdapter Generalization and Retrieval Plugin — Context

## Why This Phase Exists

当前 `IndexAdapter.kind` 是固定联合类型 `'vector' | 'keyword' | 'graph'`，`KnowledgeIndexStateRecord` 硬编码了三个适配器字段。新增索引通道需要修改类型定义、pipeline 逻辑和状态跟踪结构。

检索管道的召回通道（semantic/keyword/graph）在 orchestrator 中直接 import 调用，没有统一的 `RecallChannel` 接口。routing.ts 通过 if-else 分派 v1/v2/v3 版本，新增检索版本需要修改核心代码。

## Current Architecture (Before)

### Indexing
```typescript
// types.ts — 固定 kind
interface IndexAdapter {
  kind: 'vector' | 'keyword' | 'graph';   // 硬编码
  sync(document): Promise<IndexSyncResult>;
  remove(ref): Promise<void>;
}

// types.ts — 固定字段
interface KnowledgeIndexStateRecord {
  vector: AdapterSyncState;    // 硬编码
  keyword: AdapterSyncState;   // 硬编码
  graph: AdapterSyncState;     // 硬编码
}

// adapters/index.ts — 固定列表
function buildDefaultIndexAdapters(): IndexAdapter[] {
  return [vectorIndexAdapter, keywordIndexAdapter, graphIndexAdapter];
}
```

### Retrieval
```typescript
// orchestrator.ts — 直接 import 调用
import { semanticRecall } from './recall/semantic.js';
import { keywordRecall } from './recall/keyword.js';
import { graphAssistedRecall } from './recall/graph-assisted.js';

// routing.ts — if-else 版本分派
if (mode === 'semantic') { ... }
else if (mode === 'hybrid') { ... }
else if (mode === 'graph-assisted') { ... }
```

## Target Architecture (After)

### Indexing
```typescript
// AdapterRegistry
const registry = new AdapterRegistry();
registry.register(vectorAdapter);      // kind: 'vector'
registry.register(keywordAdapter);     // kind: 'keyword'
registry.register(graphAdapter);       // kind: 'graph'
registry.register(fullTextAdapter);    // kind: 'fulltext' — 新通道！

// 动态 IndexState
interface KnowledgeIndexStateRecord {
  contentHash: string;
  normalizedAt: string;
  adapters: Record<string, AdapterSyncState>;  // 动态 key
}

// pipeline fan-out
for (const adapter of registry.all()) {
  await adapter.sync(document);
}
```

### Retrieval
```typescript
// RecallChannel 接口
interface RecallChannel {
  name: string;
  recall(query: RecallQuery, ctx: RecallContext): Promise<RecallCandidate[]>;
}

// ChannelRegistry
const channels = new ChannelRegistry();
channels.register(semanticChannel);
channels.register(keywordChannel);
channels.register(graphChannel);

// RetrievalStrategy 接口
interface RetrievalStrategy {
  version: string;
  execute(query, channels, fusion): Promise<RetrievalResponse>;
}

// 策略注册表
const strategies = new StrategyRegistry();
strategies.register(new V1Strategy());
strategies.register(new V2Strategy());
strategies.register(new V3Strategy());

// routing.ts 简化
const strategy = strategies.get(requestedVersion);
return strategy.execute(query, channels, fusion);
```

## Key Files to Understand

### Indexing System
- `packages/server/src/lib/indexing/types.ts` — IndexAdapter, IndexSyncResult, KnowledgeIndexStateRecord
- `packages/server/src/lib/indexing/adapters/index.ts` — buildDefaultIndexAdapters, buildHybridIndexAdapters
- `packages/server/src/lib/indexing/adapters/vector.ts` — vector adapter 实现
- `packages/server/src/lib/indexing/adapters/keyword.ts` — keyword adapter 实现
- `packages/server/src/lib/indexing/adapters/graph.ts` — graph adapter 实现
- `packages/server/src/lib/indexing/adapters/pg-vector.ts` — PG vector adapter
- `packages/server/src/lib/indexing/adapters/pg-keyword.ts` — PG keyword adapter
- `packages/server/src/lib/indexing/pipeline.ts` — syncKnowledgeIndex (fan-out logic)

### Retrieval System
- `packages/server/src/lib/retrieval/types.ts` — RecallChannel, RecallCandidate, MergedCandidate 类型
- `packages/server/src/lib/retrieval/orchestrator.ts` — 主编排器（fan-out + merge）
- `packages/server/src/lib/retrieval/routing.ts` — 版本/模式分派
- `packages/server/src/lib/retrieval/recall-coordinator.ts` — 多通道召回协调
- `packages/server/src/lib/retrieval/recall/semantic.ts` — 语义召回
- `packages/server/src/lib/retrieval/recall/keyword.ts` — 关键词召回
- `packages/server/src/lib/retrieval/recall/graph-assisted.ts` — 图辅助召回
- `packages/server/src/lib/retrieval/merge.ts` — 结果合并
- `packages/server/src/lib/retrieval/rerank.ts` — 重排序
- `packages/server/src/lib/retrieval/assembly.ts` — 响应组装

### Contracts
- `packages/contracts/src/domain/retrieval.ts` — RetrievalQuery, RetrievalResponse, RetrievalMode schemas

## Constraints

- **IndexState migration** — 已有 StoreData 中的 KnowledgeIndexStateRecord 需要兼容读取
- **Pipeline sequential semantics** — 当前适配器顺序执行（非并行），新架构需保持此语义或显式支持并行
- **Score normalization** — 不同通道的评分尺度不同（cosine 0-1, BM25 无上限, graph 关系强度），融合前需归一化
- **No behavior change** — 默认行为不变，新能力是扩展点

## Risks

- KnowledgeIndexStateRecord 结构变更影响 StoreData 序列化（Json/PG 都有）
- RecallChannel 接口可能需要多次迭代才能找到合适的抽象粒度
- 性能：注册表查找比直接 import 慢，但在 hot path 上影响可忽略

## Dependencies

- Phase 101: Lifecycle State Machine（事件驱动后，索引触发已解耦，更容易替换适配器实现）
- Phase 100: Store Repository Pattern（KnowledgeIndexStateRecord 的读写通过 repo 接口）
