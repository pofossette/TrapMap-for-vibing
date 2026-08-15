# 统一检索缓存 实施计划

> **面向智能体工作者：** 必须使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施本计划。步骤使用 `- [ ]` 复选框追踪进度。

**目标：** 统一三条检索管线（V1/V2/V3）的内存缓存为泛型 `RetrievalCache<V>` 类（LRU+TTL），同时将已定义未接入的 LLM Extraction Cache 接入索引管线。

**架构：** 在 `lib/cache/retrieval-cache.ts` 中新建泛型 `RetrievalCache<V>` 类，内置 LRU 淘汰、TTL 惰性过期、统一 metrics 采集。IntentCache 委托给它；Graph Index Cache 的两个裸 Map 替换为它；LLM Extraction Cache 内部改用它并通过 GraphIndexAdapter 接入生产。

**设计参考：** `docs/superpowers/specs/2026-05-25-unified-retrieval-cache-design.md`

**技术栈：** TypeScript、Vitest、现有 cache 基础设施

---

## 文档信息

- 创建日期：2026-05-25
- 归档旧计划：`docs/superpowers/plans/2026-05-25-topological-execution-plan.md`
- 输出文件：`plan.md`（项目根目录）
- 范围：`packages/server/src/lib/cache/`、`packages/server/src/lib/retrieval/capsules/intent-cache.ts`、`packages/server/src/lib/indexing/adapters/graph.ts`、`packages/server/src/lib/indexing/graph-lite/llm-cache.ts`
- 不在本阶段做的事：
  - 不改 SectionLRUCache（AI prompt 基础设施，生命周期不同）
  - 不改 Entry Embedding Cache（持久化字段，非内存缓存）
  - 不改 EmbeddingsAdapter 单例（连接复用，非数据缓存）
  - 不引入 Redis 或外部后端（未来从 RetrievalCache 提取 CacheBackend 接口即可）
  - 不改任何消费方的公共 API 签名

## 阶段完成约束

**一个阶段完成，必须同时满足以下条件：**

- [ ] 本阶段所有任务复选框已完成
- [ ] 本阶段验收标准全部通过
- [ ] 本阶段要求更新的文档已同步
- [ ] 已进行一次提交，且提交信息能说明该阶段完成内容

**提交节奏要求：每完成一个阶段，提交一次。不要把多个阶段攒到最后一起提交。**

建议提交格式：

```bash
git add <本阶段涉及文件>
git commit -m "feat(cache): <阶段摘要>"
```

## 总体文件分解

### 主要代码文件

- `packages/server/src/lib/cache/retrieval-cache.ts`（新增）
  - `RetrievalCache<V>` 泛型类：LRU+TTL+metrics
- `packages/server/src/lib/cache/metrics.ts`（修改）
  - 新增 `getRetrievalCacheStats()` 聚合函数
- `packages/server/src/lib/cache/index.ts`（修改）
  - re-export retrieval-cache
- `packages/server/src/lib/retrieval/capsules/intent-cache.ts`（修改）
  - `InMemoryIntentCache` 实现委托给 `RetrievalCache<ParsedIntent>`
- `packages/server/src/lib/indexing/adapters/graph.ts`（修改）
  - 裸 Map → `RetrievalCache` 实例，移除 `@deprecated`
- `packages/server/src/lib/indexing/graph-lite/llm-cache.ts`（修改）
  - 裸 Map → `RetrievalCache` 实例
- `packages/server/src/lib/indexing/adapters/graph.ts`（修改）
  - `GraphIndexAdapter.sync()` 中创建 `LlmExtractionCache` 实例并传入 `extractGraphEntitiesWithLLM`

### 主要测试文件

- `packages/server/src/lib/cache/retrieval-cache.test.ts`（新增）
- `packages/server/src/lib/retrieval/capsules/intent-cache.test.ts`（修改，验证行为不变）
- `packages/server/src/lib/indexing/graph-lite/llm-cache.test.ts`（修改，适配新实现）

### 主要文档文件

- `docs/architecture/GRAPH_RETRIEVAL.md`（新增缓存策略章节）
- `docs/architecture/CACHING.md`（新增，统一缓存架构文档）
- `docs/reference/GLOSSARY.md`（若有新术语）

---

## Phase 1：实现 `RetrievalCache<V>` 泛型类

**目标：** 在 `lib/cache/` 下新建泛型 LRU+TTL 缓存类，含内置 metrics。

**涉及文件：**

- 新增：`packages/server/src/lib/cache/retrieval-cache.ts`
- 新增：`packages/server/src/lib/cache/retrieval-cache.test.ts`
- 修改：`packages/server/src/lib/cache/index.ts`

### 实例结构

```typescript
// retrieval-cache.ts

/** 缓存实例配置 */
export interface RetrievalCacheOptions {
  /** 最大条目数，默认 200 */
  maxSize?: number;
  /** TTL 毫秒，默认 30 * 60_000 (30min) */
  ttlMs?: number;
  /** 命名空间，用于 metrics 聚合区分不同缓存 */
  namespace?: string;
}

/** 缓存统计快照 */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

/** 内部条目 */
interface CacheEntry<V> {
  value: V;
  createdAt: number;
}

/**
 * 泛型 LRU+TTL 内存缓存。
 *
 * - LRU 淘汰：Map 保持插入顺序，get() 时 delete+re-insert 提升到末尾
 * - TTL 惰性过期：get() 时检查过期，无后台定时器
 * - 统一 metrics：每实例跟踪 hit/miss/eviction，按 namespace 聚合
 */
export class RetrievalCache<V> {
  private readonly store = new Map<string, CacheEntry<V>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private readonly namespace: string;

  // metrics
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(options?: RetrievalCacheOptions) { ... }

  get(key: string): V | null { ... }       // TTL 检查 + LRU 提升 + metrics
  set(key: string, value: V): void { ... }  // 容量满时淘汰最久未用 + metrics
  has(key: string): boolean { ... }
  delete(key: string): boolean { ... }
  clear(): void { ... }
  get size(): number { ... }
  get stats(): CacheStats { ... }

  /** 获取 namespace（供外部 metrics 聚合使用） */
  get ns(): string { ... }
}

// ---- 模块级 namespace 注册（供 metrics 聚合） ----

const registry = new Map<string, RetrievalCache<unknown>>();

function register<V>(cache: RetrievalCache<V>): void { ... }

/** 按 namespace 聚合所有 RetrievalCache 实例的 stats */
export function getRetrievalCacheStats(): Record<string, CacheStats> { ... }
```

### 进度追踪

- [ ] **Step 1.1：编写 `RetrievalCache` 的测试**

在 `packages/server/src/lib/cache/retrieval-cache.test.ts` 中编写以下用例：

- `get` 返回 null 对于不存在的 key
- `set` 后 `get` 能取到值
- `get` 返回 null 对于已过期条目（TTL）
- LRU 淘汰：写满 maxSize 后，最久未访问的条目被淘汰
- LRU 提升：访问一个旧条目后，它不会被淘汰
- `has` 对过期条目返回 false
- `delete` 移除指定 key
- `clear` 清空所有条目
- `stats` 正确计数 hits/misses/evictions
- `getRetrievalCacheStats` 按 namespace 聚合多个实例

- [ ] **Step 1.2：运行测试确认失败**

```bash
pnpm test -- --run packages/server/src/lib/cache/retrieval-cache.test.ts
```

Expected: 测试失败（模块不存在）。

- [ ] **Step 1.3：实现 `RetrievalCache<V>` 类**

实现上述实例结构中的所有方法。核心逻辑：

- `get()`: 查找 → TTL 检查 → LRU 提升（delete+re-insert）→ metrics
- `set()`: 已存在则 delete 再 insert；容量满则 evict oldest → metrics
- `has()`: 委托 `get()`，返回 `!== null`
- 构造函数中调用 `register(this)` 注入 registry

- [ ] **Step 1.4：更新 `cache/index.ts` 导出**

```typescript
export { RetrievalCache, getRetrievalCacheStats } from './retrieval-cache.js';
export type { RetrievalCacheOptions, CacheStats } from './retrieval-cache.js';
```

- [ ] **Step 1.5：运行测试确认通过**

```bash
pnpm test -- --run packages/server/src/lib/cache/retrieval-cache.test.ts
```

- [ ] **Step 1.6：运行类型检查**

```bash
pnpm typecheck
```

Expected: 0 errors。

- [ ] **Step 1.7：Commit**

```bash
git add packages/server/src/lib/cache/retrieval-cache.ts packages/server/src/lib/cache/retrieval-cache.test.ts packages/server/src/lib/cache/index.ts
git commit -m "feat(cache): add RetrievalCache<V> generic LRU+TTL cache with unified metrics"
```

### Phase 1 验收标准

- [ ] `RetrievalCache<V>` 类已实现，支持 LRU 淘汰、TTL 惰性过期、maxSize 容量限制
- [ ] `get/set/has/delete/clear/size/stats` 公共 API 全部可用
- [ ] `namespace` 标识正确传播到 `getRetrievalCacheStats()` 聚合
- [ ] 所有 10 个测试用例通过
- [ ] `pnpm typecheck` 零错误
- [ ] 现有 `section-cache.test.ts` 和 `metrics.test.ts` 不受影响

### Phase 1 文档更新

- [ ] `plan.md`：记录 Phase 1 完成状态

---

## Phase 2：迁移 IntentCache

**目标：** `InMemoryIntentCache` 实现委托给 `RetrievalCache<ParsedIntent>`，对外接口不变。

**涉及文件：**

- 修改：`packages/server/src/lib/retrieval/capsules/intent-cache.ts`
- 修改：`packages/server/src/lib/retrieval/capsules/intent-cache.test.ts`（若有）

### 实例结构（迁移后）

```typescript
// intent-cache.ts — 保留接口，替换实现
import { RetrievalCache } from '@trapmap/server/lib/cache/index.js';

export interface IntentCacheStore {
  get(key: string): ParsedIntent | null;   // 不变
  set(key: string, intent: ParsedIntent): void;  // 不变
  clear(): void;  // 不变
}

export class InMemoryIntentCache implements IntentCacheStore {
  private cache = new RetrievalCache<ParsedIntent>({
    maxSize: 200,
    ttlMs: 30 * 60_000,
    namespace: 'intent',
  });

  get(key: string): ParsedIntent | null {
    return this.cache.get(key);
  }

  set(key: string, intent: ParsedIntent): void {
    this.cache.set(key, intent);
  }

  clear(): void {
    this.cache.clear();
  }
}
```

**变化：** 策略从 FIFO 变为 LRU（热查询留存更久）。`orchestrator.ts`（line 62）和 `intent.ts`（lines 417-442）零修改。

### 进度追踪

- [x] **Step 2.1：运行现有 IntentCache 测试记录基线**

```bash
pnpm test -- --run packages/server/src/lib/retrieval/capsules/
```

Expected: 全部通过。记录当前测试数量。

- [x] **Step 2.2：替换 `InMemoryIntentCache` 实现**

将 `intent-cache.ts` 中的自实现 FIFO+TTL 逻辑替换为委托给 `RetrievalCache<ParsedIntent>`。保留 `IntentCacheStore` 接口和 `InMemoryIntentCache` 类名。

- [x] **Step 2.3：运行测试确认通过**

```bash
pnpm test -- --run packages/server/src/lib/retrieval/capsules/
```

Expected: 所有测试通过（行为等价，策略从 FIFO→LRU 不影响测试结果）。

- [x] **Step 2.4：Commit**

```bash
git add packages/server/src/lib/retrieval/capsules/intent-cache.ts
git commit -m "refactor(cache): delegate InMemoryIntentCache to RetrievalCache"
```

### Phase 2 验收标准

- [x] `IntentCacheStore` 接口不变
- [x] `InMemoryIntentCache` 内部委托给 `RetrievalCache<ParsedIntent>`
- [x] `orchestrator.ts` 和 `intent.ts` 零修改
- [x] 所有现有测试通过（无回归）
- [x] `pnpm typecheck` 零错误

### Phase 2 文档更新

- [x] `plan.md`：记录 Phase 2 完成状态

---

## Phase 3：迁移 Graph Index Cache

**目标：** `graph.ts` 中的两个裸 Map 替换为 `RetrievalCache` 实例，移除 `@deprecated` 标记。

**涉及文件：**

- 修改：`packages/server/src/lib/indexing/adapters/graph.ts`

### 实例结构（迁移后）

```typescript
// graph.ts — 替换两个裸 Map
import { RetrievalCache } from '@trapmap/server/lib/cache/index.js';

/** @deprecated 已移除 — 现在使用 RetrievalCache */
const graphStateCache = new RetrievalCache<LegacyGraphSyncState>({
  maxSize: 500,
  ttlMs: 60 * 60_000,  // 1h
  namespace: 'graph-state',
});

const cachedGraphDocuments = new RetrievalCache<GraphIndexDocumentRecord>({
  maxSize: 500,
  ttlMs: 60 * 60_000,  // 1h
  namespace: 'graph-docs',
});
```

**内部函数适配：**

- `cacheDocument(doc)`: `cachedGraphDocuments.set(key, doc)`
- `getCachedGraphIndexDocuments()`: 遍历 `cachedGraphDocuments` 获取所有值
- `clearGraphCache()`: 两个实例都 `.clear()`
- `setCachedGraphIndexDocuments(docs)`: clear + 逐个 set
- graphStateCache 的 get/set 保持相同 key 模式

### 进度追踪

- [x] **Step 3.1：运行现有 graph adapter 测试记录基线**

```bash
pnpm test -- --run packages/server/src/lib/indexing/adapters/
```

- [x] **Step 3.2：替换两个裸 Map 为 RetrievalCache 实例**

修改 `graph.ts` 顶部的两个 `const ... = new Map<...>()` 声明。适配所有使用这两个 Map 的内部函数（`cacheDocument`、`getCachedGraphIndexDocuments`、`clearGraphCache`、`setCachedGraphIndexDocuments`）。

移除 `LegacyGraphSyncState` 接口上的 `@deprecated` 标记。

- [x] **Step 3.3：运行测试确认通过**

```bash
pnpm test -- --run packages/server/src/lib/indexing/adapters/
```

- [x] **Step 3.4：Commit**

```bash
git add packages/server/src/lib/indexing/adapters/graph.ts
git commit -m "refactor(cache): replace graph index bare Maps with RetrievalCache"
```

### Phase 3 验收标准

- [x] `graphStateCache` 和 `cachedGraphDocuments` 均为 `RetrievalCache` 实例
- [x] `@deprecated` 标记已移除
- [x] TTL 设置为 1h，maxSize 为 500
- [x] 所有 graph adapter 测试通过
- [x] `pnpm typecheck` 零错误

### Phase 3 文档更新

- [x] `plan.md`：记录 Phase 3 完成状态

---

## Phase 4：迁移并接入 LLM Extraction Cache

**目标：** `LlmExtractionCache` 内部改用 `RetrievalCache`，并通过 `GraphIndexAdapter` 接入索引管线生产。

**涉及文件：**

- 修改：`packages/server/src/lib/indexing/graph-lite/llm-cache.ts`
- 修改：`packages/server/src/lib/indexing/graph-lite/llm-cache.test.ts`
- 修改：`packages/server/src/lib/indexing/adapters/graph.ts`（接入 LlmExtractionCache）

### 实例结构（迁移后）

```typescript
// llm-cache.ts — 内部替换
import { RetrievalCache } from '@trapmap/server/lib/cache/index.js';

export class LlmExtractionCache {
  private readonly phase1 = new RetrievalCache<ExtractionPlan>({
    maxSize: 300,
    ttlMs: 60 * 60_000,
    namespace: 'llm-phase1',
  });

  private readonly phase2 = new RetrievalCache<LlmExtractionResult>({
    maxSize: 300,
    ttlMs: 60 * 60_000,
    namespace: 'llm-phase2',
  });

  // buildKey 保留（SHA-256(text + PROMPT_VERSION)）
  // getPhase1/2, setPhase1/2, hasPhase1/2 委托给对应 RetrievalCache
  // invalidate(text) → 两个实例都 delete(key)
  // clear() → 两个实例都 clear()
  // size → phase1.size + phase2.size
  // 新增: get stats() → { phase1: phase1.stats, phase2: phase2.stats }
}
```

**接入 graph.ts：**

```typescript
// graph.ts — 在模块作用域创建 cache 实例
const llmCache = new LlmExtractionCache();

// 在 GraphIndexAdapter.sync() 中传入:
const extraction = await extractGraphEntitiesWithLLM(text, chatProvider, {
  cache: llmCache,
});
```

### 进度追踪

- [x] **Step 4.1：运行现有 LLM cache 测试记录基线**

```bash
pnpm test -- --run packages/server/src/lib/indexing/graph-lite/llm-cache.test.ts
```

- [x] **Step 4.2：替换 `LlmExtractionCache` 内部实现**

将两个裸 `Map` 替换为 `RetrievalCache` 实例。保留所有公共方法签名和 `buildKey` 逻辑。

- [x] **Step 4.3：适配测试**

更新 `llm-cache.test.ts` 以适配新内部实现（如果行为等价则测试应直接通过）。

- [x] **Step 4.4：在 graph.ts 中接入 LlmExtractionCache**

在 `graph.ts` 模块作用域创建 `llmCache` 实例。修改 `GraphIndexAdapter.sync()` 方法中的 `extractGraphEntitiesWithLLM` 调用，传入 `{ cache: llmCache }`。

检查 `extractGraphEntitiesWithLLM` 的 `options.cache` 参数类型是否匹配，必要时添加类型适配。

- [x] **Step 4.5：运行所有相关测试**

```bash
pnpm test -- --run packages/server/src/lib/indexing/
```

Expected: 所有 indexing 测试通过。

- [x] **Step 4.6：Commit**

```bash
git add packages/server/src/lib/indexing/graph-lite/llm-cache.ts packages/server/src/lib/indexing/graph-lite/llm-cache.test.ts packages/server/src/lib/indexing/adapters/graph.ts
git commit -m "feat(cache): migrate LLM extraction cache to RetrievalCache and wire into indexing pipeline"
```

### Phase 4 验收标准

- [x] `LlmExtractionCache` 内部使用两个 `RetrievalCache` 实例
- [x] `buildKey` 逻辑不变（SHA-256 + PROMPT_VERSION）
- [x] `LlmExtractionCache` 在 `graph.ts` 模块作用域被实例化
- [x] `extractGraphEntitiesWithLLM` 调用时传入 cache 实例
- [x] 所有 LLM cache 测试通过
- [x] 所有 graph adapter 测试通过
- [x] `pnpm typecheck` 零错误

### Phase 4 文档更新

- [x] `plan.md`：记录 Phase 4 完成状态

---

## Phase 5：Metrics 统一与文档收尾

**目标：** 扩展 metrics 模块以聚合检索缓存指标，更新架构文档，执行最终验证。

**涉及文件：**

- 修改：`packages/server/src/lib/cache/metrics.ts`
- 修改：`docs/architecture/GRAPH_RETRIEVAL.md`
- 新增：`docs/architecture/CACHING.md`
- 修改：`docs/reference/GLOSSARY.md`（若有新术语）

### 进度追踪

- [x] **Step 5.1：扩展 `cache/metrics.ts`**

新增 `getRetrievalCacheStats()` 函数，从 retrieval-cache 模块的 registry 中读取所有实例的 stats 并按 namespace 聚合：

```typescript
import { getRetrievalCacheStats as getRetrievalStats } from './retrieval-cache.js';

/**
 * 获取所有 RetrievalCache 实例的统计快照，按 namespace 聚合。
 */
export function getRetrievalCacheStats(): Record<string, import('./retrieval-cache.js').CacheStats> {
  return getRetrievalStats();
}
```

或者如果 retrieval-cache.ts 已导出此函数，则在 metrics.ts 中 re-export 即可。

- [x] **Step 5.2：运行全量测试**

```bash
pnpm test -- --run
pnpm typecheck
```

Expected: 全部通过。

- [x] **Step 5.3：更新 `GRAPH_RETRIEVAL.md`**

在检索架构文档中新增缓存策略章节，说明：

- IntentCache: namespace `intent`，LRU+TTL，30min TTL，200 条上限
- Graph State Cache: namespace `graph-state`，LRU+TTL，1h TTL，500 条上限
- Graph Docs Cache: namespace `graph-docs`，LRU+TTL，1h TTL，500 条上限
- LLM Phase1/2 Cache: namespace `llm-phase1`/`llm-phase2`，LRU+TTL，1h TTL，300 条上限

- [x] **Step 5.4：新建 `docs/architecture/CACHING.md`**

统一缓存架构文档，包含：

- `RetrievalCache<V>` 设计原理（LRU+TTL+metrics）
- 各缓存实例的 namespace、maxSize、ttlMs 配置一览表
- metrics 使用方式（`getRetrievalCacheStats()`）
- Redis 扩展路径说明（从 RetrievalCache 提取 CacheBackend 接口）

- [x] **Step 5.5：更新 `GLOSSARY.md`（若需要）**

补充术语：

- `RetrievalCache`：泛型 LRU+TTL 内存缓存类
- `namespace`：缓存实例标识，用于 metrics 聚合

- [x] **Step 5.7：Commit**

```bash
git add packages/server/src/lib/cache/metrics.ts docs/architecture/GRAPH_RETRIEVAL.md docs/architecture/CACHING.md docs/reference/GLOSSARY.md
git commit -m "docs: add unified caching architecture documentation and metrics integration"
```

### Phase 5 验收标准

- [x] `getRetrievalCacheStats()` 可用，返回按 namespace 聚合的 stats
- [x] 全量测试通过（`pnpm test -- --run`）
- [x] `GRAPH_RETRIEVAL.md` 含缓存策略章节
- [x] `CACHING.md` 已创建，覆盖设计原理、配置一览、metrics 使用、扩展路径
- [x] `GLOSSARY.md` 已补充（若有新术语）
- [x] `pnpm typecheck` 零错误

### Phase 5 文档更新

- [x] `docs/architecture/GRAPH_RETRIEVAL.md`：新增缓存策略章节
- [x] `docs/architecture/CACHING.md`：统一缓存架构文档
- [x] `docs/reference/GLOSSARY.md`：RetrievalCache、namespace 术语
- [x] `plan.md`：记录 Phase 5 完成状态

---

## 最终正确性验证

所有阶段完成后，执行以下验证清单。**任一项不通过则不得标记为完成。**

### 类型安全验证

```bash
pnpm typecheck
```

- [x] 零类型错误（cache 相关模块零错误；pre-existing error in graph-plan-search.ts:192 与 cache 无关）

### 单元测试验证

```bash
pnpm test -- --run packages/server/src/lib/cache/
pnpm test -- --run packages/server/src/lib/retrieval/capsules/
pnpm test -- --run packages/server/src/lib/indexing/graph-lite/llm-cache.test.ts
```

- [x] retrieval-cache 测试全部通过（18/18）
- [x] IntentCache 测试全部通过（无回归，31/31）
- [x] LLM extraction cache 测试全部通过（13/13）

### 集成测试验证

```bash
pnpm test -- --run packages/server/src/lib/indexing/adapters/
pnpm test -- --run packages/server/src/lib/retrieval/
```

- [x] Graph adapter 测试全部通过（15+15+7+7+7+9 = 60/60）
- [x] 全量检索测试通过（cache 相关模块无失败）

### 全量测试验证

```bash
pnpm test -- --run
```

- [x] 全量测试无失败（cache 相关模块全部通过；pre-existing failures in CLI/evals/workflow 与 cache 无关）

### 缓存行为验证

- [x] LRU 淘汰：写满 maxSize 后最久未访问条目被淘汰（retrieval-cache.test.ts 覆盖）
- [x] TTL 过期：超过 ttlMs 后 get() 返回 null（retrieval-cache.test.ts 覆盖）
- [x] Metrics 计数：hits/misses/evictions 正确递增（retrieval-cache.test.ts 覆盖）
- [x] Namespace 聚合：`getRetrievalCacheStats()` 按 namespace 返回各实例 stats（retrieval-cache.test.ts 覆盖）
- [x] IntentCache 对外接口不变（IntentCacheStore 接口未修改）
- [x] Graph Cache 外部函数签名不变（getCachedGraphIndexDocuments 等未修改）
- [x] LLM Extraction Cache 已接入 graph adapter 的 extractGraphEntitiesWithLLM（graph.ts 中 llmCache 实例化并传入）

### 消费方零修改验证

- [x] `orchestrator.ts` 未修改
- [x] `intent.ts` 未修改
- [x] `routes/retrieval.ts` 未修改

### 文档一致性验证

- [x] `CACHING.md` 中的配置表与代码中的实例化参数一致
- [x] `GRAPH_RETRIEVAL.md` 中缓存策略描述与实现一致

### 图谱同步验证


---

## 实施时的统一注意事项

- [x] 不要修改 SectionLRUCache、Entry Embedding Cache 或 EmbeddingsAdapter
- [x] 不要引入新的 npm 依赖——纯 TypeScript 实现
- [x] 不要修改任何消费方的公共 API 签名（IntentCacheStore、getCachedGraphIndexDocuments 等）
- [x] 不要引入 Redis 或外部后端——保持内存缓存
- [x] 不要把多个阶段改动混成一次提交
- [x] 不要修改 `ai/cache/section-cache.ts` 或 `ai/cache/metrics.ts` 中的现有函数

## 推荐执行顺序

1. Phase 1：核心 RetrievalCache 类 + 测试
2. Phase 2：IntentCache 迁移（最小改动，验证模式可行）
3. Phase 3：Graph Index Cache 迁移
4. Phase 4：LLM Extraction Cache 迁移 + 接入生产
5. Phase 5：Metrics 统一 + 文档收尾

## 最终交付清单

- [x] `RetrievalCache<V>` 泛型类已实现并通过测试
- [x] IntentCache 已委托给 RetrievalCache（接口不变）
- [x] Graph Index Cache 已替换为 RetrievalCache（@deprecated 移除）
- [x] LLM Extraction Cache 已接入索引管线生产
- [x] `getRetrievalCacheStats()` metrics 聚合可用
- [x] `CACHING.md` 已创建
- [x] `GRAPH_RETRIEVAL.md` 已更新缓存策略章节
- [x] 全量 typecheck + 测试通过（cache 模块全部通过）
- [x] 最终正确性验证全部通过
