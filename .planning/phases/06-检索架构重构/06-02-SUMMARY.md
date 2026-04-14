---
phase: 06-检索架构重构
plan: "02"
subsystem: retrieval-architecture
tags: [architecture, extraction, refactoring, regression-tested]
dependency_graph:
  requires:
    - "06-01: orchestrator entrypoint"
  provides:
    - "06-03: query mode interface"
    - "07-01: keyword recall adapter"
  affects:
    - "retrieval pipeline"
    - "response structure"
tech_stack:
  added:
    - "filter eligibility module (filters.ts)"
    - "semantic recall adapter (recall/semantic.ts)"
    - "response assembly module (assembly.ts)"
  patterns:
    - "pipeline separation: filter -> recall -> assembly -> refinement"
    - "module isolation for future extension points"
key_files:
  created:
    - "packages/server/src/lib/retrieval/filters.ts"
    - "packages/server/src/lib/retrieval/recall/semantic.ts"
    - "packages/server/src/lib/retrieval/assembly.ts"
  modified:
    - "packages/server/src/lib/retrieval/orchestrator.ts"
key_decisions:
  - "Extracted filtering logic to filters.ts module before recall candidate generation"
  - "Moved semantic recall (embedding, similarity, scoring) to recall/semantic.ts"
  - "Isolated response assembly (bucket split, match shaping) to assembly.ts"
  - "Preserved scope semantics as business grouping concept, not query mode selector"
metrics:
  duration: "3 minutes"
  completed_date: "2026-04-14"
  tasks_completed: 2
  files_created: 3
  files_modified: 1
  test_results: "68 tests passed"
deviations: []
threat_flags: []
---

# Phase 6 Plan 02: Split Retrieval into Filter, Recall, and Assembly Modules Summary

**One-liner:** Extracted filtering, semantic recall, and response assembly into dedicated modules while preserving the current response structure and API contract.

## Completed Tasks

| Task | Name | Commit | Files |
| ---- | ----- | ------ | ----- |
| 1 | Extract server-side filtering logic | 9ff4d59 | packages/server/src/lib/retrieval/filters.ts, packages/server/src/lib/retrieval/orchestrator.ts |
| 2 | Extract semantic recall and response assembly modules | 386d5f8 | packages/server/src/lib/retrieval/recall/semantic.ts, packages/server/src/lib/retrieval/assembly.ts, packages/server/src/lib/retrieval/orchestrator.ts |

## Implementation Summary

### Module Extraction

**filters.ts** - Eligibility filtering module
- Consolidated approval state, security level, team access, scope, and label filtering
- Enforced filter-before-recall order for security
- Exported `isEntryEligible()` and `filterEligibleEntries()` helpers
- Ensured unapproved, high-level, other-team, and mismatched entries are excluded

**recall/semantic.ts** - Semantic recall adapter
- Extracted embedding text generation, cache reuse, and cosine similarity
- Isolated score computation with metadata-aware boosts
- Prepared extension point for keyword and graph-assisted recall paths
- Maintained deterministic fallback behavior for CI/local environments

**assembly.ts** - Response assembly module
- Extracted match reason generation and retrieval match schema conversion
- Isolated globalConstraints and projectKnowledge bucket assembly
- Ensured no entry appears in both buckets
- Preserved refinementSummary: null behavior when no provider is configured

### Orchestrator Updates

Updated `orchestrator.ts` to follow explicit pipeline order:
1. **Eligibility filtering** (approval, team, level, metadata) via `filterEligibleEntries()`
2. **Semantic recall** (embedding lookup and scoring) via `getQueryEmbedding()`, `semanticGetEntryEmbedding()`, `cosineSimilarity()`, `computeScore()`
3. **Response assembly** (bucket split and output shaping) via `assembleResponseBuckets()`, `buildRetrievalResponse()`
4. **Optional refinement** (if requested and provider configured) via `generateRefinement()`

### Verification

- All 68 retrieval and workflow tests pass
- Response structure unchanged: `globalConstraints + projectKnowledge + refinementSummary`
- Scope semantics preserved as business grouping (global vs project), not retrieval mode
- No behavioral changes to eligibility filtering or scoring

## Deviations from Plan

None - plan executed exactly as written.

## Threat Flags

None - no new security-relevant surface introduced beyond the planned extraction.

## Known Stubs

None - all modules are fully wired with production logic.

## Key Decisions

1. **Filter-before-recall enforcement**: Moved filtering to dedicated module and documented the pipeline order in orchestrator comments to prevent future changes from bypassing eligibility gates.

2. **Semantic recall isolation**: Extracted embedding, similarity, and scoring logic to `recall/semantic.ts` to make later hybrid and graph work additive rather than invasive.

3. **Assembly module separation**: Isolated response bucket assembly to enable future recall channel attribution and enhanced citations without restructuring response shaping.

4. **Type inference from schema**: Used `ReturnType<typeof retrievalMatchSchema.parse>` for `RetrievalMatch` type since contracts package doesn't export the type directly.

## Self-Check: PASSED

- [x] All created files exist and are committed
- [x] All commits exist and are linked
- [x] Tests pass (68/68)
- [x] Response structure preserved
- [x] Scope semantics unchanged
- [x] Pipeline order documented and enforced
