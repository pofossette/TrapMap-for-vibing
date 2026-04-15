---
phase: 08-索引生命周期
plan: "03"
type: execute
wave: 2
completed_date: "2026-04-15"
duration_minutes: 17
tasks_completed: 2
total_tasks: 2
subsystem: lifecycle-driven indexing
tags: [indexing, adapters, retrieval, phase-08]
requirements_satisfied: [IDX-07, IDX-08, BOUND-01, BOUND-02, BOUND-03, BOUND-04, BOUND-05]
---

# Phase 08 Plan 03: Vector and Keyword Adapters Summary

## One-Liner

Implemented lifecycle-managed vector and keyword index adapters with persisted state storage, enabling query-time retrieval to read pre-computed vectors and tokens instead of recomputing on every query.

## Objective

Implement the vector and keyword adapters and switch the retrieval read path to consume persisted index state so Phase 8 actually removes query-time recomputation from the hot path while preserving existing retrieval contracts and security boundaries.

## Outcomes

### Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create Wave 0 adapter tests and retrieval read-path assertions | fe20c6f | `packages/server/src/lib/indexing/adapters/vector.test.ts`, `packages/server/src/lib/indexing/adapters/keyword.test.ts`, `packages/server/src/lib/retrieval.test.ts` |
| 2 | Implement vector and keyword adapters and consume persisted index state during recall | 2000feb | `packages/server/src/lib/indexing/adapters/vector.ts`, `packages/server/src/lib/indexing/adapters/keyword.ts`, `packages/server/src/lib/retrieval/recall/semantic.ts`, `packages/server/src/lib/retrieval/recall/keyword.ts` |

### Artifacts Created

1. **packages/server/src/lib/indexing/adapters/vector.ts** (179 lines)
   - `vectorIndexAdapter.upsert()` - Persists vector payloads keyed by revision and contentHash
   - `vectorIndexAdapter.remove()` - Idempotent removal of vector state
   - EmbeddingCache mirroring for migration compatibility
   - Idempotency based on revision/contentHash comparison

2. **packages/server/src/lib/indexing/adapters/keyword.ts** (172 lines)
   - `keywordIndexAdapter.upsert()` - Persists normalized token arrays and per-field token sets
   - `keywordIndexAdapter.remove()` - Idempotent removal of keyword state
   - `PersistedKeywordState` interface for token storage
   - `getIndexedKeywordTokens()` helper for query-time reuse

3. **packages/server/src/lib/indexing/adapters/vector.test.ts** (131 lines)
   - Tests for fresh vector writes keyed by revision/contentHash
   - Tests for stale rewrite skipping (idempotency)
   - Tests for content hash and revision change detection
   - Tests for embeddingCache mirroring
   - Tests for idempotent remove operations

4. **packages/server/src/lib/indexing/adapters/keyword.test.ts** (114 lines)
   - Tests for persisted token state storage
   - Tests for per-field token set persistence
   - Tests for stale rewrite skipping (idempotency)
   - Tests for content hash change detection
   - Tests for idempotent remove operations

5. **packages/server/src/lib/retrieval/recall/semantic.ts** (modified)
   - Updated `getEntryEmbedding()` to prefer `indexState.vector` for synced entries
   - Falls back to `embeddingCache` for legacy entries
   - Preserves existing hot-path recomputation as last resort

6. **packages/server/src/lib/retrieval/recall/keyword.ts** (modified)
   - Updated `tokenizeEntry()` to reuse persisted keyword tokens when available
   - Falls back to query-time tokenization for legacy entries
   - Reduces query-time tokenization overhead for synced entries

7. **packages/server/src/lib/retrieval.test.ts** (extended)
   - Added "persisted index state read path (Phase 8)" test suite
   - Documents expected behavior for semantic recall preferring persisted vectors
   - Documents expected behavior for keyword recall reusing persisted tokens
   - Validates legacy fallback path for entries without synced state

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written.

## Verification

### Tests Passing

All 119 tests pass:
- `src/lib/indexing/adapters/vector.test.ts` - 7 tests
- `src/lib/indexing/adapters/keyword.test.ts` - 6 tests
- `src/lib/retrieval.test.ts` - 27 tests (including 3 new Phase 8 tests)
- All other existing tests continue to pass

### Acceptance Criteria Met

- [x] `test -f packages/server/src/lib/indexing/adapters/vector.test.ts`
- [x] `test -f packages/server/src/lib/indexing/adapters/keyword.test.ts`
- [x] `rg -n "upsert|remove|fresh|stale|embeddingCache" packages/server/src/lib/indexing/adapters/vector.test.ts`
- [x] `rg -n "tokens|fieldTokens|remove|idempotent" packages/server/src/lib/indexing/adapters/keyword.test.ts`
- [x] `rg -n "indexState|keywordRecall|getEntryEmbedding" packages/server/src/lib/retrieval.test.ts`
- [x] `rg -n "export const vectorIndexAdapter|upsert|remove" packages/server/src/lib/indexing/adapters/vector.ts`
- [x] `rg -n "export const keywordIndexAdapter|upsert|remove" packages/server/src/lib/indexing/adapters/keyword.ts`
- [x] `rg -n "indexState\.vector|embeddingCache" packages/server/src/lib/retrieval/recall/semantic.ts`
- [x] `rg -n "indexState\.keyword|getIndexedKeywordTokens" packages/server/src/lib/retrieval/recall/keyword.ts`

### Threat Mitigations Implemented

- [x] **T-08-09 (Tampering)**: Vector and keyword adapters key persisted payloads by revision and contentHash, with tests validating stale rewrite skipping and idempotent remove
- [x] **T-08-10 (Information Disclosure)**: Adapters remain authorization-agnostic, consuming only entries already filtered by the orchestrator
- [x] **T-08-11 (Denial of Service)**: Retrieval recall prefers persisted state first, with recomputation only for legacy entries lacking synced payloads
- [x] **T-08-12 (Integrity)**: Vector adapter mirrors writes to embeddingCache during migration, with tests asserting persisted state and compatibility remain aligned

## Technical Decisions

### Key Decisions

1. **Adapter State Storage**: Chose to store adapter sync state directly on `entry.indexState.vector` and `entry.indexState.keyword` rather than in separate index files. This keeps state co-located with entries and simplifies reconciliation.

2. **Keyword Token Persistence**: Stored per-field token sets (shortcut, detail, labels) in addition to the normalized token array to enable targeted matching during keyword recall while maintaining flexibility for future scoring improvements.

3. **EmbeddingCache Mirroring**: Vector adapter continues to write to `entry.embeddingCache` for backward compatibility during migration. This allows the system to support both legacy (cache-based) and Phase 8 (indexState-based) entries simultaneously.

4. **Fallback Path Preservation**: Kept the hot-path recomputation fallback in both semantic and keyword recall to handle legacy entries that haven't been synced yet. This ensures zero disruption during migration.

### Trade-offs

1. **IndexState Mutation**: Adapters mutate entry records in place rather than returning new objects. This follows the existing JsonStore pattern but requires care to avoid reference sharing issues.

2. **Persisted State Structure**: Keyword adapter stores persisted token state as an extension property on the AdapterSyncState interface rather than defining a separate interface. This keeps the implementation simple but relies on TypeScript's type extensibility.

3. **No Vector Storage**: The adapter implementation doesn't include actual vector storage (e.g., Vector database). Vectors are persisted on the entry records themselves, which is sufficient for the current in-memory store but may need to be revisited for large-scale deployments.

## Dependencies

### Requires

- 08-01: Persisted index state, normalization, and sync/reconcile pipeline (completed)
- Normalized index document structure from `normalize.ts`
- Embedding generation from `embeddings.ts`
- KnowledgeRecord structure from `store.ts`

### Provides

- Vector and keyword adapters for lifecycle-driven indexing
- Persisted index state read path for retrieval
- Foundation for Phase 08-04 (update and deactivate index lifecycle)

## Known Stubs

None - all implementations are concrete and functional.

## Threat Flags

None - no new security-relevant surface introduced beyond what was already documented in the plan's threat model.

## Self-Check: PASSED

- [x] All created files exist
- [x] All commits exist
- [x] All tests pass (119/119)
- [x] TypeScript compilation succeeds (no new errors)
- [x] All acceptance criteria met
- [x] All threat mitigations implemented

## Next Steps

Phase 08-04 will complete the index lifecycle by implementing update and deactivate triggers that call the adapters implemented in this plan, ensuring that:
- Content-changing approved updates refresh index state without exposing stale content
- Deactivated entries are removed from all index representations
