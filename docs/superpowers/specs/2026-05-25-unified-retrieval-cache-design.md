# Unified Retrieval Cache Design

**Date**: 2026-05-25
**Status**: Approved
**Scope**: Unify in-memory caches across V1/V2/V3 retrieval pipelines and wire up LLM extraction cache

## Background

The three retrieval pipelines (V1/V2/V3) each implement caching independently:

| Cache | Pipeline | Implementation | Eviction | TTL |
|---|---|---|---|---|
| InMemoryIntentCache | V2 | Custom class (42 lines) | FIFO | 30min |
| Graph Index Cache (2 Maps) | V1 | Bare `Map` | None | None |
| LLM Extraction Cache | Indexing | Defined but unwired | None | None |

Problems:
- No shared abstraction — each cache reimplements Map-based storage, no unified metrics
- Graph Index Cache grows unboundedly (no eviction, no TTL)
- LLM Extraction Cache is fully tested but never instantiated in production
- Inconsistent strategies (FIFO vs none vs none)

Non-targets (remain independent):
- SectionLRUCache — AI prompt infrastructure, different lifecycle
- Entry Embedding Cache — persisted denormalized field on records
- EmbeddingsAdapter singleton — connection reuse, not a data cache

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Unification scope | Retrieval in-memory caches only | Embedding cache is persisted; SectionCache is AI infra |
| Eviction strategy | LRU + TTL + maxSize | Hot data stays longer; bounded memory |
| LLM Extraction Cache | Wire into indexing pipeline | Code + tests already exist |
| Metrics | Unified hit/miss/eviction tracking | Consistent observability across all retrieval caches |
| Graph Cache treatment | Replace deprecated Maps | Remove unbounded growth; keep same external API |
| Future extensibility | Extract CacheBackend interface from RetrievalCache when Redis is needed | Avoid premature abstraction; single-file refactor |

## Core Class: `RetrievalCache<V>`

**File**: `packages/server/src/lib/cache/retrieval-cache.ts`

```typescript
interface RetrievalCacheOptions {
  maxSize?: number;      // Default: 200
  ttlMs?: number;        // Default: 30 * 60_000 (30min)
  namespace?: string;    // For metrics aggregation, e.g. "intent", "graph-state"
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

class RetrievalCache<V> {
  // Map preserves insertion order; delete+re-insert = LRU promotion
  private store = new Map<string, { value: V; createdAt: number }>();

  get(key: string): V | null;       // Lazy TTL expiry + LRU promotion
  set(key: string, value: V): void; // Evict LRU entry when at capacity
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  get size(): number;
  get stats(): CacheStats;
}
```

**Key design points**:
- String keys only (SHA-256 or concatenated strings) — matches all three current key patterns
- Generic value type `V` — each instance declares its own value type
- LRU via Map insertion order: `get()` does delete+re-insert to move entry to end; `set()` evicts the first entry (least recently used) when at capacity
- TTL checked lazily on `get()` — no background timer
- `namespace` option for metrics identification; stats collected per-namespace

## Migration Plan

### 2a. IntentCache (V2 Pipeline)

**Current**: `InMemoryIntentCache` — custom FIFO+TTL, 42 lines
**After**: Implementation delegates to `RetrievalCache<ParsedIntent>`

```typescript
// intent-cache.ts — interface preserved, implementation replaced
export class InMemoryIntentCache implements IntentCacheStore {
  private cache = new RetrievalCache<ParsedIntent>({
    maxSize: 200, ttlMs: 30 * 60_000, namespace: 'intent'
  });
  get(key) { return this.cache.get(key); }
  set(key, value) { this.cache.set(key, value); }
  clear() { this.cache.clear(); }
}
```

- `IntentCacheStore` interface unchanged — zero consumer changes
- Strategy changes from FIFO to LRU (hot queries stay longer)
- orchestrator.ts and intent.ts require no modifications

### 2b. Graph Index Cache (V1 Pipeline)

**Current**: Two bare `Map` objects (`graphStateCache` + `cachedGraphDocuments`), no TTL/LRU, `@deprecated`
**After**: Two `RetrievalCache` instances

```typescript
const graphStateCache = new RetrievalCache<LegacyGraphSyncState>({
  maxSize: 500, ttlMs: 60 * 60_000, namespace: 'graph-state'
});
const cachedGraphDocuments = new RetrievalCache<GraphIndexDocumentRecord>({
  maxSize: 500, ttlMs: 60 * 60_000, namespace: 'graph-docs'
});
```

- Remove `@deprecated` annotation
- External function signatures unchanged (`getCachedGraphIndexDocuments`, `cacheDocument`, etc.)
- Add TTL (1h) and LRU eviction — resolves unbounded memory growth
- `clearGraphCache()` clears both instances

### 2c. LLM Extraction Cache (Indexing Pipeline)

**Current**: `LlmExtractionCache` class defined + tested but not instantiated in production
**After**: Internal Maps replaced with `RetrievalCache`; wired into `GraphIndexAdapter`

```typescript
// llm-cache.ts — internal replacement
export class LlmExtractionCache {
  private phase1 = new RetrievalCache<ExtractionPlan>({
    maxSize: 300, ttlMs: 60 * 60_000, namespace: 'llm-phase1'
  });
  private phase2 = new RetrievalCache<LlmExtractionResult>({
    maxSize: 300, ttlMs: 60 * 60_000, namespace: 'llm-phase2'
  });
  // buildKey, getPhase1/2, setPhase1/2, hasPhase1/2, invalidate, clear, size preserved
}
```

**Wiring**: `GraphIndexAdapter` in `graph.ts` becomes a stateful adapter holding an `LlmExtractionCache` instance. The cache is passed to `extractGraphEntitiesWithLLM(options)` via the existing optional `options.cache` parameter.

## Metrics

`RetrievalCache` tracks per-instance stats (hits, misses, evictions, size, hitRate) via the `namespace` option.

The existing `ai/cache/metrics.ts` is extended with:

```typescript
export function getRetrievalCacheStats(): Record<string, CacheStats>;
```

This aggregates stats from all `RetrievalCache` instances by namespace. The existing `trackCacheHit`/`trackCacheMiss` functions for SectionCache remain unchanged.

## File Changes

```
packages/server/src/lib/cache/
├── retrieval-cache.ts          NEW: RetrievalCache<V> generic class
├── retrieval-cache.test.ts     NEW: LRU eviction, TTL expiry, metrics, clear
├── metrics.ts                  MODIFY: add getRetrievalCacheStats()
└── index.ts                    MODIFY: re-export retrieval-cache

packages/server/src/lib/retrieval/capsules/
├── intent-cache.ts             MODIFY: delegate to RetrievalCache
└── intent.ts                   NO CHANGE

packages/server/src/lib/indexing/
├── adapters/graph.ts           MODIFY: Map → RetrievalCache, remove @deprecated
└── graph-lite/
    └── llm-cache.ts            MODIFY: Map → RetrievalCache
```

**Total**: 1 new file + 1 new test file + 4 modified files. Zero consumer API changes.

## Out of Scope

- SectionLRUCache — remains independent (AI prompt infrastructure)
- Entry Embedding Cache — remains a persisted denormalized field
- EmbeddingsAdapter singleton — remains a process-lifetime connection cache
- Redis/external backend — deferred; extracting `CacheBackend<V>` from `RetrievalCache` is a single-file refactor when needed

## Testing

- `retrieval-cache.test.ts`: LRU eviction order, TTL expiry, maxSize enforcement, stats tracking, clear
- `intent-cache.test.ts`: existing tests pass unchanged (behavior identical except FIFO→LRU)
- `llm-cache.test.ts`: adapt to new internal implementation, verify phase1/2 caching still works
- Graph cache: covered through graph adapter integration tests (no standalone test currently)
