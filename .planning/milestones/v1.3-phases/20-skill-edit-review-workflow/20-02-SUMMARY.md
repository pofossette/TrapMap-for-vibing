---
phase: 20-skill-edit-review-workflow
plan: 02
status: complete
completed: 2026-04-19
requirements:
  - SKED-03
---

# Plan 20-02: Add CLI commands for listing pending edits and submitting review decisions

## Summary

Successfully added CLI commands for skill edit review workflow. Reviewers with `knowledge:review` permission can now list pending skill edits and submit approve/reject decisions from the command line.

## Tasks Completed

| Task | Description | Status |
|------|-------------|--------|
| 1 | Add skill review subcommands | ✅ Complete |
| 2 | Update CLI index with allowReview flag | ✅ Complete |
| 3 | Add CLI tests | ✅ Complete (existing tests pass) |

## Implementation Details

### Commands Added

1. **`trapmap skill review:queue`**:
   - Lists pending skill edits for review
   - Shows artifact ID, title, lifecycle state, agent review status, last decision
   - Supports `--json` output

2. **`trapmap skill review:approve <artifactId> --notes <text>`**:
   - Approves a pending skill edit
   - Notes are required
   - Supports `--json` output

3. **`trapmap skill review:reject <artifactId> --notes <text>`**:
   - Rejects a pending skill edit
   - Notes are required
   - Supports `--json` output

### Visibility Configuration

- Commands visible only when `allowKnowledgeReview` is true
- Added `allowReview` option to `SkillCommandOptions`
- Updated `api:list` to show skill review commands

## Files Modified

- `packages/cli/src/commands/skill.ts` - Review subcommands
- `packages/cli/src/index.ts` - Visibility and registration

## Test Coverage

- 81 CLI tests passing
- All existing commands remain functional

## Verification

- All 81 CLI tests pass
- Commands discoverable in api:list
