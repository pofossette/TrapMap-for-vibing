---
phase: 50-batch-management-interface
plan: 03
subsystem: cli
tags: [cli, decay, batch, commander, output-formatting]

requires:
  - phase: 50-batch-management-interface/02
    provides: GET /v1/operations/decay/entries, POST /v1/operations/decay/batch, POST /v1/operations/decay/search
provides:
  - decay-stale CLI command for listing entries by decay state
  - decay-batch CLI command for batch mutations with dry-run
  - decay-search CLI command for pattern search with decay facets
affects: []

tech-stack:
  added: []
  patterns: [commander-command, output-formatting, api-request-wrapper]

key-files:
  created:
    - packages/cli/src/commands/decay.ts
    - packages/cli/src/commands/decay.test.ts
  modified:
    - packages/cli/src/index.ts

key-decisions:
  - "All commands require session token via requireSessionToken"
  - "Commands gate on allowManage option tied to knowledge:update permission"
  - "Human-readable output shows entry ID, decay state, age, and shortcut"
  - "Batch output shows eligibility status with checkmarks/crosses and reasons"

patterns-established:
  - "CLI command pattern: loadCliState + requireSessionToken + apiRequest + printResult"
  - "Output formatting: formatters for human-readable and JSON modes"

requirements-completed: [DECAY-03]

duration: 15min
completed: 2026-05-02
---

# Plan 50-03: Decay Management CLI Commands Summary

**CLI commands for decay management with human-readable output and JSON mode**

## Performance

- **Duration:** 15 min
- **Started:** 2026-05-02T20:10:00Z
- **Completed:** 2026-05-02T20:20:00Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Created decay.ts command module with three CLI commands
- Implemented human-readable output formatters for list and batch results
- Added --json flag support for raw JSON output
- Added --dry-run flag for batch operations preview
- 32 comprehensive tests covering all commands and edge cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Create CLI decay commands with unit tests** - `HEAD` (feat)

## Files Created/Modified
- `packages/cli/src/commands/decay.ts` - Commander CLI commands for decay management
- `packages/cli/src/commands/decay.test.ts` - 32 tests covering all commands
- `packages/cli/src/index.ts` - Added registerDecayCommands import and registration

## Decisions Made
- All decay commands require knowledge:update permission (via allowManage option)
- Human-readable output uses compact format: ID, decay state, age, shortcut
- Batch output shows eligibility with ✓/✗ and ineligibility reasons
- Empty results show "No entries found" message
- Entries without decay state show "unknown" state and "n/a" age

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - implementation followed existing patterns from operations.ts.

## User Setup Required

None - CLI commands work with existing session authentication.

## Next Phase Readiness
- CLI surface complete for decay management (DECAY-03)
- All three commands functional with filtering and batch operations
- Ready for integration testing with live server

---
*Phase: 50-batch-management-interface*
*Completed: 2026-05-02*
