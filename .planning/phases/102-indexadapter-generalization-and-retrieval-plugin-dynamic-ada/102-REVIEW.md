---
status: issues_found
phase: 102
depth: standard
files_reviewed: 22
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
reviewed: "2026-05-07"
---

# Phase 102: Code Review Report

**Reviewed:** 2026-05-07
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Phase 102 generalized the IndexAdapter from hardcoded adapter arrays to a dynamic `AdapterRegistry`, and introduced `ChannelRegistry` and `StrategyRegistry` for the retrieval subsystem. The architecture is sound and the pattern is applied consistently at the registry level. However, the review found one critical runtime crash vector, several behavioral bugs around the `remove()` overload pattern and deprecated field access, and a type-safety gap where the keyword persisted state type is incomplete.

## Critical Issues

### CR-01: semanticChannel.recall() crashes at runtime — `undefined` cast past type system

**File:** `packages/server/src/lib/retrieval/recall/semantic.ts:339`
**Issue:** `optimizedSemanticRecall` is called with `undefined as unknown as RetrievalQuery['filters']`. This compiles but `undefined` reaches `computeScore()` at runtime, which accesses `filters.labels.length` (line 77) and `filters.scopes.length` (line 84). Any code path that calls `semanticChannel.recall()` will throw `TypeError: Cannot read properties of undefined (reading 'labels')`.

Currently the `channelRegistry` is wired but the registered strategies bypass it (they call `semanticRecall`/`hybridRecall` directly), so this crash is dormant. However, the channel is registered and the crash will activate the moment any code calls `channelRegistry.get('semantic')!.recall(...)`.

**Fix:** Pass empty filters when used as a channel, or make filters optional in `computeScore` with safe defaults.

## Warnings

### WR-01: vector and keyword adapter `remove()` is a silent no-op for the IndexAdapter single-argument call pattern

**Files:** `packages/server/src/lib/indexing/adapters/vector.ts:68-71`, `packages/server/src/lib/indexing/adapters/keyword.ts:103-106`
**Issue:** Both adapters define two overloads for `remove()` — one taking `(ref)` and one taking `(entry, ref)`. The implementation checks `if (!maybeRef) { return; }`, which means the single-argument form (matching the `IndexAdapter` interface) always returns immediately without doing anything. The pipeline calls `adapter.remove({ entryId, revision })` with one argument, so vector and keyword removes are no-ops.

### WR-02: Deprecated `indexState.keyword` and `indexState.vector` fields read but never written by new pipeline

**Files:** `packages/server/src/lib/retrieval/recall/keyword.ts:67-77`, `packages/server/src/lib/retrieval/recall/semantic.ts:101-109`
**Issue:** The keyword recall `tokenizeEntry()` reads from the deprecated top-level `entry.indexState?.keyword` field, and the semantic recall `getEntryEmbedding()` reads from `entry.indexState?.vector`. The new pipeline writes only to `entry.indexState.adapters.keyword` and `entry.indexState.adapters.vector` respectively. The deprecated paths are never populated, losing persisted-token optimization for keyword and relying on cache fallback for semantic.

### WR-03: keyword adapter error handler writes to deprecated `indexState.keyword` field (dead code)

**File:** `packages/server/src/lib/indexing/adapters/keyword.ts:205-206`
**Issue:** The catch block writes to `entry.indexState?.keyword` (deprecated top-level field). Since the new pipeline populates `entry.indexState.adapters.keyword`, this error-recording code never executes. Failed sync states are silently lost.

### WR-04: KeywordAdapterSyncState type omits boundaryFacets from persistedState

**File:** `packages/server/src/lib/indexing/types.ts:70-80`
**Issue:** `KeywordAdapterSyncState.persistedState` declares `tokens` and `fieldTokens` but not `boundaryFacets`. The keyword adapter's `PersistedKeywordState` includes `boundaryFacets`. TypeScript consumers cannot access `persistedState.boundaryFacets` without a type assertion.

### WR-05: `cleanupStaleIndexes` generates invalid SQL when no knowledge entries exist

**File:** `packages/server/src/lib/persistence/backfill-indexes.ts:159-164`
**Issue:** When `validEntryIds` is empty, the generated SQL becomes `DELETE FROM knowledge_embeddings WHERE entry_id NOT IN () RETURNING id`, which is a PostgreSQL syntax error.

## Info

### IN-01: `ChannelRegistry` is wired but never used by retrieval strategies

**File:** `packages/server/src/app.ts:174-180`
**Issue:** The `ChannelRegistry` is created and channels are registered, but all three strategy implementations receive it as `_channels` and never use it. The channel registry is effectively dead code at runtime.

### IN-02: `dispatchByMode` error message leaks internal strategy version strings to API consumers

**File:** `packages/server/src/lib/retrieval/recall-coordinator.ts:91`
**Issue:** The error message exposes the full set of registered strategy versions through the API error response.

### IN-03: `StrategyRegistry.register()` silently overwrites, inconsistent with other registries

**File:** `packages/server/src/lib/retrieval/strategy-registry.ts:41-43`
**Issue:** `AdapterRegistry.register()` and `ChannelRegistry.register()` both throw on duplicate registration, but `StrategyRegistry.register()` silently overwrites.

### IN-04: Significant code duplication between keyword adapter methods and standalone functions

**File:** `packages/server/src/lib/indexing/adapters/keyword.ts`
**Issue:** `KeywordIndexAdapter.upsert()` and standalone `upsertKeywordIndex()` contain nearly identical logic.
