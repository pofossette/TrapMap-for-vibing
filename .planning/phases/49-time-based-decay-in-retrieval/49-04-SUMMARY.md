---
phase: 49-time-based-decay-in-retrieval
plan: 04
subsystem: retrieval
tags: [decay, citation, freshness, transparency]

requires:
  - phase: 49-time-based-decay-in-retrieval
    provides: MergedCandidate type with decayMultiplier field, retrievalCitationSchema with decayMultiplier
provides:
  - buildCitationFromCandidate helper for citation construction
  - decayMultiplier exposure in toRetrievalMatch
  - freshness percentage in match reasons
affects: [retrieval, ranking, citation]

tech-stack:
  added: []
  patterns: [decay transparency in citations, freshness percentage in match reasons]

key-files:
  created: []
  modified:
    - packages/server/src/lib/retrieval/assembly.ts

key-decisions:
  - "Freshness percentage shown in match reason only when decayMultiplier < 1.0"
  - "buildCitationFromCandidate extracts decayMultiplier from MergedCandidate for citation scores"

patterns-established:
  - "Citation scores include optional decayMultiplier field for transparency"
  - "Match reason format: 'base reason (score: X.XX, freshness: YY%)' when decay applied"

requirements-completed: [DECAY-02]

duration: 15min
completed: 2026-05-02
---

# Phase 49-04: Citation Decay Multiplier Exposure Summary

**Expose decay multiplier in retrieval citations for freshness transparency, enabling clients to see the exact penalty applied to each result.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-05-02T08:30:00Z
- **Completed:** 2026-05-02T08:45:00Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- Added `decayMultiplier` parameter to `toRetrievalMatch` and `generateMatchReason` functions
- Match reason now shows freshness percentage (e.g., "freshness: 65%") when decay applied
- Added `buildCitationFromCandidate` helper to construct citations with decay metadata

## Task Commits

Each task was committed atomically:

1. **Task 1: Update toRetrievalMatch** - Part of combined commit
2. **Task 2: Add buildCitationFromCandidate** - Part of combined commit
3. **Task 3: Update generateMatchReason** - Part of combined commit

**Combined commit:** `feat(49-04): expose decay multiplier in retrieval citations`

_Note: All three tasks were tightly coupled in assembly.ts, committed as one atomic unit._

## Files Created/Modified

- `packages/server/src/lib/retrieval/assembly.ts` - Added decayMultiplier parameter handling, buildCitationFromCandidate helper, and freshness percentage in match reasons

## Decisions Made

- Freshness percentage only shown when `decayMultiplier < 1.0` (no need to show 100% freshness)
- `buildCitationFromCandidate` directly uses `MergedCandidate.channels` since it's already `RecallChannel[]`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Citation construction ready for integration with reranking pipeline
- Awaiting 49-03 PLAN completion for end-to-end decay flow

---
*Phase: 49-time-based-decay-in-retrieval*
*Completed: 2026-05-02*
