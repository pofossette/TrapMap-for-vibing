---
phase: 14-seed-intent-retrieval-and-capsule-ranking
plan: "02"
subsystem: "Retrieval and Capsule Ranking"
tags: ["retrieval", "capsule-native", "derivation", "governance", "ranking"]
wave: 2
depends_on:
  - 14-01
files_modified:
  - packages/server/src/lib/artifacts/derive.ts
  - packages/server/src/lib/artifacts/derive.test.ts
  - packages/server/src/lib/retrieval/orchestrator.ts
  - packages/server/src/lib/retrieval/capsule-recall.ts
  - packages/server/src/lib/retrieval/capsule-recall.test.ts
autonomous: true
requirements:
  - RETR-03
  - CAPS-04
  - COMP-02
must_haves:
  truths:
    - "Approved artifact-derived profiles and capsules become the main retrieval candidates instead of flat knowledge entries."
    - "Ranking considers parsed problem/situation signals plus stack/path boosts while still respecting team, level, and approval gates."
    - "The Phase 12 derivation seam remains the source of profile/capsule data; retrieval does not bypass it."
  artifacts:
    - path: "packages/server/src/lib/artifacts/derive.ts"
      provides: "Text-backed profile/capsule derivation suitable for ranking"
    - path: "packages/server/src/lib/retrieval/capsule-recall.ts"
      provides: "Profile shortlist and capsule ranking helpers"
    - path: "packages/server/src/lib/retrieval/orchestrator.ts"
      provides: "Governed v2 recall pipeline over artifact-derived data"
requires:
  - phase: "Phase 12"
    provides: "Skill artifact derived outputs (profile, capsules, clientManifest)"
  - phase: "14-01"
    provides: "ParsedIntent types and parseSeedIntent() helper"
provides:
  - "14-02: Retrieval-grade derivation from actual file content"
  - "14-02: Governed profile shortlist and capsule ranking"
  - "14-02: V2 retrieval pipeline with capsule-native results"
affects:
  - "14-03: Distilled response shaping"
  - "14-04: Route and CLI integration"
tech_stack:
  added: []
  patterns:
    - "Text-backed profile/capsule derivation from SKILL.md and references/"
    - "Governed capsule extraction with approval/team/level filtering"
    - "Intent signal scoring with stack/path boosts"
    - "Coexistence of legacy v1 and v2 retrieval pipelines"
key_files:
  created:
    - "packages/server/src/lib/retrieval/capsule-recall.ts:380 lines - Capsule recall helpers for governance and ranking"
    - "packages/server/src/lib/retrieval/capsule-recall.test.ts:492 lines - TDD tests for capsule recall"
  modified:
    - "packages/server/src/lib/artifacts/derive.ts:585 lines - Added deriveFromPayloads() for text-backed derivation"
    - "packages/server/src/lib/artifacts/derive.test.ts:461 lines - Added retrieval-grade derivation tests"
    - "packages/server/src/lib/retrieval/orchestrator.ts:559 lines - Added searchKnowledgeV2() pipeline"
key_decisions:
  - "Use deriveFromPayloads() for retrieval-grade derivation from actual file content instead of placeholders"
  - "Rank capsules using parsed intent signals: situation, problem, goal, errorText, and keywords"
  - "Apply stack/path boosts when capsule content matches detected technology hints"
  - "Preserve legacy v1 retrieval unchanged for coexistence during v1.2 transition"
requirements_completed:
  - RETR-03
  - CAPS-04
  - COMP-02
duration: "38 min"
completed_date: "2026-04-16T14:48:47Z"
---

# Phase 14 Plan 02: Retrieval-Grade Derivation and Capsule Ranking Summary

**Implemented retrieval-grade derivation and capsule ranking with governance enforcement for artifact-native retrieval.**

## Performance

- **Duration:** 38 min
- **Started:** 2026-04-16T14:10:27Z
- **Completed:** 2026-04-16T14:48:47Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added deriveFromPayloads() for deriving profile/capsule content from actual SKILL.md and reference text
- Implemented governed capsule extraction with approval/team/level filtering (T-14-04)
- Implemented rankCapsules() with intent signal scoring and stack/path boosts (CAPS-04)
- Added searchKnowledgeV2() to orchestrator for v2 retrieval pipeline
- Maintained coexistence with legacy v1 retrieval path

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace placeholder derivation text with retrieval-grade content** - `9364ef8` (feat)
   - Added deriveFromPayloads() for text-backed derivation
   - Extract frontmatter metadata from SKILL.md content
   - Extract situation/problem/goal sections for capsule generation
   - Build summary and keywords from combined text content

2. **Task 2: Implement governed profile shortlist and capsule ranking** - `68932e7`, `7ffcf52` (feat)
   - Added capsule-recall.ts with governance and ranking helpers
   - Implement isArtifactGovernanceEligible() for filtering
   - Implement rankCapsules() with intent scoring and stack/path boosts
   - Add searchKnowledgeV2() to orchestrator

## Files Created/Modified

- `packages/server/src/lib/artifacts/derive.ts` - Added deriveFromPayloads() for text-backed derivation
- `packages/server/src/lib/artifacts/derive.test.ts` - Added tests for retrieval-grade derivation
- `packages/server/src/lib/retrieval/capsule-recall.ts` - Capsule recall helpers (new file)
- `packages/server/src/lib/retrieval/capsule-recall.test.ts` - Capsule recall tests (new file)
- `packages/server/src/lib/retrieval/orchestrator.ts` - Added v2 retrieval pipeline

## Decisions Made

- **Text-backed derivation:** deriveFromPayloads() reads actual SKILL.md and reference content instead of using title/labels placeholders
- **Governance enforcement:** Capsules filtered by approval state, team access, and security level before ranking (T-14-04)
- **Intent scoring:** Weighted combination of problem (35%), situation (25%), goal (20%), and keyword (20%) scores
- **Stack/path boosts:** Score multiplier when capsule content matches detected technology hints
- **Coexistence:** Legacy v1 searchKnowledge() remains unchanged; v2 searchKnowledgeV2() added alongside

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in model.test.ts, import-export.ts, and indexing adapters are unrelated to this plan. These were present before execution and do not affect retrieval functionality.

## Threat Model Coverage

| Threat ID | Mitigation | Status |
|-----------|------------|--------|
| T-14-04 | Preserve approval/team/level filtering before any shortlist or ranking work | ✓ Implemented |
| T-14-05 | Keep derivation inputs limited to SKILL.md and references; exclude assets/scripts | ✓ Implemented |
| T-14-06 | Rank only distilled profile/capsule text; do not inline raw payloads | ✓ Implemented |

## Next Phase Readiness

- Retrieval-grade derivation ready for 14-03 distilled response shaping
- Capsule ranking ready for 14-04 route integration
- Governance enforcement verified through tests

---
*Phase: 14-seed-intent-retrieval-and-capsule-ranking*
*Completed: 2026-04-16*
