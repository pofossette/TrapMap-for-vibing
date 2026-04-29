---
phase: 31-ci
plan: 02
subsystem: [testing, evals, reporting]
tags: [mode-comparison, routing-distribution, route-family, metrics]

# Dependency graph
requires:
  - phase: 29-ci
    provides: RetrievalStrategy, RoutingReason, RoutingTrace types
  - phase: 30-ci
    provides: Real execution with context traces
  - phase: 31-01
    provides: Cohort aggregation infrastructure
provides:
  - Mode comparison aggregation for client vs router-selected modes
  - Routing distribution analysis
  - Route family field in slice summaries
affects: [31-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [mode comparison grouping, routing reason distribution]

key-files:
  created: []
  modified:
    - packages/contracts/src/domain/evals/report.ts
    - evals/retrieval/lib/types.ts
    - evals/retrieval/lib/report.ts
    - evals/retrieval/lib/format.ts

key-decisions:
  - "Mode comparison groups by client mode + selected mode + routing reason + fallback status"
  - "Routing distribution shows percentage breakdown of routing reasons"
  - "Route family derived from endpoint (v1=entry, v2=capsule)"

patterns-established:
  - "Mode comparison: Group by mode combination for router behavior analysis"
  - "Routing distribution: Track routing reason counts and percentages"

requirements-completed: [EOPS-01]

# Metrics
duration: 20min
completed: 2026-04-24
---

# Phase 31-02: Mode-Aware Reporting Summary

**Added mode comparison and routing distribution for analyzing router behavior in evaluation reports**

## Performance

- **Duration:** 20 min
- **Started:** 2026-04-24T05:30:00Z
- **Completed:** 2026-04-24T05:50:00Z
- **Tasks:** 5
- **Files modified:** 4

## Accomplishments
- ModeComparison and RoutingDistribution schemas added to contracts
- getModeComparisonKey helper function for grouping by mode combination
- buildModeComparisons and buildRoutingDistribution aggregation functions
- formatModeComparison and formatRoutingDistribution output formatters
- routeFamily field added to slice summaries for entry/capsule distinction

## Task Commits

Each task was committed atomically:

1. **Task 1: Add mode comparison types to contracts** - `a9fc313` (feat)
2. **Task 2: Add mode comparison types to runner types** - `c679856` (feat)
3. **Task 3: Add mode comparison aggregation to report builder** - `c239237` (feat)
4. **Task 4: Add mode comparison output formatter** - `63fe2fa` (feat)
5. **Task 5: Update slice summary to include route family** - Completed as part of Task 3

## Files Modified
- `packages/contracts/src/domain/evals/report.ts` - Added ModeComparison, RoutingDistribution schemas and routeFamily to slice summary
- `evals/retrieval/lib/types.ts` - Added getModeComparisonKey helper function
- `evals/retrieval/lib/report.ts` - Added buildModeComparisons, buildModeComparison, buildRoutingDistribution functions
- `evals/retrieval/lib/format.ts` - Added formatModeComparison and formatRoutingDistribution formatters

## Decisions Made
- Mode comparison groups by 4 dimensions: clientMode, selectedMode, routingReason, fallbackApplied
- Routing distribution shows counts and percentages of each routing reason
- Route family derived from endpoint path (v1=entry, v2=capsule) using existing deriveRouteFamily helper

## Deviations from Plan

None - plan executed exactly as written

## Issues Encountered
None - all tasks completed smoothly following the patterns from Phase 31-01

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Mode comparison infrastructure complete, ready for Phase 31-03 (Baseline Persistence and CI Regression)
- Reports now include modeComparisons and routingDistribution arrays
- formatModeComparison and formatRoutingDistribution ready for terminal/CI output integration

---
*Phase: 31-ci*
*Completed: 2026-04-24*
