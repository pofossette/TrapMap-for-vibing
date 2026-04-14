# 07-02-SUMMARY: Hybrid Retrieval Wiring

## Status: ✅ Complete

## Overview

Wired hybrid mode into the retrieval orchestrator by merging semantic and keyword candidates while preserving the public API contract. Implemented the merge module for combining multi-channel recall results and updated the orchestrator to dispatch hybrid queries through the new merge-assembly pipeline.

## Commits

1. **9dd06c7** - `feat(retrieval): add hybrid candidate merge module (HYBR-02)`
   - Created `packages/server/src/lib/retrieval/merge.ts`
   - Implemented `mergeCandidates`, `toScoredEntry`, `toScoredEntries`
   - Added `createSemanticCandidate` factory and `hasBothChannels` helper
   - Full test coverage for deduplication, score combination, and ordering

2. **e331f70** - `feat(retrieval): wire hybrid mode into orchestrator (HYBR-02, HYBR-04)`
   - Updated `packages/server/src/lib/retrieval/orchestrator.ts`
   - Added `hybridRecall` and `computeSemanticCandidates` functions
   - Extended tests for hybrid mode behavior in server and CLI

## Artifacts

| Path | Purpose |
|------|---------|
| `packages/server/src/lib/retrieval/merge.ts` | Semantic + keyword merge and dedupe logic |
| `packages/server/src/lib/retrieval/orchestrator.ts` | Hybrid mode dispatch using filter → recall → merge → assembly |
| `packages/server/src/lib/retrieval.test.ts` | Test coverage for hybrid mode and merge module |
| `packages/server/src/routes/retrieval.test.ts` | Route coverage for hybrid mode acceptance |
| `packages/cli/src/commands/retrieval.test.ts` | CLI passthrough tests for --mode hybrid |

## Truths Validated

- ✅ Hybrid mode returns a normal retrieval response instead of a 501 placeholder
- ✅ Semantic and keyword candidates are merged and deduplicated before bucket assembly
- ✅ Response shape stays `globalConstraints + projectKnowledge + refinementSummary` and scope still means business scope, not retrieval mode

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Default weights: semantic 0.6, keyword 0.4 | Embedding similarity is more semantically meaningful than pure lexical overlap |
| Merge runs semantic and keyword channels in parallel | Optimizes latency by running both recall paths concurrently |
| Dedupe by entry.id with stable ID-based tiebreaker | Ensures deterministic ordering for identical scores |
| No changes to public contracts package | Hybrid channel evidence stays server-internal (BOUND-01, BOUND-02) |

## Verification

```bash
pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/routes/retrieval.test.ts
# 116 tests passed

pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts
# 13 tests passed

pnpm --filter @skill-shareer/server exec tsc --noEmit
# No errors in new files (pre-existing errors in operations.ts are known)
```

## Invariants Preserved

- **Filter-first ordering**: Only eligible entries from `filterEligibleEntries` reach hybrid dispatch
- **Public response shape**: No changes to contracts package or retrieval response types
- **Scope semantics**: `global` and `project` remain business scope, not retrieval mode
- **CLI/API boundaries**: CLI is a thin mode passthrough, contracts remain sole truth

## Threat Model Mitigations

| Threat ID | Status |
|-----------|--------|
| T-07-04 (Information Disclosure) | ✅ Mitigated - preserve `filterEligibleEntries` as only source |
| T-07-05 (Tampering) | ✅ Mitigated - dedupe strictly by `entry.id`, deterministic ordering |
| T-07-06 (Elevation of Privilege) | ✅ Mitigated - bucket split unchanged, mode does not replace scope |
| T-07-07 (Repudiation) | ✅ Mitigated - response contract unchanged, CLI passthrough tested |

## Next Steps (Future Plans)

This plan provides the hybrid retrieval path for:
- 07-03: Reranking (reorder merged candidates with learned or heuristic scoring)
- Phase 8: Lifecycle-driven indexing with keyword index persistence

---

*Generated: 2026-04-14*
*Plan: 07-02 of Phase 07-混合检索*
