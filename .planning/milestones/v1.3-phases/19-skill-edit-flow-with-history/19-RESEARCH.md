# Phase 19: Skill Edit Flow with History - Research

**Researched:** 2026-04-19 [VERIFIED: codebase grep]
**Domain:** Skill editing with revision history and review-queue integration [VERIFIED: codebase grep]
**Confidence:** HIGH [VERIFIED: codebase grep, existing patterns established]

<user_constraints>
## User Constraints

### Locked Decisions
- Goal: Enable users to edit skills by ID with edit history preservation. [VERIFIED: ROADMAP]
- User can invoke `skill edit <id>` to modify skill content. [VERIFIED: REQUIREMENTS SKED-02]
- Edit creates a pending revision that enters the review queue. [VERIFIED: REQUIREMENTS SKED-02]
- Previous skill versions are preserved with timestamps. [VERIFIED: REQUIREMENTS SKED-04]
- User can view edit history for a skill showing all past revisions. [VERIFIED: REQUIREMENTS SKED-04]

### Claude's Discretion
- Exact contract shape for edit request and history response. [ASSUMED]
- Whether to reuse existing `knowledge:*` permissions or introduce `skill:*` permissions. [ASSUMED]
- How to handle file content updates vs. metadata-only updates. [ASSUMED]
- Whether edits require a new revision number or can amend pending revisions. [ASSUMED]

### Deferred Ideas (OUT OF SCOPE)
- Skill edit review workflow (approve/reject) is Phase 20. [VERIFIED: ROADMAP]
- Logging work is Phases 21-22. [VERIFIED: ROADMAP]
- Skill deletion is admin-only and out of scope. [VERIFIED: REQUIREMENTS]
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SKED-02 | User can edit an existing skill by ID; changes enter a review queue before taking effect. | Extend the skill artifact model to support pending revisions, add a `skill edit` CLI command, and integrate with the existing review queue pattern from `packages/server/src/routes/review.ts`. [VERIFIED: codebase grep] |
| SKED-04 | Edit history is preserved on the skill (previous versions, edit timestamps). | The `SkillArtifactRecord` already has `history: SkillArtifactRevisionRecord[]` with revision numbers, timestamps, and actor refs. Add history view endpoint and CLI command. [VERIFIED: codebase grep] |
</phase_requirements>

## Summary

Phase 19 should be implemented as an extension to the existing skill artifact model, reusing the revision history pattern already built into `SkillArtifactRecord` and the review queue pattern from the legacy knowledge system. The codebase already has:

1. **Revision history**: `SkillArtifactRecord.history` stores immutable `SkillArtifactRevisionRecord[]` entries with revision numbers, timestamps, and file manifests. [VERIFIED: store.ts lines 461-476]

2. **Revision appending**: `appendSkillArtifactRevision()` in `packages/server/src/lib/artifacts/model.ts` already creates new revisions with pre-review. [VERIFIED: artifacts/model.ts lines 337-420]

3. **Review queue pattern**: `packages/server/src/routes/review.ts` shows the pattern for pending reviews, lifecycle states, and approval flows. [VERIFIED: review.ts]

4. **CLI skill namespace**: Phase 18 established `packages/cli/src/commands/skill.ts` with `search-by-content`. Extend with `edit` and `history` subcommands. [VERIFIED: skill.ts]

5. **Audit trail**: `createAuditEvent()` records all mutating operations. [VERIFIED: audit.ts]

The cheapest correct implementation is to:
- Add `skill edit <id>` CLI command that fetches artifact by ID, accepts edit payload, creates a new pending revision via `appendSkillArtifactRevision()`, and transitions lifecycle state to `agent-pass` or `agent-rejected`.
- Add `skill history <id>` CLI command that fetches artifact and displays revision history with timestamps and actors.
- Reuse `knowledge:submit` permission for editing (owner can edit their own artifacts; higher-level users can edit artifacts below their level). [ASSUMED]

**Primary recommendation:** Extend `packages/cli/src/commands/skill.ts` with `edit` and `history` subcommands. Add server routes in `packages/server/src/routes/operations.ts` for `GET /v1/operations/artifacts/:artifactId` (fetch for editing) and `POST /v1/operations/artifacts/:artifactId/revisions` (submit edit). Add contracts in `packages/contracts/src/domain/operations.ts` for edit request/response and history response schemas. [ASSUMED]

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Commander | 14.0.3 [VERIFIED: npm registry] | Nested CLI command surface for `skill edit` and `skill history` | Already used in Phase 18 for `skill search-by-content` [VERIFIED: skill.ts] |
| Zod | 4.3.6 [VERIFIED: npm registry] | Shared request/response schemas for edit and history | Contracts package already exports artifact schemas [VERIFIED: artifacts.ts] |
| Fastify | 5.8.5 [VERIFIED: npm registry] | Thin HTTP route layer for edit and history endpoints | Operations routes already handle artifact operations [VERIFIED: operations.ts] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | 4.1.4 [VERIFIED: npm registry] | Contract, CLI, and route/helper tests | Use for targeted tests following Phase 18 patterns [VERIFIED: vitest] |
| Existing artifact model | In-repo [VERIFIED: codebase grep] | Revision history, governance, derived outputs | Reuse `appendSkillArtifactRevision()`, `toSkillArtifact()` [VERIFIED: artifacts/model.ts] |
| Existing review patterns | In-repo [VERIFIED: codebase grep] | Pre-review, lifecycle transitions, audit events | Reuse `runPreReview()`, lifecycle event creation [VERIFIED: review.ts, knowledge.ts] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending `skill` CLI namespace [ASSUMED] | New `skill-edit` top-level command | Top-level would be inconsistent with Phase 18's nested namespace. [VERIFIED: skill.ts] |
| Reusing `knowledge:submit` permission [ASSUMED] | New `skill:edit` permission | Adding a new permission expands scope; current permission model has no `skill:*` family. [VERIFIED: common.ts] |
| Operations routes for artifact edit [ASSUMED] | New `/v1/artifacts` routes | Operations routes already handle artifact import/export/activate; keeps artifact mutations together. [VERIFIED: operations.ts] |

**Version verification:** Current registry versions verified: Commander `14.0.3`, Zod `4.3.6`, Fastify `5.8.5`, Vitest `4.1.4`. [VERIFIED: npm registry]

## Architecture Patterns

### Recommended Project Structure
```text
packages/
├── cli/src/commands/skill.ts           # Extend with edit and history subcommands
├── contracts/src/domain/operations.ts  # Add skillEditRequestSchema, skillHistoryResponseSchema
├── server/src/routes/operations.ts     # Add GET /v1/operations/artifacts/:artifactId, POST revisions
├── server/src/lib/artifacts/model.ts   # Already has appendSkillArtifactRevision()
└── server/src/lib/artifacts/edit.ts    # New helper for edit-specific logic
```

### Pattern 1: Extend Skill CLI Namespace with Edit and History
**What:** Add `skill edit <id>` and `skill history <id>` commands to the existing `skill` namespace. [ASSUMED]
**When to use:** Phase 19 adds edit flow while Phase 18 already has `search-by-content`. [VERIFIED: skill.ts]
**Example:**
```typescript
// Source: existing pattern from packages/cli/src/commands/skill.ts
const skill = program.command('skill').description('Search and manage skill artifacts');

// Phase 18: search-by-content (already exists)
skill.command('search-by-content')...

// Phase 19: edit (additive)
skill
  .command('edit <artifactId>')
  .description('Edit a skill artifact by ID')
  .option('--title <title>', 'New title')
  .option('--labels <labels>', 'Comma-separated labels')
  .option('--file <path>', 'File to update (can be repeated)', collect, [])
  .option('--json', 'Output JSON')
  .action(async (artifactId, flags) => {
    // 1. Fetch artifact by ID
    // 2. Build edit payload from flags
    // 3. POST to /v1/operations/artifacts/:artifactId/revisions
    // 4. Print result
  });

// Phase 19: history (additive)
skill
  .command('history <artifactId>')
  .description('View revision history for a skill artifact')
  .option('--json', 'Output JSON')
  .action(async (artifactId, flags) => {
    // GET /v1/operations/artifacts/:artifactId/history
  });
```

### Pattern 2: Reuse Append Revision for Edit Flow
**What:** The existing `appendSkillArtifactRevision()` already creates new revisions with pre-review and updates lifecycle state. [VERIFIED: artifacts/model.ts lines 337-420]
**When to use:** When a user submits an edit, create a new revision with the updated file manifest and run pre-review. [ASSUMED]
**Example:**
```typescript
// Source: packages/server/src/lib/artifacts/model.ts
export function appendSkillArtifactRevision(args: {
  store: JsonStore;
  data: StoreData;
  artifact: ServerSkillArtifactRecord;
  ownerUserId: string;
  payload: {
    files: Array<{...}>;
    scriptDescriptors: Array<{...}>;
    sourceHash: string;
  };
  submittedAt: string;
  preReview: AgentReviewResult;
}): ServerSkillArtifactRecord {
  // Creates new revision, updates metadata, transitions lifecycle state
  // Appends to history array
  // Records lifecycle events
}

// Phase 19 edit route would:
// 1. Resolve auth, check permissions
// 2. Fetch artifact by ID
// 3. Validate user can edit (owner or higher level)
// 4. Build new file manifest from edit payload
// 5. Run pre-review
// 6. Call appendSkillArtifactRevision()
// 7. Trigger derivation for new revision
// 8. Record audit event
// 9. Return updated artifact
```

### Pattern 3: Permission Model for Skill Editing
**What:** Reuse `knowledge:submit` for skill editing, with ownership and level checks. [ASSUMED]
**When to use:** The permission enum has no `skill:*` family; adding one expands scope. [VERIFIED: common.ts lines 20-35]
**Example:**
```typescript
// Source: existing permission checks from packages/server/src/routes/knowledge.ts
app.patch('/v1/knowledge/:entryId', async (request) => {
  const auth = await resolveAuthContext(app.skillShareer, request);
  requirePermission(auth, 'knowledge:update');

  // Owner check + level check
  if (entry.ownerUserId !== ownerUserId) {
    throw new AppError(403, 'forbidden', 'Only the original submitter may resubmit this entry');
  }
  requireHigherLevel(auth, entry.requiredLevel);
});

// Phase 19: skill edit should allow:
// - Owner can edit their own artifacts (any state except approved?)
// - Higher-level user can edit artifacts below their level
// - System admin can edit any artifact
```

### Pattern 4: History View Schema
**What:** Return the artifact's revision history with actor refs and timestamps. [VERIFIED: artifacts.ts]
**When to use:** The `skill history <id>` command needs a response schema. [ASSUMED]
**Example:**
```typescript
// Source: packages/contracts/src/domain/artifacts.ts
export const skillArtifactRevisionSchema = z.object({
  revision: z.number().int().min(1),
  sourceHash: z.string().length(64),
  files: z.array(skillArtifactFileSchema).min(1),
  submittedAt: isoTimestampSchema,
  submittedBy: actorRefSchema,
  scriptDescriptors: z.array(skillScriptDescriptorSchema).default([]),
  derived: z.object({...}).nullable(),
});

// Phase 19: History response wraps revision history with metadata
export const skillHistoryResponseSchema = z.object({
  artifactId: entityIdSchema,
  title: z.string(),
  currentRevision: z.number().int().min(1),
  lifecycleState: lifecycleStateSchema,
  revisions: z.array(z.object({
    revision: z.number().int().min(1),
    submittedAt: isoTimestampSchema,
    submittedBy: actorRefSchema,
    summary: z.string().optional(), // Brief description of changes
    state: lifecycleStateSchema, // State after this revision
  })),
});
```

### Anti-Patterns to Avoid
- **Creating a parallel edit path instead of using `appendSkillArtifactRevision()`:** The existing function already handles revision numbering, metadata updates, lifecycle events, and history preservation. [VERIFIED: artifacts/model.ts]
- **Editing approved artifacts without review:** SKED-02 explicitly requires edits to enter the review queue. Approved artifacts should transition to pending state when edited. [VERIFIED: REQUIREMENTS]
- **Bypassing pre-review:** Even edits should go through the agent pre-review for duplicate detection and quality checks. [VERIFIED: knowledge.ts, review.ts patterns]
- **Storing file content in revision records:** Revision records store metadata only; content goes in `artifactFilePayloads`. [VERIFIED: store.ts lines 527-544]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Revision history storage | New history table or array [ASSUMED] | `SkillArtifactRecord.history: SkillArtifactRevisionRecord[]` [VERIFIED: store.ts] | Already stores immutable revisions with timestamps and actors. |
| Revision numbering | Custom increment logic [ASSUMED] | `appendSkillArtifactRevision()` computes `history.length + 1` [VERIFIED: artifacts/model.ts line 369] | Prevents revision number conflicts. |
| Pre-review for edits | Skip agent checks for trusted users [ASSUMED] | `runPreReview()` from `packages/server/src/lib/pre-review.ts` [VERIFIED: pre-review.ts] | Consistency with original submission flow. |
| Lifecycle state transitions | Manual state assignment [ASSUMED] | Pattern from `appendSkillArtifactRevision()` lines 391-393 [VERIFIED: artifacts/model.ts] | `agent-pass` or `agent-rejected` based on pre-review. |
| Permission gating | New `skill:edit` permission [ASSUMED] | `knowledge:submit` + ownership/level checks [VERIFIED: knowledge.ts] | No `skill:*` permission family exists. |
| Audit events for edits | Ad hoc logging [ASSUMED] | `createAuditEvent()` from `packages/server/src/lib/audit.ts` [VERIFIED: audit.ts] | Consistent audit trail format. |

**Key insight:** Phase 19 is mostly wiring work — the data model and revision mechanics already exist. The novel work is the edit contract, history view contract, and CLI command surface. [VERIFIED: codebase grep]

## Common Pitfalls

### Pitfall 1: Editing Without Creating a Pending Revision
**What goes wrong:** Edits could immediately affect approved artifacts, bypassing the review requirement. [VERIFIED: REQUIREMENTS SKED-02]
**Why it happens:** The `appendSkillArtifactRevision()` function transitions to `agent-pass` or `agent-rejected`, but Phase 20 is needed for the full review workflow.
**How to avoid:** Ensure edited artifacts with state `approved` transition to `agent-pass` (pending review) after edit submission. Phase 20 will implement the reviewer approval/rejection flow.
**Warning signs:** Approved artifacts show immediate content changes after edit submission.

### Pitfall 2: Losing File Content During Edit
**What goes wrong:** If edit payload only includes changed files, unchanged files could be lost. [VERIFIED: operations.ts import pattern]
**Why it happens:** The revision record stores a complete file manifest, not a diff.
**How to avoid:** The edit flow must fetch the current artifact, merge the edit payload with existing files, and compute a new complete file manifest for the revision.
**Warning signs:** Edited artifacts lose references or assets that weren't explicitly included in the edit payload.

### Pitfall 3: History View Without Access Control
**What goes wrong:** Users could view history for artifacts they shouldn't have access to. [VERIFIED: operations.ts export pattern]
**Why it happens:** History endpoint might skip governance checks.
**How to avoid:** Apply the same governance filters (team access, security level) to history views as to artifact export/activation.
**Warning signs:** History shows artifacts from other teams or above user's security level.

### Pitfall 4: CLI Edit Without Content Fetch
**What goes wrong:** CLI `skill edit` might require users to provide all fields, even unchanged ones. [ASSUMED]
**Why it happens:** Unlike a web form that pre-populates current values, CLI edit needs to support partial updates.
**How to avoid:** CLI should fetch artifact by ID, then PATCH only provided fields, similar to `knowledgeUpdateSchema` pattern. [VERIFIED: knowledge.ts lines 133-139]
**Warning signs:** Users must re-enter unchanged fields when editing.

## Code Examples

Verified patterns from the current codebase:

### Existing Append Revision Pattern
```typescript
// Source: packages/server/src/lib/artifacts/model.ts lines 337-420
export function appendSkillArtifactRevision(args: {
  store: JsonStore;
  data: StoreData;
  artifact: ServerSkillArtifactRecord;
  ownerUserId: string;
  payload: {
    files: Array<{
      path: string;
      kind: 'skill-markdown' | 'reference' | 'asset' | 'script';
      sha256: string;
      sizeBytes: number;
      mediaType: string;
      source: 'references/' | 'assets/' | 'scripts/' | 'SKILL.md';
      includeInDerivation: boolean;
      activationOnly: boolean;
    }>;
    scriptDescriptors: Array<{...}>;
    sourceHash: string;
  };
  submittedAt: string;
  preReview: AgentReviewResult;
}): ServerSkillArtifactRecord {
  const revisionNumber = args.artifact.history.length + 1;

  // Create new revision
  const revision: SkillArtifactRevisionRecord = {
    revision: revisionNumber,
    sourceHash: args.payload.sourceHash,
    files: args.payload.files,
    submittedAt: args.submittedAt,
    submittedByUserId: args.ownerUserId,
    scriptDescriptors: args.payload.scriptDescriptors,
    derived: null,
  };

  // Update metadata
  args.artifact.metadata.submissionCount += 1;
  args.artifact.metadata.revisionCount = revisionNumber;
  args.artifact.metadata.latestSubmissionId = args.store.nextId(args.data, 'artifact_submission');
  args.artifact.metadata.latestSubmittedAt = args.submittedAt;
  args.artifact.metadata.latestReviewedAt = args.preReview.checkedAt;
  args.artifact.metadata.latestDecision = null;

  // Update lifecycle state based on pre-review
  args.artifact.lifecycleState =
    args.preReview.status === 'agent-pass' ? 'agent-pass' : 'agent-rejected';
  args.artifact.latestRevision = revision;
  args.artifact.history.push(revision);
  // ... lifecycle events, review notes ...

  return args.artifact;
}
```

### Existing Permission + Ownership Pattern
```typescript
// Source: packages/server/src/routes/knowledge.ts lines 123-175
app.post('/v1/knowledge/:entryId/resubmit', async (request) => {
  const auth = await resolveAuthContext(app.skillShareer, request);
  const ownerUserId = requireRealUser(auth.user?.id);
  const entryId = (request.params as { entryId: string }).entryId;

  const updatedEntry = await app.skillShareer.store.transact((data) => {
    const entry = data.knowledgeEntries.find((candidate) => candidate.id === entryId);

    if (!entry) {
      throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
    }

    if (entry.ownerUserId !== ownerUserId) {
      throw new AppError(403, 'forbidden', 'Only the original submitter may resubmit this entry');
    }

    if (!['rejected', 'agent-rejected'].includes(entry.lifecycleState)) {
      throw new AppError(400, 'invalid_state', 'Only rejected entries may be resubmitted');
    }

    // ... resubmit logic ...
  });
});
```

### Existing Governance Check Pattern
```typescript
// Source: packages/server/src/routes/operations.ts lines 536-548
// Artifact export shows governance pattern
const artifact = data.skillArtifacts?.find((a) => a.id === artifactId);
if (!artifact) {
  throw new AppError(404, 'artifact_not_found', `Artifact ${artifactId} not found`);
}

// Check team access
if (artifact.teamId !== null) {
  requireTeamAccess(auth, artifact.teamId);
}

// Check security level
if (auth.securityLevel < artifact.requiredLevel) {
  throw new AppError(
    403,
    'insufficient_level',
    `Security level ${auth.securityLevel} insufficient for artifact level ${artifact.requiredLevel}`,
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Knowledge entries had flat revision history with `KnowledgeRevisionRecord[]`. [VERIFIED: knowledge.ts] | Skill artifacts have structured `SkillArtifactRevisionRecord[]` with derived outputs, file manifests, and script descriptors. [VERIFIED: artifacts.ts] | Phase 12, completed 2026-04-16. [VERIFIED: PROJECT.md] | Phase 19 can reuse the richer revision structure for history views. |
| Edits to knowledge entries used `knowledgeUpdateSchema` with optional fields. [VERIFIED: knowledge.ts] | Skill artifact edits should support partial file updates with merge logic. [ASSUMED] | Phase 19 scope. [VERIFIED: ROADMAP] | Need a `skillEditRequestSchema` that supports both metadata and file updates. |

**Deprecated/outdated:**
- Using the legacy `knowledgeUpdateSchema` for skill edits is outdated; skill artifacts have a richer file-based model. [VERIFIED: knowledge.ts vs artifacts.ts]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 19 should reuse `knowledge:submit` instead of introducing `skill:edit`. [ASSUMED] | Summary, Architecture Patterns | Planner may under-scope auth changes if product intent actually requires a new permission. |
| A2 | Edits should use `appendSkillArtifactRevision()` instead of a custom edit path. [VERIFIED] | Architecture Patterns | If the edit flow needs different lifecycle handling, additional logic will be needed. |
| A3 | Edit endpoint should live in operations routes alongside import/export. [ASSUMED] | Architecture Patterns | Planner may place the route in the wrong module and create churn. |
| A4 | File content updates require fetching current artifact and merging with edit payload. [ASSUMED] | Common Pitfalls | If partial updates aren't needed, this adds unnecessary complexity. |

## Open Questions (TO RESOLVE)

1. **Edit permissions for non-owners**
   - Question: Can users edit artifacts they don't own?
   - Options: (a) Only owner can edit, (b) Higher-level users can edit lower-level artifacts, (c) Team admins can edit team artifacts
   - Recommendation: Follow the `knowledgeUpdate` pattern where higher-level users can update lower-level entries. [VERIFIED: knowledge.ts lines 177-262]
   - Phase 19 should support: Owner can edit their own; higher-level users can edit below their level; system admin can edit any. [ASSUMED]

2. **Edit payload format**
   - Question: How should the CLI and contract represent file changes?
   - Options: (a) Full replacement of all files, (b) Add/update/delete operations per file, (c) Patch-based with file paths
   - Recommendation: Full replacement is simpler and matches the import pattern. CLI should fetch current artifact, merge with provided files, and submit complete manifest. [ASSUMED]

3. **History view granularity**
   - Question: Should history show full file manifests per revision or just metadata?
   - Options: (a) Full file manifests, (b) Metadata only (revision, timestamp, actor), (c) Summary of changes
   - Recommendation: Return metadata for the history list view; use existing artifact export for full revision details. Add optional `--revision <n>` flag to fetch specific revision content. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | CLI/server execution and tests [VERIFIED: codebase grep] | ✓ [VERIFIED: local command] | 20.19.5 [VERIFIED: local command] | — |
| pnpm | Workspace package scripts [VERIFIED: codebase grep] | ✓ [VERIFIED: local command] | 10.33.0 [VERIFIED: local command] | — |

**Missing dependencies with no fallback:**
- None identified for planning Phase 19. [VERIFIED: local command]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 [VERIFIED: npm registry] |
| Config file | none discovered; packages use direct `vitest run` scripts. [VERIFIED: codebase grep] |
| Quick run command | `pnpm --filter @trapmap/contracts test -- src/index.test.ts && pnpm --filter @trapmap/server test -- src/routes/operations.test.ts && pnpm --filter @trapmap/cli test -- src/commands/skill.test.ts` [ASSUMED] |
| Full suite command | `pnpm test` [VERIFIED: codebase grep] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SKED-02 | Edit request schema validates artifact ID, file updates, and metadata changes. [ASSUMED] | contract | `pnpm --filter @trapmap/contracts test -- src/index.test.ts` [VERIFIED: codebase grep] | ✅ |
| SKED-02 | Server edit route creates pending revision, runs pre-review, preserves history. [ASSUMED] | route | `pnpm --filter @trapmap/server test -- src/routes/operations.test.ts` [VERIFIED: codebase grep] | ✅ |
| SKED-02 | CLI `skill edit <id>` submits edit and prints result. [ASSUMED] | CLI | `pnpm --filter @trapmap/cli test -- src/commands/skill.test.ts` [VERIFIED: codebase grep] | ✅ |
| SKED-04 | History response schema validates revision list with timestamps. [ASSUMED] | contract | `pnpm --filter @trapmap/contracts test -- src/index.test.ts` [VERIFIED: codebase grep] | ✅ |
| SKED-04 | Server history route enforces governance and returns revision list. [ASSUMED] | route | `pnpm --filter @trapmap/server test -- src/routes/operations.test.ts` [VERIFIED: codebase grep] | ✅ |
| SKED-04 | CLI `skill history <id>` displays revision list in text and JSON modes. [ASSUMED] | CLI | `pnpm --filter @trapmap/cli test -- src/commands/skill.test.ts` [VERIFIED: codebase grep] | ✅ |

### Wave 0 Gaps
- [ ] Contract tests for `skillEditRequestSchema` and `skillHistoryResponseSchema` — covers edit request validation and history response shape. [ASSUMED]
- [ ] Server helper tests for edit flow — covers governance, revision creation, and history retrieval. [ASSUMED]
- [ ] CLI tests for `skill edit` and `skill history` commands — covers request wiring, text/JSON output. [ASSUMED]

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no [VERIFIED: codebase grep] | Existing session resolution only; Phase 19 does not add login/session flows. |
| V3 Session Management | no [VERIFIED: codebase grep] | Existing saved-session behavior only; no new session semantics. |
| V4 Access Control | yes [VERIFIED: codebase grep] | `requirePermission()` plus artifact governance filtering by team and security level. [VERIFIED: rbac.ts] |
| V5 Input Validation | yes [VERIFIED: codebase grep] | Shared Zod request/response schemas in `@trapmap/contracts`. [VERIFIED: contracts] |
| V6 Cryptography | no [VERIFIED: codebase grep] | No new crypto behavior in this phase. |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized artifact modification across teams [VERIFIED: codebase grep] | Tampering | `requireTeamAccess()` check before edit; ownership or level check. [VERIFIED: operations.ts] |
| Edit bypassing review queue [VERIFIED: REQUIREMENTS] | Elevation of Privilege | Edits must transition approved artifacts to `agent-pass` state; Phase 20 implements review approval. |
| History disclosure of restricted artifacts [VERIFIED: codebase grep] | Information Disclosure | Apply same governance filters to history endpoint as to export. [VERIFIED: operations.ts] |
| Malicious file content injection [VERIFIED: codebase grep] | Tampering | SHA-256 hash validation; derive outputs on server side. [VERIFIED: artifacts/model.ts] |

## Sources

### Primary (HIGH confidence)
- Codebase grep and file reads:
  - `packages/cli/src/commands/skill.ts` (Phase 18 skill namespace)
  - `packages/server/src/routes/operations.ts` (artifact import/export/activate patterns)
  - `packages/server/src/routes/review.ts` (review queue pattern)
  - `packages/server/src/routes/knowledge.ts` (update/resubmit patterns)
  - `packages/server/src/lib/artifacts/model.ts` (revision model, append logic)
  - `packages/server/src/lib/audit.ts` (audit event creation)
  - `packages/server/src/lib/rbac.ts` (permission helpers)
  - `packages/server/src/lib/store.ts` (data model definitions)
  - `packages/contracts/src/domain/artifacts.ts` (artifact schemas)
  - `packages/contracts/src/domain/operations.ts` (operation schemas)
  - `packages/contracts/src/domain/retrieval.ts` (Phase 18 lookup contracts)
  - `packages/contracts/src/domain/common.ts` (permission enum)
- npm registry verification:
  - `commander` `14.0.3`
  - `zod` `4.3.6`
  - `fastify` `5.8.5`
  - `vitest` `4.1.4`

### Secondary (MEDIUM confidence)
- Phase 18 research and plans for context on CLI patterns and skill namespace. [VERIFIED: 18-RESEARCH.md, 18-01-PLAN.md, 18-02-PLAN.md]

### Tertiary (LOW confidence)
- None beyond the primary sources listed above. [VERIFIED: source inventory]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - package usage is visible in workspace manifests and current versions were verified against npm. [VERIFIED: codebase grep] [VERIFIED: npm registry]
- Architecture: HIGH - revision model, governance, and audit patterns are already implemented for artifacts. [VERIFIED: codebase grep]
- Pitfalls: MEDIUM - most are extrapolations from existing patterns rather than failed Phase 19 code. [ASSUMED]

**Research date:** 2026-04-19 [VERIFIED: codebase grep]
**Valid until:** 2026-05-03 for planning purposes unless the permission model or package versions change first. [ASSUMED]
