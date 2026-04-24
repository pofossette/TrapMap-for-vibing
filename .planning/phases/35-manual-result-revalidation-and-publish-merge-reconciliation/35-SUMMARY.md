# Phase 35: Manual Result Revalidation and Publish Merge Reconciliation - Summary

**Completed:** 2026-04-24
**Status:** Complete

## What Was Implemented

### Contracts and Types (35-01)
- Added `resolved` status to `CandidateStatusSchema`
- Added `ResolutionOutcomeSchema` and `EntityLineageSchema` types
- Added `applyResolutionResponseSchema` for API responses

### Revalidation Logic (35-02)
- `revalidateManualResult()` - Validates candidate state before resolution
- `isAlreadyResolved()` - Idempotency check
- Error codes for all validation failures

### Publish Independent Path (35-03)
- `publishTrapCandidate()` - Creates KnowledgeRecord from trap candidate
- `publishSkillCandidate()` - Creates SkillArtifactRecord from skill candidate
- Both set lifecycleState to 'agent-pass' for review flow

### Merge Path (35-04)
- `recordMergeLineage()` - Links candidate to existing entity
- Adds review notes to existing entity (non-destructive)
- Lineage query helpers for future use

### API Endpoint (35-05)
- `POST /v1/candidates/:candidateId/apply-resolution`
- Audit events with `duplicate-resolved-independent` and `duplicate-resolved-merged` actions
- Post-commit indexing for newly published traps

### CLI Integration (35-06)
- `trapmap skill duplicate-job apply-resolution <id>` command
- Integration test coverage for complete workflow

## Key Decisions

1. **Simpler merge semantics**: Merge records lineage without modifying content. Future phases can add content merging.

2. **Idempotent resolution**: Calling apply-resolution twice returns success without re-processing.

3. **agent-pass lifecycle**: Published entities start at 'agent-pass' to enter the normal review flow.

4. **Non-destructive merge notes**: Adding review notes to existing entities preserves their content while recording the merge event.

## Files Created

- `packages/server/src/lib/candidates/reconcile.ts` - Core resolution logic
- `packages/server/src/lib/candidates/reconcile.test.ts` - Unit tests
- `packages/server/src/routes/candidates.test.ts` - Integration tests

## Files Modified

- `packages/contracts/src/domain/candidates.ts` - New types
- `packages/contracts/src/index.ts` - Exports
- `packages/server/src/lib/store.ts` - EntityLineageRecord
- `packages/server/src/lib/candidates/store.ts` - markCandidateResolved
- `packages/server/src/routes/candidates.ts` - apply-resolution endpoint
- `packages/cli/src/commands/skill.ts` - CLI command

## Testing

- Unit tests: `pnpm --filter @trapmap/server test -- --grep reconcile`
- Integration tests: `pnpm --filter @trapmap/server test -- --grep apply-resolution`
- CLI: `trapmap skill duplicate-job apply-resolution <id>`

## Next Phase

Phase 36: GraphRAG-lite indexing pipeline for skill-trap graph extraction
