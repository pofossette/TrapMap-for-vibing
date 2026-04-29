---
phase: 32
plan: 03
subsystem: cli
tags: [cli, trap-command, domain-separation, backward-compat]
dependency_graph:
  requires: [32-02]
  provides: [trap-cli-group]
  affects: [packages/cli]
tech_stack:
  added: [trap-command-group]
  patterns: [command-alias, domain-separated-cli]
key_files:
  created:
    - packages/cli/src/commands/trap.ts
  modified:
    - packages/cli/src/index.ts
decisions:
  - Trap commands reuse same /v1/knowledge API endpoints for full backward compatibility
  - Trap commands share same visibility flags as knowledge commands (allowSubmit, allowInspect)
  - Existing knowledge commands left fully intact -- no deprecation at this stage
metrics:
  duration_seconds: 149
  tasks_completed: 2
  files_created: 1
  files_modified: 1
  completed_date: "2026-04-24"
---

# Phase 32 Plan 03: Create trap CLI Command Group Summary

New `trap` CLI command group providing domain-separated interface for pitfall/warning knowledge operations, aliasing existing knowledge functionality while maintaining full backward compatibility.

## Tasks Completed

### Task 1: Create trap CLI command module
**Commit:** a3de832

Created `packages/cli/src/commands/trap.ts` with four subcommands:
- `trap submit` -- submit a new trap entry for review (POST /v1/knowledge)
- `trap resubmit <entryId>` -- resubmit a rejected trap entry (POST /v1/knowledge/:entryId/resubmit)
- `trap list` -- list your trap submissions (GET /v1/knowledge/mine)
- `trap show <entryId>` -- show details of a trap entry (GET /v1/knowledge/:entryId)

Module mirrors the knowledge.ts structure with trap-specific terminology in descriptions and output messages.

### Task 2: Register trap commands in CLI index
**Commit:** 343777f

Updated `packages/cli/src/index.ts`:
- Added import for `registerTrapCommands` from `./commands/trap.js`
- Registered trap commands with same visibility flags (`allowKnowledgeSubmit`, `allowKnowledgeInspect`)
- Added `trap submit`, `trap resubmit`, `trap list`, `trap show` to `api:list` command output
- Existing `registerKnowledgeCommands` call remains unchanged

## Decisions Made

1. **Same API endpoints** -- Trap commands use `/v1/knowledge/*` endpoints identically to knowledge commands. This is intentional: the trap command group is a domain-naming alias, not a separate service boundary.
2. **Shared visibility flags** -- Trap commands reuse `allowKnowledgeSubmit` and `allowKnowledgeInspect` since they gate the same server-side operations.
3. **No deprecation warnings** -- The existing knowledge commands are left fully intact. Deprecation messaging is deferred to a future plan.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `pnpm --filter @trapmap/cli build` -- No errors in trap.ts or index.ts (pre-existing errors in other unrelated files confirmed out of scope)
- `registerTrapCommands` import and call confirmed in index.ts
- `api:list` output includes all four trap subcommands
- Existing `registerKnowledgeCommands` call preserved

## Known Stubs

None.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundary changes introduced. The trap commands delegate to the same existing API paths with the same authorization model.

## Self-Check: PASSED

- FOUND: packages/cli/src/commands/trap.ts
- FOUND: packages/cli/src/index.ts
- FOUND: .planning/phases/32-skill-trap-cli/32-03-SUMMARY.md
- FOUND: a3de832 (Task 1 commit)
- FOUND: 343777f (Task 2 commit)
