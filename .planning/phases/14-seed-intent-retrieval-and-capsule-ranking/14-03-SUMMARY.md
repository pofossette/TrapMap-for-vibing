---
phase: 14-seed-intent-retrieval-and-capsule-ranking
plan: "03"
subsystem: "Retrieval and Response Shaping"
tags: ["retrieval", "capsule-first", "distilled", "response-assembly", "summary", "pure-functions"]
wave: 3
depends_on:
  - 14-02
files_modified:
  - packages/contracts/src/domain/retrieval.ts
  - packages/contracts/src/index.test.ts
  - packages/server/src/lib/retrieval/orchestrator.ts
  - packages/server/src/lib/retrieval/assembly.ts
  - packages/server/src/lib/retrieval/assembly.test.ts
  - packages/server/src/lib/retrieval/summary.ts
  - packages/server/src/lib/retrieval/summary.test.ts
autonomous: true
requirements:
  - RETR-04
  - COMP-01
must_haves:
  truths:
    - "Default retrieval output is capsule-first and distilled rather than a raw skill bundle."
    - "Response shaping stays pure and contract-driven, separate from ranking and route logic."
    - "Optional summary behavior still summarizes only already-filtered distilled hits."
  artifacts:
    - path: "packages/contracts/src/domain/retrieval.ts"
      provides: "Final capsule-first v2 response schema used by server and CLI"
    - path: "packages/server/src/lib/retrieval/assembly.ts"
      provides: "Pure capsule-first response assembly helpers"
    - path: "packages/server/src/lib/retrieval/summary.ts"
      provides: "Pure summary builder for distilled capsule hits"
    - path: "packages/server/src/lib/retrieval/assembly.test.ts"
      provides: "Focused regression tests for response shaping"
requires:
  - phase: "14-02"
    provides: "Ranked capsule candidates and governed artifact-derived data"
provides:
  - "14-03: Capsule-first v2 response schema with optional summary"
  - "14-03: Pure assembly helpers for capsule match and profile hint building"
  - "14-03: Pure summary builder for filtered distilled capsule hits"
affects:
  - "14-04: Route and CLI integration"
tech_stack:
  added: []
  patterns:
    - "Pure function pattern for response assembly with no store access"
    - "Capsule-first response shaping with governance inheritance"
    - "Summary builder limited to already-filtered hits (T-14-08 mitigation)"
key_files:
  created:
    - "packages/server/src/lib/retrieval/assembly.test.ts:245 lines - TDD tests for capsule-first response shaping"
  modified:
    - "packages/contracts/src/domain/retrieval.ts:181 lines - Added summary field to v2 response schema"
    - "packages/contracts/src/index.test.ts:1993 lines - Added Task 1 contract tests for distilled response"
    - "packages/server/src/lib/retrieval/assembly.ts:238 lines - Added v2 capsule-first assembly helpers"
    - "packages/server/src/lib/retrieval/orchestrator.ts:543 lines - Updated searchKnowledgeV2() to use assembly helpers"
    - "packages/server/src/lib/retrieval/summary.ts:247 lines - Added buildCapsuleSummary() for capsule hits"
    - "packages/server/src/lib/retrieval/summary.test.ts:498 lines - Added capsule summary tests"
key_decisions:
  - "Add optional summary field to v2 response schema for distilled capsule hit summaries"
  - "Keep assembly and summary as pure functions with no store access (T-14-07, T-14-08)"
  - "Use buildCapsuleMatch() and buildProfileHint() helpers in orchestrator"
  - "Summary builder only consumes already-filtered distilled hits, never re-fetches"
requirements_completed:
  - RETR-04
  - COMP-01
duration: "22 min"
completed_date: "2026-04-16T15:07:04Z"
---

# Phase 14 Plan 03: Capsule-First Response Shaping Summary

**Finalized capsule-first v2 response contract and pure assembly/summary helpers for distilled retrieval output.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-04-16T14:45:00Z
- **Completed:** 2026-04-16T15:07:04Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added optional summary field to retrievalV2ResponseSchema (T-14-08 mitigation)
- Added contract tests for distilled capsule matches with artifact/profile metadata
- Added buildCapsuleMatch() for creating capsule matches from records (T-14-07)
- Added buildProfileHint() for lightweight artifact metadata
- Added buildV2RetrievalResponse() for capsule-first response assembly
- Added buildCapsuleSummary() for distilled capsule hit summaries
- Updated searchKnowledgeV2() to use pure assembly helpers
- Created assembly.test.ts with focused regression tests
- Maintained pure-function pattern with no store access in assembly/summary

## Task Commits

Each task was committed atomically:

1. **Task 1: Finalize the shared capsule-first v2 response contract** - `3e75690` (feat)
   - Added summary field to retrievalV2ResponseSchema
   - Added tests for distilled capsule matches with metadata
   - Added tests proving default payloads don't require bundle file contents
   - Added tests for legacy schema coexistence

2. **Task 2: Implement pure capsule-first assembly and summary shaping** - `d0f7767` (feat)
   - Added buildCapsuleMatch() and buildProfileHint() helpers
   - Added buildV2RetrievalResponse() for capsule-first assembly
   - Added buildCapsuleSummary() for capsule hit summaries
   - Updated searchKnowledgeV2() to use assembly helpers
   - Created assembly.test.ts with regression tests
   - Added capsule summary tests to summary.test.ts

## Files Created/Modified

- `packages/contracts/src/domain/retrieval.ts` - Added summary field to v2 response schema
- `packages/contracts/src/index.test.ts` - Added Task 1 contract tests for distilled response
- `packages/server/src/lib/retrieval/assembly.ts` - Added v2 capsule-first assembly helpers
- `packages/server/src/lib/retrieval/assembly.test.ts` - TDD tests for response shaping (new file)
- `packages/server/src/lib/retrieval/orchestrator.ts` - Updated searchKnowledgeV2() to use assembly helpers
- `packages/server/src/lib/retrieval/summary.ts` - Added buildCapsuleSummary() for capsule hits
- `packages/server/src/lib/retrieval/summary.test.ts` - Added capsule summary tests

## Decisions Made

- **Summary field:** Added optional summary to v2 response schema for distilled capsule hit summaries
- **Pure functions:** Assembly and summary helpers have no store access, operating only on provided inputs
- **Capsule match builder:** buildCapsuleMatch() creates matches from capsule records and candidates
- **Profile hint builder:** buildProfileHint() creates lightweight metadata from artifacts
- **Summary builder:** buildCapsuleSummary() only consumes already-filtered hits, returns null without citations

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in model.test.ts, import-export.ts, and indexing adapters are unrelated to this plan. These were present before execution and do not affect retrieval functionality.

## Threat Model Coverage

| Threat ID | Mitigation | Status |
|-----------|------------|--------|
| T-14-07 | Emit distilled capsule/profile metadata only; do not include raw bundle file contents | ✓ Implemented |
| T-14-08 | Keep summary builder pure and limited to filtered distilled hits/citations | ✓ Implemented |
| T-14-09 | Validate final v2 responses against shared schemas | ✓ Implemented |

## Next Phase Readiness

- Capsule-first response shaping ready for 14-04 route and CLI integration
- Pure assembly helpers ready for reuse by route/CLI consumers
- Summary builder ready for optional capsule hit summarization

---
*Phase: 14-seed-intent-retrieval-and-capsule-ranking*
*Completed: 2026-04-16*
