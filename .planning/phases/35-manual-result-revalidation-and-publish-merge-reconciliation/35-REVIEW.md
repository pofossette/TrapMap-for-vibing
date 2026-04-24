# Phase 35 Review: Manual Result Revalidation and Publish/Merge Reconciliation

## Overview

This review covers the implementation of Phase 35, which adds the ability to apply manual resolutions to duplicate candidates by either publishing them as independent entities or merging them into existing entities.

## Files Reviewed

| File | Purpose |
|------|---------|
| `packages/contracts/src/domain/candidates.ts` | Schema definitions for candidates, manual results, and lineage |
| `packages/contracts/src/index.ts` | Contract exports |
| `packages/server/src/lib/store.ts` | Data structures including EntityLineageRecord |
| `packages/server/src/lib/candidates/reconcile.ts` | Core reconciliation logic |
| `packages/server/src/lib/candidates/reconcile.test.ts` | Unit tests for reconciliation |
| `packages/server/src/routes/candidates.ts` | API route handlers |
| `packages/server/src/routes/candidates.test.ts` | Integration tests for routes |
| `packages/server/src/lib/user-ops-log.ts` | User operation logging |
| `packages/cli/src/commands/skill.ts` | CLI commands for duplicate job workflow |

---

## Schema Design (`packages/contracts/src/domain/candidates.ts`)

### Strengths

1. **Comprehensive Manual Result Schema**: The `ManualResultSubmissionSchema` captures both decision types (`independent`/`merged`) with appropriate optional fields:
   - `decision` - Required enum
   - `notes` - Required string (1-1000 chars)
   - `mergedWith` - Optional reference for merged decisions

2. **Well-structured ResolutionOutcome**: Captures the complete outcome of resolution with:
   - `publishedEntityId` / `mergedIntoEntityId` as nullable to clearly indicate outcome type
   - `entityType` as nullable to handle edge cases
   - Full audit trail with `resolvedAt`, `resolvedBy`, and `notes`

3. **EntityLineage Schema**: Provides full provenance tracking:
   - Supports both `published_as` and `merged_into` relationships
   - Links candidates to their final outcomes
   - Includes notes for audit context

4. **Duplicate Job Bundle**: Complete offline review support with `DuplicateJobBundleResponseSchema` including:
   - Candidate metadata
   - Original payload
   - Matched entities with full details
   - Expected schema documentation for manual submission

### Observations

- The `manualResult` field on `CandidateSubmissionSchema` is nullable and embedded directly, which is appropriate for the workflow
- The `expectedResultSchema` in the bundle response provides helpful documentation for reviewers

---

## Core Reconciliation Logic (`packages/server/src/lib/candidates/reconcile.ts`)

### Architecture

The reconciliation module follows a clean separation of concerns:

```
revalidateManualResult() → validation only
publishTrapCandidate()    → creates KnowledgeRecord
publishSkillCandidate()   → creates SkillArtifactRecord
recordMergeLineage()      → creates lineage, adds review note
applyManualResultResolution() → orchestrator
```

### Validation Logic

**`revalidateManualResult`** performs thorough validation:

1. Candidate existence check
2. Already-resolved check (for idempotency)
3. Status validation (must be `duplicate_detected`)
4. Manual result attachment check
5. For merged decisions: target entity exists and is not deactivated

**Error codes are well-defined**:
- `candidate_not_found`
- `invalid_candidate_status`
- `no_manual_result`
- `merge_target_not_found`
- `merge_target_incompatible`
- `already_resolved`

### Publishing Logic

**`publishTrapCandidate`**:
- Creates `KnowledgeRecord` with `agent-pass` lifecycle state
- Sets up initial revision history correctly
- Creates agent review record with appropriate notes
- Pushes to `knowledgeEntries` array
- Creates `published_as` lineage record

**`publishSkillCandidate`**:
- Creates `SkillArtifactRecord` with `agent-pass` lifecycle state
- Maps skill files from payload to revision
- Creates appropriate lifecycle history events
- Creates `published_as` lineage record

### Merge Logic

**`recordMergeLineage`**:
- Creates `merged_into` lineage relationship
- **Non-destructive**: Does NOT modify existing entity content
- Adds a system-authored review note to the existing entity
- Updates `updatedAt` timestamp

This is a conservative, safe approach - content merging is left for a future phase.

### Orchestrator

**`applyManualResultResolution`** handles:

1. User validation (requires real user, not system)
2. Revalidation (with idempotency handling for already-resolved)
3. Decision dispatch (independent → publish, merged → record lineage)
4. Marks candidate as resolved via `markCandidateResolved`

**Idempotency**: If already resolved, returns success with existing lineage without re-processing.

---

## API Routes (`packages/server/src/routes/candidates.ts`)

### POST `/v1/candidates/:candidateId/apply-resolution`

**Flow**:
1. Authenticate and require `knowledge:review` permission
2. Run resolution in transaction
3. On success with `independent` decision for trap:
   - Trigger post-commit indexing via `runKnowledgeIndexEvent`
4. Log user operation
5. Return response with outcome and lineage

**Error Handling**:
- 404 for `candidate_not_found`
- 400 for other validation errors
- 403 for permission issues

**Post-commit Indexing**: Only triggers for traps with `independent` decision. Errors are logged but don't fail the request.

### POST `/v1/candidates/:candidateId/manual-result`

- Validates `mergedWith` is present for `merged` decisions
- Sets next state based on decision (but keeps status as `duplicate_detected` pending Phase 35)
- Logs user operation

### GET `/v1/duplicates/:candidateId/bundle`

- Builds full offline review bundle
- Includes entity data for each match (trap or skill)
- Provides expected schema documentation

---

## Test Coverage

### Unit Tests (`reconcile.test.ts`)

**Comprehensive coverage of**:
- All revalidation error paths
- Idempotency checks
- Publishing trap candidates (fields, lineage, array pushes)
- Publishing skill candidates (fields, lineage, array pushes)
- Recording merge lineage (for both traps and skills)
- Lineage query functions

**Test helpers** are well-structured with `createTestCandidate`, `createTestTrap`, `createTestSkill`, `createTestData`, and `createMockStore`.

### Integration Tests (`candidates.test.ts`)

**Covers**:
- 404 for non-existent candidate
- 400 for invalid status (not `duplicate_detected`)
- 400 for missing manual result
- Publishing trap for independent decision
- Publishing skill for independent decision
- Recording lineage for merged decision
- Idempotency (calling twice returns same result)
- Audit event creation
- Authorization (requires `knowledge:review` permission)

---

## CLI Commands (`packages/cli/src/commands/skill.ts`)

### `skill duplicate-job apply-resolution`

- Takes candidateId as argument
- Calls `/v1/candidates/:candidateId/apply-resolution`
- Formats response showing decision and outcome

### Output Formatting

**`formatApplyResolutionResponse`** provides clear output:
- Shows decision type
- For independent: shows published entity type and ID
- For merged: shows target entity type and ID
- Includes lineage ID if available

---

## User Operations Logging (`packages/server/src/lib/user-ops-log.ts`)

Supports new actions:
- `manual-result` - When submitting manual resolution
- `apply-resolution` - When applying the resolution

Logs capture actor, target, team, and metadata including decision type.

---

## Data Structures (`packages/server/src/lib/store.ts`)

### EntityLineageRecord

```typescript
interface EntityLineageRecord {
  id: string;
  candidateId: string;
  relationshipType: 'published_as' | 'merged_into';
  sourceType: 'candidate' | 'trap' | 'skill';
  sourceId: string;
  targetType: 'trap' | 'skill';
  targetId: string;
  createdAt: string;
  notes: string | null;
}
```

This structure supports:
- Tracing candidate → entity outcomes
- Finding all candidates merged into an entity
- Full provenance audit trail

### StoreData includes:
- `entityLineage: EntityLineageRecord[]`
- `candidateSubmissions: CandidateSubmissionRecord[]`
- `duplicateCases: DuplicateCaseRecord[]`

---

## Quality Assessment

### Strengths

1. **Idempotency**: The system correctly handles re-application of resolution by checking existing state

2. **Non-destructive Merges**: The merge operation only records lineage and adds a note, never modifying existing content

3. **Comprehensive Validation**: The revalidation step catches all edge cases before processing

4. **Audit Trail**: Full audit via lineage records, audit events, and user ops logging

5. **Post-commit Indexing**: For independent trap publications, indexing is triggered appropriately

6. **Offline Review Support**: The bundle endpoint provides all data needed for offline decision-making

### Considerations

1. **Skill Indexing**: Post-commit indexing is only implemented for traps, not skills. This may be intentional based on indexing infrastructure.

2. **Indexing Error Handling**: Post-commit indexing errors are logged but don't fail the request. This is appropriate for eventual consistency but worth monitoring.

3. **Merge Content**: The current merge is metadata-only. Future phases may need to implement content merging semantics.

4. **No Skill Metadata Title/Slug Computation**: In `publishSkillCandidate`, title and slug fall back to defaults if not provided. The processor should compute these during analysis.

---

## Summary

Phase 35 implements a complete manual resolution workflow with:

- **Robust validation** before applying resolutions
- **Clear separation** between independent (publish) and merged (lineage) paths
- **Full audit trail** through lineage, audit events, and user ops logs
- **Idempotent operations** safe for retry
- **Offline review support** via bundle endpoint
- **CLI integration** for manual workflow

The implementation follows established patterns in the codebase and maintains consistency with existing lifecycle states (`agent-pass` for published entities).

---

## Recommendations

1. **Consider adding integration test** for the case where merge target becomes deactivated between manual-result submission and apply-resolution call

2. **Document** that merge is metadata-only and content merging is a future capability

3. **Consider rate limiting** on apply-resolution endpoint to prevent accidental double-processing in rapid succession (though idempotency handles this correctly)
