# Phase 35: Manual Result Revalidation and Publish Merge Reconciliation - Research

**Gathered:** 2026-04-24
**Status:** Research complete, ready for planning

---

## Executive Summary

Phase 35 is the final phase in the duplicate resolution workflow. It takes a manual result (submitted in Phase 34) and applies the reviewer's decision to the published entity store. The phase must handle three outcomes: keep candidate as independent, merge candidate into existing entity, or reject the candidate entirely.

---

## 1. Current State (What Exists)

### 1.1 Candidate Submission Pipeline (Phase 33-34)

**Files:**
- `packages/contracts/src/domain/candidates.ts` - Candidate types and schemas
- `packages/server/src/lib/candidates/store.ts` - Candidate store functions
- `packages/server/src/lib/candidates/processor.ts` - Async processing pipeline
- `packages/server/src/routes/candidates.ts` - API endpoints

**Key Types:**
```typescript
// CandidateSubmission has a manualResult field (nullable)
interface CandidateSubmission {
  id: string;
  sourceType: 'trap' | 'skill';
  status: 'received' | 'queued' | 'analyzing' | 'duplicate_detected' | 'ready_for_review' | 'error';
  originalPayload: CandidatePayload;
  analysisSnapshot: AnalysisSnapshot | null;
  duplicateCase: DuplicateCase | null;
  manualResult: {
    decision: 'independent' | 'merged';
    notes: string;
    mergedWith?: { entityType: 'trap' | 'skill'; entityId: string; };
    submittedAt: string;
    submittedBy: string;
  } | null;
  // ... timestamps and retry tracking
}
```

**Key Behaviors:**
- Phase 33 creates candidates with status `received`, processes them async
- Duplicate detection creates a `DuplicateCase` attached to the candidate
- Phase 34's `attachManualResult()` stores the reviewer decision but **does not apply it**
- Current `manualResult` endpoint sets a `nextState` hint but doesn't transition status

### 1.2 Existing Entity Store Models

**Knowledge Entries (Traps):**
- `packages/server/src/lib/store.ts` - `KnowledgeRecord` type
- `packages/server/src/lib/knowledge.ts` - CRUD functions
- `packages/server/src/routes/knowledge.ts` - Routes

**Key Record Types:**
```typescript
interface KnowledgeRecord {
  id: string;
  lifecycleState: LifecycleState; // 'draft' | 'submitted' | 'agent-pass' | 'agent-rejected' | 'approved' | 'rejected' | 'deactivated'
  lifecycleHistory: KnowledgeLifecycleEventRecord[];
  // ... content and governance fields
}

interface KnowledgeLifecycleEventRecord {
  type: 'submitted' | 'resubmitted' | 'agent-reviewed' | 'reviewer-approved' | 'reviewer-rejected' | 'updated' | 'deactivated';
  state: LifecycleState;
  note: string | null;
  // ...
}
```

**Skill Artifacts:**
- `packages/server/src/lib/artifacts/model.ts` - `SkillArtifactRecord` type
- Similar lifecycle tracking with `SkillArtifactLifecycleEventRecord`

### 1.3 Audit System

**File:** `packages/server/src/lib/audit.ts`

```typescript
interface CreateAuditEventArgs {
  store: JsonStore;
  data: StoreData;
  teamId: string | null;
  actor: ResolvedAuthContext;
  action: string; // e.g., 'knowledge-reviewed', 'knowledge-deactivated'
  entityId: string;
  payload: Record<string, unknown>;
}
```

**Existing Audit Actions:**
- `knowledge-submitted`, `knowledge-reviewed`, `knowledge-imported`, `knowledge-exported`, `knowledge-deactivated`
- `artifact-imported`, `artifact-exported`
- `member-updated`

### 1.4 Indexing Integration

**File:** `packages/server/src/lib/indexing/events.ts`

```typescript
function determineKnowledgeIndexAction(
  previousState: LifecycleState,
  nextState: LifecycleState,
): 'upsert' | 'remove' | 'noop'
```

- Index sync happens on `approved` transition (upsert)
- Index removal happens on `deactivated` transition (remove)
- Post-commit pattern: indexing runs AFTER transaction commits

### 1.5 Review Flow (Reference Implementation)

**File:** `packages/server/src/routes/review.ts`

The review flow provides a template for Phase 35:
1. Resolve auth context, check permissions
2. Load entity within transaction
3. Apply decision using `applyReviewDecision()` from `knowledge.ts`
4. Record audit event
5. Return updated entity
6. Trigger post-commit indexing for state transitions

---

## 2. Gap Analysis (What's Missing)

### 2.1 No Revalidation Logic

The manual result from Phase 34 is stored but never revalidated before application. Need to verify:
- Candidate still exists and is in `duplicate_detected` status
- The existing entity referenced in `mergedWith` still exists
- The existing entity's current state is compatible with merge

### 2.2 No Publish/Merge Implementation

No functions exist for:
- Publishing a trap candidate to `KnowledgeRecord`
- Publishing a skill candidate to `SkillArtifactRecord`
- Merging candidate content into an existing entity
- Marking an entity as "superseded" or "absorbed"

### 2.3 No Lineage Tracking

No relationship records exist for:
- `merged_from` / `merged_into` relationships
- `superseded_by` relationships
- Preserving the chain from `originalPayload` → `duplicateCase` → `manualResult` → `finalEntity`

### 2.4 No Lifecycle States for Merge Outcomes

Current `LifecycleState` lacks:
- `superseded` state for entities that were absorbed by a merge
- Any distinction between "rejected by reviewer" and "rejected as duplicate"

### 2.5 No Audit Actions for Merge Events

Missing audit actions:
- `duplicate-resolved-independent` - candidate published as independent
- `duplicate-merged-into-existing` - candidate merged into existing entity
- `existing-superseded-by-merge` - existing entity superseded (if merging existing into candidate)

### 2.6 No Status Transition for Applied Manual Results

After manual result is applied, the candidate needs a new terminal status like `resolved` or `published`.

---

## 3. Key Decisions for Planning

### 3.1 Merge Semantics

**Question:** What does "merge" mean for traps vs. skills?

**For Traps:**
- Merge candidate into existing: Could update `detail` field, append notes, or keep existing
- Merge existing into candidate: Could create new trap, mark old as superseded

**For Skills:**
- Merge is more complex due to file structure
- Likely means "reject candidate, link to existing" or "update existing with candidate content"

**Recommendation:** Start with simpler semantics:
- `independent` → Create new entity from candidate
- `merged` → Reject candidate, record lineage link to existing entity

### 3.2 Lifecycle State Design

**Options:**

1. **Add new states:** `superseded` for absorbed entities
2. **Reuse existing states:** Use `deactivated` with a reason in lifecycle history
3. **Relationship records:** Create separate `EntityLineage` records

**Recommendation:** Use `deactivated` with lifecycle event notes, plus add relationship tracking in a new field on the record (e.g., `supersededBy` / `absorbed`).

### 3.3 Idempotency Strategy

**Question:** How to make the publish step idempotent?

**Recommendation:** Check candidate status before applying:
- If already in `resolved` or `published` status, return current state without reprocessing
- Use `manualResult.submittedAt` as deduplication key

### 3.4 Index Sync Timing

**Question:** When to sync indexes for newly published entities?

**Recommendation:** Follow the post-commit pattern from review.ts:
1. Transaction commits with entity state change
2. Post-commit: trigger `runKnowledgeIndexEvent()` or equivalent for artifacts
3. Log indexing errors but don't fail the domain operation

### 3.5 Error Cases

**Scenarios to handle:**
1. Candidate disappeared (deleted by another process) → 404 error
2. Existing entity disappeared → Abort, return error, suggest `independent` path
3. Candidate status not `duplicate_detected` → 400 error, invalid state
4. Race condition (two reviewers submit different results) → Last-write-wins based on `submittedAt`

---

## 4. Implementation Patterns to Follow

### 4.1 Transaction + Post-Commit Pattern

From `review.ts`:
```typescript
// Capture transition context for post-commit indexing
let previousState: LifecycleState | undefined;
let nextState: LifecycleState | undefined;

const result = await store.transact((data) => {
  // ... apply changes, capture previousState/nextState
});

// Post-commit indexing
if (previousState !== nextState) {
  await runKnowledgeIndexEvent({ ... });
}
```

### 4.2 Audit Event Creation

From `review.ts`:
```typescript
const auditEvent = createAuditEvent({
  store,
  data,
  teamId: entry.teamId,
  actor: auth,
  action: 'knowledge-reviewed',
  entityId: entry.id,
  payload: { decision, notes, previousState },
});
data.auditEvents.push(auditEvent);
```

### 4.3 Lifecycle Event Tracking

From `knowledge.ts`:
```typescript
function createLifecycleEvent(
  store: JsonStore,
  data: StoreData,
  input: Omit<KnowledgeLifecycleEventRecord, 'id'>,
): KnowledgeLifecycleEventRecord
```

Add lifecycle events for:
- `duplicate-resolution-applied` (custom event type or reuse existing)
- `deactivated` with note explaining merge/supersede

### 4.4 Permission Checking

From `review.ts`:
```typescript
const auth = await resolveAuthContext(app.skillShareer, request);
requirePermission(auth, 'knowledge:review');
requireTeamAccess(auth, entry.teamId);
requireHigherLevel(auth, entry.requiredLevel);
```

---

## 5. Files to Create/Modify

### 5.1 New Files

1. **`packages/server/src/lib/candidates/reconcile.ts`**
   - `revalidateManualResult()` - Pre-flight checks before applying
   - `publishCandidateAsIndependent()` - Create entity from candidate
   - `mergeCandidateIntoExisting()` - Link candidate to existing, mark resolved
   - `applyManualResultResolution()` - Main orchestrator function

2. **`packages/server/src/lib/candidates/lineage.ts`**
   - `EntityLineageRecord` type
   - `recordLineage()` - Store relationship between entities
   - `getLineage()` - Query lineage history

3. **`packages/contracts/src/domain/lineage.ts`** (optional, if lineage becomes a first-class concept)
   - Schemas for lineage relationships

### 5.2 Files to Modify

1. **`packages/contracts/src/domain/candidates.ts`**
   - Add `CandidateStatusSchema` value `'resolved'` or `'published'`
   - Add `ManualResultStatusSchema` for tracking applied/pending/failed

2. **`packages/contracts/src/domain/common.ts`**
   - Consider adding `'superseded'` to `lifecycleStateSchema` (or document use of `deactivated`)

3. **`packages/server/src/routes/candidates.ts`**
   - Add `POST /v1/candidates/:candidateId/apply-resolution` endpoint
   - Or modify existing manual-result endpoint to apply immediately

4. **`packages/server/src/lib/candidates/store.ts`**
   - Add `markCandidateResolved()` function
   - Add lineage tracking fields

5. **`packages/server/src/lib/audit.ts`**
   - Add new audit action types for merge events

6. **`packages/cli/src/commands/`** (if CLI integration needed)
   - Add command to trigger resolution application

---

## 6. Data Flow

```
Phase 34: Manual Result Submission
───────────────────────────────────
POST /v1/candidates/:id/manual-result
  ↓
Candidate.status = 'duplicate_detected' (unchanged)
Candidate.manualResult = { decision, notes, mergedWith?, ... }
  ↓
Response: { nextState: 'ready_for_review' | 'rejected' } (hint only)

Phase 35: Resolution Application
────────────────────────────────
POST /v1/candidates/:id/apply-resolution
  ↓
Revalidate:
  - Candidate exists and status = 'duplicate_detected'
  - manualResult exists
  - If mergedWith: target entity exists
  ↓
Apply Decision:
  - If 'independent':
    - Create new KnowledgeRecord/SkillArtifactRecord
    - Set status to appropriate initial state (agent-pass, pending review)
  - If 'merged':
    - Record lineage: candidate → existing entity
    - (Optionally) Update existing entity with notes
  ↓
Mark Candidate:
  - Candidate.status = 'resolved'
  - Candidate.resolvedAt = now
  ↓
Record Audit:
  - action: 'duplicate-resolved-independent' | 'duplicate-merged'
  - payload: { candidateId, decision, targetEntityId? }
  ↓
Post-Commit Indexing:
  - If new entity created → upsert to indexes
  - If entity absorbed → remove from indexes (if marked deactivated/superseded)
```

---

## 7. Testing Considerations

### 7.1 Unit Tests

- `revalidateManualResult()` with missing candidate → error
- `revalidateManualResult()` with wrong status → error
- `revalidateManualResult()` with missing target entity → error
- `publishCandidateAsIndependent()` creates correct entity fields
- `mergeCandidateIntoExisting()` records lineage correctly
- Idempotency: calling twice returns same result without duplication

### 7.2 Integration Tests

- Full flow from duplicate detection → manual result → resolution
- Trap candidate resolution
- Skill candidate resolution
- Merge with existing trap that gets deactivated
- Index sync after resolution

### 7.3 Edge Cases

- Concurrent resolution attempts (race conditions)
- Target entity deleted between manual result and resolution
- Target entity state changed (e.g., already deactivated)
- Large payload handling for skill bundles

---

## 8. Dependencies and Sequencing

### 8.1 Depends On

- **Phase 34** (complete): Manual result intake and storage
- **Phase 33** (complete): Candidate submission and duplicate detection

### 8.2 Blocks

- **Phase 36** (GraphRAG-lite indexing): No direct dependency, but resolved entities become part of the graph

### 8.3 Suggested Plan Breakdown

1. **35-01: Contracts and Types**
   - Add `resolved` status to `CandidateStatusSchema`
   - Add lineage types if creating separate lineage records
   - Add audit action types for merge events

2. **35-02: Revalidation Logic**
   - Create `revalidateManualResult()` function
   - Handle all error cases with appropriate error codes

3. **35-03: Publish Independent Path**
   - `publishTrapCandidate()` - Create KnowledgeRecord from candidate
   - `publishSkillCandidate()` - Create SkillArtifactRecord from candidate
   - Set appropriate lifecycle state for review

4. **35-04: Merge Path**
   - `recordMergeLineage()` - Link candidate to existing entity
   - Handle entity deactivation/supersede if needed
   - Record lifecycle event on existing entity

5. **35-05: API Endpoint**
   - `POST /v1/candidates/:candidateId/apply-resolution`
   - Integrate revalidation, publish, merge, audit, indexing

6. **35-06: Integration Testing**
   - End-to-end tests for all three outcomes
   - Error handling tests
   - Idempotency tests

---

## 9. Open Questions for Planning Session

1. **Merge depth:** Should `merged` decision update the existing entity's content, or just link and reject the candidate?
   - Start with link-and-reject for simplicity.

2. **Lineage persistence:** Separate `entityLineage` collection, or fields on existing records?
   - Recommend fields on records (`supersededBy`, `mergedFrom` arrays).

3. **Review flow for independent:** Should newly published entities go through the standard review queue?
   - Likely yes - they should enter at `agent-pass` or `submitted` state.

4. **CLI integration:** Should there be a CLI command for `trapmap candidates resolve <id> --decision independent`?
   - Or rely on Phase 34's manual result flow + separate apply endpoint?

5. **Bulk resolution:** Should Phase 35 support batch resolution of multiple candidates?
   - Defer to future phase if needed.

---

## 10. Summary

Phase 35 needs to:
1. **Revalidate** the manual result before trust
2. **Publish** candidates marked independent as new entities
3. **Merge/link** candidates marked merged to existing entities
4. **Record** lineage and audit trails
5. **Sync** indexes for newly published content
6. **Handle errors** gracefully with idempotent operations

The implementation should follow the established patterns from `review.ts` and `knowledge.ts` for transaction management, lifecycle tracking, audit logging, and post-commit indexing.