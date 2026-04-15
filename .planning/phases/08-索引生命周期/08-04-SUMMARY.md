---
phase: 08-索引生命周期
plan: "04"
subsystem: lifecycle-driven-indexing
tags: [lifecycle, indexing, adapters, vector, keyword, tdd]
wave: 2
dependency_graph:
  requires:
    - id: "08-01"
      reason: "pipeline.ts and normalize.ts from 08-01 provide sync and normalization functions"
    - id: "08-02"
      reason: "events.ts from 08-02 provides lifecycle trigger mapping for adapter implementations"
  provides:
    - id: "08-03"
      reason: "vector and keyword adapters enable update/deactivate index side effects"
  affects:
    - component: "retrieval/recall/semantic.ts"
      impact: "now prefers persisted indexState.vector for synced entries, reducing query-time embedding computation"
    - component: "retrieval/recall/keyword.ts"
      impact: "now reuses persisted keyword tokens for synced entries, reducing query-time tokenization"
tech_stack:
  added:
    - "vector index adapter: vectorIndexAdapter with upsert/remove semantics"
    - "keyword index adapter: keywordIndexAdapter with persisted token sets"
    - "query-time helpers: getVectorPayload(), getIndexedKeywordTokens(), hasIndexedKeywordTokens()"
  patterns:
    - "Idempotent adapters: upsert skips work when revision/contentHash match"
    - "Migration compatibility: vector adapter mirrors to embeddingCache for legacy entries"
    - "Query-time reuse: retrieval modules prefer persisted state, fall back to computation"
key_files:
  created:
    - path: "packages/server/src/lib/indexing/adapters/vector.ts"
      provides: "vector index adapter with embedding generation and persistence"
    - path: "packages/server/src/lib/indexing/adapters/keyword.ts"
      provides: "keyword index adapter with token set persistence"
    - path: "packages/server/src/lib/indexing/adapters/index.ts"
      provides: "adapter exports and helper functions"
  modified:
    - path: "packages/server/src/lib/retrieval/recall/semantic.ts"
      provides: "updated getEntryEmbedding() to prefer persisted vectors"
    - path: "packages/server/src/lib/retrieval/recall/keyword.ts"
      provides: "updated tokenizeEntry() to reuse persisted tokens"
decisions:
  - decision: "Store keyword tokens in entry.keywordIndexCache instead of indexState.keyword.persistedState"
    rationale: "Keeps indexState.keyword minimal (sync metadata only) while storing payload separately, similar to how embeddingCache works for vectors"
    alternatives: ["Store tokens directly in indexState.keyword", "Create a separate keyword store collection"]
  - decision: "Vector adapter mirrors to embeddingCache for backward compatibility"
    rationale: "Allows gradual migration - existing code that reads embeddingCache continues to work while new code prefers indexState.vector"
    alternatives: ["Break embeddingCache immediately", "Maintain dual writes indefinitely"]
  - decision: "Adapter sync() returns IndexSyncResult but doesn't persist to store directly"
    rationale: "The pipeline owns persistence and wraps adapter calls in store.transact(), keeping adapters focused on index operations only"
    alternatives: ["Adapters call store.transact() internally", "Adapters return payloads and let pipeline persist"]
metrics:
  duration: "5m 14s"
  started_at: "2026-04-15T02:05:50Z"
  completed_at: "2026-04-15T02:11:04Z"
  tasks_completed: 2
  files_created: 3
  files_modified: 2
  tests_added: 14
  tests_passing: 119
---

# Phase 08 Plan 04: Vector and Keyword Adapters Summary

Implement concrete vector and keyword index adapters that persist index state and reduce query-time recomputation for synced entries.

## One-Liner

Lifecycle-driven vector and keyword adapters with idempotent upsert/remove semantics and persisted index state for query-time reuse.

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written.

## Artifacts Created

### Vector Index Adapter (`packages/server/src/lib/indexing/adapters/vector.ts`)

```typescript
export const vectorIndexAdapter: IndexAdapter = {
  kind: 'vector',
  async sync(document: NormalizedIndexDocument): Promise<IndexSyncResult> {
    // Generates embedding and returns success
    // Pipeline handles persistence to entry.indexState.vector
  },
  async remove(ref: { entryId: string; revision: number }): Promise<void> {
    // Pipeline handles removal from entry.indexState.vector
  },
};

export async function upsertVectorIndex(
  entry: KnowledgeRecord,
  normalizedDocument: NormalizedIndexDocument,
): Promise<IndexSyncResult> {
  // Idempotent: skips if revision/contentHash match
  // Persists to entry.indexState.vector and mirrors to embeddingCache
}

export function removeVectorIndex(entry: KnowledgeRecord): void {
  // Clears indexState.vector and embeddingCache
}

export function getVectorPayload(entry: KnowledgeRecord): VectorIndexPayload | null {
  // Returns persisted vector or null
}
```

**Security properties:**
- Only operates on approved entries (pipeline gates on lifecycleState)
- Idempotent based on revision and contentHash (T-08-04)
- Mirrors to embeddingCache for migration compatibility

### Keyword Index Adapter (`packages/server/src/lib/indexing/adapters/keyword.ts`)

```typescript
export const keywordIndexAdapter: IndexAdapter = {
  kind: 'keyword',
  async sync(document: NormalizedIndexDocument): Promise<IndexSyncResult> {
    // Builds keyword payload and returns success
    // Pipeline handles persistence to entry.indexState.keyword
  },
  async remove(ref: { entryId: string; revision: number }): Promise<void> {
    // Pipeline handles removal from entry.indexState.keyword
  },
};

export async function upsertKeywordIndex(
  entry: KnowledgeRecord,
  normalizedDocument: NormalizedIndexDocument,
): Promise<IndexSyncResult> {
  // Idempotent: skips if revision/contentHash match
  // Persists to entry.keywordIndexCache
}

export function removeKeywordIndex(entry: KnowledgeRecord): void {
  // Clears indexState.keyword and keywordIndexCache
}

export function getIndexedKeywordTokens(entry: KnowledgeRecord): KeywordIndexPayload | null {
  // Returns persisted tokens or null
}

export function hasIndexedKeywordTokens(entry: KnowledgeRecord): boolean {
  // Checks if persisted tokens are available
}
```

**Security properties:**
- Only operates on approved entries (pipeline gates on lifecycleState)
- Idempotent based on revision and contentHash (T-08-04)
- Stores normalized tokens per field for efficient query-time reuse

### Retrieval Read Path Updates

**Semantic recall (`packages/server/src/lib/retrieval/recall/semantic.ts`):**

```typescript
export async function getEntryEmbedding(entry: KnowledgeRecord): Promise<number[]> {
  const text = buildEmbeddingText(entry);
  const textHash = hashEmbeddingText(text);

  // Phase 8: Prefer persisted indexState.vector for synced entries
  if (
    entry.indexState?.vector?.status === 'synced' &&
    entry.indexState.vector.revision === entry.history.length &&
    entry.indexState.vector.contentHash === textHash
  ) {
    // Use persisted vector from embeddingCache (mirrored by vector adapter)
    if (entry.embeddingCache?.embedding) {
      return entry.embeddingCache.embedding;
    }
  }

  // Fall back to legacy embeddingCache for entries without synced state
  // ... (existing logic)
}
```

**Keyword recall (`packages/server/src/lib/retrieval/recall/keyword.ts`):**

```typescript
function tokenizeEntry(entry: KnowledgeRecord): {
  shortcut: Set<string>;
  detail: Set<string>;
  labels: Set<string>;
} {
  // Phase 8: Check for persisted keyword state in keywordIndexCache
  const keywordCache = (entry as any).keywordIndexCache;
  if (
    entry.indexState?.keyword?.status === 'synced' &&
    keywordCache?.tokens &&
    Array.isArray(keywordCache.tokens)
  ) {
    // Use persisted tokens
    return {
      shortcut: new Set(keywordCache.shortcutTokens || []),
      detail: new Set(keywordCache.detailTokens || []),
      labels: new Set(keywordCache.labelTokens || []),
    };
  }

  // Fall back to query-time tokenization for legacy entries
  // ... (existing logic)
}
```

## Key Links Verified

✅ `vector.ts` → `embeddingCache` via mirroring for backward compatibility
✅ `keyword.ts` → `keywordIndexCache` for persisted token storage
✅ `semantic.ts` → `indexState.vector` via freshness checks before using embeddingCache
✅ `keyword.ts` → `keywordIndexCache` via status check before using persisted tokens
✅ Adapters implement `IndexAdapter` contract from `types.ts`

## Threat Mitigations

| Threat ID | Mitigation |
|-----------|------------|
| T-08-04 | Vector adapter skips stale rewrites when revision/contentHash match |
| T-08-04 | Keyword adapter idempotency based on revision/contentHash |
| T-08-05 | Adapters operate only on approved entries (pipeline gate) |
| T-08-08 | Retrieval modules verify sync status before using persisted state |

## Verification Results

```bash
pnpm --filter @skill-shareer/server test -- --run
# Test Files: 10 passed (10)
# Tests: 119 passed (119)
```

All acceptance criteria met:
- ✅ `test -f packages/server/src/lib/indexing/adapters/vector.test.ts`
- ✅ `test -f packages/server/src/lib/indexing/adapters/keyword.test.ts`
- ✅ `rg -n "indexState\.vector\.status === 'synced'" packages/server/src/lib/retrieval/recall/semantic.ts`
- ✅ `rg -n "keywordIndexCache" packages/server/src/lib/retrieval/recall/keyword.ts`
- ✅ `rg -n "export const vectorIndexAdapter|export const keywordIndexAdapter" packages/server/src/lib/indexing/adapters/`
- ✅ All 119 tests passing

## Known Stubs

None - all adapter behavior is implemented and tested.

## Next Steps

Plan 08-03 (if not yet completed) will integrate these adapters with the update and deactivate workflows to ensure index state stays in sync with lifecycle changes.

## Self-Check: PASSED

**Created Files:**
- ✅ `packages/server/src/lib/indexing/adapters/vector.ts`
- ✅ `packages/server/src/lib/indexing/adapters/keyword.ts`
- ✅ `packages/server/src/lib/indexing/adapters/index.ts`

**Modified Files:**
- ✅ `packages/server/src/lib/retrieval/recall/semantic.ts`
- ✅ `packages/server/src/lib/retrieval/recall/keyword.ts`

**Commits:**
- ✅ `f93ceb3`: feat(08-04): implement vector and keyword adapters with persisted index state read path

**Tests:**
- ✅ 119 tests passing
- ✅ All vector adapter tests passing
- ✅ All keyword adapter tests passing
- ✅ All retrieval tests passing
