# 统一缓存架构

## 概述

TrapMap 使用统一的 `RetrievalCache<V>` 泛型类管理所有内存缓存实例。该类提供 LRU 淘汰、惰性 TTL 过期和内置 metrics，是图检索系统的核心基础设施。

---

## 一、RetrievalCache<V> 设计

### 1.1 核心特性

| 特性 | 实现方式 |
|------|---------|
| **LRU 淘汰** | 基于 `Map` 插入序，get 时 delete+re-insert 提升到最近使用位置；满容量时淘汰最旧条目 |
| **惰性 TTL** | `get()` 时检查 `Date.now() - createdAt > ttlMs`，过期条目惰性删除，无后台定时器 |
| **内置 Metrics** | 跟踪 hits、misses、evictions、size、hitRate |
| **全局聚合** | `WeakRef` 注册 + `FinalizationRegistry` 自动清理，`getRetrievalCacheStats()` 按 namespace 汇总 |

### 1.2 API

```typescript
class RetrievalCache<V> {
  constructor(options?: RetrievalCacheOptions);

  get(key: string): V | null;      // 检索 + LRU 提升 + metrics 计数
  set(key: string, value: V): void; // 插入/更新，满容量时淘汰 LRU
  has(key: string): boolean;        // 存在性检查（不影响 metrics）
  delete(key: string): boolean;     // 删除指定 key
  clear(): void;                    // 清空全部
  get size(): number;               // 当前条目数
  get stats(): CacheStats;          // metrics 快照
  *values(): IterableIterator<V>;   // 遍历所有未过期值（惰性清理）
  get ns(): string;                 // namespace 标识
}
```

### 1.3 设计决策

- **Map 而非 LinkedHashMap**：V8 的 `Map` 保持插入序，delete+re-insert 即可实现 LRU 提升，无需额外数据结构。
- **无后台定时器**：TTL 检查完全惰性，避免 setInterval 的内存和生命周期问题。
- **WeakRef 注册**：缓存实例被 GC 回收后自动从全局注册表移除，metrics 聚合不会泄漏。

---

## 二、缓存实例配置

| 缓存名称 | namespace | maxSize | TTL | 值类型 | 位置 |
|----------|-----------|---------|-----|--------|------|
| Query Embedding Cache | `query-embedding` | 300 | 20 min | `number[]` | `packages/server/src/lib/cache/query-embedding-cache.ts` |
| IntentCache | `intent` | 200 | 30 min | `ParsedIntent` | `packages/server/src/lib/retrieval/capsules/intent-cache.ts` |
| Graph State Cache | `graph-state` | 500 | 1 h | `LegacyGraphSyncState` | `packages/server/src/lib/indexing/adapters/graph.ts` |
| Graph Docs Cache | `graph-docs` | 500 | 1 h | `GraphIndexDocumentRecord` | `packages/server/src/lib/indexing/adapters/graph.ts` |
| LLM Phase1 Cache | `llm-phase1` | 300 | 1 h | `ExtractionPlan` | `packages/server/src/lib/indexing/graph-lite/llm-cache.ts` |
| LLM Phase2 Cache | `llm-phase2` | 300 | 1 h | `LlmExtractionResult` | `packages/server/src/lib/indexing/graph-lite/llm-cache.ts` |

**默认值**：`maxSize: 200`, `ttlMs: 30 * 60_000` (30 min), `namespace: 'default'`。

---

## 三、Metrics 使用

### 3.1 聚合函数

```typescript
import { getRetrievalCacheStats } from '@trapmap/server/lib/cache/metrics.js';

const stats = getRetrievalCacheStats();
// {
//   'query-embedding': { hits, misses, evictions, size, hitRate },
//   'intent':      { hits, misses, evictions, size, hitRate },
//   'graph-state': { hits, misses, evictions, size, hitRate },
//   'graph-docs':  { ... },
//   'llm-phase1':  { ... },
//   'llm-phase2':  { ... },
// }
```

### 3.2 聚合机制

- 每个 `RetrievalCache` 实例在构造时通过 `WeakRef` 注册到模块级 `liveCaches` 集合。
- `getRetrievalCacheStats()` 遍历所有存活实例，按 namespace 汇总 hits/misses/evictions/size，重新计算 hitRate。
- 同一 namespace 下的多个实例（如两个 `graph-state` 缓存）会被合并统计。
- `FinalizationRegistry` 确保实例被 GC 后自动移除，无需手动清理。

### 3.3 CacheStats 接口

```typescript
interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;  // hits / (hits + misses)
}
```

---

## 四、Redis 扩展路径

当前 `RetrievalCache<V>` 是纯内存实现，未来可扩展为 Redis 后端：

1. **提取 `CacheBackend` 接口**：从 `RetrievalCache` 中抽象出 `get`/`set`/`delete`/`clear`/`size` 的后端接口。
2. **实现 `RedisCacheBackend`**：使用 `ioredis` 或 `redis` 客户端实现同一接口。
3. **配置驱动切换**：通过环境变量或配置项选择内存或 Redis 后端。
4. **序列化层**：Redis 后端需要 JSON 序列化/反序列化，内存后端直接持有引用。

此扩展路径不影响现有 `RetrievalCache<V>` 的 API 和使用方式，只需替换内部存储后端。

---

## 五、关键源文件

| 文件 | 职责 |
|------|------|
| `packages/server/src/lib/cache/retrieval-cache.ts` | `RetrievalCache<V>` 核心实现 + `getRetrievalCacheStats()` + `clearRetrievalCacheRegistry()` |
| `packages/server/src/lib/cache/metrics.ts` | metrics 入口（re-export `getRetrievalCacheStats` 和 `CacheStats`） |
| `packages/server/src/lib/cache/retrieval-cache.test.ts` | 单元测试 |
| `packages/server/src/lib/retrieval/capsules/intent-cache.ts` | IntentCache 封装 |
| `packages/server/src/lib/indexing/adapters/graph.ts` | Graph State / Docs Cache |
| `packages/server/src/lib/indexing/graph-lite/llm-cache.ts` | LLM Extraction Cache |
