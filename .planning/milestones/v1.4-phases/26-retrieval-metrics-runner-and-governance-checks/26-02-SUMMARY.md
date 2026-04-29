---
phase: 26-retrieval-metrics-runner-and-governance-checks
plan: 02
subsystem: evaluation
tags: [retrieval, evaluation, governance, reporting, metrics, assertions]

requires:
  - phase: 26-retrieval-metrics-runner-and-governance-checks
    plan: 01
    provides: Execution substrate with adapters, normalization, metrics, and governance
provides:
  - First-class governance verdicts separate from ranking metrics
  - Canonical report schema validated through shared contracts
  - Per-slice summaries with endpoint, tier, and mode breakdowns
  - Machine-readable JSON and human-readable terminal output from one source
affects: [ci-reporting, regression-detection, summary-evaluation]

tech-stack:
  added: []
  patterns:
    - "First-class verdict pattern: governance assertions as explicit pass/fail records"
    - "Canonical report pattern: single source of truth for JSON and terminal output"
    - "Slice aggregation pattern: stable keys for regression comparison"

key-files:
  created:
    - evals/retrieval/lib/assertions.ts
    - evals/retrieval/lib/report.ts
    - evals/retrieval/lib/format.ts
    - packages/contracts/src/domain/evals/report.ts
  modified:
    - evals/retrieval/lib/types.ts
    - evals/retrieval/run.ts
    - evals/retrieval/README.md
    - packages/contracts/src/index.ts

key-decisions:
  - "Verdicts are first-class: governance failures are explicit records, not metric noise"
  - "Canonical report structure: JSON and terminal derive from same in-memory object"
  - "Stable slice keys: sorted by tier, endpoint, mode for regression comparison"
  - "Schema validation: reports validate through contracts before emission"

patterns-established:
  - "Verdict pattern: Each case produces verdicts with kind, passed, and optional failure"
  - "Report builder pattern: Aggregate case results into canonical report with slices, failures, warnings"
  - "Format pattern: Terminal formatter reads from canonical report, not case results directly"

requirements-completed:
  - REVAL-01
  - REVAL-03
  - REVAL-04

duration: 30min
completed: 2026-04-21
---

# Phase 26 Plan 02: Governance Assertions and Report Builder Summary

**First-class governance verdicts, canonical report schema, and dual JSON/terminal output from a single source**

## Performance

- **Duration:** 30 min
- **Started:** 2026-04-21T19:20:00Z
- **Completed:** 2026-04-21T19:50:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Governance failures surface explicitly as first-class verdicts, separate from ranking metrics
- Per-slice summaries show endpoint, tier, and mode breakdowns suitable for regression review
- Retrieval evaluator emits both machine-readable JSON and human-readable terminal output from one canonical report
- Compatibility warnings and fallback execution details remain visible in reports

## Task Commits

Each task was committed atomically:

1. **Task 1: Evaluate governance and expectation failures as first-class verdicts** - `2c633bb` (feat/test)
2. **Task 2: Build canonical JSON and terminal reports with slice summaries** - `1d9f5f8` (feat/test/docs)

## Files Created/Modified

- `evals/retrieval/lib/assertions.ts` - First-class verdict evaluation with forbidden-hit, outcome, shape checks
- `evals/retrieval/lib/assertions.test.ts` - Tests for verdict evaluation
- `evals/retrieval/lib/report.ts` - Canonical report builder aggregating metrics and verdicts by slice
- `evals/retrieval/lib/report.test.ts` - Tests for report building and formatting
- `evals/retrieval/lib/format.ts` - Human-readable terminal formatting
- `evals/retrieval/lib/types.ts` - Added VerdictKind, Verdict, CaseVerdicts types
- `evals/retrieval/run.ts` - Updated to use report builder and format modules
- `evals/retrieval/README.md` - Documented report contract and maintainer workflow
- `packages/contracts/src/domain/evals/report.ts` - Canonical report schema with validation
- `packages/contracts/src/index.ts` - Export report types

## Decisions Made

- **First-class verdicts:** Each case produces a CaseVerdicts object with explicit verdicts for governance, outcome, shape, and execution - not just a combined pass/fail
- **Canonical report structure:** Report builder creates a single RetrievalEvalReport object; both JSON serialization and terminal formatting derive from this same structure
- **Stable slice keys:** Slices are aggregated by `{tier, endpoint, mode}` and sorted deterministically for regression comparison
- **Schema validation:** Reports are validated through `retrievalEvalReportSchema` before emission, ensuring contract compliance

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tests pass (105 tests across 6 test files).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Retrieval evaluation runner produces validated JSON and readable terminal reports
- Governance failures are explicit and cannot hide in ranking metrics
- Ready for Phase 27 (summary evaluation) and CI wiring in Phase 28

---
*Phase: 26-retrieval-metrics-runner-and-governance-checks*
*Completed: 2026-04-21*
