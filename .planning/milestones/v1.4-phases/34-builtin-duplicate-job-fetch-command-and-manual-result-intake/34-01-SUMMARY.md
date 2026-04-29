---
phase: 34-builtin-duplicate-job-fetch-command-and-manual-result-intake
plan: 01
subsystem: contracts
tags: [zod, schema, types, duplicate-detection, manual-review]

# Dependency graph
requires:
  - phase: 33
    provides: CandidateSubmission and DuplicateCase types
provides:
  - Manual result submission types for duplicate case resolution
  - Duplicate job bundle response types for offline review
affects: [phase-35, phase-36]

# Tech tracking
tech-stack:
  added: []
  patterns: [zod schema for domain validation, type exports via z.infer]

key-files:
  created: []
  modified:
    - packages/contracts/src/domain/candidates.ts

key-decisions:
  - "Manual result decision uses enum with 'independent' and 'merged' values for explicit reviewer choices"
  - "Bundle response includes full entity data for offline review without requiring additional API calls"

patterns-established:
  - "Schema definitions followed by type exports using z.infer pattern"

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-04-24
---

# Phase 34 Plan 01: Add Duplicate Job Bundle and Manual Result Types Summary

**Added domain types for duplicate job bundle response and manual result submission schemas to the contracts package, enabling offline review and structured decision intake for Phase 35 processing.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-24T10:30:15Z
- **Completed:** 2026-04-24T10:32:15Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- Added manual result submission types (ManualResultDecision, ManualResultSubmission, MergedWithReference, ManualResultResponse) for reviewer decisions
- Added duplicate job bundle response types (DuplicateJobBundleResponse, DuplicateJobMatchEntry, DuplicateJobMatchEntity, ExpectedManualResultSchema) for offline review
- Verified TypeScript compilation succeeds with all new exports

## Task Commits

Each task was committed atomically:

1. **Task 1: Add manual result submission types** - `73a2bb7` (feat)
2. **Task 2: Add duplicate job bundle response types** - `ec363d7` (feat)
3. **Task 3: Verify contracts export all new types** - No file changes (verification only)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `packages/contracts/src/domain/candidates.ts` - Added 103 lines of new schema definitions and type exports for manual result and bundle response types

## Decisions Made

- Used explicit enum for manual result decision ('independent' | 'merged') to enforce valid reviewer choices
- Bundle response includes full entity data (trap/skill fields) to support offline review without additional lookups
- ExpectedManualResultSchema provides schema metadata for UI form generation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all schemas compiled successfully on first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Contracts package now has all types needed for duplicate job fetch command and manual result intake
- Ready for Phase 34-02 (CLI command implementation)
- Ready for Phase 35 (manual result revalidation and publish merge reconciliation)

---
*Phase: 34-builtin-duplicate-job-fetch-command-and-manual-result-intake*
*Completed: 2026-04-24*
