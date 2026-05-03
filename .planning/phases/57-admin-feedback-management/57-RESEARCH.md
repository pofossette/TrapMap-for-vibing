# Phase 57: Admin Feedback Management - Research

**Researched:** 2026-05-03
**Domain:** Admin CLI for feedback queue review, batch processing, and lifecycle integration
**Confidence:** HIGH

## Summary

Phase 57 builds on the feedback submission mechanism from Phase 56 to provide admin-level feedback queue management. The system needs: (1) Admin CLI commands for listing and filtering feedback queue with filtering by type, age, and entry, (2) Batch actions for processing feedback (resolve, invalidate, trigger lifecycle transition, request more info), (3) Quality score contribution from feedback signals, and (4) Automatic lifecycle transitions based on recurring feedback patterns.

The feedback queue (`feedbackQueue: FeedbackQueueItemRecord[]`) is already implemented in Phase 56 and persisted in `StoreData`. Each `FeedbackQueueItemRecord` includes `status` ('new' | 'triaged' | 'resolved' | 'dismissed'), `problemType`, `adminNotes`, and references to the target entry. Phase 57 consumes this queue for admin review workflows.

**Primary recommendation:** Create new admin-feedback CLI commands and server routes that follow the established patterns from `decay.ts` routes and `operations.ts` CLI commands. Extend `FeedbackQueueItemRecord` with admin-controlled status transitions. Create a feedback aggregation service that contributes to knowledge quality scores and triggers automatic lifecycle transitions.

## Key Findings from Dependency Phases

### Phase 56: CLI Feedback Entry Points (FEEDBACK-01)

**What exists:**

1. **Feedback data model** (`packages/contracts/src/domain/feedback.ts`):
   - `feedbackProblemTypeSchema`: 'incorrect' | 'outdated' | 'context-mismatch' | 'incomplete' | 'other'
   - `feedbackStatusSchema`: 'new' | 'triaged' | 'resolved' | 'dismissed'
   - `feedbackSubmissionSchema`: entryId, entryType, problemType, description, context?, querySeed?, customAnswers?
   - `feedbackRecordSchema`: extends submission with id, submittedAt, submittedBy, status, adminNotes?

2. **Feedback queue storage** (`packages/server/src/lib/store.ts`):
   ```typescript
   export interface FeedbackQueueItemRecord {
     id: string;
     entryId: string;
     entryType: 'trap' | 'skill';
     problemType: FeedbackProblemType;
     description: string;
     context: string | null;
     querySeed: string | null;
     customAnswers: Array<{ prompt: string; answer: string }> | null;
     submittedAt: string;
     submittedByUserId: string;
     submittedByHandle: string;
     status: 'new' | 'triaged' | 'resolved' | 'dismissed';
     adminNotes: string | null;
     createdAt: string;
     updatedAt: string;
   }
   ```

3. **Server route** (`packages/server/src/routes/feedback.ts`):
   - `POST /v1/feedback`: Submit feedback (requires authentication)
   - Persists to `data.feedbackQueue`
   - Logs user operation with action='feedback'

4. **CLI command** (`packages/cli/src/commands/feedback.ts`):
   - `trapmap feedback <entryId>`: Interactive prompts for problem capture
   - Supports non-interactive mode with `--type` and `--description` flags

**Integration points for Phase 57:**
- The feedback queue is append-only from Phase 56; Phase 57 adds status mutation
- Admin notes field exists but is never written in Phase 56
- No admin-facing endpoints exist yet

### Phase 48: Lifecycle State Machine (DECAY-01)

**What exists:**

1. **Decay states** (`packages/contracts/src/domain/decay.ts`):
   - `decayStateSchema`: 'active' | 'review-due' | 'stale' | 'expired' | 'superseded'
   - `decayMetaSchema`: lastVerifiedAt, decayState, supersededById, decayStateComputedAt, freshnessType

2. **State machine** (`packages/server/src/lib/decay/state-machine.ts`):
   - `computeDecayState(entry, config, now)`: Pure function for state computation
   - `isTerminalDecayState(state)`: Returns true for 'superseded' | 'expired'
   - `requiresAttention(state)`: Returns true for non-'active' states

3. **Decay configuration** (`packages/server/src/lib/decay/config.ts`):
   - `loadDecayConfig()`: Reads TRAPMAP_DECAY_* env vars
   - Default thresholds: 90/180/365 days for review-due/stale/expired

**Integration points for Phase 57:**
- Feedback patterns can trigger lifecycle transitions (e.g., multiple "outdated" → 'stale')
- The `decayMeta` on knowledge entries can be updated by feedback-driven transitions
- Lifecycle events should be logged via `entry.lifecycleHistory.push(...)`

### Phase 50: Batch Management Interface (DECAY-03)

**What exists:**

1. **Batch operation schema** (`packages/contracts/src/domain/decay.ts`):
   ```typescript
   export const batchActionSchema = z.enum(['extend', 'mark-review', 'deactivate', 'supersede']);

   export const batchOperationRequestSchema = z.object({
     action: batchActionSchema,
     entryIds: z.array(entityIdSchema).min(1).max(100),
     dryRun: z.boolean().default(false),
     extendDays: z.number().int().min(1).max(3650).optional(),
     replacementId: entityIdSchema.optional(),
   });

   export const batchOperationItemSchema = z.object({
     entryId: entityIdSchema,
     shortcut: z.string(),
     currentDecayState: decayStateSchema.nullable(),
     proposedDecayState: decayStateSchema.nullable(),
     changeDescription: z.string(),
     eligible: z.boolean(),
     ineligibilityReason: z.string().nullable(),
   });
   ```

2. **Batch routes** (`packages/server/src/routes/decay.ts`):
   - `GET /v1/operations/decay/entries`: List with decay-state enrichment
   - `POST /v1/operations/decay/batch`: Execute batch mutations (extend/mark-review/deactivate/supersede)
   - `POST /v1/operations/decay/search`: Pattern search with decay-state facets

3. **Batch CLI commands** (`packages/cli/src/commands/decay.ts`):
   - `decay-stale`: List entries filtered by decay state
   - `decay-batch`: Apply batch operations with `--dry-run` support
   - `decay-search`: Search entries with lifecycle state facet

**Integration points for Phase 57:**
- Feedback batch processing should follow similar patterns (dry-run mode, per-item eligibility)
- The `batchOperationItemSchema` pattern can be adapted for feedback batch responses
- Permission model: `knowledge:export` for listing, `knowledge:update` for mutations

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Feedback queue listing | Server + CLI | -- | Admin visibility requires both API and CLI surface |
| Feedback batch actions | Server | CLI | Server handles mutations; CLI provides UX |
| Quality score computation | Server | -- | Aggregation logic lives server-side |
| Lifecycle transition triggers | Server | -- | Server-side automation |
| Admin notes and status | Server | CLI | Server persists; CLI presents |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | ^4.3.6 | Schema validation for feedback contracts | Already in use across all packages |
| vitest | ^4.1.5 | Testing feedback capture and validation | Existing test framework in monorepo |
| @inquirer/prompts | ^7.0.0 | Interactive CLI prompts (if needed) | Already added in Phase 56 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| gray-matter | ^4.0.3 | SKILL.md frontmatter parsing | Already used in contracts/parsing.ts |

## Architecture Patterns

### System Architecture Diagram

```
+-------------------+      +-------------------+      +-------------------+
| CLI               |      | Server            |      | Store             |
|                   |      |                   |      |                   |
| feedback-list     |      | GET /v1/admin/    |      | feedbackQueue[]   |
| feedback-resolve  |      |   feedback        |      |                   |
| feedback-batch    |      | POST /v1/admin/   |      | +----------------+|
|       |           |      |   feedback/batch  |      | | status:        ||
|       v           |      |       |           |      | | new→triaged→   ||
| +-------------+   |      |       v           |      | | resolved/     ||
| | Filter by   |   |      | +-------------+   |      | | dismissed     ||
| | type/age/   |   |      | | Validate    |   |      | +----------------+|
| | entry       |   |      | | Status      |   |      |                   |
| +------+------+   |      | | Transition   |   |      | +----------------+|
|        |          |      | +------+------+   |      | | adminNotes     ||
|        v          |      |        |          |      | +----------------+|
| +-------------+   |      |        v          |      |                   |
| | Batch       |   |      | +-------------+   |      |                   |
| | Resolve/    +--------->+ | Update      +--------->+                   |
| | Invalidate  |   |      | | feedbackQueue|   |      |                   |
| | Transition  |   |      | | + lifecycle |   |      |                   |
| +-------------+   |      | +-------------+   |      |                   |
|                   |      |                   |      |                   |
+-------------------+      +-------------------+      +-------------------+

Feedback → Lifecycle Integration:
+-------------------+
| feedbackQueue     |
| (aggregated by   |
|  entryId)         |
+--------+----------+
         |
         v
+-------------------+      +-------------------+
| Quality Score     |      | Lifecycle Trigger |
| Computation       |      | Rules             |
|                   |      |                   |
| - Count by type   |      | - 3+ outdated     |
| - Weight by age   |      |   → stale         |
| - Normalize 0-100 |      | - 2+ incorrect    |
|                   |      |   → review-due    |
+--------+----------+      +--------+----------+
         |                          |
         v                          v
+-------------------+      +-------------------+
| knowledgeEntries  |      | decayMeta update  |
| .qualityScore?    |      | + lifecycleHistory|
+-------------------+      +-------------------+
```

### Recommended Project Structure

```
packages/contracts/src/domain/
  feedback.ts                 # EXTEND: Add batch action schemas, quality score schema
  decay.ts                    # REFERENCE: Lifecycle states for transition triggers

packages/server/src/
  routes/
    admin-feedback.ts         # NEW: Admin feedback management routes
    admin-feedback.test.ts    # NEW: Route tests
  lib/
    feedback/
      batch.ts                # NEW: Batch action processing logic
      quality-score.ts        # NEW: Quality score computation from feedback
      lifecycle-triggers.ts   # NEW: Automatic transition rules
    store.ts                  # EXTEND: Add quality score fields to KnowledgeRecord

packages/cli/src/
  commands/
    admin-feedback.ts         # NEW: Admin feedback CLI commands
    admin-feedback.test.ts    # NEW: CLI command tests
  index.ts                    # EXTEND: Register admin-feedback commands

packages/server/src/app.ts    # EXTEND: Register admin-feedback routes
```

### Pattern 1: Feedback Queue List Schema

**What:** Request/response schemas for listing feedback queue with filters.
**When to use:** Admin CLI and server route for feedback queue listing.

```typescript
// packages/contracts/src/domain/feedback.ts (extend)

export const feedbackListRequestSchema = z.object({
  /** Filter by feedback status */
  status: z.array(feedbackStatusSchema).optional(),
  /** Filter by problem type */
  problemType: z.array(feedbackProblemTypeSchema).optional(),
  /** Filter by entry ID */
  entryId: entityIdSchema.optional(),
  /** Filter by entry type */
  entryType: z.enum(['trap', 'skill']).optional(),
  /** Minimum age in days */
  ageMinDays: z.coerce.number().int().min(0).optional(),
  /** Maximum age in days */
  ageMaxDays: z.coerce.number().int().min(0).optional(),
  /** Pagination limit */
  limit: z.coerce.number().int().min(1).max(100).default(25),
  /** Pagination cursor */
  cursor: z.string().min(1).max(128).optional(),
});

export const feedbackListItemSchema = z.object({
  id: entityIdSchema,
  entryId: entityIdSchema,
  entryType: z.enum(['trap', 'skill']),
  entryShortcut: z.string(),  // Denormalized for display
  problemType: feedbackProblemTypeSchema,
  description: z.string(),
  context: z.string().nullable(),
  submittedAt: isoTimestampSchema,
  submittedByHandle: z.string(),
  status: feedbackStatusSchema,
  adminNotes: z.string().nullable(),
  ageDays: z.number(),
});

export const feedbackListResponseSchema = z.object({
  items: z.array(feedbackListItemSchema),
  total: z.number().int().min(0),
  nextCursor: z.string().min(1).max(128).nullable(),
});
```

### Pattern 2: Feedback Batch Action Schema

**What:** Request/response schemas for batch processing feedback items.
**When to use:** Admin CLI and server route for batch actions.

```typescript
// packages/contracts/src/domain/feedback.ts (extend)

export const feedbackBatchActionSchema = z.enum([
  'resolve',      // Mark as resolved, optionally update entry
  'dismiss',      // Mark as dismissed/invalid
  'triage',       // Mark as triaged (acknowledged)
  'request-info', // Request more information from submitter
  'transition',   // Trigger lifecycle transition on entry
]);

export const feedbackBatchRequestSchema = z.object({
  action: feedbackBatchActionSchema,
  feedbackIds: z.array(entityIdSchema).min(1).max(100),
  dryRun: z.boolean().default(false),
  /** Notes to add to all processed items */
  notes: z.string().max(1000).optional(),
  /** For 'transition' action: target decay state */
  targetDecayState: decayStateSchema.optional(),
});

export const feedbackBatchItemSchema = z.object({
  feedbackId: entityIdSchema,
  entryId: entityIdSchema,
  entryShortcut: z.string(),
  currentStatus: feedbackStatusSchema,
  proposedStatus: feedbackStatusSchema,
  changeDescription: z.string(),
  eligible: z.boolean(),
  ineligibilityReason: z.string().nullable(),
  /** For 'transition' action: resulting decay state */
  resultingDecayState: decayStateSchema.nullable(),
});

export const feedbackBatchResponseSchema = z.object({
  action: feedbackBatchActionSchema,
  dryRun: z.boolean(),
  items: z.array(feedbackBatchItemSchema),
  totalEligible: z.number().int().min(0),
  totalIneligible: z.number().int().min(0),
  appliedAt: isoTimestampSchema.nullable(),
});
```

### Pattern 3: Quality Score Schema

**What:** Schema for knowledge quality score derived from feedback signals.
**When to use:** Server-side quality score computation and storage.

```typescript
// packages/contracts/src/domain/feedback.ts (extend)

export const feedbackQualityScoreSchema = z.object({
  /** Entry ID this score applies to */
  entryId: entityIdSchema,
  /** Overall quality score (0-100, higher is better) */
  score: z.number().min(0).max(100),
  /** Breakdown by feedback type */
  breakdown: z.object({
    incorrect: z.number().int().min(0),
    outdated: z.number().int().min(0),
    contextMismatch: z.number().int().min(0),
    incomplete: z.number().int().min(0),
    other: z.number().int().min(0),
  }),
  /** Total feedback count */
  totalFeedback: z.number().int().min(0),
  /** Score computation timestamp */
  computedAt: isoTimestampSchema,
});

export type FeedbackQualityScore = z.infer<typeof feedbackQualityScoreSchema>;
```

### Pattern 4: Feedback Route Handler (Server)

**What:** Server route for listing feedback queue with filters.
**When to use:** `GET /v1/admin/feedback` endpoint.

```typescript
// Pattern from packages/server/src/routes/decay.ts lines 78-194

export const adminFeedbackRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/admin/feedback', async (request, reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export'); // Admin-level permission

    const query = feedbackListRequestSchema.parse(request.query);
    const data = await app.skillShareer.store.snapshot();
    const now = new Date();

    // Filter feedback queue
    let items = data.feedbackQueue;

    if (query.status?.length) {
      items = items.filter(f => query.status!.includes(f.status));
    }
    if (query.problemType?.length) {
      items = items.filter(f => query.problemType!.includes(f.problemType));
    }
    if (query.entryId) {
      items = items.filter(f => f.entryId === query.entryId);
    }
    if (query.entryType) {
      items = items.filter(f => f.entryType === query.entryType);
    }

    // Age filtering
    if (query.ageMinDays !== undefined || query.ageMaxDays !== undefined) {
      items = items.filter(f => {
        const ageDays = (now.getTime() - new Date(f.submittedAt).getTime()) / (1000 * 60 * 60 * 24);
        if (query.ageMinDays !== undefined && ageDays < query.ageMinDays) return false;
        if (query.ageMaxDays !== undefined && ageDays > query.ageMaxDays) return false;
        return true;
      });
    }

    // Enrich with entry shortcut
    const enrichedItems = items.map(f => {
      const entry = data.knowledgeEntries.find(e => e.id === f.entryId);
      return feedbackListItemSchema.parse({
        ...f,
        entryShortcut: entry?.shortcut ?? '[deleted]',
        ageDays: (now.getTime() - new Date(f.submittedAt).getTime()) / (1000 * 60 * 60 * 24),
      });
    });

    // Sort by submittedAt descending
    enrichedItems.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

    return feedbackListResponseSchema.parse({
      items: enrichedItems.slice(0, query.limit),
      total: enrichedItems.length,
      nextCursor: null,
    });
  });
};
```

### Pattern 5: Feedback Batch Processing (Server)

**What:** Server logic for batch processing feedback items.
**When to use:** `POST /v1/admin/feedback/batch` endpoint.

```typescript
// Pattern from packages/server/src/routes/decay.ts lines 202-316

export const adminFeedbackRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/admin/feedback/batch', async (request, reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    const body = feedbackBatchRequestSchema.parse(request.body);
    const now = new Date();

    if (body.dryRun) {
      // Plan without executing
      const data = await app.skillShareer.store.snapshot();
      const planItems = planFeedbackBatch(data, body);
      return feedbackBatchResponseSchema.parse({
        action: body.action,
        dryRun: true,
        items: planItems,
        totalEligible: planItems.filter(i => i.eligible).length,
        totalIneligible: planItems.filter(i => !i.eligible).length,
        appliedAt: null,
      });
    }

    // Execute batch
    const result = await app.skillShareer.store.transact((data) => {
      return executeFeedbackBatch(app.skillShareer.store, data, body, auth, now);
    });

    // Log operation
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'feedback-batch',
      targetId: null,
      teamId: auth.activeTeamId,
      metadata: { action: body.action, count: body.feedbackIds.length },
    });

    return feedbackBatchResponseSchema.parse(result);
  });
};
```

### Pattern 6: Automatic Lifecycle Transition Rules

**What:** Rules for triggering lifecycle transitions based on feedback patterns.
**When to use:** After batch processing, or as a background job.

```typescript
// packages/server/src/lib/feedback/lifecycle-triggers.ts

export interface LifecycleTriggerRule {
  /** Problem type to match */
  problemType: FeedbackProblemType;
  /** Minimum count to trigger */
  minCount: number;
  /** Time window in days for counting */
  timeWindowDays: number;
  /** Target decay state */
  targetDecayState: DecayState;
}

export const DEFAULT_LIFECYCLE_TRIGGER_RULES: LifecycleTriggerRule[] = [
  { problemType: 'outdated', minCount: 3, timeWindowDays: 90, targetDecayState: 'stale' },
  { problemType: 'incorrect', minCount: 2, timeWindowDays: 30, targetDecayState: 'review-due' },
  { problemType: 'context-mismatch', minCount: 5, timeWindowDays: 180, targetDecayState: 'review-due' },
];

export function checkLifecycleTriggers(
  entryId: string,
  feedbackQueue: FeedbackQueueItemRecord[],
  rules: LifecycleTriggerRule[],
  now: Date,
): { shouldTransition: boolean; targetState: DecayState | null; reason: string } {
  const entryFeedback = feedbackQueue.filter(f =>
    f.entryId === entryId &&
    f.status !== 'dismissed'
  );

  for (const rule of rules) {
    const matchingFeedback = entryFeedback.filter(f => {
      if (f.problemType !== rule.problemType) return false;
      const ageDays = (now.getTime() - new Date(f.submittedAt).getTime()) / (1000 * 60 * 60 * 24);
      return ageDays <= rule.timeWindowDays;
    });

    if (matchingFeedback.length >= rule.minCount) {
      return {
        shouldTransition: true,
        targetState: rule.targetDecayState,
        reason: `${matchingFeedback.length} '${rule.problemType}' feedback in last ${rule.timeWindowDays} days`,
      };
    }
  }

  return { shouldTransition: false, targetState: null, reason: '' };
}
```

### Pattern 7: Quality Score Computation

**What:** Compute quality score from feedback signals for an entry.
**When to use:** After batch processing, or on-demand for admin views.

```typescript
// packages/server/src/lib/feedback/quality-score.ts

/** Weights for each problem type (negative impact) */
const PROBLEM_TYPE_WEIGHTS: Record<FeedbackProblemType, number> = {
  incorrect: -30,
  outdated: -15,
  'context-mismatch': -10,
  incomplete: -10,
  other: -5,
};

/** Age decay factor: newer feedback weighs more */
function ageWeight(submittedAt: string, now: Date): number {
  const ageDays = (now.getTime() - new Date(submittedAt).getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp(-ageDays / 90); // 90-day half-life
}

export function computeQualityScore(
  entryId: string,
  feedbackQueue: FeedbackQueueItemRecord[],
  now: Date,
): FeedbackQualityScore {
  const entryFeedback = feedbackQueue.filter(f =>
    f.entryId === entryId &&
    f.status !== 'dismissed'
  );

  let weightedScore = 100; // Start at 100
  const breakdown = {
    incorrect: 0,
    outdated: 0,
    contextMismatch: 0,
    incomplete: 0,
    other: 0,
  };

  for (const f of entryFeedback) {
    const baseWeight = PROBLEM_TYPE_WEIGHTS[f.problemType];
    const ageW = ageWeight(f.submittedAt, now);
    const impact = baseWeight * ageW;

    weightedScore += impact;

    // Track breakdown
    switch (f.problemType) {
      case 'incorrect': breakdown.incorrect++; break;
      case 'outdated': breakdown.outdated++; break;
      case 'context-mismatch': breakdown.contextMismatch++; break;
      case 'incomplete': breakdown.incomplete++; break;
      case 'other': breakdown.other++; break;
    }
  }

  // Clamp to 0-100
  const score = Math.max(0, Math.min(100, weightedScore));

  return {
    entryId,
    score,
    breakdown,
    totalFeedback: entryFeedback.length,
    computedAt: now.toISOString(),
  };
}
```

### Pattern 8: CLI Command for Feedback List (CLI)

**What:** CLI command for listing feedback queue with filters.
**When to use:** `trapmap feedback-list` command.

```typescript
// Pattern from packages/cli/src/commands/decay.ts

export function registerAdminFeedbackCommands(
  program: Command,
  options: AdminFeedbackCommandOptions,
): void {
  if (!options.allowManage) return;

  program
    .command('feedback-list')
    .description('List feedback queue for admin review')
    .option('--status <status>', 'Filter by status (comma-separated: new,triaged,resolved,dismissed)')
    .option('--type <type>', 'Filter by problem type (comma-separated)')
    .option('--entry <entryId>', 'Filter by entry ID')
    .option('--age-min <days>', 'Minimum age in days', parseInt)
    .option('--age-max <days>', 'Maximum age in days', parseInt)
    .option('--limit <n>', 'Maximum results', '25')
    .option('--json', 'Output JSON')
    .action(async (flags) => {
      const state = await loadCliState();
      requireSessionToken(state);

      const queryParams = new URLSearchParams();
      if (flags.status) {
        flags.status.split(',').forEach((s: string) => {
          queryParams.append('status', s.trim());
        });
      }
      // ... build query params ...

      const response = await apiRequest<FeedbackListResponse>(state, {
        path: `/v1/admin/feedback?${queryParams}`,
      });
      const parsed = feedbackListResponseSchema.parse(response.data);

      printResult(parsed, flags, formatFeedbackList);
    });
}
```

## Anti-Patterns to Avoid

- **Storing quality score on every read:** Quality scores should be computed lazily or cached, not computed on every retrieval. Consider storing on `KnowledgeRecord` with periodic recomputation.

- **Triggering lifecycle transitions synchronously in feedback submission:** This would add latency to user feedback submission. Process triggers asynchronously or on-demand.

- **Allowing feedback modification after submission:** Users should not be able to edit feedback after submission to maintain audit integrity. Admins can add notes but not change the original submission.

- **Hardcoding trigger rules in code:** Trigger rules should be configurable via env vars or database to allow tuning without code changes.

- **Ignoring feedback on deleted entries:** Feedback on deleted entries should still be visible in admin views with "[deleted]" indicator for auditing purposes.

## Common Pitfalls

### Pitfall 1: Feedback Queue Unbounded Growth
**What goes wrong:** Feedback queue grows indefinitely without cleanup.
**Why it happens:** No retention policy or archival mechanism.
**How to avoid:** Add a cleanup job for feedback older than N days with 'resolved' or 'dismissed' status. Consider exporting to cold storage before deletion.

### Pitfall 2: Quality Score Drift
**What goes wrong:** Quality scores become stale as feedback ages.
**Why it happens:** No recomputation trigger or schedule.
**How to avoid:** Compute quality scores on-demand with caching, or recompute periodically (e.g., daily). Include computation timestamp in response.

### Pitfall 3: Race Condition in Batch Processing
**What goes wrong:** Two admins process the same feedback items simultaneously.
**Why it happens:** No locking mechanism on feedback items.
**How to avoid:** Use store.transact() for atomic updates. Consider adding optimistic locking with version field.

### Pitfall 4: Missing Entry Context
**What goes wrong:** Feedback refers to deleted entries, causing display issues.
**Why it happens:** Entries can be deleted after feedback submission.
**How to avoid:** Store entry shortcut at feedback submission time (denormalization). Show "[deleted]" indicator when entry no longer exists.

### Pitfall 5: Transition Loop
**What goes wrong:** Feedback triggers lifecycle transition, which triggers recomputation, which triggers another transition.
**Why it happens:** No guard against repeated transitions.
**How to avoid:** Check current decay state before transitioning. Don't trigger transition if already in target state or a "worse" state.

## Open Questions

1. **Should quality scores be persisted on KnowledgeRecord?**
   - What we know: Quality scores are computed from feedback signals and should be visible in admin views.
   - What's unclear: Whether to compute on-demand (expensive) or cache with periodic recomputation.
   - Recommendation: Add `qualityScore: number | null` and `qualityScoreComputedAt: string | null` to `KnowledgeRecord`. Compute on feedback change and daily.

2. **How should trigger rules be configured?**
   - What we know: Default rules exist but teams may want different thresholds.
   - What's unclear: Whether rules should be global, per-team, or per-entry-type.
   - Recommendation: Start with global env var configuration. Per-team configuration can be added later if needed.

3. **Should feedback submitters be notified when their feedback is processed?**
   - What we know: FEEDBACK-03 mentions connecting feedback to lifecycle but doesn't specify notifications.
   - What's unclear: Whether to implement notification mechanism or defer to future phase.
   - Recommendation: Defer notifications to a future phase. Focus on admin processing workflow first.

## Test File Patterns

### `packages/contracts/src/domain/feedback.test.ts` (EXTEND)

```typescript
describe('feedback batch schemas', () => {
  describe('feedbackBatchRequestSchema', () => {
    it('accepts valid batch request', () => {
      const result = feedbackBatchRequestSchema.parse({
        action: 'resolve',
        feedbackIds: ['feedback_1', 'feedback_2'],
        dryRun: false,
      });
      expect(result.action).toBe('resolve');
    });

    it('rejects empty feedback IDs array', () => {
      expect(() =>
        feedbackBatchRequestSchema.parse({
          action: 'resolve',
          feedbackIds: [],
        }),
      ).toThrow();
    });
  });
});
```

### `packages/server/src/routes/admin-feedback.test.ts` (NEW)

```typescript
describe('admin feedback routes', () => {
  describe('GET /v1/admin/feedback', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/admin/feedback',
      });
      expect(response.statusCode).toBe(401);
    });

    it('filters by status', async () => {
      // Seed feedback with different statuses
      // Request with status=new
      // Assert only 'new' items returned
    });
  });

  describe('POST /v1/admin/feedback/batch', () => {
    it('dry-run mode returns plan without mutations', async () => {
      // Seed feedback
      // Request with dryRun: true
      // Assert no status changes in store
    });

    it('execute mode updates feedback status', async () => {
      // Seed feedback with status='new'
      // Request action='resolve'
      // Assert status changed to 'resolved'
      // Assert adminNotes updated
    });
  });
});
```

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Admin endpoints require authenticated session |
| V3 Session Management | no | No session changes |
| V4 Access Control | yes | Require 'knowledge:export' for listing, 'knowledge:update' for mutations |
| V5 Input Validation | yes | Zod validates all inputs; feedback IDs validated as entityIdSchema |
| V6 Cryptography | no | No cryptographic operations |

### Known Threat Patterns for Admin Feedback

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Privilege escalation (non-admin accessing admin endpoints) | Elevation of Privilege | requirePermission(auth, 'knowledge:export') check |
| Feedback tampering (modifying original submission) | Tampering | Store original submission immutably; admin can only add notes and change status |
| Batch action abuse (excessive batch sizes) | Denial of Service | Limit batch size to 100 items; rate limit by admin user |
| Feedback spam flooding the queue | Denial of Service | Phase 56 accepted this risk; Phase 57 can add bulk dismiss for spam |

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `packages/contracts/src/domain/feedback.ts` -- feedback schema and types
- Codebase analysis: `packages/contracts/src/domain/decay.ts` -- lifecycle and batch operation schemas
- Codebase analysis: `packages/server/src/routes/feedback.ts` -- feedback submission route
- Codebase analysis: `packages/server/src/routes/decay.ts` -- batch management routes (pattern reference)
- Codebase analysis: `packages/server/src/lib/store.ts` -- FeedbackQueueItemRecord definition
- Codebase analysis: `packages/cli/src/commands/decay.ts` -- CLI batch command patterns
- Codebase analysis: `packages/server/src/lib/decay/state-machine.ts` -- decay state computation

### Secondary (MEDIUM confidence)
- Phase 56 RESEARCH.md -- feedback submission mechanism design decisions
- Phase 48 PATTERNS.md -- lifecycle state machine integration patterns
- Phase 50 PATTERNS.md -- batch action patterns and CLI command structure

### Tertiary (LOW confidence)
- None -- all findings are based on direct codebase analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- uses existing patterns from decay and operations modules
- Architecture: HIGH -- follows established server/CLI patterns
- Pitfalls: MEDIUM -- based on general feedback system patterns and assumed behaviors

**Research date:** 2026-05-03
**Valid until:** 2026-06-03 (stable -- patterns are codebase-internal)
