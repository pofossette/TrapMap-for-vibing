---
phase: 14-seed-intent-retrieval-and-capsule-ranking
plan: "01"
subsystem: "Retrieval Contracts and Intent Parsing"
tags: ["retrieval", "contracts", "intent-parsing", "capsule-native", "seed-only"]
wave: 1
depends_on: []
files_modified:
  - packages/contracts/src/domain/retrieval.ts
  - packages/contracts/src/index.test.ts
  - packages/server/src/lib/retrieval/types.ts
  - packages/server/src/lib/retrieval/intent.ts
  - packages/server/src/lib/retrieval/intent.test.ts
autonomous: true
requirements:
  - RETR-01
  - RETR-02
  - COMP-01
must_haves:
  truths:
    - "CLI-facing retrieval requests still require only one seed string."
    - "The server can derive internal situation, problem, goal, and errorText fields from one seed before recall begins."
    - "The shared retrieval contract exposes a capsule-native v2 response shape without forcing the client to send structured intent fields."
  artifacts:
    - path: "packages/contracts/src/domain/retrieval.ts"
      provides: "Seed-only v2 retrieval request/response schemas"
    - path: "packages/server/src/lib/retrieval/types.ts"
      provides: "Internal parsed-intent and capsule retrieval pipeline types"
    - path: "packages/server/src/lib/retrieval/intent.ts"
      provides: "Pure intent parsing helpers kept inside the server boundary"
    - path: "packages/server/src/lib/retrieval/intent.test.ts"
      provides: "Focused regression coverage for parsed-intent behavior"
  key_links:
    - from: "packages/contracts/src/domain/retrieval.ts"
      to: "packages/server/src/routes/retrieval.ts"
      via: "shared zod schemas for request/response validation"
      pattern: "retrieval(V2)?(Query|Response)Schema"
    - from: "packages/server/src/lib/retrieval/intent.ts"
      to: "packages/server/src/lib/retrieval/orchestrator.ts"
      via: "internal parsed-intent handoff before recall"
      pattern: "parseSeedIntent"
requires:
  - phase: "Phase 12"
    provides: "Skill artifact derived outputs (profile, capsules, clientManifest)"
provides:
  - "14-01: Shared v2 retrieval schemas with seed-only request and capsule-first response"
  - "14-01: Server-internal ParsedIntent types and parseSeedIntent() helper"
affects:
  - "14-02: Profile recall and capsule ranking pipeline"
  - "14-03: Distilled response shaping"
  - "14-04: Route and CLI integration"
tech_stack:
  added: []
  patterns:
    - "Seed-only client contract with server-side intent decomposition"
    - "Deterministic heuristic parsing without external model dependencies"
    - "Capsule-native response schemas with governance inheritance"
key_files:
  created:
    - "packages/server/src/lib/retrieval/intent.ts:284 lines - Pure intent parsing helpers"
    - "packages/server/src/lib/retrieval/intent.test.ts:211 lines - TDD tests for intent parsing"
  modified:
    - "packages/contracts/src/domain/retrieval.ts:171 lines - Added v2 retrieval schemas"
    - "packages/contracts/src/index.test.ts:299 lines - Added Phase 14 contract tests"
    - "packages/server/src/lib/retrieval/types.ts:176 lines - Added parsed-intent types"
key_decisions:
  - "Use seed-only v2 query schema to preserve RETR-01 compliance"
  - "Keep parsed-intent types server-internal per RETR-02"
  - "Capsules inherit governance (scope, requiredLevel) from artifact root per T-14-01 mitigation"
  - "Deterministic heuristic parser runs without OPENAI_API_KEY for baseline intent extraction"
requirements_completed:
  - RETR-01
  - RETR-02
  - COMP-01
duration: "18 min"
completed_date: "2026-04-16T14:06:06Z"
---

# Phase 14 Plan 01: Seed-Only Retrieval Contract Summary

**Defined seed-only v2 retrieval schemas and server-internal parsed-intent seam for capsule-native retrieval pipeline.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-16T13:47:38Z
- **Completed:** 2026-04-16T14:06:06Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added retrievalV2QuerySchema with seed-only required input (RETR-01)
- Added retrievalV2ResponseSchema with capsule-first distilled results (RETR-04)
- Created parseSeedIntent() for deterministic seed decomposition (RETR-02)
- Established server-internal ParsedIntent types without client contract exposure
- Added comprehensive test coverage for both contracts and intent parsing

## Task Commits

Each task was committed atomically:

1. **Task 1: Add seed-only v2 retrieval schemas to contracts** - `e7b8926` (feat)
   - Added retrievalV2QuerySchema, retrievalV2ResponseSchema, capsuleMatchSchema, profileHintSchema
   - Capsules inherit governance from artifact root per T-14-01
   - v2 schemas coexist with legacy retrieval schemas

2. **Task 2: Create internal parsed-intent types and pure parser** - `4a8e981` (feat)
   - Added ParsedIntent, NormalizedToken, StackPathHint, CapsuleCandidate types
   - Implemented parseSeedIntent() with deterministic heuristic parsing
   - Runs without OPENAI_API_KEY dependency

## Files Created/Modified

- `packages/contracts/src/domain/retrieval.ts` - v2 retrieval request/response schemas
- `packages/contracts/src/index.test.ts` - Phase 14 contract tests
- `packages/server/src/lib/retrieval/types.ts` - Internal parsed-intent types
- `packages/server/src/lib/retrieval/intent.ts` - Pure intent parsing helpers
- `packages/server/src/lib/retrieval/intent.test.ts` - Intent parsing test coverage

## Decisions Made

- **Seed-only contract:** v2 query schema requires only `seed` string; server handles intent decomposition
- **Server-internal parsing:** ParsedIntent types stay within server boundary, not exported through contracts
- **Governance inheritance:** Capsules inherit scope and requiredLevel from artifact root
- **Deterministic baseline:** Parser uses heuristics without external model dependencies; optional model enhancement can be added later

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tests pass, type checking successful for modified files.

## Threat Model Coverage

| Threat ID | Mitigation | Status |
|-----------|------------|--------|
| T-14-01 | v2 request schema is seed-only; server derives parsed intent | ✓ Implemented |
| T-14-02 | Parsed-intent model stays server-internal | ✓ Implemented |
| T-14-03 | Deterministic string parsing without blocking network dependency | ✓ Implemented |

## Next Phase Readiness

- v2 retrieval contracts ready for 14-02 profile recall and capsule ranking
- parseSeedIntent() ready for orchestrator integration
- CapsuleCandidate types ready for ranking pipeline

---
*Phase: 14-seed-intent-retrieval-and-capsule-ranking*
*Completed: 2026-04-16*
