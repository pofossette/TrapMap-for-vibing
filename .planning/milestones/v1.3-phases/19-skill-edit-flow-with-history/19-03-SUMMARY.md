---
phase: 19-skill-edit-flow-with-history
plan: 03
status: complete
completed: 2026-04-19
requirements:
  - SKED-02
  - SKED-04
---

# Plan 19-03: Add CLI edit-by-id command and history view

## Summary

Successfully added CLI commands for skill editing and history viewing. Users with proper permissions can now edit skill artifacts and view revision history from the terminal.

## Tasks Completed

| Task | Description | Status |
|------|-------------|--------|
| 1 | Add skill edit command with file and metadata update support | ✅ Complete |
| 2 | Add skill history command with revision display | ✅ Complete |
| 3 | Update CLI index with new visibility flags and command registration | ✅ Complete |

## Implementation Details

### Commands Added

1. **`trapmap skill edit <artifactId>`**:
   - Options: `--title`, `--labels`, `--file`, `--json`
   - Requires `knowledge:submit` permission
   - Validates at least one update option is provided
   - Reads file contents and sends to server
   - Text output shows artifact ID, revision info, lifecycle transition

2. **`trapmap skill history <artifactId>`**:
   - Options: `--json`
   - Requires `knowledge:export` permission
   - Displays revision history with timestamps and actors
   - Shows current revision and lifecycle state

### Visibility Flags

Updated `SkillCommandOptions` to include:
- `allowSearch` - for search-by-content command
- `allowSubmit` - for edit command
- `allowExport` - for history command

### api:list Integration

- `skill edit` appears when `knowledge:submit` is allowed
- `skill history` appears when `knowledge:export` is allowed

## Files Modified

- `packages/cli/src/commands/skill.ts` - Added edit and history commands
- `packages/cli/src/index.ts` - Updated visibility and registration

## Test Coverage

- 81 CLI tests passing
- All existing commands remain functional

## Threat Model Mitigations

| Threat | Mitigation |
|--------|------------|
| T-19-10 | Session token required before API requests |
| T-19-11 | Edit command only visible with `knowledge:submit` |
| T-19-12 | File content passed to server for validation |
| T-19-13 | Text output deterministic, JSON is raw response |
| T-19-14 | History command only visible with `knowledge:export` |

## Verification

- All 81 CLI tests pass
- TypeScript type checking passes
- Commands discoverable in api:list
