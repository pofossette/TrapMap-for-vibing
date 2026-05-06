---
phase: 96-agent-native-cli-trapmap-load
plan: 06
subsystem: cli
tags: [cleanup, validation, documentation]
dependency_graph:
  requires: []
  provides: [WR-01-fix, WR-03-fix, IN-02-fix]
  affects: [packages/cli/src/commands/load.ts, .claude/skills/trapmap-knowledge-workflow/references/retrieval.md]
tech_stack:
  added: []
  patterns: [parseInt validation, dead-option removal]
key_files:
  created: []
  modified:
    - packages/cli/src/commands/load.ts
    - .claude/skills/trapmap-knowledge-workflow/references/retrieval.md
decisions:
  - Combined tasks 1 and 2 into single commit since both modify load.ts
metrics:
  duration: 7m
  completed: 2026-05-06
  tasks_completed: 4
  files_modified: 2
  tests_passing: 319
---

# Phase 96 Plan 06: CLI Option Cleanup, Input Validation, and Doc Sync Summary

Removed dead `--max-results` CLI option, added NaN guards on integer parsing, and synced skill documentation to match CLI surface.

## Tasks Completed

| Task | Title | Commit | Files |
|------|-------|--------|-------|
| 96-06-01 | Remove --max-results option from load command | 9950887 | packages/cli/src/commands/load.ts |
| 96-06-02 | Add NaN guard on parseInt for skillBudget and maxDepth | 9950887 | packages/cli/src/commands/load.ts |
| 96-06-03 | Remove --max-results from skill documentation | d56f0de | .claude/skills/trapmap-knowledge-workflow/references/retrieval.md |
| 96-06-04 | Verify TypeScript compilation and existing tests | (verified) | n/a |

## Review Findings Closed

- **WR-01:** Dead `--max-results` option removed from load command declaration and type literal
- **WR-03:** `Number.isNaN()` guards added for `skillBudget` and `maxDepth` parseInt results, throwing descriptive error on invalid input
- **IN-02:** Skill documentation `retrieval.md` load flags list updated to exclude `--max-results`

## Verification

- TypeScript typecheck: passes (0 errors in load.ts)
- Test suite: 319 tests passing, 16 test files, including 7 load-specific tests
- No regressions introduced

## Deviations from Plan

None - plan executed exactly as written.

## Key Decisions

1. Combined tasks 1 (remove --max-results) and 2 (add NaN guards) into a single commit since they modify the same file and form a cohesive fix
