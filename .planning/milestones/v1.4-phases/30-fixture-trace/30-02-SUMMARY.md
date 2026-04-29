---
phase: 30-fixture-trace
plan: "02"
subsystem: retrieval
tags: [retrieval, summary, citations, v2-api, capsule]

requires:
  - phase: 29
    provides: unified retrieval routing strategy layer
provides:
  - v2 query schema with includeSummary field
  - buildCapsuleCitations helper for capsule-to-citation conversion
  - v2 retrieval path that produces real summaries when requested
affects: [summary-evaluation, retrieval-eval, v2-api]

tech-stack:
  added: []
  patterns: [capsule-first-summary, governed-citation-derivation]

key-files:
  created: []
  modified:
    - packages/contracts/src/domain/retrieval.ts
    - packages/server/src/lib/retrieval/summary.ts
    - packages/server/src/lib/retrieval/orchestrator.ts

key-decisions:
  - "includeSummary defaults to false for backward compatibility"
  - "Citations derived from already-governed CapsuleMatch records to preserve filtering guarantees"
  - "Used 'semantic' as safe recallChannels fallback since capsule channel may not be in enum"

patterns-established:
  - "Citation derivation from governed capsule data preserves auth/level filtering"
  - "v2 summary path mirrors v1 summary pattern with capsule-specific helpers"

requirements-completed:
  - EOPS-01

duration: 4min
completed: "2026-04-24"
---

# Phase 30-02: V2 Summary Wiring Summary

**Wired buildCapsuleSummary into v2 retrieval pipeline so /v2/retrieval/search produces real summaries when includeSummary is true**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-24T01:49:50Z
- **Completed:** 2026-04-24T01:53:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `includeSummary` field to v2 query schema with backward-compatible default false
- Created `buildCapsuleCitations` helper to convert CapsuleMatch[] to RetrievalCitation[]
- Wired conditional summary generation into searchKnowledgeV2 function
- Updated RAG log metadata to reflect actual includeSummary parameter value

## Task Commits

Each task was committed atomically:

1. **Task 30-02-01: Add includeSummary to v2 query schema** - `7b495ec` (feat)
2. **Task 30-02-02: Wire v2 summary in orchestrator** - `2f88af1` (feat)

## Files Created/Modified

- `packages/contracts/src/domain/retrieval.ts` - Added includeSummary field to retrievalV2QuerySchema
- `packages/server/src/lib/retrieval/summary.ts` - Added buildCapsuleCitations helper function
- `packages/server/src/lib/retrieval/orchestrator.ts` - Wired buildCapsuleSummary into searchKnowledgeV2

## Decisions Made

- Used `includeSummary: z.boolean().default(false)` matching v1 contract for API consistency
- Derived citations from CapsuleMatch records after governance filtering to preserve security guarantees
- Used `['semantic']` as recallChannels fallback since capsule-specific channel isn't in the Zod enum

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - straightforward implementation following existing patterns from v1 summary path.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- v2 retrieval endpoint now produces real summaries when requested
- Summary evaluation can execute against v2 endpoint with real context
- Enables groundedness-style judge checks over retrieved capsule content

---
*Phase: 30-fixture-trace*
*Completed: 2026-04-24*
