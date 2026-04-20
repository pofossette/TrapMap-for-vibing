---
phase: 19-skill-edit-flow-with-history
plan: 02
status: complete
completed: 2026-04-19
requirements:
  - SKED-02
  - SKED-04
---

# Plan 19-02: Implement server edit endpoint with history tracking

## Summary

Successfully implemented the server routes and helper for Phase 19 skill editing and history viewing. Users with proper permissions can now edit skill artifacts with revision tracking and view edit history.

## Tasks Completed

| Task | Description | Status |
|------|-------------|--------|
| 1 | Implement edit helper with merge, pre-review, and revision append logic | ✅ Complete |
| 2 | Add edit endpoint to operations routes with governance and audit | ✅ Complete |
| 3 | Add history endpoint to operations routes with governance | ✅ Complete |
| 4 | Update app.ts to document new routes | ✅ Complete |

## Implementation Details

### Edit Helper (`packages/server/src/lib/artifacts/edit.ts`)

1. **`submitSkillEdit()`** - Submits a skill artifact edit:
   - Merges edit payload with existing artifact state
   - Runs pre-review on merged content
   - Appends new revision via `appendSkillArtifactRevision()`
   - Returns updated artifact with transition info

2. **`mergeEditPayload()`** - Merges edit payload with existing artifact:
   - Full file replacement if files provided
   - Preserves existing script descriptors if not provided
   - Computes source hash from derivation-eligible files

3. **`getSkillHistory()`** - Retrieves revision history:
   - Returns revision summaries without full file manifests
   - Maps each revision to lifecycle state

### Routes (`packages/server/src/routes/operations.ts`)

1. **`POST /v1/operations/artifacts/:artifactId/edit`**:
   - Requires `knowledge:submit` permission
   - Checks team access and security level
   - Owner OR higher-level user can edit
   - Creates audit event with `artifact-edited` action

2. **`GET /v1/operations/artifacts/:artifactId/history`**:
   - Requires `knowledge:export` permission
   - Same governance filters as export
   - Creates audit event with `artifact-history-viewed` action

### Test Coverage

- 58 test cases in edit.test.ts
- 435 total server tests passing

## Files Modified

- `packages/server/src/lib/artifacts/edit.ts` - Edit helper functions
- `packages/server/src/lib/artifacts/edit.test.ts` - Edit helper tests
- `packages/server/src/routes/operations.ts` - Edit and history routes
- `packages/server/src/app.ts` - Route documentation

## Threat Model Mitigations

| Threat | Mitigation |
|--------|------------|
| T-19-04 | Auth resolved from saved session, `knowledge:submit` required |
| T-19-05 | Team access and security level checks applied |
| T-19-06 | Full file replacement, deterministic source hash |
| T-19-07 | Owner OR strictly higher security level required |
| T-19-08 | All edit operations create audit events |
| T-19-09 | History view uses same governance filters as export |

## Verification

- All 435 server tests pass
- TypeScript type checking passes
- Routes documented in app.ts
