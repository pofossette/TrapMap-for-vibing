# Phase 35: Manual Result Revalidation and Publish Merge Reconciliation - Overview

**Phase Goal:** Turn a manually edited duplicate job into a validated publish action while preserving the original upload, the old published item, and the full audit trail.

## Plans Summary

| Plan | Wave | Description | Dependencies |
|------|------|-------------|--------------|
| 35-01 | 1 | Contracts and types for resolution workflow | None |
| 35-02 | 2 | Revalidation logic for manual results | 35-01 |
| 35-03 | 3 | Publish independent path | 35-02 |
| 35-04 | 4 | Merge path and lineage recording | 35-03 |
| 35-05 | 5 | Main orchestrator and API endpoint | 35-04 |
| 35-06 | 6 | CLI integration and end-to-end testing | 35-05 |

## Must-Haves (Goal-Backward Verification)

To verify this phase achieves its goal, the following must be present:

1. **Manual result can be revalidated before trust**
   - `packages/server/src/lib/candidates/reconcile.ts` contains `revalidateManualResult()` function
   - Function returns error for invalid candidate states
   - Function returns error for missing manual result
   - Function returns error for non-existent merge targets

2. **Candidates can be published as independent entities**
   - `packages/server/src/lib/candidates/reconcile.ts` contains `publishTrapCandidate()` function
   - `packages/server/src/lib/candidates/reconcile.ts` contains `publishSkillCandidate()` function
   - Created entities have `lifecycleState: 'agent-pass'`
   - New entities are added to their respective collections

3. **Merge decisions record lineage without content modification**
   - `packages/server/src/lib/candidates/reconcile.ts` contains `recordMergeLineage()` function
   - Function creates `EntityLineageRecord` with `relationshipType: 'merged_into'`
   - Function adds review notes to existing entity (non-destructive)

4. **API endpoint applies resolutions**
   - `POST /v1/candidates/:candidateId/apply-resolution` endpoint exists
   - Endpoint returns 404 for non-existent candidates
   - Endpoint returns 400 for invalid states
   - Endpoint records audit events
   - Endpoint triggers indexing for published traps

5. **Audit trail is preserved**
   - `EntityLineageRecord` records are created
   - Audit events with `duplicate-resolved-*` actions are recorded
   - Candidate status transitions to `resolved`

6. **Operation is idempotent**
   - Calling apply-resolution twice returns success without duplication
   - `isAlreadyResolved()` helper exists

## Verification Commands

```bash
# Build contracts
pnpm --filter @trapmap/contracts build

# Type check server
pnpm --filter @trapmap/server typecheck

# Run unit tests
pnpm --filter @trapmap/server test -- --grep reconcile

# Run integration tests
pnpm --filter @trapmap/server test

# Build CLI
pnpm --filter @trapmap/cli build
```

## Key Files

### New Files
- `packages/server/src/lib/candidates/reconcile.ts` - Core resolution logic
- `packages/server/src/lib/candidates/reconcile.test.ts` - Unit tests
- `packages/server/tests/e2e/duplicate-resolution.e2e.test.ts` - E2E tests

### Modified Files
- `packages/contracts/src/domain/candidates.ts` - Types
- `packages/contracts/src/index.ts` - Exports
- `packages/server/src/lib/store.ts` - EntityLineageRecord
- `packages/server/src/lib/candidates/store.ts` - Store functions
- `packages/server/src/routes/candidates.ts` - API endpoint
- `packages/cli/src/commands/candidates.ts` - CLI command

## Data Flow

```
Phase 34: Manual Result Submission
───────────────────────────────────
POST /v1/candidates/:id/manual-result
  ↓
Candidate.status = 'duplicate_detected' (unchanged)
Candidate.manualResult = { decision, notes, mergedWith?, ... }

Phase 35: Resolution Application
────────────────────────────────
POST /v1/candidates/:id/apply-resolution
  ↓
Revalidate (status, manual result, merge target)
  ↓
Apply Decision:
  - 'independent' → Create new entity (trap/skill)
  - 'merged' → Record lineage to existing entity
  ↓
Mark Candidate:
  - status = 'resolved'
  - completedAt = now
  ↓
Record Audit + Lineage
  ↓
Post-Commit Indexing (if new entity)
```
