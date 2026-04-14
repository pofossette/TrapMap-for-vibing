---
phase: 04-retrieval-and-cli-workflow
plan: 03
subsystem: cli
tags:
  - cli
  - retrieval
  - commander
  - permission-aware
provides:
  - CLI search command with shell-friendly input options (direct seed, stdin, labels, scope, max-results, no-refinement)
  - Permission-aware command visibility for search based on knowledge:search permission
  - Formatted text output with separate Global constraints and Project knowledge sections
  - JSON output mode for machine-readable retrieval responses
affects:
  - packages/cli
  - Phase 05 (any CLI workflow extensions)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - TDD approach: tests written first (RED), implementation passes tests (GREEN)
    - Shell-friendly CLI input with --stdin flag for piped content
    - Permission-aware command registration using visibility flags
    - Repeated flag collection using collectValues helper
    - Formatted output with printResult helper and custom formatter

key-files:
  created:
    - packages/cli/src/commands/retrieval.ts
    - packages/cli/src/commands/retrieval.test.ts
  modified:
    - packages/cli/src/index.ts

key-decisions:
  - Search command does not include --team-id override; uses caller's active team from session
  - Mocked resolveTextInput in tests to avoid stdin complexity in test environment
  - api:list includes 'search' only when knowledge:search permission is available

patterns-established:
  - TDD workflow: write failing tests first, then implement to pass
  - CLI command registration pattern: visibility check -> register -> api:list inclusion
  - Repeated flag collection pattern using collectValues helper
  - Formatted output pattern: printResult with custom formatter function

requirements-completed: [CLI-01, CLI-02, RAG-01]

# Metrics
duration: 2min
completed: 2026-04-13
---

# Phase 4 Plan 03 Summary

**CLI search command with shell-friendly input options, permission-aware visibility, and formatted text/JSON output modes.**

## Performance

- **Duration:** 2min
- **Started:** 2026-04-13T11:07:27Z
- **Completed:** 2026-04-13T11:09:39Z
- **Tasks:** 2 completed
- **Files created:** 2
- **Files modified:** 1

## Accomplishments

### Task 1: Implement the CLI `search` command with shell-friendly input options
- Created `packages/cli/src/commands/retrieval.ts` with `search [seed]` command
- Supports direct seed argument, `--stdin` flag for piped input
- Supports repeated `--label` flags, `--scope` filter, `--max-results`, and `--no-refinement`
- Posts to `/v1/retrieval/search` through `apiRequest` with proper schema validation
- Human-readable output prints separate "Global constraints" and "Project knowledge" sections
- JSON output mode (`--json`) prints raw contract-shaped retrieval data
- Wrote comprehensive test suite with 7 tests covering all functionality

### Task 2: Wire search into the permission-aware command surface
- Added `allowKnowledgeSearch` visibility check in `packages/cli/src/index.ts`
- Registered `registerRetrievalCommands` with `allowSearch` option
- Added 'search' to `api:list` output when `knowledge:search` permission is available
- Added visibility tests to verify command registration behavior
- All 9 tests pass and TypeScript compilation succeeds

## Task Commits

1. **48de2e6** - `test(04-03): add CLI search command with shell-friendly input options`
   - Created retrieval.ts with search command supporting all required flags
   - Added comprehensive test suite with 7 tests covering text output, JSON output, and flag combinations
   - Tests mock apiRequest and use proper Commander.js patterns
   - Formatted output separates Global constraints and Project knowledge sections
   - All tests pass (7/7)

2. **4b3f968** - `feat(04-03): wire search into permission-aware command surface`
   - Added allowKnowledgeSearch visibility check based on knowledge:search permission
   - Registered registerRetrievalCommands with allowSearch option
   - Added 'search' to api:list output when permission is available
   - Added visibility tests to verify search command registration behavior
   - All tests pass (9/9) and typecheck succeeds

## Files Created/Modified

- `packages/cli/src/commands/retrieval.ts` - CLI search command with shell-friendly input options and formatted output
- `packages/cli/src/commands/retrieval.test.ts` - Comprehensive test suite covering text output, JSON output, and all flags
- `packages/cli/src/index.ts` - Added permission-aware visibility and registration for retrieval commands

## Decisions Made

- Search command does not include `--team-id` override; uses the caller's active team from cached session to align with `retrievalQuerySchema` and the active-team access model
- Mocked `resolveTextInput` in tests to avoid stdin complexity in test environment while maintaining test coverage for the stdin flag
- Positioned 'search' in api:list between review-status and review commands to group retrieval-related workflow surfaces

## Deviations from Plan

None - plan executed exactly as written.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| T-04-07 | packages/cli/src/index.ts | CLI visibility based on cached session only - search command exposed only when knowledge:search permission present |
| T-04-08 | packages/cli/src/commands/retrieval.ts | Parse responses with shared retrieval schemas - uses retrievalResponseSchema.parse() for contract validation |
| T-04-09 | packages/cli/src/commands/retrieval.ts | Present only server-returned data - formatter displays only globalConstraints, projectKnowledge, and refinementSummary from API response |

## Known Stubs

None - all CLI search functionality is fully implemented and tested.

## Next Phase Readiness

Phase 4 Wave 3 is complete. The CLI now has a fully functional search command that:
- Accepts shell-friendly input (direct seed, stdin, flags)
- Communicates with the `/v1/retrieval/search` endpoint
- Respects permission-based visibility
- Provides both human-readable and JSON output modes
- Properly formats results into Global constraints and Project knowledge sections

The retrieval pipeline is now end-to-end: CLI -> API -> embeddings -> ranking -> response shaping -> formatted output.

## Self-Check: PASSED

- [x] SUMMARY.md created at `.planning/phases/04-retrieval-and-cli-workflow/04-03-SUMMARY.md`
- [x] Commit 48de2e6 exists in git history
- [x] Commit 4b3f968 exists in git history
- [x] All tests pass (9 tests)
- [x] TypeScript compilation succeeds
- [x] No stubs in implementation
- [x] All threat model mitigations implemented
