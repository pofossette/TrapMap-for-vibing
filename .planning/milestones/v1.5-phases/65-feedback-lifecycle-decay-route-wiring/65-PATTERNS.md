# Phase 65: Feedback Lifecycle & Decay Route Wiring - Pattern Map

**Mapped:** 2026-05-03
**Files analyzed:** 6 new/modified files
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/contracts/src/domain/feedback.ts` | model | CRUD | `packages/contracts/src/domain/decay.ts` | exact (same domain schema file) |
| `packages/server/src/lib/feedback/lifecycle-triggers.ts` | service | CRUD | `packages/server/src/lib/feedback/lifecycle-triggers.ts` (self -- fix imports) | self |
| `packages/server/src/lib/feedback/batch.ts` | service | CRUD | `packages/server/src/lib/feedback/batch.ts` (self -- fix imports) | self |
| `packages/server/src/routes/feedback-admin.ts` | controller | request-response | `packages/server/src/routes/decay.ts` | role-match |
| `packages/server/src/app.ts` | config | request-response | `packages/server/src/app.ts` (self -- add to array) | self |
| `packages/server/src/routes/feedback.test.ts` | test | request-response | `packages/server/src/routes/feedback.test.ts` (self -- add tests) | self |

## Pattern Assignments

### `packages/contracts/src/domain/feedback.ts` (model, CRUD)

**Analog:** `packages/contracts/src/domain/decay.ts`

This file already contains all feedback schemas. The task is to ADD `lifecycleTriggerRuleSchema`, the `LifecycleTriggerRule` type, and `DEFAULT_LIFECYCLE_TRIGGER_RULES` constant.

**Existing imports pattern** (lines 1-4):
```typescript
import { z } from 'zod';

import { entityIdSchema, isoTimestampSchema, actorRefSchema } from './common.js';
import { decayStateSchema } from './decay.js';
```

**Schema + type export pattern** (from `decay.ts` lines 85-131):
```typescript
export const decayStateSchema = z.enum([
  'active',
  'review-due',
  'stale',
  'expired',
  'superseded',
]);

// ...schema definition...

export type DecayState = z.infer<typeof decayStateSchema>;
```

**Where to add:** After the existing type exports at the end of `feedback.ts` (after line 267). The new schemas must use `feedbackProblemTypeSchema` and `decayStateSchema` (already imported). Follow the same `z.object()` -> `z.infer<>` -> constant pattern.

**Concrete code to add** (new block at end of file, before type exports would need to move or add alongside):
```typescript
/**
 * Rule for automatic lifecycle transitions triggered by feedback patterns.
 */
export const lifecycleTriggerRuleSchema = z.object({
  problemType: feedbackProblemTypeSchema,
  minCount: z.number().int().min(1).default(3),
  timeWindowDays: z.number().int().min(1).default(30),
  targetDecayState: decayStateSchema,
});

export type LifecycleTriggerRule = z.infer<typeof lifecycleTriggerRuleSchema>;

/**
 * Default lifecycle trigger rules.
 */
export const DEFAULT_LIFECYCLE_TRIGGER_RULES: LifecycleTriggerRule[] = [
  { problemType: 'outdated', minCount: 3, timeWindowDays: 30, targetDecayState: 'stale' },
  { problemType: 'incorrect', minCount: 5, timeWindowDays: 30, targetDecayState: 'review-due' },
];
```

---

### `packages/server/src/lib/feedback/lifecycle-triggers.ts` (service, CRUD)

**Analog:** Self -- fix broken imports only.

**Current broken imports** (lines 8-19):
```typescript
import type {
  DecayState,
  FeedbackProblemType,
  LifecycleTriggerRule,
} from '@trapmap/contracts';
import { DEFAULT_LIFECYCLE_TRIGGER_RULES } from '@trapmap/contracts';

import type {
  FeedbackQueueItemRecord,  // <-- DOES NOT EXIST in store.ts
  KnowledgeRecord,
  SkillArtifactRecord,
} from '../store.js';
```

**Fix required:** Change `FeedbackQueueItemRecord` to `FeedbackQueueRecord` on lines 16 and 44 and 87. The correct type is `FeedbackQueueRecord` (defined in `packages/server/src/lib/store.ts` line 584).

**No other changes needed** -- the function logic is complete and correct.

---

### `packages/server/src/lib/feedback/batch.ts` (service, CRUD)

**Analog:** Self -- fix broken imports and remove unused `executeFeedbackBatch`.

**Current broken imports** (lines 8-22):
```typescript
import type {
  FeedbackBatchAction,
  DecayState,
  FeedbackStatus,
  LifecycleTriggerRule,   // imported but unused
} from '@trapmap/contracts';
import { DEFAULT_LIFECYCLE_TRIGGER_RULES } from '@trapmap/contracts';  // imported but unused

import { AppError } from '../errors.js';
import type {
  FeedbackQueueItemRecord,  // <-- DOES NOT EXIST
  KnowledgeRecord,
  SkillShareerStore,
  StoreData,
} from '../store.js';
```

**Fix required:**
1. Change `FeedbackQueueItemRecord` to `FeedbackQueueRecord` on lines 18, 208, 212
2. Remove unused imports: `LifecycleTriggerRule`, `DEFAULT_LIFECYCLE_TRIGGER_RULES` (lines 12-13)
3. Remove the unused `executeFeedbackBatch` function (lines 203-263) -- it is never called from the route (the route does its own inline batch execution)

---

### `packages/server/src/routes/feedback-admin.ts` (controller, request-response)

**Analog:** `packages/server/src/routes/decay.ts` -- batch execution with post-transaction logic.

This is the primary wiring file. The `checkLifecycleTriggers` function must be called AFTER the batch transaction completes on line 332.

**Current imports pattern** (lines 1-27):
```typescript
import {
  feedbackListRequestSchema,
  feedbackListResponseSchema,
  feedbackBatchRequestSchema,
  feedbackBatchResponseSchema,
  feedbackStatsResponseSchema,
  type QualityScore,
  type FeedbackListItem,
  type FeedbackBatchItem,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '../lib/errors.js';
import { requirePermission } from '../lib/rbac.js';
import { resolveAuthContext } from '../lib/session.js';
import type { FeedbackQueueRecord } from '../lib/store.js';
import { nowIso } from '../lib/store.js';
import { loadUserOpsLogConfig, logUserOperation } from '../lib/user-ops-log.js';
```

**Imports to add** (after line 27):
```typescript
import { checkLifecycleTriggers, getLifecycleTriggerRules } from '../lib/feedback/lifecycle-triggers.js';
```

**Core batch execution pattern** (lines 290-332) -- the transact block ends at line 332:
```typescript
// Execute the batch operation
await app.skillShareer.store.transact((txData) => {
  const txFeedbackMap = new Map(txData.feedbackQueue.map((f) => [f.id, f]));

  for (const item of resultItems) {
    if (!item.eligible) continue;
    const feedback = txFeedbackMap.get(item.feedbackId);
    if (!feedback) continue;
    // ... action handling ...
  }
});  // <-- LINE 332: transact ends here
```

**Wiring pattern to add after the transact block** (after line 332, before the log operation at line 335):
```typescript
// After batch execution, evaluate lifecycle triggers for affected entries
const lifecycleTransitions: Array<{ entryId: string; toState: string; reason: string }> = [];

if (!body.dryRun) {
  const freshData = await app.skillShareer.store.snapshot();
  const rules = getLifecycleTriggerRules();
  const lifecycleNow = new Date();

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
    const result = checkLifecycleTriggers(entryId, freshData.feedbackQueue, rules, lifecycleNow);
    if (result.shouldTransition && result.targetState) {
      await app.skillShareer.store.transact((data) => {
        const entry = data.knowledgeEntries.find(e => e.id === entryId);
        if (entry) {
          entry.decayMeta = {
            lastVerifiedAt: entry.decayMeta?.lastVerifiedAt ?? entry.updatedAt,
            decayState: result.targetState!,
            supersededById: entry.decayMeta?.supersededById ?? null,
            decayStateComputedAt: lifecycleNow.toISOString(),
            freshnessType: entry.decayMeta?.freshnessType ?? 'evergreen',
          };
          entry.updatedAt = lifecycleNow.toISOString();
        }
      });
      lifecycleTransitions.push({
        entryId,
        toState: result.targetState,
        reason: result.reason,
      });
    }
  }
}
```

**Response pattern** -- current return (lines 351-358):
```typescript
return feedbackBatchResponseSchema.parse({
  action: body.action,
  dryRun: false,
  items: resultItems,
  totalEligible,
  totalIneligible,
  appliedAt,
});
```

The response schema (`feedbackBatchResponseSchema`) does not currently have a `lifecycleTransitions` field. The planner should decide whether to add it to the schema or include it in the metadata log only. If adding to response, extend the schema in `packages/contracts/src/domain/feedback.ts`.

**Reference: decay.ts post-transaction pattern** (lines 268-274):
```typescript
// Execute mode: plan and execute
const mutatedRecords = await app.skillShareer.store.transact((data) => {
  return executeBatchOperation(app.skillShareer.store, data, input, config, now);
});

// Get the plan for response (using fresh snapshot after mutation)
const data = await app.skillShareer.store.snapshot();
const planItems = planBatchOperation(data, input, config, now);
```

---

### `packages/server/src/app.ts` (config, request-response)

**Analog:** Self -- add entries to existing array.

**Current `documentedRoutes` array** (lines 41-80):
```typescript
const documentedRoutes = [
  'POST /v1/auth/login',
  'GET /v1/auth/session',
  // ... 30+ existing routes ...
  'POST /v1/feedback',
  'GET /v1/operations/feedback',
  'POST /v1/operations/feedback/batch',
  'GET /v1/operations/feedback/stats/:entryId',
] as const;
```

**Entries to add** (before the `as const` on line 80, after the last feedback route):
```typescript
  'GET /v1/operations/decay/entries',
  'POST /v1/operations/decay/batch',
  'POST /v1/operations/decay/search',
  'PATCH /v1/knowledge/:id/evidence',
  'GET /v1/operations/maintenance/entries',
  'POST /v1/operations/maintenance/batch',
```

---

### `packages/server/src/routes/feedback.test.ts` (test, request-response)

**Analog:** Self -- add lifecycle trigger tests to existing test file.

**Existing test setup pattern** (lines 289-470):
```typescript
describe('feedback admin routes', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;

  const userId = 'user_1';
  const adminUserId = 'admin_1';
  const teamId = 'team_1';
  let sessionToken: string;
  let adminSessionToken: string;

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-feedback-admin-${Date.now()}-${Math.random()}.json`;
    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;

    // Setup: Create user, team, membership, session
    await store.transact(async (data) => {
      // ... user, team, membership, session setup ...
      // ... knowledge entry setup ...
      // ... feedback records setup ...
    });
  });
```

**Test assertion pattern for route registration** (from `operations.test.ts` lines 293-303):
```typescript
it('lists operations routes in documented routes', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/meta/routes',
  });

  expect(response.statusCode).toBe(200);
  const json = response.json();
  expect(json.documentedRoutes).toContain('GET /v1/operations/knowledge');
  expect(json.documentedRoutes).toContain('POST /v1/operations/knowledge/:entryId/deactivate');
});
```

**Tests to add** (new `describe` block within `feedback admin routes`):

1. Lifecycle trigger E2E test: Create 3 "outdated" feedback items for same entry, batch-resolve them, verify entry `decayMeta.decayState` transitions to `'stale'`
2. Dry-run does NOT trigger lifecycle transitions
3. Route registration test: `GET /meta/routes` contains all 6 new documented routes

---

## Shared Patterns

### Authentication & Authorization
**Source:** `packages/server/src/routes/feedback-admin.ts` lines 200-201
**Apply to:** All route handlers (already in place)
```typescript
const auth = await resolveAuthContext(app.skillShareer, request);
requirePermission(auth, 'knowledge:update');
```

### Error Handling
**Source:** `packages/server/src/app.ts` lines 250-278
**Apply to:** All routes (global error handler already configured)
```typescript
app.setErrorHandler((error, _request, reply) => {
  if (isAppError(error)) {
    return reply.status(error.statusCode).send({
      code: error.code,
      message: error.message,
    });
  }
  // ... ZodError, fallback 500 ...
});
```

### Store Transaction Pattern
**Source:** `packages/server/src/routes/decay.ts` lines 268-273
**Apply to:** Lifecycle trigger transition (post-batch)
```typescript
const mutatedRecords = await app.skillShareer.store.transact((data) => {
  return executeBatchOperation(app.skillShareer.store, data, input, config, now);
});
// Then fresh snapshot for reads
const data = await app.skillShareer.store.snapshot();
```

### Import Alias Convention
**Source:** All route files
**Apply to:** Any new imports in this phase
- Use `.js` extension in relative imports: `'../lib/store.js'`
- Use `@trapmap/contracts` for shared types/schemas
- Type-only imports use `import type { ... }` syntax

### User Operation Logging
**Source:** `packages/server/src/routes/feedback-admin.ts` lines 335-349
**Apply to:** All mutations
```typescript
const logConfig = loadUserOpsLogConfig();
await logUserOperation(logConfig, {
  timestamp: appliedAt,
  actorId: auth.actorId,
  actorHandle: auth.handle,
  action: 'feedback-batch',
  targetId: null,
  teamId: auth.activeTeamId,
  metadata: { /* ... */ },
});
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | -- | -- | All files have direct analogs in the existing codebase |

## Metadata

**Analog search scope:** `packages/server/src/routes/`, `packages/server/src/lib/feedback/`, `packages/server/src/lib/store.ts`, `packages/contracts/src/domain/`
**Files scanned:** 15+
**Pattern extraction date:** 2026-05-03
