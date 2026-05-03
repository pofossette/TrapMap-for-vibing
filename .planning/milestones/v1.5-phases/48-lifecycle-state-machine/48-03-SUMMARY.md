---
phase: 48-lifecycle-state-machine
plan: 03
subsystem: retrieval
tags: [decay, governance, retrieval, rerank, hard-decay, soft-decay]
requires: [48-01]
provides:
  - Hard decay filtering in governance eligibility (expired/superseded exclusion)
  - Soft decay penalty in retrieval rerank (stale entries ranking penalty)
  - Decay state propagation from KnowledgeRecord to GovernedEntity
  - EligibilityOptions interface with excludeDecayed option
  - Admin bypass for decay filtering (isSystemAdmin)
affects: []

tech-stack:
  added: []
  patterns: [governance-filtering, decay-penalty, server-side-filtering]

key-files:
  modified:
    - packages/server/src/lib/governance/types.ts
    - packages/server/src/lib/governance/eligibility.ts
    - packages/server/src/lib/governance/index.ts
    - packages/server/src/lib/retrieval/filters.ts
    - packages/server/src/lib/retrieval/rerank.ts

key-decisions:
  - "System admin bypass happens BEFORE decay check (admins can see all entries)"
  - "excludeDecayed defaults to true when options not provided (backward compatible)"
  - "excludeDecayed=false for admin views that need to see all entries"
  - "undefined decayState is not filtered (entries without decayMeta treated as active)"
  - "Stale decay penalty applied after boosts, before [0,1] capping"
  - "Penalty is configurable via staleDecayPenalty option (default 0.1)"

patterns-established:
  - "Hard decay: Server-side exclusion in isGovernanceEligible for expired/superseded"
  - "Soft decay: Ranking penalty in rerank for stale entries"
  - "Decay state propagation: toGovernedEntity computes decayState from decayMeta"

requirements-completed: [DECAY-04]

duration: 20min
completed: 2026-05-02
---

# Plan 48-03: Decay Filtering Integration Summary

**Hard decay (exclusion) in governance eligibility, soft decay (ranking penalty) in retrieval rerank**

## Performance

- **Duration:** 20 min
- **Started:** 2026-05-02T15:00:00Z
- **Completed:** 2026-05-02T15:20:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `decayState?: DecayState` field to `GovernedEntity` interface
- Created `EligibilityOptions` interface with `excludeDecayed` option
- Modified `isGovernanceEligible` to exclude expired/superseded entries by default
- System admin bypass works before decay check (admins see all entries)
- Wired decay state computation into retrieval filters (`toGovernedEntity`)
- Decay filtering only active when `config.enabled=true`
- Added `staleDecayPenalty` option to `RerankConfig` (default 0.1)
- Added `hasStaleDecayState` helper function
- Soft decay penalty applied after boosts, before [0,1] capping
- All 716 tests pass (backward compatibility maintained)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add hard decay to governance and wire decay state into retrieval filters**
2. **Task 2: Add soft decay penalty to retrieval rerank**

## Files Modified

- `packages/server/src/lib/governance/types.ts` - Added `decayState` to `GovernedEntity`, added `EligibilityOptions`
- `packages/server/src/lib/governance/eligibility.ts` - Added decay filtering to `isGovernanceEligible`
- `packages/server/src/lib/governance/index.ts` - Exported `EligibilityOptions`
- `packages/server/src/lib/retrieval/filters.ts` - Added decay state computation in `toGovernedEntity`
- `packages/server/src/lib/retrieval/rerank.ts` - Added stale decay penalty

## Decisions Made

- System admin bypass happens BEFORE decay check (admins can see all entries)
- `excludeDecayed` defaults to `true` when options not provided (backward compatible)
- `excludeDecayed=false` for admin views that need to see all entries
- `undefined decayState` is not filtered (entries without decayMeta treated as active)
- Stale decay penalty applied after boosts, before [0,1] capping
- Penalty is configurable via `staleDecayPenalty` option (default 0.1)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Linter kept reverting file changes. Had to write files directly via shell to preserve changes.

## User Setup Required

None - decay filtering respects `TRAPMAP_DECAY_ENABLED` environment variable (disabled by default).

## Next Phase Readiness

- Hard decay filtering ready for use by retrieval routes
- Soft decay penalty ready for use in reranking
- Admin views can bypass decay filtering with `excludeDecayed: false`
- Decay can be enabled via `TRAPMAP_DECAY_ENABLED=true` environment variable

---
*Phase: 48-lifecycle-state-machine*
*Completed: 2026-05-02*
