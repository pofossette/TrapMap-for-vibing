# 07-01-SUMMARY: Keyword Recall Foundation

## Status: ✅ Complete

## Overview

Implemented the Phase 7 keyword recall foundation as specified in 07-01-PLAN.md. Added internal candidate types and a query-time lexical recall adapter while preserving Phase 6 invariants.

## Commits

1. **c67fda3** - `feat(retrieval): add channel-aware candidate types for hybrid recall`
   - Extended `packages/server/src/lib/retrieval/types.ts` with internal-only types
   - No changes to public API contract (BOUND-03, BOUND-05 satisfied)

2. **ea64dff** - `feat(retrieval): add query-time keyword recall adapter (HYBR-01)`
   - Created `packages/server/src/lib/retrieval/recall/keyword.ts`
   - Created `packages/server/src/lib/retrieval/recall/keyword.test.ts`
   - Full test coverage for tokenization, normalization, and scoring

## Artifacts

| Path | Purpose |
|------|---------|
| `packages/server/src/lib/retrieval/types.ts` | Channel-aware retrieval candidate metadata |
| `packages/server/src/lib/retrieval/recall/keyword.ts` | Query-time keyword recall adapter |
| `packages/server/src/lib/retrieval/recall/keyword.test.ts` | Deterministic coverage for tokenization, normalization, and score bounds |

## Truths Validated

- ✅ The server has a keyword recall adapter that scores already-eligible knowledge entries at query time
- ✅ Keyword recall uses only approved and authorized entries passed in from the filter stage
- ✅ Hybrid groundwork exists as internal candidate metadata, without changing the public retrieval response shape

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Scoring weights: labels(3.0) > shortcut(2.0) > detail(1.0) | Labels are most precise signals, shortcuts are headlines, detail is body text |
| Score normalization to [0, 1] | Enables fair comparison with semantic scores during merge |
| Filter-out tokens < 2 chars in `normalizeQuery()` | Reduces noise from common articles ("a", "I") |
| Adapter accepts pre-filtered entries only | Preserves Phase 6 security ordering (T-07-01 mitigation) |

## Verification

```bash
pnpm --filter @skill-shareer/server test -- src/lib/retrieval/recall/keyword.test.ts
# 22 tests passed

pnpm --filter @skill-shareer/server exec tsc --noEmit
# No errors in new files (pre-existing errors in operations.ts are known)
```

## Invariants Preserved

- **Filter-first ordering**: Keyword adapter receives only eligible entries from `filterEligibleEntries`
- **Public response shape**: No changes to contracts package or retrieval response types
- **Mode separation**: No mode wiring added (hybrid mode integration is a later plan)
- **CLI/API boundaries**: No changes to CLI commands or API routes

## Threat Model Mitigations

| Threat ID | Status |
|-----------|--------|
| T-07-01 (Information Disclosure) | ✅ Mitigated - adapter accepts only eligible entries |
| T-07-02 (Tampering) | ✅ Mitigated - deterministic scoring, bounded to [0, 1] |
| T-07-03 (DoS) | ✅ Mitigated - query-time only, no unbounded operations |

## Next Steps (Future Plans)

This plan provides the groundwork for:
- 07-02: Hybrid merge (combine semantic + keyword candidates)
- 07-03: Reranking (reorder merged candidates)
- Phase 8: Lifecycle-driven indexing with keyword index persistence

---

*Generated: 2026-04-14*
*Plan: 07-01 of Phase 07-混合检索*
