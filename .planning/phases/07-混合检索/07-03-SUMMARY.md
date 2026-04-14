# 07-03-SUMMARY: Hybrid Reranking

## Status: ✅ Complete

## Overview

Added a deterministic rerank stage to hybrid retrieval and validation proving hybrid mode improves short-query outcomes without breaking server-side safety guarantees. Completed HYBR-03 and HYBR-05 requirements for Phase 7.

## Commits

1. **a572251** - `feat(retrieval): add deterministic rerank after hybrid merge (HYBR-03)`
   - Created `packages/server/src/lib/retrieval/rerank.ts`
   - Implemented `rerankCandidates`, `toScoredEntriesFromReranked`
   - Added both-channel boost (+0.15) and token density boost (+0.10)
   - Wired rerank into hybrid path in orchestrator after merge

2. **0b35808** - `test(retrieval): prove short-query improvement and preserve approval safety (HYBR-05)`
   - Extended retrieval.test.ts with rerank module tests
   - Added hybrid mode short-query improvement tests
   - Extended workflow tests for approval boundary after rerank
   - Added route tests for hybrid mode acceptance

## Artifacts

| Path | Purpose |
|------|---------|
| `packages/server/src/lib/retrieval/rerank.ts` | Deterministic rerank module for hybrid candidates |
| `packages/server/src/lib/retrieval/orchestrator.ts` | Hybrid path integration with rerank stage |
| `packages/server/src/lib/retrieval.test.ts` | Rerank module and hybrid improvement tests |
| `packages/server/src/lib/retrieval-workflow.test.ts` | Approval boundary tests after rerank wiring |
| `packages/server/src/routes/retrieval.test.ts` | Route acceptance for hybrid mode |

## Truths Validated

- ✅ Hybrid retrieval applies a deterministic rerank stage after merge and before response assembly
- ✅ Short-query fixtures show a measurable hybrid ordering/recall improvement over semantic-only behavior
- ✅ Approved-only and team-safe retrieval boundaries still hold after rerank is introduced

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Both-channel boost: +0.15 | Cross-channel agreement is a strong relevance signal |
| Token density boost: +0.10 | High token coverage indicates strong lexical match |
| Truncation after rerank, not before merge | Ensures best candidates reach rerank stage |
| No external model dependencies | Phase 7 stays query-time and deterministic |

## Verification

```bash
pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts
# 134 tests passed

pnpm --filter @skill-shareer/server exec tsc --noEmit
# No errors in new files (pre-existing errors in operations.ts are known)
```

## Invariants Preserved

- **Filter-first ordering**: Rerank only receives candidates from `filterEligibleEntries`
- **Public response shape**: No changes to contracts package or retrieval response types
- **Approved-only boundary**: Rerank cannot introduce unapproved entries
- **Team-safe boundaries**: Rerank does not bypass team scoping

## Threat Model Mitigations

| Threat ID | Status |
|-----------|--------|
| T-07-08 (Tampering) | ✅ Mitigated - rerank is deterministic, bounded, and covered by tests |
| T-07-09 (Information Disclosure) | ✅ Mitigated - rerank operates only on filtered candidates |
| T-07-10 (DoS) | ✅ Mitigated - local heuristic scoring only, no network calls |
| T-07-11 (Repudiation) | ✅ Mitigated - HYBR-05 proof encoded in automated tests |

## Phase 7 Completion

This plan completes Phase 7 - Hybrid Retrieval with:
- 07-01: Keyword recall foundation (keyword.ts, types.ts)
- 07-02: Hybrid wiring (merge.ts, orchestrator integration)
- 07-03: Reranking (rerank.ts, validation tests)

---

*Generated: 2026-04-14*
*Plan: 07-03 of Phase 07-混合检索*
