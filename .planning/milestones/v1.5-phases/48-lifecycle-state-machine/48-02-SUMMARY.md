---
phase: 48-lifecycle-state-machine
plan: 02
subsystem: api
tags: [supersede, lifecycle, decay, mutation, cli]

requires: [48-01]
provides:
  - supersedeEntry mutation function with validation
  - POST /v1/knowledge/:entryId/supersede route
  - POST /v1/traps/:trapId/supersede route
  - CLI `knowledge supersede` subcommand
affects: []

tech-stack:
  added: []
  patterns: [mutation-service, route-handler, cli-command]

key-files:
  created:
    - packages/server/src/lib/decay/supersede.ts
    - packages/server/src/lib/decay/supersede.test.ts
  modified:
    - packages/server/src/routes/knowledge.ts
    - packages/server/src/routes/traps.ts
    - packages/cli/src/commands/knowledge.ts
    - packages/server/src/lib/user-ops-log.ts
    - packages/server/src/lib/knowledge.ts

key-decisions:
  - "Supersede requires both entries to be approved before allowing the operation"
  - "Self-supersede rejected with explicit error code 'invalid_supersede'"
  - "Supersede sets decayMeta.supersededById and decayState='superseded'"
  - "Lifecycle event with type 'deactivated' records the supersede action"
  - "Both knowledge and trap routes use shared supersedeEntry function"

patterns-established:
  - "Mutation function takes store + data + params, returns modified record"
  - "Route handlers require 'knowledge:update' permission for admin operations"
  - "CLI commands follow existing patterns: argument + required option + json output"

requirements-completed: [DECAY-01]

duration: 20min
completed: 2026-05-02
---

# Plan 48-02: Supersede Feature Summary

**Manual supersede feature enabling admins to explicitly supersede knowledge/trap entries with replacements**

## Performance

- **Duration:** 20 min
- **Started:** 2026-05-02T14:50:00Z
- **Completed:** 2026-05-02T15:10:00Z
- **Tasks:** 1
- **Files modified:** 6

## Accomplishments
- Created supersedeEntry mutation function with comprehensive validation
- Added POST /v1/knowledge/:entryId/supersede route with knowledge:update permission
- Added POST /v1/traps/:trapId/supersede route with knowledge:update permission
- Added CLI `knowledge supersede <entryId> --replacement <id>` subcommand
- Added 'supersede' and 'trap-supersede' action types to UserOpsAction
- Fixed missing decayMeta field in createKnowledgeEntryRecord
- 8 comprehensive tests covering all validation scenarios

## Task Commits

Each task was committed atomically:

1. **feat(48-02): implement supersede feature for knowledge lifecycle** - `251d053`
2. **fix(48-02): add decayMeta to createKnowledgeEntryRecord** - `4722016`
3. **fix(48-01): add decayMeta to remaining record creators** - `d84ab82`

## Files Created/Modified
- `packages/server/src/lib/decay/supersede.ts` - supersedeEntry mutation function
- `packages/server/src/lib/decay/supersede.test.ts` - 8 tests covering all validation scenarios
- `packages/server/src/routes/knowledge.ts` - Added POST /v1/knowledge/:entryId/supersede route
- `packages/server/src/routes/traps.ts` - Added POST /v1/traps/:trapId/supersede route
- `packages/cli/src/commands/knowledge.ts` - Added supersede CLI subcommand
- `packages/server/src/lib/user-ops-log.ts` - Added 'supersede' and 'trap-supersede' action types
- `packages/server/src/lib/knowledge.ts` - Added decayMeta: null to createKnowledgeEntryRecord
- `packages/server/src/lib/artifacts/model.ts` - Added decayMeta: null to createSkillArtifactRecord
- `packages/server/src/lib/candidates/reconcile.ts` - Added decayMeta: null to publish functions

## Decisions Made
- Supersede requires both entries to be in 'approved' lifecycle state
- Self-supersede (entryId === replacementId) rejected with 'invalid_supersede' error
- DecayMeta.lastVerifiedAt preserved if already set, otherwise defaults to entry.updatedAt
- Lifecycle event note format: "Superseded by {replacementId}"
- Both knowledge and trap routes delegate to shared supersedeEntry function

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Type errors for missing decayMeta field in record creators (createKnowledgeEntryRecord, createSkillArtifactRecord, publishTrapCandidate, publishSkillCandidate) - fixed by adding decayMeta: null to all record creation functions.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Supersede feature ready for use by decay filtering (48-03)
- Governance eligibility can check for superseded entries via decayMeta.supersededById
- Retrieval pipelines can filter superseded entries via decayState='superseded'

---
*Phase: 48-lifecycle-state-machine*
*Completed: 2026-05-02*
