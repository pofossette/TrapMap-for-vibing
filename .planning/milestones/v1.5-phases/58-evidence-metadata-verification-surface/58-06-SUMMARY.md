---
phase: 58-evidence-metadata-verification-surface
plan: 06
subsystem: cli
tags: [evidence, cli, review, ansi-colors, zod-validation]

# Dependency graph
requires:
  - phase: 58-evidence-metadata-verification-surface
    plan: 02
    provides: EvidenceMeta, EvidenceHint, evidenceLevelSchema, evidenceSourceTypeSchema from contracts
  - phase: 58-evidence-metadata-verification-surface
    plan: 04
    provides: Review flow integration for capturing evidence metadata
  - phase: 58-evidence-metadata-verification-surface
    plan: 05
    provides: PATCH /v1/knowledge/:id/evidence endpoint, evidence filtering in operations routes
provides:
  - Review commands with --source-type, --source-ref, --evidence-level flags
  - CLI validation using zod safeParse from @trapmap/contracts
  - ANSI colored evidence output respecting NO_COLOR and isTTY
  - admin:evidence command for listing entries by evidence status
  - evidence:update command for updating evidence metadata
affects: [cli-review-commands, cli-admin-commands]

# Tech tracking
tech-stack:
  added: []
  patterns: [zod-safeParse-validation, ansi-colors-with-fallback, array-query-params]

key-files:
  created:
    - packages/cli/src/commands/evidence.ts
    - packages/cli/src/commands/review.test.ts
  modified:
    - packages/cli/src/commands/review.ts
    - packages/cli/src/index.ts
    - packages/contracts/src/domain/knowledge.ts

key-decisions:
  - "Use zod safeParse from contracts instead of importing server-side validation helpers"
  - "Default to internal-experience/anecdotal when evidence flags partially provided"
  - "Send evidenceLevel[] as array query param matching server z.array schema"
  - "Include evidenceMeta in knowledgeListItemSchema for list responses"

patterns-established:
  - "CLI flag validation: zod safeParse with user-friendly error messages listing valid options"
  - "ANSI color helper: withColor() checks NO_COLOR and isTTY before applying codes"
  - "Array query params: evidenceLevel[]=value format for z.array schema on server"

requirements-completed: [EVIDENCE-01, EVIDENCE-02]

# Metrics
duration: 20min
completed: 2026-05-02
---

# Plan 58-06: CLI Evidence Commands Summary

**Extended CLI review commands to accept evidence metadata flags and created admin evidence management commands with colored output.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-05-02T23:20:00Z
- **Completed:** 2026-05-02T23:27:00Z
- **Tasks:** 3
- **Files modified:** 4
- **Files created:** 2

## Accomplishments
- Added --source-type, --source-ref, --evidence-level flags to review:approve and review:reject commands
- Implemented zod safeParse validation with user-friendly error messages listing valid options
- Added evidence metadata display with ANSI colors respecting NO_COLOR and isTTY
- Created admin:evidence command with --level and --missing filter flags
- Created evidence:update command for updating evidence on existing entries
- Added evidenceMeta to knowledgeListItemSchema for list responses
- Created comprehensive test suite covering all evidence flag scenarios

## Task Commits

Each task was committed atomically:

1. **Task 1: Add evidence flags to review command** - `9bc6e5a` (feat)
2. **Task 2: Add admin:evidence and evidence:update commands** - `b4dce36` (feat)
3. **Task 3: Create CLI evidence tests** - `HEAD` (test)

## Files Created/Modified
- `packages/cli/src/commands/review.ts` - Added evidence flags, validation, and colored output
- `packages/cli/src/commands/evidence.ts` - New file: admin:evidence and evidence:update commands
- `packages/cli/src/commands/review.test.ts` - New file: tests for evidence flag handling
- `packages/cli/src/index.ts` - Registered evidence commands
- `packages/contracts/src/domain/knowledge.ts` - Added evidenceMeta to knowledgeListItemSchema

## Decisions Made
- Use zod safeParse from @trapmap/contracts instead of server-side validation helpers to keep CLI validation independent
- Default to internal-experience/anecdotal when evidence flags are partially provided
- Send evidenceLevel[] as array query param to match server's z.array(evidenceLevelSchema) schema
- Include evidenceMeta in knowledgeListItemSchema so admin:evidence can display evidence status

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Initial test mock responses were incomplete, causing Zod validation errors. Fixed by providing complete mock responses matching KnowledgeEntryResponse schema.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- CLI review commands fully support evidence metadata capture
- Admin commands support evidence-based filtering and updates
- All evidence CLI functionality tested and verified
- Ready for integration testing with server endpoints

---
*Phase: 58-evidence-metadata-verification-surface*
*Completed: 2026-05-02*
