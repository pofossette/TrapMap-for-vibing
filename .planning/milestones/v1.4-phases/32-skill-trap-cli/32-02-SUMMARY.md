---
phase: 32-skill-trap-cli
plan: 32-02
subsystem: governance
tags: [governance, refactoring, eligibility, retrieval, capsule-recall]

# Dependency graph
requires:
  - phase: 32-01
    provides: shared governance module (governance/types.ts, governance/eligibility.ts, governance/permissions.ts, governance/index.ts)
provides:
  - filters.ts wired to shared governance via isGovernanceEligible + matchesGovernanceFilters
  - capsule-recall.ts wired to shared governance via isGovernanceEligible
  - No governance logic duplication in retrieval layer
affects: [32-03, 32-04, retrieval, governance]

# Tech tracking
tech-stack:
  added: []
  patterns: [adapter-pattern for domain record to GovernedEntity mapping]

key-files:
  created: []
  modified:
    - packages/server/src/lib/retrieval/filters.ts
    - packages/server/src/lib/retrieval/capsule-recall.ts

key-decisions:
  - "Adapter functions map domain-specific records (KnowledgeRecord, SkillArtifactRecord) to GovernedEntity inline rather than adding interface inheritance"
  - "capsule-recall.ts ArtifactGovernanceFilters interface kept unchanged to avoid breaking callers"

patterns-established:
  - "Adapter pattern: domain records mapped to GovernedEntity via inline object literal in toGovernedEntity or inline const"
  - "Governance delegation: retrieval-layer functions delegate to shared module rather than implementing checks inline"

requirements-completed: []

# Metrics
duration: 4min
completed: 2026-04-24
---

# Phase 32 Plan 02: Refactor Existing Code to Use Shared Governance Module Summary

**Wired filters.ts and capsule-recall.ts to delegate eligibility checks to the shared governance module, eliminating duplicated governance logic across the retrieval layer**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-24T07:51:48Z
- **Completed:** 2026-04-24T07:56:05Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- filters.ts now delegates all eligibility logic (lifecycle, level, team, scope, labels) to isGovernanceEligible + matchesGovernanceFilters
- capsule-recall.ts now delegates artifact governance checks to isGovernanceEligible via inline adapter
- All 498 existing tests pass without modification, confirming behavioral equivalence

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor retrieval/filters.ts to use shared governance** - `3c749e7` (refactor)
2. **Task 2: Refactor retrieval/capsule-recall.ts to use shared governance** - `0053b61` (refactor)

## Files Created/Modified
- `packages/server/src/lib/retrieval/filters.ts` - Replaced inline eligibility checks with delegation to governance module; added toGovernedEntity adapter
- `packages/server/src/lib/retrieval/capsule-recall.ts` - Replaced inline governance checks in isArtifactGovernanceEligible with delegation to isGovernanceEligible

## Decisions Made
- Used inline object literal adapters (toGovernedEntity function / const entity) rather than making KnowledgeRecord or SkillArtifactRecord implement GovernedEntity interface -- avoids coupling domain types to governance abstraction
- Kept ArtifactGovernanceFilters interface unchanged in capsule-recall.ts to preserve backward compatibility with all callers
- Used extractGovernanceContext in filters.ts to bridge ResolvedAuthContext to GovernanceContext; capsule-recall.ts constructs GovernanceContext directly from ArtifactGovernanceFilters since it has a different input shape

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing build errors in test files (retrieval.test.ts, review.test.ts) unrelated to this plan's changes -- out of scope, not fixed

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both retrieval-layer files now use shared governance module for all eligibility decisions
- Ready for subsequent plans to build trap-specific CLI commands that also delegate to the shared governance module
- The governance module is now the single source of truth for eligibility logic across both KnowledgeEntry and SkillArtifact domains

## Self-Check: PASSED

All files and commits verified present.

---
*Phase: 32-skill-trap-cli*
*Completed: 2026-04-24*
