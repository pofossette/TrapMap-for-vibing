---
phase: 12-skill-artifact-canonical-model
plan: "03"
subsystem: "Skill Artifact Derivation"
tags: ["derivation", "capsules", "profile", "client-manifest", "tdd"]
wave: 3
dependency_graph:
  requires:
    - "12-01: Shared contract schemas for artifacts and derived outputs"
    - "12-02: Server-side storage model and persistence helpers"
  provides:
    - "12-03: Deterministic derivation seam for profile, capsules, and client manifest"
    - "13-01: Derivation consumers for import/export workflows"
    - "14-01: Capsule consumers for retrieval ranking"
  affects:
    - "packages/server/src/lib/artifacts/derive.ts"
    - "packages/server/src/lib/artifacts/model.ts"
    - "packages/server/src/lib/artifacts/derive.test.ts"
tech_stack:
  added:
    - "Node.js crypto module for SHA-256 content hashing"
  patterns:
    - "TDD RED-GREEN-REFACTOR workflow"
    - "Deterministic derivation with content hashing"
    - "Governance inheritance from artifact root"
    - "Revision-scoped caching for downstream consumption"
key_files:
  created:
    - "packages/server/src/lib/artifacts/derive.ts:367 lines - Derivation module with deterministic profile, capsule, and client-manifest generation"
    - "packages/server/src/lib/artifacts/derive.test.ts:448 lines - TDD regression tests for derivation boundaries and deterministic hashes"
  modified:
    - "packages/server/src/lib/artifacts/model.ts:558 lines - Added applyDerivedArtifactOutputs() for persisting derived outputs on revisions"
decisions:
  - "Use SHA-256 content hashing for deterministic derivation from ordered SKILL.md + references/ only"
  - "Exclude assets/ and scripts/ from profile/capsule content, expose only through client manifest"
  - "Derived outputs inherit governance (scope, requiredLevel) from artifact root, not independent ACLs"
  - "Cache derived outputs on revision records keyed by sourceHash for downstream phase consumption"
metrics:
  duration: "277 seconds (~4.6 minutes)"
  completed_date: "2026-04-16T10:15:27Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
  tests_added: 10
  tests_passing: 18 (10 derive + 8 model)
---

# Phase 12 Plan 03: Derivation Seam Summary

## One-Liner
Implemented deterministic derivation seam for skill artifacts that generates governed profile, capsule, and client-manifest outputs from SKILL.md and references/ while excluding assets/ and scripts/ from model context.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ----- | ------ | ----- |
| 1 | Create Wave 0 derivation tests for deterministic profile, capsule, and client-manifest output | `09388a6` | `packages/server/src/lib/artifacts/derive.test.ts` |
| 2 | Implement deterministic derivation and revision-level caching helpers | `3ffa30c`, `e1ac2b6` | `packages/server/src/lib/artifacts/derive.ts`, `packages/server/src/lib/artifacts/model.ts` |

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written.

### Auth Gates

None encountered.

## Known Stubs

The implementation includes placeholder content that will be replaced in later phases:

1. **Profile summary and keywords** (`derive.ts:192-193`)
   - Current: Uses `artifact.title` and `artifact.labels` as placeholders
   - Reason: Phase 13 import/export will parse actual SKILL.md frontmatter and content
   - Future: Replace with LLM-derived summary and extracted keywords from SKILL.md body

2. **Capsule content structure** (`derive.ts:238-244`)
   - Current: Single placeholder capsule with generic situation/problem/goal
   - Reason: Phase 14 retrieval will implement LLM-based capsule distillation
   - Future: Generate multiple capsules per artifact based on distinct problem/solution patterns

These stubs are intentional and documented in the plan. The derivation boundary is correctly established - later phases will wire real content parsing and LLM distillation into this seam.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: T-12-09 | `derive.ts:67-84` | Derivation uses SHA-256 hashes from ordered SKILL.md + references/ text only for deterministic capsuleId generation |
| threat_flag: T-12-10 | `derive.ts:286-310` | assets/ and scripts/ excluded from profile/capsule content, exposed only through clientManifest metadata |
| threat_flag: T-12-11 | `derive.ts:248-250`, `model.ts:495-497` | Capsules inherit scope and requiredLevel from artifact root, no independent ACLs |
| threat_flag: T-12-12 | `derive.ts:135-153`, `model.ts:487-493` | Revision-scoped caching with sourceHash and derivedAt for downstream consumption |

## Verification

### Acceptance Criteria

**Task 1:**
- ✓ `test -f packages/server/src/lib/artifacts/derive.test.ts`
- ✓ `rg -n "deriveSkillArtifactOutputs|applyDerivedArtifactOutputs" packages/server/src/lib/artifacts/derive.test.ts`
- ✓ `rg -n "SKILL.md|references/|assets/|scripts/" packages/server/src/lib/artifacts/derive.test.ts`
- ✓ `rg -n "capsuleId|sourceHash|clientManifest" packages/server/src/lib/artifacts/derive.test.ts`

**Task 2:**
- ✓ `test -f packages/server/src/lib/artifacts/derive.ts`
- ✓ `rg -n "export function deriveSkillArtifactOutputs" packages/server/src/lib/artifacts/derive.ts`
- ✓ `rg -n "buildSkillProfile|buildSkillCapsules|buildClientManifest" packages/server/src/lib/artifacts/derive.ts`
- ✓ `rg -n "createHash\\('sha256'\\)" packages/server/src/lib/artifacts/derive.ts`
- ✓ `rg -n "export function applyDerivedArtifactOutputs" packages/server/src/lib/artifacts/model.ts`
- ✓ `rg -n "derived.profile|derived.capsules|derived.clientManifest" packages/server/src/lib/artifacts/model.ts`

### Test Results

```
✓ src/lib/artifacts/derive.test.ts (10 tests) 21ms
✓ src/lib/artifacts/model.test.ts (8 tests) 22ms
```

All 18 artifact tests passing:
- 10 derivation tests for deterministic hashes, text boundaries, and client manifest
- 8 model tests for artifact persistence and governance

## Self-Check: PASSED

### Files Created
- ✓ `packages/server/src/lib/artifacts/derive.test.ts` (448 lines)
- ✓ `packages/server/src/lib/artifacts/derive.ts` (367 lines)

### Files Modified
- ✓ `packages/server/src/lib/artifacts/model.ts` (558 lines, added `applyDerivedArtifactOutputs`)

### Commits Exist
- ✓ `09388a6`: test(12-03): add failing test for deterministic derivation (RED phase)
- ✓ `3ffa30c`: feat(12-03): implement deterministic derivation and revision-level caching (GREEN phase)
- ✓ `e1ac2b6`: feat(12-03): add applyDerivedArtifactOutputs to model.ts and update test imports

### Tests Pass
- ✓ All 18 artifact tests passing
- ✓ TDD RED-GREEN cycle completed
- ✓ Deterministic derivation verified
- ✓ Text boundaries enforced (assets/ and scripts/ excluded from capsules)
- ✓ Governance inheritance verified (capsules inherit scope and requiredLevel)
- ✓ Revision caching verified (sourceHash and derivedAt persisted)

## Next Steps

This plan completes the derivation seam for Phase 12. Downstream phases will consume these cached derived outputs:

- **Phase 13**: Import/export workflows will call `deriveSkillArtifactOutputs()` after parsing skill directories
- **Phase 14**: Retrieval ranking will consume `derived.capsules` directly without reparsing source files
- **Phase 15**: Activation flow will consume `derived.clientManifest` for references, assets, and scripts

The deterministic derivation boundary is now established, enabling later phases to focus on content parsing and LLM distillation without remodeling the canonical aggregate.
