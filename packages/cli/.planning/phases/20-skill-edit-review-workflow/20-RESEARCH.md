# Phase 20: Skill Edit Review Workflow - Research

**Gathered:** 2026-04-19
**Target Requirement:** SKED-03

---

## Summary: What Do I Need to Know to PLAN This Phase?

To plan Phase 20 well, you need to understand:

1. **The existing review patterns** - The knowledge review flow (`/v1/knowledge/review`) already implements reviewer RBAC, audit logging, and lifecycle transitions. This phase extends those patterns to skill artifacts.

2. **The skill artifact data model** - Skill artifacts (`SkillArtifactRecord`) have their own lifecycle state, review history, and governance fields that parallel knowledge entries.

3. **The key difference from knowledge review** - Skill artifact edits create pending revisions that need approval before becoming active. Approved edits become the active version; rejected edits return to submitter.

4. **CLI patterns already established** - The CLI has `review:queue`, `review:approve`, `review:reject` commands for knowledge entries that can be adapted for skill artifacts.

---

## Requirement Analysis

**SKED-03:** Reviewers with sufficient permissions can approve or reject skill edits

### Success Criteria Breakdown

1. **Reviewers with `skill:review` permission can see pending skill edits**
   - Note: Current permissions use `knowledge:review` (see `permissionSchema` in `common.ts`)
   - Option A: Add new `skill:review` permission
   - Option B: Reuse `knowledge:review` for skill artifacts (simpler, consistent with existing patterns)

2. **Reviewer can approve or reject a skill edit with notes**
   - Same pattern as knowledge review: decision ('approve' | 'reject') + notes (string)

3. **Approved edits become the active skill version; rejected edits return to submitter for revision**
   - For artifacts: `lifecycleState` transitions from 'agent-pass' → 'approved' or 'rejected'
   - The latest revision becomes active on approval

4. **Edit review decisions are recorded in audit trail**
   - Use existing `createAuditEvent()` pattern
   - New action type: `artifact-reviewed` (already exists in audit schema)

---

## Existing Code Patterns to Reuse

### 1. Knowledge Review Route Pattern (`/packages/server/src/routes/review.ts`)

The existing review route provides the exact template:

```typescript
// Permission check
requirePermission(auth, 'knowledge:review');

// Team access check
if (entry.teamId) {
  requireTeamAccess(auth, entry.teamId);
}

// Security level check
requireHigherLevel(auth, entry.requiredLevel);

// Transaction with review decision
await app.skillShareer.store.transact((data) => {
  // ... apply review decision
  // ... record audit event
});

// Post-commit indexing (for approvals)
await runKnowledgeIndexEvent({ ... });
```

### 2. Review Decision Application (`/packages/server/src/lib/knowledge.ts`)

`applyReviewDecision()` shows the pattern:
- Push review decision to `reviewHistory`
- Add review note
- Update `lifecycleState` to 'approved' or 'rejected'
- Update metadata (`latestReviewedAt`, `latestDecision`)
- Push lifecycle event

### 3. CLI Review Commands (`/packages/cli/src/commands/review.ts`)

Existing commands:
- `review:queue` - Lists pending items
- `review:approve <entryId> --notes <text>`
- `review:reject <entryId> --notes <text>`

### 4. Skill Artifact Model (`/packages/server/src/lib/artifacts/model.ts`)

Key structures:
- `SkillArtifactReviewDecisionRecord` - Already defined with `decidedAt`, `decidedByUserId`, `decision`, `notes`
- `SkillArtifactReviewNoteRecord` - For review notes
- `SkillArtifactLifecycleEventRecord` - Includes 'reviewer-approved' and 'reviewer-rejected' types

The artifact record already has:
- `reviewHistory: SkillArtifactReviewDecisionRecord[]`
- `reviewNotes: SkillArtifactReviewNoteRecord[]`
- `lifecycleHistory: SkillArtifactLifecycleEventRecord[]`
- `metadata.latestDecision`

---

## New Contracts Needed

### Option A: New Skill Review Contracts

```typescript
// In contracts/src/domain/operations.ts or new file

// Pending skill edits queue query
export const skillReviewQueueQuerySchema = paginatedQuerySchema.extend({
  status: lifecycleStateSchema.optional(),
  teamId: entityIdSchema.optional(),
});

// Pending skill edit item in queue
export const skillReviewQueueItemSchema = z.object({
  artifact: skillArtifactSchema,
  revision: z.number().int().min(1),
  agentReview: agentReviewResultSchema.nullable(),
  submittedBy: actorRefSchema,
  lastDecision: reviewDecisionSchema.nullable(),
});

// Skill review queue response
export const skillReviewQueueResponseSchema = z.object({
  items: z.array(skillReviewQueueItemSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().min(0),
});

// Skill review decision request
export const skillReviewDecisionRequestSchema = z.object({
  artifactId: entityIdSchema,
  revision: z.number().int().min(1).optional(), // Optional: defaults to latest
  decision: z.enum(['approve', 'reject']),
  notes: z.string().min(1).max(2000),
});

// Skill review decision response
export const skillReviewDecisionResponseSchema = z.object({
  artifact: skillArtifactSchema,
  previousState: lifecycleStateSchema,
  newState: lifecycleStateSchema,
});
```

### Option B: Reuse Existing Review Contracts

The existing `reviewDecisionRequestSchema` and `reviewQueueResponseSchema` could be extended or reused, but this may cause confusion between knowledge entries and skill artifacts.

**Recommendation:** Create distinct contracts for skill artifact review to maintain clear separation.

---

## Implementation Approach

### Plan 20-01: Implement Skill Edit Review Endpoint

**Location:** `/packages/server/src/routes/operations.ts` (extend existing artifact routes)

**New Routes:**

1. `GET /v1/operations/artifacts/review-queue` - List pending skill edits
   - Permission: `knowledge:review` (reuse existing)
   - Filter artifacts where `lifecycleState` is 'agent-pass' (pending review)
   - Return artifact metadata with revision info

2. `POST /v1/operations/artifacts/:artifactId/review` - Submit review decision
   - Permission: `knowledge:review`
   - Team access check
   - Higher security level check
   - Apply decision:
     - Approve: Set `lifecycleState = 'approved'`, trigger indexing
     - Reject: Set `lifecycleState = 'rejected'`, notify submitter (future)

**Key Implementation Details:**

```typescript
// Apply review decision to artifact
function applyArtifactReviewDecision(args: {
  store: JsonStore;
  data: StoreData;
  artifact: SkillArtifactRecord;
  reviewerUserId: string;
  decidedAt: string;
  decision: 'approve' | 'reject';
  notes: string;
}): SkillArtifactRecord {
  const { artifact, decision, notes, reviewerUserId, decidedAt } = args;

  // Create review decision record
  const reviewDecision: SkillArtifactReviewDecisionRecord = {
    decidedAt,
    decidedByUserId: reviewerUserId,
    decision,
    notes,
  };

  // Create review note
  const note: SkillArtifactReviewNoteRecord = {
    id: args.store.nextId(args.data, 'artifact_note'),
    createdAt: decidedAt,
    authorType: 'reviewer',
    authorUserId: reviewerUserId,
    message: notes,
  };

  // Update artifact
  artifact.reviewHistory.push(reviewDecision);
  artifact.reviewNotes.push(note);
  artifact.lifecycleState = decision === 'approve' ? 'approved' : 'rejected';
  artifact.metadata.latestReviewedAt = decidedAt;
  artifact.metadata.latestDecision = decision;

  // Add lifecycle event
  artifact.lifecycleHistory.push({
    id: args.store.nextId(args.data, 'artifact_event'),
    type: decision === 'approve' ? 'reviewer-approved' : 'reviewer-rejected',
    createdAt: decidedAt,
    actorUserId: reviewerUserId,
    submissionId: artifact.metadata.latestSubmissionId,
    revision: artifact.latestRevision.revision,
    state: artifact.lifecycleState,
    note: notes,
  });

  artifact.updatedAt = decidedAt;

  return artifact;
}
```

### Plan 20-02: Add CLI Commands

**Location:** `/packages/cli/src/commands/skill.ts` (extend existing skill commands)

**New Commands:**

1. `skill review:queue` - List pending skill edits
   - Options: `--status <state>`, `--json`

2. `skill review:approve <artifactId>` - Approve a skill edit
   - Required: `--notes <text>`
   - Optional: `--revision <n>` (default: latest)

3. `skill review:reject <artifactId>` - Reject a skill edit
   - Required: `--notes <text>`
   - Optional: `--revision <n>` (default: latest)

**CLI Registration Update:** `/packages/cli/src/index.ts`

The visibility check already exists for knowledge review:
```typescript
allowKnowledgeReview: securityLevel >= 1 && hasPermission(effectivePermissions, 'knowledge:review'),
```

This can be reused for skill artifact review.

---

## Governance & Security Considerations

### RBAC Pattern (from existing code)

```typescript
// 1. Resolve auth context
const auth = await resolveAuthContext(app.skillShareer, request);

// 2. Check permission
requirePermission(auth, 'knowledge:review');

// 3. Check team access (for team-scoped artifacts)
if (artifact.teamId) {
  requireTeamAccess(auth, artifact.teamId);
}

// 4. Check higher security level (reviewer must be higher level than artifact)
requireHigherLevel(auth, artifact.requiredLevel);
```

### Audit Trail

Existing audit event types include `artifact-imported`, `artifact-exported`. Add `artifact-reviewed`:

```typescript
const auditEvent = createAuditEvent({
  store: app.skillShareer.store,
  data,
  teamId: artifact.teamId,
  actor: auth,
  action: 'artifact-reviewed',
  entityId: artifact.id,
  payload: {
    decision: payload.decision,
    notes: payload.notes,
    revision: artifact.latestRevision.revision,
    previousState,
    newState: artifact.lifecycleState,
  },
});
```

Note: The `auditEventSchema` action enum needs to include `'artifact-reviewed'`.

---

## Dependencies on Phase 19

Phase 19 (Skill Edit Flow with History) provides:
- `submitSkillEdit()` - Creates pending revisions
- `getSkillHistory()` - View revision history
- Edit endpoint: `POST /v1/operations/artifacts/:artifactId/edit`
- History endpoint: `GET /v1/operations/artifacts/:artifactId/history`

Phase 20 builds on this by:
- Adding review workflow for pending edits
- Approving/rejecting specific revisions
- Recording review decisions in lifecycle history

---

## Testing Strategy

Based on existing test patterns in `review.test.ts`:

1. **Unit tests for `applyArtifactReviewDecision()`**
   - Test lifecycle state transitions
   - Test review history recording
   - Test metadata updates

2. **Integration tests for review endpoints**
   - Test permission enforcement
   - Test team access checks
   - Test security level checks
   - Test approval flow with indexing
   - Test rejection flow (no indexing)
   - Test audit event creation

3. **Coexistence tests**
   - Verify knowledge review still works with skill artifacts present
   - Verify artifact review works with knowledge entries present

---

## Open Questions

1. **Permission naming:** Should we add `skill:review` or reuse `knowledge:review`?
   - **Recommendation:** Reuse `knowledge:review` for consistency with existing patterns (SKED-03 says "sufficient permissions", doesn't mandate new permission)

2. **Indexing on approval:** Should approved skill edits trigger the indexing pipeline?
   - **Yes:** Follows the same pattern as knowledge approval (IDX-03)
   - Use `runKnowledgeIndexEvent()` with artifact-derived capsules

3. **Notification on rejection:** Should rejected edits notify the submitter?
   - **Out of scope for v1.3:** Would require notification system
   - Submitter can check history to see rejection

4. **Revision-specific review:** Can reviewers approve/reject specific revisions?
   - **Simpler approach:** Always review the latest revision
   - The `--revision` flag could be added later if needed

---

## File Changes Summary

### Server Changes

| File | Action | Description |
|------|--------|-------------|
| `src/routes/operations.ts` | Modify | Add review queue and review decision endpoints |
| `src/lib/artifacts/model.ts` | Modify | Add `applyArtifactReviewDecision()` function |
| `src/lib/artifacts/edit.ts` | Possibly modify | May add review-related helpers |

### Contracts Changes

| File | Action | Description |
|------|--------|-------------|
| `src/domain/operations.ts` | Modify | Add skill review contracts |
| `src/domain/common.ts` | Possibly modify | May need to update audit action enum |

### CLI Changes

| File | Action | Description |
|------|--------|-------------|
| `src/commands/skill.ts` | Modify | Add review subcommands |
| `src/index.ts` | Possibly modify | May need to update visibility flags |

---

## References

- **Existing review route:** `/packages/server/src/routes/review.ts`
- **RBAC helpers:** `/packages/server/src/lib/rbac.ts`
- **Audit helpers:** `/packages/server/src/lib/audit.ts`
- **Skill artifact model:** `/packages/server/src/lib/artifacts/model.ts`
- **Skill edit helpers:** `/packages/server/src/lib/artifacts/edit.ts`
- **Store types:** `/packages/server/src/lib/store.ts`
- **CLI review commands:** `/packages/cli/src/commands/review.ts`
- **CLI skill commands:** `/packages/cli/src/commands/skill.ts`
