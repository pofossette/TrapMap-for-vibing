---
phase: 18-cli-skill-lookup-commands
plan: 01
subsystem: contracts
tags: [zod, schema, skill-lookup, artifact-first]

# Dependency graph
requires:
  - phase: 14-retrieval-v2
    provides: retrievalV2QuerySchema, profileHintSchema, capsuleMatchSchema patterns
provides:
  - skillLookupQuerySchema: request schema for skill search-by-content
  - skillLookupResultItemSchema: artifact-first match with metadata-only fields
  - skillLookupResponseSchema: response schema with ranked artifact matches
affects: [18-02, 18-03, cli-skill-commands, server-retrieval-routes]

# Tech tracking
tech-stack:
  added: []
  patterns: [artifact-first response, metadata-only contract, skill lookup schema]

key-files:
  created: []
  modified:
    - packages/contracts/src/domain/retrieval.ts
    - packages/contracts/src/index.test.ts

key-decisions:
  - "Artifact-first response shape distinct from capsule-native retrievalV2ResponseWithHintsSchema"
  - "Metadata-only fields: artifactId, title, slug, labels, scope, requiredLevel, sourceKind, score, reason"
  - "Reuse existing entityIdSchema, labelSchema, scopeSchema, securityLevelSchema from common domain"

patterns-established:
  - "Artifact-first lookup: returns unique skill IDs, not capsule payloads"
  - "Metadata-only response: excludes capsule content, activation hints, file payloads"
  - "Shared contract location: retrieval domain beside existing v1/v2 retrieval schemas"

requirements-completed: [SKED-01]

# Metrics
duration: 5min
completed: 2026-04-19
---

# Phase 18-01: Skill Lookup Contracts Summary

**Additive artifact-first skill lookup schemas in retrieval domain for CLI skill search-by-content command**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-19T13:43:00Z
- **Completed:** 2026-04-19T13:48:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created skillLookupQuerySchema accepting text search and maxResults with defaults
- Created skillLookupResultItemSchema with artifact-first, metadata-only fields
- Created skillLookupResponseSchema distinct from capsule-native retrievalV2 responses
- Added 19 contract tests proving schema correctness and distinctness

## Task Commits

Each task was committed atomically:

1. **Task 1: Add artifact-first skill lookup schemas to retrieval contracts** - `e1afd44` (feat)
2. **Task 2: Add contract regression coverage for skill lookup schemas** - `42edf58` (test)

## Files Created/Modified
- `packages/contracts/src/domain/retrieval.ts` - Added skillLookupQuerySchema, skillLookupResultItemSchema, skillLookupResponseSchema, skillSourceKindSchema, and exported types
- `packages/contracts/src/index.test.ts` - Added 19 tests for Phase 18 skill lookup contracts

## Decisions Made
- Used artifact-first design (unique artifactId per match) instead of capsule-first to align with SKED-01 requirement for skill IDs
- Included sourceKind field to distinguish skill-directory, single-skill-md, and legacy-knowledge origins
- Kept schemas in retrieval domain for consistency with existing retrieval patterns
- Reused existing common schemas (entityIdSchema, labelSchema, scopeSchema, securityLevelSchema) for consistency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - all tests passed on first run.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Contracts are ready for 18-02 server-side route and helper implementation
- 18-03 CLI command can consume skillLookupResponseSchema for JSON output
- Schema tests document the artifact-first contract for future consumers

---
*Phase: 18-cli-skill-lookup-commands*
*Completed: 2026-04-19*
