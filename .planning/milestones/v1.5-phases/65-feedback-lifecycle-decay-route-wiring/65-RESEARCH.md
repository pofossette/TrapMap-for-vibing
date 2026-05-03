# Phase 65: Feedback Lifecycle & Decay Route Wiring - Research

**Researched:** 2026-05-03
**Domain:** Server route wiring & feedback-driven lifecycle transitions
**Confidence:** HIGH

## Summary

Phase 65 is a **dead-code activation and route documentation** phase. The core implementation already exists from Phases 50, 57, and 58, but two critical gaps prevent the features from working end-to-end:

1. **FEEDBACK-03 gap:** `checkLifecycleTriggers` is imported in `feedback/batch.ts` but never called after batch execution. The function itself is fully implemented and tested -- it just needs to be wired into the execution path so that feedback patterns (e.g., 3 "outdated" reports in 30 days) automatically trigger decay state transitions.

2. **DECAY-03 gap:** Three decay batch management routes (`GET /v1/operations/decay/entries`, `POST /v1/operations/decay/batch`, `POST /v1/operations/decay/search`) are registered and functional in `decay.ts` but are missing from the `documentedRoutes` array in `app.ts`. This makes them invisible to the `/meta/routes` endpoint.

Additionally, three other routes from dependent phases are also undocumented: `PATCH /v1/knowledge/:id/evidence` (Phase 58), `GET /v1/operations/maintenance/entries`, and `POST /v1/operations/maintenance/batch` (Phase 59). These should be registered alongside the decay routes for a complete fix.

**Primary recommendation:** This is a wiring-and-registration phase. No new business logic is needed. The work involves: (a) adding `LifecycleTriggerRule` and `DEFAULT_LIFECYCLE_TRIGGER_RULES` to contracts, (b) fixing the `FeedbackQueueItemRecord` import to use the correct `FeedbackQueueRecord` type, (c) calling `checkLifecycleTriggers` after feedback batch execution, (d) adding 6 missing routes to `documentedRoutes`, and (e) writing E2E tests for the automatic lifecycle trigger flow.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Claude's Discretion
All implementation choices are at Claude's discretion -- discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None -- discuss phase skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FEEDBACK-03 | Feedback signals contribute to knowledge lifecycle transitions and quality scoring | `checkLifecycleTriggers` in `lifecycle-triggers.ts` is implemented but never called. Wire it into `feedback-admin.ts` batch execution path. Also need to define `LifecycleTriggerRule` type and `DEFAULT_LIFECYCLE_TRIGGER_RULES` in contracts. |
| DECAY-03 | Maintainer can perform batch management of outdated/erroneous knowledge through retrieval-based discovery interface | Routes exist in `decay.ts` but 3 routes missing from `documentedRoutes`. Also 3 non-decay routes (evidence, maintenance) are undocumented. Add all 6. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Feedback batch execution with lifecycle triggers | API / Backend | -- | Server-side mutation of feedback and knowledge records |
| Lifecycle trigger evaluation | API / Backend | -- | Pure function in `lib/feedback/lifecycle-triggers.ts` |
| Decay state transition | API / Backend | -- | Updates `decayMeta` on knowledge entries |
| Route documentation registration | API / Backend | -- | `documentedRoutes` array in `app.ts` |
| E2E test verification | API / Backend | -- | Integration tests via `vitest` + Fastify `inject()` |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | existing | HTTP server framework | Project standard |
| vitest | existing | Test framework | Project standard |
| zod | existing | Schema validation | Project standard, all routes use `parse()` |
| @trapmap/contracts | workspace | Shared types and schemas | Single source of truth for API contracts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| -- | -- | No new dependencies needed | This is a wiring phase, all libs already in project |

**Installation:** No new packages required.

## Architecture Patterns

### System Architecture Diagram

```
User submits feedback
        |
        v
POST /v1/feedback (feedback.ts)
   |-- Sets triggeredTransition flag on record
   |-- Does NOT auto-transition entry
        |
        v
Admin reviews feedback
        |
        v
POST /v1/operations/feedback/batch (feedback-admin.ts)
   |-- Executes batch action (resolve/dismiss/triage/transition)
   |-- [MISSING WIRE] After batch execution:
   |       |-- Get all feedback for affected entries
   |       |-- Call checkLifecycleTriggers() per entry
   |       |-- If shouldTransition=true, update entry decayMeta
   |       |-- Return lifecycleTransition results in response
        |
        v
Entry decay state updated
   |-- decayMeta.decayState changed
   |-- Lifecycle event recorded
        |
        v
Decay routes visible in /meta/routes
   |-- documentedRoutes array includes all 6 missing routes
```

### Recommended Project Structure

No new files needed. Changes to existing files:

```
packages/contracts/src/domain/feedback.ts  -- Add LifecycleTriggerRule, DEFAULT_LIFECYCLE_TRIGGER_RULES
packages/server/src/lib/feedback/batch.ts  -- Fix imports, remove unused executeFeedbackBatch
packages/server/src/lib/feedback/lifecycle-triggers.ts  -- Fix imports
packages/server/src/routes/feedback-admin.ts  -- Wire checkLifecycleTriggers after batch execution
packages/server/src/app.ts  -- Add 6 routes to documentedRoutes
packages/server/src/routes/feedback.test.ts  -- Add E2E lifecycle trigger tests
```

### Pattern 1: Batch Execution with Post-Hook

**What:** After executing a feedback batch operation, evaluate lifecycle triggers for all affected entries.
**When to use:** In the POST /v1/operations/feedback/batch non-dry-run execution path.
**Example:**

```typescript
// In feedback-admin.ts, after the transact block:
// 1. Collect unique entry IDs from eligible feedback items
const affectedEntryIds = [...new Set(
  resultItems
    .filter(i => i.eligible)
    .map(i => txFeedbackMap.get(i.feedbackId)?.entryId)
    .filter(Boolean)
)];

// 2. Get fresh data and evaluate lifecycle triggers
const freshData = await app.skillShareer.store.snapshot();
const rules = getLifecycleTriggerRules();
const now = new Date();

const lifecycleResults: Array<{ entryId: string; transition: LifecycleTriggerResult }> = [];
for (const entryId of affectedEntryIds) {
  const result = checkLifecycleTriggers(entryId, freshData.feedbackQueue, rules, now);
  if (result.shouldTransition && result.targetState) {
    // Apply the transition
    await app.skillShareer.store.transact((data) => {
      const entry = data.knowledgeEntries.find(e => e.id === entryId);
      if (entry) {
        entry.decayMeta = {
          lastVerifiedAt: entry.decayMeta?.lastVerifiedAt ?? entry.updatedAt,
          decayState: result.targetState!,
          supersededById: entry.decayMeta?.supersededById ?? null,
          decayStateComputedAt: now.toISOString(),
          freshnessType: entry.decayMeta?.freshnessType ?? 'evergreen',
        };
        entry.updatedAt = now.toISOString();
      }
    });
    lifecycleResults.push({ entryId, transition: result });
  }
}
```

### Pattern 2: documentedRoutes Registration

**What:** Add route method+path strings to the `documentedRoutes` array in `app.ts`.
**When to use:** When new routes are registered in Fastify plugin files.
**Example:**

```typescript
// In app.ts documentedRoutes array:
const documentedRoutes = [
  // ... existing routes ...
  'GET /v1/operations/decay/entries',
  'POST /v1/operations/decay/batch',
  'POST /v1/operations/decay/search',
  'PATCH /v1/knowledge/:id/evidence',
  'GET /v1/operations/maintenance/entries',
  'POST /v1/operations/maintenance/batch',
] as const;
```

### Anti-Patterns to Avoid

- **Duplicating lifecycle trigger logic:** The `checkLifecycleTriggers` and `applyLifecycleTrigger` functions already exist in `lifecycle-triggers.ts`. Do NOT re-implement the logic inline in `feedback-admin.ts`. Import and call the existing functions.
- **Modifying decay state without going through the state machine:** Use `applyLifecycleTrigger` which respects state ordering (won't transition backwards).
- **Evaluating lifecycle triggers on every individual feedback submission:** Only evaluate after batch operations, not on individual POST /v1/feedback (which already has its own simple threshold check for flagging).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Lifecycle trigger evaluation | Custom threshold counting | `checkLifecycleTriggers()` from `lifecycle-triggers.ts` | Already implemented with rule-based evaluation, time window filtering, and state ordering |
| Lifecycle state transition | Manual decayMeta mutation | `applyLifecycleTrigger()` from `lifecycle-triggers.ts` | Handles state ordering validation, won't transition backwards |
| Feedback queue type | Custom record type | `FeedbackQueueRecord` from `store.ts` | The correct type already exists; `FeedbackQueueItemRecord` was a naming mistake |
| Route registration validation | Manual string checking | `documentedRoutes` array + test assertion | Project convention for API surface documentation |

**Key insight:** This phase has zero new business logic. All the moving parts exist. The work is purely integration wiring.

## Common Pitfalls

### Pitfall 1: TypeScript Compilation Errors Block Development

**What goes wrong:** The codebase has ~40 pre-existing TypeScript errors in the server package, including in the exact files this phase needs to modify (`feedback/batch.ts`, `feedback/lifecycle-triggers.ts`). The `LifecycleTriggerRule` type and `DEFAULT_LIFECYCLE_TRIGGER_RULES` constant are imported from `@trapmap/contracts` but don't exist there. Similarly `FeedbackQueueItemRecord` doesn't exist in store -- the actual type is `FeedbackQueueRecord`.
**Why it happens:** Phase 57 implemented these files but the contracts types were never added, and the imports reference non-existent exports.
**How to avoid:** First task must define `LifecycleTriggerRule` interface and `DEFAULT_LIFECYCLE_TRIGGER_RULES` in `packages/contracts/src/domain/feedback.ts` and export them. Then fix the import to use `FeedbackQueueRecord` instead of `FeedbackQueueItemRecord`.
**Warning signs:** `error TS2305: Module has no exported member 'LifecycleTriggerRule'` and `error TS2724: has no exported member named 'FeedbackQueueItemRecord'`

### Pitfall 2: Calling checkLifecycleTriggers Inside the Transaction

**What goes wrong:** Evaluating lifecycle triggers inside the `store.transact()` callback in `feedback-admin.ts` could cause nested transactions or stale data reads.
**Why it happens:** The feedback batch execution path already uses `store.transact()`. If lifecycle evaluation is added inside the same transaction, it reads feedback data that was just modified within the same transaction.
**How to avoid:** Evaluate lifecycle triggers AFTER the feedback batch transaction completes. Use a fresh `store.snapshot()` to read the post-batch state.
**Warning signs:** Lifecycle triggers not firing because the transaction sees pre-mutation feedback state.

### Pitfall 3: Lifecycle Triggers Firing on Dry-Run

**What goes wrong:** The feedback batch endpoint has a `dryRun` mode. If lifecycle triggers are evaluated during dry-run, entries would get transitions that shouldn't happen.
**Why it happens:** Not guarding the lifecycle trigger evaluation behind `!body.dryRun`.
**How to avoid:** Only evaluate lifecycle triggers when `body.dryRun === false`. Return preview info about potential transitions in dry-run mode instead.
**Warning signs:** Tests showing state transitions occurring during dry-run requests.

### Pitfall 4: Missing evidence and maintenance routes from documentedRoutes

**What goes wrong:** Only adding the 3 decay routes to `documentedRoutes` while leaving 3 other undocumented routes (evidence PATCH, maintenance GET/batch) uncovered.
**Why it happens:** The milestone audit flags "8 routes not in documentedRoutes" but the phase description specifically mentions "decay batch management routes."
**How to avoid:** Register ALL 6 undocumented routes in `documentedRoutes` as part of this phase. The routes are: `GET /v1/operations/decay/entries`, `POST /v1/operations/decay/batch`, `POST /v1/operations/decay/search`, `PATCH /v1/knowledge/:id/evidence`, `GET /v1/operations/maintenance/entries`, `POST /v1/operations/maintenance/batch`.
**Warning signs:** Only 3 new routes in documentedRoutes after the phase completes.

### Pitfall 5: Feedback single-submission route already has a simpler trigger

**What goes wrong:** Attempting to wire lifecycle triggers into POST /v1/feedback (individual submission), which already has its own simpler threshold-based trigger check (`TRANSITION_TRIGGERS` in `feedback.ts`).
**Why it happens:** Not reading `feedback.ts` carefully and assuming all trigger logic should go through `checkLifecycleTriggers`.
**How to avoid:** Only wire `checkLifecycleTriggers` into the batch execution path in `feedback-admin.ts`. Leave the existing simple threshold check in `feedback.ts` alone.
**Warning signs:** Duplicate trigger evaluation paths or conflicting transition logic.

## Code Examples

### LifecycleTriggerRule definition (needs to be added to contracts)

```typescript
// packages/contracts/src/domain/feedback.ts
// Needs to be added:

/**
 * Rule for automatic lifecycle transitions triggered by feedback patterns.
 * When a minimum number of feedback items of a specific problem type
 * accumulate within a time window, the entry transitions to a target state.
 */
export const lifecycleTriggerRuleSchema = z.object({
  /** Problem type that triggers this rule */
  problemType: feedbackProblemTypeSchema,
  /** Minimum feedback count to trigger */
  minCount: z.number().int().min(1).default(3),
  /** Time window in days for counting feedback */
  timeWindowDays: z.number().int().min(1).default(30),
  /** Decay state to transition to */
  targetDecayState: decayStateSchema,
});

export type LifecycleTriggerRule = z.infer<typeof lifecycleTriggerRuleSchema>;

/**
 * Default lifecycle trigger rules.
 * - 3 'outdated' feedback in 30 days -> stale
 * - 5 'incorrect' feedback in 30 days -> review-due
 */
export const DEFAULT_LIFECYCLE_TRIGGER_RULES: LifecycleTriggerRule[] = [
  { problemType: 'outdated', minCount: 3, timeWindowDays: 30, targetDecayState: 'stale' },
  { problemType: 'incorrect', minCount: 5, timeWindowDays: 30, targetDecayState: 'review-due' },
];
```

### Wiring checkLifecycleTriggers into feedback-admin.ts batch execution

```typescript
// In feedback-admin.ts, after the existing transact block (line ~332):

// After batch execution, evaluate lifecycle triggers for affected entries
const lifecycleTransitions: Array<{ entryId: string; fromState: string | null; toState: string; reason: string }> = [];

if (!body.dryRun) {
  const freshData = await app.skillShareer.store.snapshot();
  const rules = getLifecycleTriggerRules();
  const now = new Date();

  // Collect unique entry IDs from eligible items
  const affectedEntryIds = [...new Set(
    resultItems
      .filter(i => i.eligible)
      .map(i => {
        const feedback = freshData.feedbackQueue.find(f => f.id === i.feedbackId);
        return feedback?.entryId;
      })
      .filter((id): id is string => id !== undefined)
  )];

  for (const entryId of affectedEntryIds) {
    const result = checkLifecycleTriggers(entryId, freshData.feedbackQueue, rules, now);
    if (result.shouldTransition && result.targetState) {
      // Apply transition in a new transaction
      await app.skillShareer.store.transact((data) => {
        const entry = data.knowledgeEntries.find(e => e.id === entryId);
        if (entry) {
          entry.decayMeta = {
            lastVerifiedAt: entry.decayMeta?.lastVerifiedAt ?? entry.updatedAt,
            decayState: result.targetState!,
            supersededById: entry.decayMeta?.supersededById ?? null,
            decayStateComputedAt: now.toISOString(),
            freshnessType: entry.decayMeta?.freshnessType ?? 'evergreen',
          };
          entry.updatedAt = now.toISOString();
        }
      });

      lifecycleTransitions.push({
        entryId,
        fromState: null, // Could look up pre-transition state
        toState: result.targetState,
        reason: result.reason,
      });
    }
  }
}
```

### Test for automatic lifecycle trigger E2E flow

```typescript
it('triggers lifecycle transition after batch feedback resolution', async () => {
  // Setup: Create 3 "outdated" feedback items for the same entry within 30 days
  await store.transact((data) => {
    for (let i = 0; i < 3; i++) {
      data.feedbackQueue.push({
        id: `feedback_outdated_${i}`,
        entryId: 'trap_1',
        entryType: 'trap',
        problemType: 'outdated',
        description: `Outdated report ${i} with enough chars to pass validation`,
        context: null,
        querySeed: null,
        customAnswers: null,
        submittedAt: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)).toISOString(),
        submittedByUserId: userId,
        submittedByHandle: 'tester',
        status: 'new',
        adminNotes: null,
        resolvedAt: null,
        resolvedByUserId: null,
        triggeredTransition: null,
        createdAt: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)).toISOString(),
        updatedAt: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)).toISOString(),
      });
    }
  });

  // Execute: Resolve all 3 outdated feedbacks in a batch
  const response = await app.inject({
    method: 'POST',
    url: '/v1/operations/feedback/batch',
    headers: { authorization: `Bearer ${adminSessionToken}` },
    payload: {
      feedbackIds: ['feedback_outdated_0', 'feedback_outdated_1', 'feedback_outdated_2'],
      action: 'resolve',
      notes: 'Batch resolved after review',
    },
  });

  expect(response.statusCode).toBe(200);

  // Verify: Entry decay state should have transitioned to 'stale'
  const data = await store.snapshot();
  const entry = data.knowledgeEntries.find(e => e.id === 'trap_1');
  expect(entry?.decayMeta?.decayState).toBe('stale');
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `FeedbackQueueItemRecord` import | Should be `FeedbackQueueRecord` | Phase 57 naming mismatch | TypeScript compilation error; needs fix |
| Lifecycle triggers never called | Need to wire into batch execution | Phase 57 gap | Dead code; needs activation |
| 6 routes undocumented | Need to add to documentedRoutes | Phases 50/58/59 gaps | Routes invisible to /meta/routes |

**Deprecated/outdated:**
- `FeedbackQueueItemRecord` type reference: never existed, was a typo/misnaming. Use `FeedbackQueueRecord`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `DEFAULT_LIFECYCLE_TRIGGER_RULES` should define: 3 outdated -> stale, 5 incorrect -> review-due | Code Examples | Triggers may need different thresholds or problem types |
| A2 | Lifecycle trigger evaluation should happen after the feedback batch transaction completes, not inside it | Architecture Patterns | If inside transaction is preferred, need different approach |
| A3 | All 6 undocumented routes (3 decay + 1 evidence + 2 maintenance) should be registered in this phase | Common Pitfalls | Scope creep concern if only decay routes are expected |
| A4 | The `request-info` action in `feedback/batch.ts` (line 98) is dead code that should not be propagated | Pitfalls | May need to add to schema if it's intentional |

**If this table is empty:** All claims in this research were verified or cited -- no user confirmation needed.

## Open Questions

1. **Should lifecycle trigger evaluation apply to skill artifacts too?**
   - What we know: `applyLifecycleTrigger` accepts `KnowledgeRecord | SkillArtifactRecord`. The feedback batch path in `feedback-admin.ts` currently only affects feedback records, not entries.
   - What's unclear: Whether skill artifacts should also get automatic transitions from feedback patterns.
   - Recommendation: Yes, include skill artifacts. The `checkLifecycleTriggers` function already operates on `entryId`, and `applyLifecycleTrigger` handles both types. Wire both `knowledgeEntries` and `skillArtifacts` in the transition logic.

2. **Should the batch response include lifecycle transition information?**
   - What we know: The `FeedbackBatchResponseSchema` currently returns per-item eligibility and `transitionApplied` flag.
   - What's unclear: Whether the response should include information about automatic lifecycle transitions that occurred as a side effect.
   - Recommendation: Add a `lifecycleTransitions` array to the response (optional, nullable for backward compatibility) containing `{ entryId, toState, reason }` objects for each transition that fired.

3. **Should dry-run mode preview potential lifecycle transitions?**
   - What we know: Dry-run mode already previews feedback changes without persisting.
   - What's unclear: Whether it should also preview which lifecycle transitions would fire.
   - Recommendation: Yes, evaluate triggers in dry-run mode but do not apply them. Include preview in response.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified -- all changes are code-only, using existing project tooling)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (existing) |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npx vitest run packages/server/src/routes/feedback.test.ts --reporter=verbose` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FEEDBACK-03 | checkLifecycleTriggers called after batch execution | integration | `npx vitest run packages/server/src/routes/feedback.test.ts -t "lifecycle"` | No -- Wave 0 |
| FEEDBACK-03 | Recurring feedback patterns trigger state transitions | integration | `npx vitest run packages/server/src/routes/feedback.test.ts -t "lifecycle"` | No -- Wave 0 |
| DECAY-03 | Decay routes visible in documentedRoutes | integration | `npx vitest run packages/server/src/routes/decay.test.ts` | Yes (exists, needs documentedRoutes test) |
| DECAY-03 | All 6 undocumented routes now in /meta/routes | integration | `npx vitest run packages/server/src/routes/operations.test.ts` | Yes (existing pattern) |

### Sampling Rate
- **Per task commit:** `npx vitest run packages/server/src/routes/feedback.test.ts packages/server/src/routes/decay.test.ts --reporter=verbose`
- **Per wave merge:** `pnpm test`
- **Phase gate:** `pnpm test && pnpm typecheck`

### Wave 0 Gaps
- [ ] `packages/server/src/routes/feedback.test.ts` -- E2E lifecycle trigger test (3 outdated feedback -> stale transition)
- [ ] `packages/server/src/routes/feedback.test.ts` -- Dry-run does not trigger lifecycle transitions
- [ ] `packages/server/src/routes/feedback.test.ts` -- Lifecycle trigger respects state ordering (won't go backwards)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Session-based auth via `resolveAuthContext` + `requirePermission` |
| V3 Session Management | yes | Session tokens in existing framework |
| V4 Access Control | yes | `requirePermission(auth, 'knowledge:update')` on batch endpoint |
| V5 Input Validation | yes | Zod schemas via `@trapmap/contracts` |
| V6 Cryptography | no | N/A |

### Known Threat Patterns for Fastify + Zod

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Batch endpoint abuse (100+ items) | Denial of Service | `z.array().max(100)` in schema |
| Privilege escalation on batch | Elevation | `requirePermission(auth, 'knowledge:update')` check |
| Stale data race condition | Tampering | `store.transact()` serializes mutations |

## Sources

### Primary (HIGH confidence)
- [VERIFIED: packages/server/src/lib/feedback/lifecycle-triggers.ts] -- `checkLifecycleTriggers` and `applyLifecycleTrigger` implementations
- [VERIFIED: packages/server/src/routes/feedback-admin.ts] -- Batch execution path, missing lifecycle trigger call
- [VERIFIED: packages/server/src/app.ts:41-80] -- Current `documentedRoutes` array
- [VERIFIED: packages/server/src/routes/decay.ts] -- 3 undocumented routes
- [VERIFIED: packages/server/src/routes/evidence.ts] -- 1 undocumented route
- [VERIFIED: packages/server/src/routes/maintenance.ts] -- 2 undocumented routes
- [VERIFIED: packages/contracts/src/domain/feedback.ts] -- Missing `LifecycleTriggerRule` type
- [VERIFIED: packages/contracts/src/domain/decay.ts] -- `DecayState` type, batch schemas
- [VERIFIED: TypeScript compilation output] -- ~40 errors including missing types

### Secondary (MEDIUM confidence)
- [VERIFIED: .planning/v1.5-MILESTONE-AUDIT.md] -- Cross-phase integration gaps documented
- [VERIFIED: .planning/REQUIREMENTS.md] -- FEEDBACK-03 and DECAY-03 definitions

### Tertiary (LOW confidence)
- None -- all findings verified against source code

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all existing code
- Architecture: HIGH - all source files read, gaps precisely identified
- Pitfalls: HIGH - TypeScript errors and dead code confirmed via compilation check
- Integration points: HIGH - exactly two gaps, both verified in source

**Research date:** 2026-05-03
**Valid until:** 2026-06-03 (stable codebase, wiring phase)
