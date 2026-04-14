# Phase 07 — 混合检索 Review

**Date:** 2026-04-14
**Base Commit:** 69208992fc79ef7b54c179f2717f7cb891262eac
**Status:** Complete

---

## Files Reviewed

| File | Change Type | Lines |
|------|-------------|-------|
| `packages/server/src/lib/retrieval/types.ts` | Modified | +56 |
| `packages/server/src/lib/retrieval/merge.ts` | New | +182 |
| `packages/server/src/lib/retrieval/orchestrator.ts` | Modified | +93/-8 |
| `packages/server/src/lib/retrieval/recall/keyword.ts` | New | +204 |
| `packages/server/src/lib/retrieval/rerank.ts` | New | +140 |

---

## Summary

Phase 7 implements hybrid retrieval combining semantic (embedding-based) and keyword (lexical) recall channels. The implementation follows the planned pipeline:

1. **Filter Stage** (unchanged): `filterEligibleEntries()` runs first to enforce approval, team, and level constraints.
2. **Dual Recall**: Semantic and keyword channels execute in parallel over the eligible entry set.
3. **Merge**: Candidates are deduplicated by `entry.id` with weighted score combination.
4. **Rerank**: Deterministic heuristics boost multi-channel matches and high token density.
5. **Assembly** (unchanged): `assembleResponseBuckets()` splits results by business scope.

---

## Requirements Traceability

| ID | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| HYBR-01 | Keyword recall adapter over eligible entries | ✅ | `recall/keyword.ts:158-204` - `keywordRecall()` accepts pre-filtered entries, performs lexical matching on `shortcut`/`detail`/`labels` |
| HYBR-02 | Merge logic with entry-id deduplication | ✅ | `merge.ts:58-127` - Map-based merge by `entry.id`, preserves both channel scores |
| HYBR-03 | Simple rerank module | ✅ | `rerank.ts:68-119` - Deterministic heuristics with both-channel and token-density boosts |
| HYBR-04 | Hybrid query mode support | ✅ | `orchestrator.ts:155-181` - `hybridRecall()` dispatches both channels, merges, reranks |
| HYBR-05 | Validate short-query improvement | ✅ | Tests in `retrieval.test.ts` (56 tests) and `keyword.test.ts` (22 tests) verify behavior |
| BOUND-01 | Contracts remain source of truth | ✅ | No changes to `packages/contracts/` - internal types only |
| BOUND-02 | CLI depends only on API contracts | ✅ | CLI unchanged, `--mode hybrid` already supported by existing contract |
| BOUND-03 | RBAC/team filtering stays server-side | ✅ | `keywordRecall()` receives only `eligibleEntries`, never raw store |
| BOUND-04 | global/project is business scope | ✅ | Assembly unchanged, scope split happens after retrieval |
| BOUND-05 | Pipeline order preserved | ✅ | `filterEligibleEntries()` runs before any recall in `searchKnowledge()` |

---

## Architectural Assessment

### Strengths

1. **Security Boundary Preserved**: Keyword recall and merge/rerank all operate on already-filtered `eligibleEntries`. No bypass paths introduced.

2. **Deterministic Behavior**: All sorting uses secondary tiebreaker by `entry.id` (via `localeCompare`), ensuring stable ordering across runs.

3. **Normalized Scores**: Keyword scores bounded to `[0, 1]` via weighted field matching, compatible with semantic scores.

4. **Clean Separation**: Each stage (recall, merge, rerank) is a pure function with explicit inputs/outputs, making testing and debugging straightforward.

5. **Parallel Execution**: Semantic and keyword channels run via `Promise.all()`, minimizing latency impact.

### Concerns

None critical. Minor observations:

1. **Weight Configuration**: Merge weights (`DEFAULT_SEMANTIC_WEIGHT = 0.6`, `DEFAULT_KEYWORD_WEIGHT = 0.4`) and rerank boosts are hardcoded constants. Future phases may want these configurable per deployment.

2. **No Intermediate Truncation**: The current implementation passes all candidates through merge before rerank truncation. For large entry sets, this is fine given the intended use case, but documented behavior differs slightly from the "intermediate cap" discussed in RESEARCH.md.

---

## Code Quality

### types.ts

- Clean addition of `RecallChannel`, `TokenMatchDetail`, `RecallCandidate`, and `MergedCandidate` types.
- Internal-only, properly documented as "Phase 7 Hybrid Groundwork".
- No public contract changes.

### recall/keyword.ts

- Pure tokenization and matching logic.
- Weighted field scoring (labels=3, shortcut=2, detail=1) reflects reasonable relevance intuition.
- Proper security comment at line 11-16 documenting that the caller is responsible for filtering.
- `async` function is synchronous internally; consider removing `async` or documenting why it's preserved for future extensibility.

### merge.ts

- O(n) merge via `Map<string, MergedCandidate>`.
- Handles both "semantic-only", "keyword-only", and "both-channels" cases correctly.
- Deterministic sort with entry ID tiebreaker.

### rerank.ts

- Simple, deterministic heuristics with documented rationale.
- Score capping at `[0, 1]` maintains bounds.
- Security comment at line 15-20 correctly documents that rerank cannot introduce new entries.

### orchestrator.ts

- Clean integration of hybrid mode into existing dispatch pattern.
- Replaces previous 501 error with full implementation.
- `computeSemanticCandidates()` reuses existing embedding logic.

---

## Test Coverage

| Test File | Tests | Status |
|-----------|-------|--------|
| `recall/keyword.test.ts` | 22 | ✅ Pass |
| `retrieval.test.ts` | 56 | ✅ Pass |
| `routes/retrieval.test.ts` | 12 | ✅ Pass |

**Test execution:**
```
✓ src/lib/embeddings.test.ts (6 tests)
✓ src/lib/retrieval/recall/keyword.test.ts (22 tests)
✓ src/lib/retrieval.test.ts (56 tests)
✓ src/routes/retrieval.test.ts (12 tests)
```

Tests cover:
- Tokenization edge cases (empty, whitespace, duplicates, short tokens)
- Score normalization and determinism
- Entry exclusion when no token overlap
- Adapter operates only on passed-in entries (security boundary)
- Label vs detail vs shortcut weight preferences
- Token match detail recording
- Hybrid mode integration

---

## Type Safety

Phase-scoped typecheck for server package:

```
src/routes/operations.ts(35,7): error TS2375: Type incompatibility
src/routes/operations.ts(222,36): error TS2532: Object possibly undefined
```

These errors are **pre-existing** in `operations.ts` and unrelated to Phase 7 implementation. The retrieval files typecheck cleanly.

---

## Security Assessment

| Threat ID | Category | Component | Disposition | Status |
|-----------|----------|-----------|-------------|--------|
| T-07-01 | Information Disclosure | `recall/keyword.ts` | Mitigate | ✅ Adapter accepts only eligible entries |
| T-07-02 | Tampering | Keyword score calculation | Mitigate | ✅ Scores normalized to [0,1], deterministic |
| T-07-03 | Denial of Service | Query tokenization | Mitigate | ✅ No unbounded expansion, query-time only |
| T-07-04 | Information Disclosure | `orchestrator.ts` | Mitigate | ✅ Hybrid mode uses same filter-first order |
| T-07-05 | Information Disclosure | `merge.ts` | Mitigate | ✅ Merge only combines, never adds new entries |
| T-07-08 | Tampering | `rerank.ts` | Mitigate | ✅ Rerank only reorders, cannot bypass filtering |

All identified threats from the plan's threat model are mitigated.

---

## Verdict

**APPROVED**

Phase 7 implementation is complete, well-tested, and maintains all security boundaries. The hybrid retrieval pipeline is cleanly integrated without changing public contracts or CLI behavior.

---

## Recommendations for Future Phases

1. **Phase 8 (IDX-08)**: Consider persistent keyword indexing for performance at scale.
2. **Phase 10**: Channel provenance exposure in public response if needed for citations.
3. **Configuration**: Consider making merge weights and rerank boosts configurable via environment or query parameters.
