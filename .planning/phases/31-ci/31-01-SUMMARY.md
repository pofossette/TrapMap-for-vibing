---
phase: 31-ci
plan: 01
subsystem: [testing, evals, reporting]
tags: [cohort, query-type, aggregation, metrics]

# Dependency graph
requires:
  - phase: 29-ci
    provides: RetrievalStrategy, RoutingReason, RoutingTrace types
  - phase: 30-ci
    provides: Real execution with context traces
provides:
  - Query-type cohort aggregation for cross-slice analysis
  - Cohort comparison output formatter
  - Query-type tags for all existing datasets
affects: [31-02, 31-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [cohort aggregation, tag-based classification]

key-files:
  created: []
  modified:
    - packages/contracts/src/domain/evals/report.ts
    - evals/retrieval/lib/types.ts
    - evals/retrieval/lib/report.ts
    - evals/retrieval/lib/format.ts
    - evals/retrieval/datasets/core/v1-retrieval-core.ts
    - evals/retrieval/datasets/core/v2-retrieval-core.ts
    - evals/retrieval/datasets/smoke/v1-retrieval-smoke.ts
    - evals/retrieval/datasets/smoke/v2-retrieval-smoke.ts

key-decisions:
  - "Separate cohort aggregation layer (not extending slice key) for backward compatibility"
  - "Tag-based query-type classification using existing tag field"
  - "Default to 'general' when no query-type tag found"

patterns-established:
  - "Cohort aggregation: Group by query type + route family for cross-slice analysis"
  - "Tag-based classification: Use existing tag arrays for cohort derivation"

requirements-completed: [EOPS-01]

# Metrics
duration: 35min
completed: 2026-04-24
---

# Phase 31-01: Query-Type Cohort Slices Summary

**Added query-type cohort aggregation for cross-slice analysis of retrieval evaluation metrics**

## Performance

- **Duration:** 35 min
- **Started:** 2026-04-24T04:30:00Z
- **Completed:** 2026-04-24T05:05:00Z
- **Tasks:** 5
- **Files modified:** 8

## Accomplishments
- Query-type cohort schemas (QueryTypeCohort, CohortKey, CohortSummary) added to contracts
- Cohort helper functions (deriveQueryType, deriveRouteFamily, getCohortKeyString) added to runner types
- Cohort aggregation integrated into report builder with sorted output
- Cohort comparison formatter for terminal output
- All 15 existing dataset cases tagged with query-type classifications

## Task Commits

Each task was committed atomically:

1. **Task 1: Define query-type cohort schemas in contracts** - `d9b3096` (feat)
2. **Task 2: Add cohort types to runner internal types** - `64792ab` (feat)
3. **Task 3: Add cohort aggregation to report builder** - `8b1ba2b` (feat)
4. **Task 4: Add cohort comparison output formatter** - `b52670a` (feat)
5. **Task 5: Add query-type tags to existing datasets** - `72c22d3` (feat)

## Files Created/Modified
- `packages/contracts/src/domain/evals/report.ts` - Added QueryTypeCohort, CohortKey, CohortSummary schemas and cohorts field to RetrievalEvalReport
- `evals/retrieval/lib/types.ts` - Added QUERY_TYPE_TAGS, deriveQueryType, deriveRouteFamily, getCohortKeyString
- `evals/retrieval/lib/report.ts` - Added buildCohortSummaries, buildCohortSummary functions and cohorts to report
- `evals/retrieval/lib/format.ts` - Added formatCohortComparison function
- `evals/retrieval/datasets/core/v1-retrieval-core.ts` - Added query-type tags to 5 cases
- `evals/retrieval/datasets/core/v2-retrieval-core.ts` - Added query-type tags to 4 cases
- `evals/retrieval/datasets/smoke/v1-retrieval-smoke.ts` - Added query-type tags to 3 cases
- `evals/retrieval/datasets/smoke/v2-retrieval-smoke.ts` - Added query-type tags to 3 cases

## Decisions Made
- Used Option B from RESEARCH.md: Separate cohort aggregation layer instead of extending slice key for backward compatibility
- Tag-based query-type classification uses existing tag field, no schema migration needed
- Default to 'general' when no query-type tag found in case tags

## Deviations from Plan

None - plan executed exactly as written

## Issues Encountered
None - all tasks completed smoothly following the established patterns

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Cohort aggregation infrastructure complete, ready for Phase 31-02 (Mode-Aware Reporting)
- Reports now include cohorts array with per-cohort metrics
- formatCohortComparison ready for terminal/CI output integration

---
*Phase: 31-ci*
*Completed: 2026-04-24*
