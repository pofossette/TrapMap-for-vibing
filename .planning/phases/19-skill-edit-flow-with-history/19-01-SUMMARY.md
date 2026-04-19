---
phase: 19-skill-edit-flow-with-history
plan: 01
status: complete
completed: 2026-04-19
requirements:
  - SKED-02
  - SKED-04
---

# Plan 19-01: Define skill edit contracts and revision schema

## Summary

Successfully defined the shared contracts for Phase 19 skill editing and history viewing. The contracts ensure consistent schemas for edit-by-ID and history flows across server and CLI implementations.

## Tasks Completed

| Task | Description | Status |
|------|-------------|--------|
| 1 | Add skill edit request and response schemas | ✅ Complete |
| 2 | Add skill history response schema | ✅ Complete |
| 3 | Add contract regression coverage | ✅ Complete |

## Implementation Details

### Schemas Added

1. **skillEditRequestSchema** - Request schema for editing skills:
   - `artifactId` (required) - the artifact to edit
   - `title` (optional) - new title
   - `labels` (optional) - new labels
   - `files` (optional) - full file replacement
   - `scriptDescriptors` (default []) - script descriptors
   - Refinement: at least one of title, labels, or files must be provided

2. **skillEditResponseSchema** - Response schema for edit operations:
   - `artifact` - the updated artifact with new revision
   - `previousRevision` - the revision before this edit
   - `lifecycleTransition` - optional state change

3. **skillRevisionSummarySchema** - Metadata-only revision info:
   - `revision`, `submittedAt`, `submittedBy`, `summary`, `lifecycleState`

4. **skillHistoryRequestSchema** - Request schema for viewing history:
   - `artifactId` (required)

5. **skillHistoryResponseSchema** - Response schema for history:
   - `artifactId`, `title`, `currentRevision`, `lifecycleState`, `revisions`

### Test Coverage

- 26 new tests for Phase 19 (155 total tests passing)
- Tests cover edit request validation, edit response, history request/response
- Validation ensures at least one update field is required
- History response verified to not expose full file manifests

## Files Modified

- `src/domain/operations.ts` - New schemas and types
- `src/index.test.ts` - Phase 19 contract tests

## Key Decisions

1. Used Zod refinement for conditional required field validation (at least one of title/labels/files)
2. History response returns metadata-only summaries, not full file manifests (T-19-02 mitigation)
3. Edit response captures optional lifecycle transitions

## Threat Model Mitigations

| Threat | Mitigation |
|--------|------------|
| T-19-01 | Require at least one update field in edit request |
| T-19-02 | Return revision summaries only, not full file manifests |
| T-19-03 | Schema-level validation ensures basic structure |

## Verification

- All 155 contract tests pass
- TypeScript type checking passes
- Schemas exported from index.ts
