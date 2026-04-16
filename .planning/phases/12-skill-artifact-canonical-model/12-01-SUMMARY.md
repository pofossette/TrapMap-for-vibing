---
phase: 12-skill-artifact-canonical-model
plan: "01"
subsystem: shared-contracts
tags: [contracts, artifacts, tdd]
dependency_graph:
  requires: []
  provides: ["12-02", "12-03", "13-import-export", "14-retrieval", "15-activation"]
  affects: ["packages/server", "packages/cli"]
tech_stack:
  added: []
  patterns: ["additive-contracts", "canonical-artifact-model", "file-kind-discrimination"]
key_files:
  created:
    - path: "packages/contracts/src/domain/artifacts.ts"
      description: "Canonical artifact, revision, manifest, profile, capsule, and client-manifest schemas"
  modified:
    - path: "packages/contracts/src/index.ts"
      description: "Added artifacts.js export to public contracts surface"
    - path: "packages/contracts/src/index.test.ts"
      description: "Added Phase 12 contract regression coverage for artifact schemas"
decisions: []
metrics:
  duration: "6 minutes"
  completed_date: "2026-04-16T09:47:00Z"
---

# Phase 12 Plan 01: Skill Artifact Canonical Model Summary

**One-liner:** Defined additive shared contracts for skill-native artifacts with canonical file-kind discrimination, immutable revisions, and deterministic derived outputs (profile, capsules, client manifest) while maintaining full compatibility with legacy knowledge contracts.

## Objective Completed

Defined the additive shared contracts for Phase 12 so the canonical skill-artifact model exists in `@skill-shareer/contracts` before any server storage or derivation code depends on it. The contracts package now exposes the complete artifact vocabulary including artifact roots, revisions, file manifests, profiles, capsules, and client manifests.

## Tasks Completed

### Task 1: Define additive artifact root, revision, and file-manifest contracts

**Commit:** `1013d74`

Created `packages/contracts/src/domain/artifacts.ts` with:
- `skillArtifactFileKindSchema` with four canonical kinds: `skill-markdown`, `reference`, `asset`, `script`
- `skillArtifactFileSchema` with path, kind, sha256, sizeBytes, mediaType, source, and inclusion flags (`includeInDerivation`, `activationOnly`)
- `skillScriptDescriptorSchema` for metadata-only script capability descriptions
- `skillArtifactRevisionSchema` with immutable revision, sourceHash, files, and derived outputs
- `skillArtifactSchema` with governance fields mirroring knowledge contracts (lifecycle, review, scope, security, audit)

Exported artifact schemas from `packages/contracts/src/index.ts`.

Added contract tests for:
- File kind separation and validation
- Artifact file metadata completeness
- Script descriptor metadata-only structure
- Revision immutability with sourceHash and files
- Additive coexistence with `knowledgeEntrySchema`

**Acceptance criteria met:**
- ✓ `packages/contracts/src/domain/artifacts.ts` exists
- ✓ File kind enum with four canonical kinds
- ✓ Revision schema with immutable fields
- ✓ Artifact schema with governance hooks
- ✓ Exported from contracts index
- ✓ Contract tests cover file-kind separation

### Task 2: Define derived profile, capsule, and client-manifest contracts

**Commit:** `8b756d1`

Extended `packages/contracts/src/domain/artifacts.ts` with:
- `skillProfileSchema` for distilled artifact-wide text from SKILL.md and references/
- `skillCapsuleSchema` for deterministic capsules with capsuleId, sourcePaths, content, situation, problem, goal, errorText, labels, scope, requiredLevel
- `clientManifestReferenceSchema`, `clientManifestAssetSchema`, `clientManifestScriptSchema` for metadata-only activation entries
- `clientManifestSchema` for activation metadata (references, assets, scripts with policy)
- Updated `skillArtifactDerivedSchema` to reference standalone derived schemas

Added contract tests for:
- Profile derivation from SKILL.md and references/
- Capsule structure with sourcePaths and governance inheritance
- Client manifest metadata-only structure for scripts (T-12-02 mitigation)
- Validation that derived shapes remain valid shared contracts
- Documentation of asset/script body exclusion from capsules

**Acceptance criteria met:**
- ✓ `skillProfileSchema` defined with artifactId, revision, sourceHash, title, summary, keywords, referencePaths, contentHash
- ✓ `skillCapsuleSchema` defined with capsuleId, sourcePaths, content, situation, problem, goal, errorText, labels, scope, requiredLevel
- ✓ `clientManifestSchema` defined with references, assets, scripts (metadata-only), sourceHash
- ✓ sourcePaths, contentHash, referencePaths fields present
- ✓ Contract tests cover profile, capsule, and client-manifest schemas

## Deviations from Plan

### Auto-fixed Issues

None. The plan was executed exactly as written with no deviations required.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: mitigate | `packages/contracts/src/domain/artifacts.ts` | T-12-01: Encoded explicit file kinds and `includeInDerivation` / `activationOnly` flags to prevent downstream code from silently flattening references/assets/scripts |
| threat_flag: mitigate | `packages/contracts/src/domain/artifacts.ts` | T-12-02: Made `clientManifestScriptSchema` metadata-only and excluded script bodies from `skillCapsuleSchema` and `skillProfileSchema` |
| threat_flag: mitigate | `packages/contracts/src/domain/artifacts.ts` | T-12-03: Kept artifact schemas additive in a new module so legacy `knowledge` imports remain stable during Phase 12-16 coexistence |
| threat_flag: mitigate | `packages/contracts/src/domain/artifacts.ts` | T-12-04: Carried `scope` and `requiredLevel` on artifact and capsule contracts so downstream retrieval/activation code cannot invent looser governance |

## Known Stubs

None. All schemas are fully defined with no placeholder values or TODOs.

## Requirements Satisfied

- **ARTF-01:** System supports skill directory import with SKILL.md, references/, assets/, scripts/ — File kind discriminator and source enums enforce four canonical kinds
- **ARTF-02:** Server stores artifact metadata, file manifest, revision, source hash — Revision schema carries immutable sourceHash and files array
- **CAPS-01:** System derives skill profile and knowledge capsules from SKILL.md and references/ — Profile and capsule schemas defined with sourcePaths and contentHash
- **COMP-01:** Contracts remain the canonical shared truth — All new schemas exported from `@skill-shareer/contracts` package

## Self-Check: PASSED

- ✓ Created `packages/contracts/src/domain/artifacts.ts`
- ✓ Modified `packages/contracts/src/index.ts` with artifacts export
- ✓ Modified `packages/contracts/src/index.test.ts` with Phase 12 coverage
- ✓ All acceptance criteria verified
- ✓ Contract tests pass (29/29 tests)
- ✓ Commits `1013d74` and `8b756d1` exist in git history
- ✓ No stubs or placeholder values in implementation
- ✓ Threat mitigations encoded in schemas per T-12-01 through T-12-04

## Next Steps

Phase 12 Plan 02 will implement the server-side store records and mappers for artifact persistence, consuming these canonical contracts to persist governed artifact aggregates beside legacy knowledge entries.
