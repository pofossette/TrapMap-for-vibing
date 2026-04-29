---
phase: 29-rag-mode-routing
plan: 03
subsystem: retrieval
tags: [evaluation, baseline, routing-trace, failure-policy, regression-detection]

# Dependency graph
requires:
  - phase: 29-01
    provides: "RetrievalStrategy, RoutingReason, routing trace metadata types"
  - phase: 29-02
    provides: "Governance filtering verification, route compatibility tests"
provides:
  - Baseline-aware retrieval evaluation result types with routing trace fields
  - Report serialization with selectedMode, fallbackApplied, regressionStatus
  - Baseline write/compare flow for regression detection
  - Explicit failure policy documentation (governance leaks always fail)
affects: [ci-evaluation, retrieval-baselines]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Baseline comparison: per-slice metric drift detection with 5% threshold"
    - "Failure policy: governance leaks and empty-result mismatches are hard failures"
    - "Routing trace in reports: selectedMode, routingReason, fallbackApplied per case"

key-files:
  created: []
  modified:
    - evals/retrieval/lib/types.ts
    - evals/retrieval/lib/report.ts
    - evals/retrieval/lib/report.test.ts
    - evals/retrieval/run.ts
    - evals/retrieval/README.md

key-decisions:
  - "Routing trace fields added to ExecutionMetadata, SliceMetrics, and case summaries for baseline attribution"
  - "Most common selectedMode used for slice-level mode aggregation"
  - "5% threshold for regression detection (Hit@1 or MRR drop triggers REGRESSED)"
  - "Governance leaks always fail; ranking regressions report only"

patterns-established:
  - "Baseline write mode: saves slice metrics and governance failures to JSON file"
  - "Baseline compare mode: shows REGRESSED/IMPROVED/STABLE/NO-BASELINE per slice"
  - "Report schemas in @trapmap/contracts use @trapmap/contracts alias in vitest"

requirements-completed: [EOPS-03]

# Metrics
duration: 18min
completed: 2026-04-23
---

# Phase 29 Plan 03: Baseline-aware Eval Outputs Summary

**Retrieval evaluation outputs extended with routing trace metadata, baseline write/compare flow, and explicit failure policy for regression detection**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-23T23:34:00Z
- **Completed:** 2026-04-23T23:52:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added routing trace fields (selectedMode, routingReason, fallbackApplied) to ExecutionMetadata, SliceMetrics, and case summaries
- Implemented baseline write/compare flow with --baseline and --write-baseline options
- Documented explicit failure policy: governance leaks always fail, empty-result mismatches always fail, ranking regressions report only
- Fixed 8 failing tests caused by incorrect import path for retrievalEvalReportSchema

## Task Commits

Each task was committed atomically:

1. **Fix: Use @trapmap/contracts alias for retrieval eval report imports** - `b879fa9` (fix)
2. **Task 29-03-01: Add stable mode-aware baseline fields to retrieval evaluation results and reports** - `5bc2044` (feat)
3. **Task 29-03-01 continued: Populate routing trace fields in retrieval eval reports** - `bb5fd9f` (feat)
4. **Task 29-03-02: Define baseline write/compare flow and explicit failure policy** - `c8b4a10` (feat)

## Files Created/Modified
- `evals/retrieval/lib/types.ts` - Added routing trace fields to ExecutionMetadata, SliceMetrics, RunnerOptions
- `evals/retrieval/lib/report.ts` - Populate selectedMode, fallbackApplied, regressionStatus; fixed outcome/exec issue detection
- `evals/retrieval/lib/report.test.ts` - Added 3 routing trace tests; updated fixture with fallbackApplied
- `evals/retrieval/run.ts` - Added --baseline and --write-baseline options; baseline write/compare flow
- `evals/retrieval/README.md` - Documented baseline flow and failure policy

## Decisions Made
- Routing trace fields (selectedMode, routingReason, fallbackApplied) captured per case and aggregated per slice
- Most common selectedMode used for slice-level aggregation
- Regression threshold: >5% drop in Hit@1 or MRR triggers REGRESSED status
- Governance leaks and empty-result mismatches are hard failures; ranking drift reports only

## Deviations from Plan

### Auto-fixed Issues

**1. [Pre-existing] retrievalEvalReportSchema import undefined**
- **Found during:** Initial test run
- **Issue:** Report tests were importing from relative path `../../../packages/contracts/src/domain/evals/report.js` which resolved to undefined in vitest's module resolution
- **Fix:** Changed imports to use `@trapmap/contracts` alias which vitest.config.ts maps correctly
- **Files modified:** evals/retrieval/lib/report.ts, evals/retrieval/lib/report.test.ts
- **Verification:** All 8 failing tests now pass
- **Committed in:** b879fa9

---

**Total deviations:** 1 auto-fixed (import resolution)
**Impact on plan:** Essential fix for test infrastructure, no scope creep.

## Issues Encountered
- The report.ts had references to `result.verdicts` which doesn't exist on CaseResult; fixed to use governance.failures and actual outcome comparison

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Retrieval eval outputs are now baseline-aware with routing trace attribution
- Ready for CI integration to compare against stable baselines
- Failure policy makes governance leaks and empty-result mismatches hard failures with explicit exit semantics

---
*Phase: 29-rag-mode-routing*
*Completed: 2026-04-23*
