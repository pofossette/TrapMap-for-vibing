---
phase: 34-builtin-duplicate-job-fetch-command-and-manual-result-intake
plan: 04
subsystem: cli
tags: [commander, cli, duplicate-detection, manual-review]

# Dependency graph
requires:
  - phase: 34
    plan: 01
    provides: DuplicateJobBundleResponse, ManualResultResponse types from contracts
  - phase: 34
    plan: 03
    provides: GET /v1/duplicates/:candidateId/bundle and POST /v1/candidates/:candidateId/manual-result endpoints
provides:
  - CLI commands for duplicate job fetch and resolve under skill namespace
  - Operator-friendly interface for offline duplicate review workflow
affects: [phase-35]

# Tech tracking
tech-stack:
  added: []
  patterns: [commander subcommand groups, API client with Zod validation]

key-files:
  created: []
  modified:
    - packages/cli/src/commands/skill.ts
    - packages/cli/src/index.ts

key-decisions:
  - "duplicate-job commands nested under skill namespace and gated by allowReview permission"
  - "resolve command validates decision value and merged options before API call"

patterns-established:
  - "Formatter functions for text output with --json flag fallback"
  - "Command validation before API request for better error messages"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-04-24
---

# Phase 34 Plan 04: Add CLI Commands for Duplicate Job Fetch and Resolve Summary

**Added CLI commands under the skill namespace for fetching duplicate job bundles and submitting manual resolution decisions, enabling reviewers to manage duplicate cases through a discoverable terminal interface.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-24T11:15:00Z
- **Completed:** 2026-04-24T11:20:00Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Added `skill duplicate-job fetch <candidateId>` command to fetch bundle for offline review
- Added `skill duplicate-job resolve <candidateId>` command with required --decision and --notes options
- Updated api:list output to include new commands for reviewers with knowledge:review permission
- Implemented validation for merged options when decision is "merged"

## Task Commits

Each task was committed atomically:

1. **Task 1 & 2: Add duplicate-job fetch and resolve commands** - `dd9c3b5` (feat)
2. **Task 3: Update CLI visibility options** - `eccaef8` (feat)

## Files Created/Modified

- `packages/cli/src/commands/skill.ts` - Added formatDuplicateJobBundle, formatManualResultResponse functions and duplicate-job fetch/resolve commands
- `packages/cli/src/index.ts` - Added duplicate-job commands to api:list visibility for reviewers

## Decisions Made

- Nested duplicate-job commands under skill namespace for discoverability alongside other review commands
- Validation in CLI before API call provides clearer error messages for invalid options
- Used existing allowReview permission gate consistent with other review commands

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in CLI package (unrelated to this plan - audit.ts, operations.ts, test files) prevent full CLI build, but new code compiles successfully.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CLI commands ready for duplicate job review workflow
- Ready for Phase 35 (manual result revalidation and publish merge reconciliation)

---
*Phase: 34-builtin-duplicate-job-fetch-command-and-manual-result-intake*
*Completed: 2026-04-24*
