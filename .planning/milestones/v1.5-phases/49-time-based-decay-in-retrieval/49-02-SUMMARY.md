---
phase: 49-time-based-decay-in-retrieval
plan: 02
subsystem: retrieval
tags: [decay, freshness, ranking, retrieval, scoring]

# Dependency graph
requires:
  - phase: 49-01
    provides: FreshnessType, FreshnessDecayConfig, DecayMeta extension
provides:
  - Pure freshness decay functions (exponential, linear, step)
  - computeFreshnessMultiplier for retrieval ranking
  - loadFreshnessConfig for environment configuration
affects: [retrieval-ranking, citation-scoring]

# Tech tracking
tech-stack:
  added: []
  patterns: [pure-functions, deterministic-testing, injected-timestamps]

key-files:
  created:
    - packages/server/src/lib/decay/freshness.ts
  modified:
    - packages/server/src/lib/decay/config.ts
    - packages/server/src/lib/decay/supersede.ts

key-decisions:
  - "Pure functions with injected timestamps for deterministic testing"
  - "DEFAULT_FRESHNESS_CONFIG matches schema defaults for consistency"

patterns-established:
  - "Pure decay functions: all functions are side-effect free"
  - "Injected 'now' parameter: enables deterministic testing"

requirements-completed: [DECAY-02]

# Metrics
duration: 15min
completed: 2026-05-02
---

# Phase 49-02: Freshness Decay Functions Summary

**Pure functions for computing freshness decay multipliers with exponential, linear, and step decay curves**

## Performance

- **Duration:** 15 min
- **Started:** 2026-05-02T10:00:00Z
- **Completed:** 2026-05-02T10:15:00Z
- **Tasks:** 5
- **Files modified:** 3

## Accomplishments
- Implemented exponentialDecay function with half-life formula
- Implemented linearDecay function with floor constraint
- Implemented stepDecay function for versioned content
- Created computeFreshnessMultiplier main entry point
- Added loadFreshnessConfig environment loader

## Task Commits

Each task was committed atomically:

1. **Task T-49-02-01: Exponential decay function** - Part of `89ca58c` (feat)
2. **Task T-49-02-02: Linear decay function** - Part of `89ca58c` (feat)
3. **Task T-49-02-03: Step decay function** - Part of `89ca58c` (feat)
4. **Task T-49-02-04: computeFreshnessMultiplier main function** - Part of `89ca58c` (feat)
5. **Task T-49-02-05: loadFreshnessConfig function** - Part of `89ca58c` (feat)

**Additional fix:** `dff7f64` (fix) - Added freshnessType to supersede decayMeta

## Files Created/Modified
- `packages/server/src/lib/decay/freshness.ts` - Pure freshness decay functions
- `packages/server/src/lib/decay/config.ts` - Added loadFreshnessConfig
- `packages/server/src/lib/decay/supersede.ts` - Fixed missing freshnessType field

## Decisions Made
- Used injected `now` parameter pattern from state-machine.ts for deterministic testing
- DEFAULT_FRESHNESS_CONFIG matches freshnessDecayConfigSchema defaults for consistency
- Versioned decay returns 1.0 since version context detection is deferred to Phase 51+

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing freshnessType in supersede.ts**
- **Found during:** Task T-49-02-04 (typecheck after creating freshness.ts)
- **Issue:** supersede.ts was creating decayMeta without freshnessType field, but contracts extended DecayMeta with required freshnessType
- **Fix:** Added `freshnessType: entry.decayMeta?.freshnessType ?? 'evergreen'` to decayMeta construction
- **Files modified:** packages/server/src/lib/decay/supersede.ts
- **Verification:** pnpm --filter @trapmap/server typecheck passes
- **Committed in:** dff7f64 (separate fix commit)

---

**Total deviations:** 1 auto-fixed (1 blocking type error)
**Impact on plan:** Minimal - required fix due to 49-01 contracts extension

## Issues Encountered
- 49-01 contracts changes (freshnessType in DecayMeta) required updating supersede.ts to include the new field

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Freshness decay functions ready for integration into retrieval ranking
- 49-03 will add unit tests for these functions
- computeFreshnessMultiplier can be called from retrieval assembly

---
*Phase: 49-time-based-decay-in-retrieval*
*Plan: 49-02*
*Completed: 2026-05-02*
