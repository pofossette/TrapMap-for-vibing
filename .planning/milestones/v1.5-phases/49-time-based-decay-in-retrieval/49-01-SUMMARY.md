---
phase: 49-time-based-decay-in-retrieval
plan: 01
subsystem: [contracts, types]
tags: [zod, schema, freshness, decay, retrieval]

# Dependency graph
requires: []
provides:
  - freshnessTypeSchema with three decay types (evergreen/versioned/volatile)
  - freshnessDecayConfigSchema with per-type configuration
  - decayMetaSchema extended with freshnessType field
  - retrievalCitationSchema.scores with optional decayMultiplier
affects: [49-02, 49-03, 49-04, 49-05]

# Tech tracking
tech-stack:
  added: []
  patterns: [zod-schema-extend, backward-compatible-defaults]

key-files:
  created: []
  modified:
    - packages/contracts/src/domain/decay.ts
    - packages/contracts/src/domain/retrieval.ts

key-decisions:
  - "Default freshnessType to 'evergreen' for backward compatibility with existing records"
  - "Make decayMultiplier optional in citation scores for gradual rollout"

patterns-established:
  - "Three knowledge decay types: evergreen (no decay), versioned (step decay), volatile (exponential/linear decay)"
  - "Configurable decay curves with sensible defaults per type"

requirements-completed: [DECAY-02]

# Metrics
duration: 3 min
completed: 2026-05-02
---

# Phase 49 Plan 01: Freshness Type Contracts Summary

**Add freshness type schema and decay curve configuration to contracts layer for three knowledge types (evergreen, versioned, volatile).**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-02T09:40:17Z
- **Completed:** 2026-05-02T09:43:48Z
- **Tasks:** 4
- **Files modified:** 2

## Accomplishments
- Defined FreshnessType enum (evergreen, versioned, volatile) for knowledge decay classification
- Created per-type decay configuration schemas with sensible defaults
- Extended DecayMeta with freshnessType field defaulting to 'evergreen'
- Added optional decayMultiplier to retrieval citation scores

## Task Commits

Each task was committed atomically:

1. **Task 1: Add freshness type schema to decay contracts** - `2d72d4d` (feat)
2. **Task 2: Add freshness decay configuration schemas** - `7c1f787` (feat)
3. **Task 3: Extend DecayMeta with freshnessType field** - `e86c4a0` (feat)
4. **Task 4: Add decayMultiplier to retrieval citation scores** - `6b897d0` (feat)

## Files Created/Modified
- `packages/contracts/src/domain/decay.ts` - Added freshnessTypeSchema, decay mode schemas, per-type config schemas, extended DecayMeta
- `packages/contracts/src/domain/retrieval.ts` - Added optional decayMultiplier to citation scores

## Decisions Made
- Default freshnessType to 'evergreen' ensures existing records continue to work without migration
- decayMultiplier is optional in citation scores to allow gradual rollout without breaking existing clients
- halfLifeDays default of 30 days and floor of 0.3 provide reasonable decay curve for volatile content

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Contracts layer ready for server-side freshness multiplier implementation (49-02)
- Type definitions available for decay curve computation logic
- Backward compatibility ensured through default values

---
*Phase: 49-time-based-decay-in-retrieval*
*Completed: 2026-05-02*
