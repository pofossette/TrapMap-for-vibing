---
phase: 48-lifecycle-state-machine
plan: 01
subsystem: database
tags: [zod, decay, lifecycle, state-machine, config]

requires: []
provides:
  - DecayState enum with 5 states (active, review-due, stale, expired, superseded)
  - DecayConfig schema with validated thresholds [1, 3650] days
  - DecayMeta schema for tracking decay on records
  - computeDecayState pure function for age-based transitions
  - loadDecayConfig for environment-based configuration
  - decayMeta field on KnowledgeRecord and SkillArtifactRecord
affects: [48-02, 48-03]

tech-stack:
  added: []
  patterns: [pure-state-machine, zod-validation, env-config]

key-files:
  created:
    - packages/contracts/src/domain/decay.ts
    - packages/server/src/lib/decay/state-machine.ts
    - packages/server/src/lib/decay/state-machine.test.ts
    - packages/server/src/lib/decay/config.ts
    - packages/server/src/lib/decay/config.test.ts
  modified:
    - packages/contracts/src/index.ts
    - packages/server/src/lib/store.ts

key-decisions:
  - "Used Zod for all schemas to ensure runtime validation matches TypeScript types"
  - "Made decayMeta nullable on records for backward compatibility with existing data"
  - "Implemented state machine as pure function with injected timestamp for deterministic testing"

patterns-established:
  - "Pure state machine: computeDecayState takes entry + config + now, returns computed state"
  - "Environment config loader: loadDecayConfig reads TRAPMAP_DECAY_* vars with Zod validation"
  - "Null-safe defaults: entries without decayMeta default to 'active' state"

requirements-completed: [DECAY-01]

duration: 15min
completed: 2026-05-02
---

# Plan 48-01: Core Decay Domain Model Summary

**Decay domain contracts with Zod schemas, pure state machine for age-based transitions, environment config loader, and store record extensions**

## Performance

- **Duration:** 15 min
- **Started:** 2026-05-02T14:36:00Z
- **Completed:** 2026-05-02T14:51:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created decay state schema with 5 states (active, review-due, stale, expired, superseded)
- Implemented computeDecayState with age-based transitions and superseded detection
- Created config loader with environment variable overrides and Zod validation
- Extended KnowledgeRecord and SkillArtifactRecord with decayMeta field
- 44 comprehensive tests (32 state machine + 12 config)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create decay contracts and state machine** - `3970338` (feat)
2. **Task 2: Create config loader and extend store records** - `3970338` (feat)

## Files Created/Modified
- `packages/contracts/src/domain/decay.ts` - DecayState, DecayConfig, DecayMeta schemas and types
- `packages/contracts/src/index.ts` - Barrel export for decay module
- `packages/server/src/lib/decay/state-machine.ts` - computeDecayState pure function + helpers
- `packages/server/src/lib/decay/state-machine.test.ts` - 32 tests covering all state transitions
- `packages/server/src/lib/decay/config.ts` - loadDecayConfig with env var reading
- `packages/server/src/lib/decay/config.test.ts` - 12 tests for config validation
- `packages/server/src/lib/store.ts` - Added decayMeta field to KnowledgeRecord and SkillArtifactRecord

## Decisions Made
- Used Zod for all schemas to ensure runtime validation matches TypeScript types
- Made decayMeta nullable on records for backward compatibility with existing fixtures
- Implemented state machine as pure function with injected timestamp for deterministic testing
- Added helper functions (isTerminalDecayState, requiresAttention, validateDecayConfig) for convenience

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Worktree merge conflict during orchestrator cleanup required manual file recovery. The executor's work was present as untracked files in the working directory and was successfully committed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Decay contracts and state machine ready for use by supersede feature (48-02)
- Decay filtering in governance/retrieval pipelines (48-03) can reference these types
- Config can be enabled via TRAPMAP_DECAY_ENABLED=true environment variable

---
*Phase: 48-lifecycle-state-machine*
*Completed: 2026-05-02*
