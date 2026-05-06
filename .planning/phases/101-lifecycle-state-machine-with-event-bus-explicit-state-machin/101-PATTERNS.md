# Phase 101: Lifecycle State Machine with Event Bus - Pattern Map

**Mapped:** 2026-05-07
**Files analyzed:** 11 (6 new, 5 modified)
**Analogs found:** 9 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/server/src/lib/lifecycle/event-bus.ts` | utility | event-driven | `packages/server/src/lib/lifecycle/state-machine.ts` | role-match |
| `packages/server/src/lib/lifecycle/transitions.ts` | config | transform | `packages/server/src/lib/lifecycle/state-machine.ts` | exact |
| `packages/server/src/lib/lifecycle/types.ts` | model | transform | `packages/server/src/lib/indexing/types.ts` | role-match |
| `packages/server/src/lib/lifecycle/subscribers/indexing.ts` | service | event-driven | `packages/server/src/lib/indexing/events.ts` | exact |
| `packages/server/src/lib/lifecycle/subscribers/audit.ts` | service | event-driven | `packages/server/src/lib/audit.ts` | role-match |
| `packages/server/src/lib/lifecycle/subscribers/conflict.ts` | service | event-driven | `packages/server/src/lib/conflict/detect.ts` | exact |
| `packages/server/src/lib/lifecycle/state-machine.ts` | utility | transform | (self — enhance) | existing |
| `packages/server/src/routes/review.ts` | controller | request-response | (self — simplify) | existing |
| `packages/server/src/routes/knowledge.ts` | controller | request-response | (self — simplify) | existing |
| `packages/server/src/lib/context.ts` | model | transform | (self — extend) | existing |
| `packages/server/src/app.ts` | config | event-driven | (self — extend) | existing |

## Pattern Assignments

### `packages/server/src/lib/lifecycle/event-bus.ts` (utility, event-driven)

**Analog:** `packages/server/src/lib/lifecycle/state-machine.ts` — same directory, same role (pure utility class)

**Import pattern** (from state-machine.ts lines 1-13):
```typescript
import type { LifecycleState } from '@trapmap/contracts';
```

**Core pattern** — extend Node.js EventEmitter with error-isolated dispatch. The codebase has zero EventEmitter usage today, so this is greenfield. Follow the state-machine's pattern of exporting pure functions and a small interface:

```typescript
// From state-machine.ts lines 63-65 (interface pattern):
interface LifecycleTransitionable {
  lifecycleState: LifecycleState;
}
```

**Error handling pattern** — follow the post-commit try/catch isolation pattern from `review.ts` lines 193-208:
```typescript
// From review.ts (post-commit error isolation):
try {
  await runKnowledgeIndexEvent({ ... });
} catch (indexingError) {
  app.log.error({ indexingError, entryId }, 'Post-commit indexing failed');
}
```

The event bus should wrap each handler in try/catch, emitting `'error'` events for failures — mirroring this same isolation philosophy at the bus level instead of per-route.

**Testing pattern** — follow `state-machine.test.ts` structure (vitest, describe/it blocks, pure function tests):
```typescript
// From state-machine.test.ts lines 1-9:
import { describe, expect, it } from 'vitest';
import type { LifecycleState } from '@trapmap/contracts';
import { ... } from './state-machine.js';
```

---

### `packages/server/src/lib/lifecycle/transitions.ts` (config, transform)

**Analog:** `packages/server/src/lib/lifecycle/state-machine.ts` — exact match (VALID_TRANSITIONS map pattern)

**Core pattern** — extend the existing VALID_TRANSITIONS map (state-machine.ts lines 18-26) with event metadata:
```typescript
// From state-machine.ts lines 18-26:
const VALID_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  draft: ['submitted'],
  submitted: ['agent-pass', 'agent-rejected'],
  'agent-pass': ['approved', 'rejected', 'deactivated', 'agent-pass'],
  'agent-rejected': ['agent-pass', 'rejected', 'approved', 'deactivated', 'agent-rejected'],
  approved: ['deactivated', 'agent-pass', 'agent-rejected'],
  rejected: ['agent-pass', 'agent-rejected', 'deactivated'],
  deactivated: [],
};
```

The new TRANSITIONS array should use the same `LifecycleState` import from `@trapmap/contracts` and add `event: string` and optional `guard` fields per entry.

**Import pattern** — same as state-machine.ts:
```typescript
import type { LifecycleState } from '@trapmap/contracts';
```

---

### `packages/server/src/lib/lifecycle/types.ts` (model, transform)

**Analog:** `packages/server/src/lib/indexing/types.ts` — same role (type definitions for a subsystem)

**Import pattern** (from indexing/types.ts lines 1-3):
```typescript
import type { Boundary, LifecycleState, Scope } from '@trapmap/contracts';
```

**Type definition pattern** — follow the JSDoc-commented interface style from indexing/types.ts lines 17-48:
```typescript
/**
 * Normalized index document produced by the normalization stage.
 * All adapters consume this single canonical representation.
 */
export interface NormalizedIndexDocument {
  /** Entry ID */
  entryId: string;
  // ... documented fields
}
```

Apply the same pattern for `DomainEvent`, `DomainEventHandler`, `TransitionDefinition`, `TransitionContext` interfaces.

---

### `packages/server/src/lib/lifecycle/subscribers/indexing.ts` (service, event-driven)

**Analog:** `packages/server/src/lib/indexing/events.ts` — exact match (wraps `runKnowledgeIndexEvent`)

**Import pattern** (from indexing/events.ts lines 1-6):
```typescript
import type { LifecycleState } from '@trapmap/contracts';
import type { SkillShareerStore, StoreData } from '../store.js';
import { syncKnowledgeIndex } from './pipeline.js';
import type { IndexAdapter } from './types.js';
```

**Core pattern** — the subscriber is a factory function that returns a `DomainEventHandler`. It calls `runKnowledgeIndexEvent` (events.ts lines 55-105) with the event payload:
```typescript
// From indexing/events.ts lines 55-62 (function signature):
export async function runKnowledgeIndexEvent(args: {
  services: { store: SkillShareerStore; data: StoreData };
  entryId: string;
  previousState: LifecycleState;
  nextState: LifecycleState;
  reason: string;
  adapters: IndexAdapter[];
}): Promise<void> {
```

The subscriber should:
1. Check `previousState !== nextState` (skip self-transitions)
2. Get fresh snapshot from store
3. Call `runKnowledgeIndexEvent` with event fields mapped to args

**Error handling** — delegate to event bus isolation (no try/catch needed in subscriber itself).

---

### `packages/server/src/lib/lifecycle/subscribers/audit.ts` (service, event-driven)

**Analog:** `packages/server/src/lib/audit.ts` — role match (audit event creation)

**Import pattern** (from audit.ts lines 1-6):
```typescript
import type { AuditEvent } from '@trapmap/contracts';
import type { SkillShareerStore, StoreData } from './store.js';
import { nowIso } from './store.js';
import type { ResolvedAuthContext } from './context.js';
```

**Core pattern** — the subscriber calls `createAuditEvent` (audit.ts lines 18-33) and pushes to `data.auditEvents`:
```typescript
// From audit.ts lines 18-33:
export function createAuditEvent(args: CreateAuditEventArgs) {
  const id = args.store.nextId(args.data, 'audit');
  const createdAt = nowIso();
  const updatedAt = createdAt;
  return { id, teamId: args.teamId, actorId: args.actor.actorId, action: args.action, ... };
}
```

Note: Per RESEARCH.md open question #4, audit recording stays inside `store.transact()` for now. The audit subscriber should be a placeholder or handle post-commit audit logging only (not the primary audit push).

---

### `packages/server/src/lib/lifecycle/subscribers/conflict.ts` (service, event-driven)

**Analog:** `packages/server/src/lib/conflict/detect.ts` — exact match

**Import pattern** (from detect.ts lines 1-5):
```typescript
import type { ConflictRelation, ConflictType } from '@trapmap/contracts';
import type { KnowledgeRecord, SkillShareerStore, StoreData } from '../store.js';
import { nowIso } from '../store.js';
```

**Core pattern** — the subscriber calls `detectConflicts` (detect.ts lines 112-178) only when `nextState === 'approved'`:
```typescript
// From detect.ts lines 112-113:
export async function detectConflicts(input: ConflictDetectionInput): Promise<ConflictRelation[]> {
  const { services, entryId } = input;
```

The subscriber should:
1. Guard: only run when `event.nextState === 'approved'`
2. Get fresh snapshot
3. Call `detectConflicts({ services: { store, data }, entryId: event.entryId })`

---

### `packages/server/src/lib/lifecycle/state-machine.ts` (EXISTING — enhance)

**Self-reference** — current implementation is the analog.

**Current pattern** (lines 18-26, VALID_TRANSITIONS map; lines 76-88, transitionLifecycleState):
```typescript
const VALID_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = { ... };

export function transitionLifecycleState(
  entry: LifecycleTransitionable,
  newState: LifecycleState,
  context: string,
): void {
  const currentState = entry.lifecycleState;
  if (!isValidTransition(currentState, newState)) {
    throw new Error(`Invalid lifecycle transition: ${currentState} → ${newState} (${context})`);
  }
  entry.lifecycleState = newState;
}
```

**Enhancement:** Add `executeTransition()` orchestrator function that:
1. Calls `transitionLifecycleState()` (pure validation + mutation)
2. Looks up the event name from the transitions table
3. Emits via `eventBus.emitDomainEvent()`
4. Keeps `transitionLifecycleState()` unchanged (pure, testable)

Per RESEARCH.md open question #2: "Separate concerns. Keep `transitionLifecycleState()` pure. Create `executeTransition()` as an orchestrator."

---

### `packages/server/src/routes/review.ts` (MODIFY — simplify)

**Self-reference** — current post-commit pattern to be replaced.

**Current pattern to replace** (lines 172-227):
```typescript
// Post-commit side effects (to be replaced by event emission)
if (entryId && previousState && nextState && previousState !== nextState) {
  // Dual-write repo update
  const knowledgeRepo = app.skillShareer.knowledgeRepo;
  if (knowledgeRepo) { /* updateLifecycle */ }

  // Indexing
  try {
    await runKnowledgeIndexEvent({ ... });
  } catch (indexingError) {
    app.log.error({ indexingError, entryId }, 'Post-commit indexing failed');
  }

  // Conflict detection
  if (nextState === 'approved') {
    try {
      await detectConflicts({ ... });
    } catch (conflictError) {
      app.log.error({ conflictError, entryId }, 'Post-commit conflict detection failed');
    }
  }
}
```

**Replacement pattern:**
```typescript
// After store.transact() commits:
if (entryId && previousState && nextState && previousState !== nextState) {
  // Keep dual-write repo update (not an event bus concern)
  const knowledgeRepo = app.skillShareer.knowledgeRepo;
  if (knowledgeRepo) { /* updateLifecycle — stays */ }

  // Replace indexing + conflict with single event emission
  app.skillShareer.eventBus.emitDomainEvent({
    name: determineEventName(previousState, nextState, payload.decision),
    entryId,
    previousState,
    nextState,
    actorId: auth.actorId,
    reason: `reviewer-${payload.decision}`,
    timestamp: nowIso(),
  });
}
```

---

### `packages/server/src/routes/knowledge.ts` (MODIFY — simplify)

**Self-reference** — current post-commit pattern to be replaced.

**Current pattern to replace** (lines 319-339, update endpoint):
```typescript
// Trigger indexing AFTER the transaction commits (post-commit pattern)
if (previousState && nextState && nextState === 'approved') {
  try {
    await runKnowledgeIndexEvent({ ... });
  } catch (indexingError) {
    app.log.error({ indexingError, entryId }, 'Post-commit indexing failed after update');
  }
}
```

**Replacement:** Same event emission pattern as review.ts. The submit endpoint (lines 88-105) does NOT have post-commit side effects currently (no indexing for draft->submitted), so it may not need event emission unless the transition table includes it.

---

### `packages/server/src/lib/context.ts` (MODIFY — extend)

**Self-reference** — current SkillShareerServices interface.

**Current pattern** (lines 16-37):
```typescript
export interface SkillShareerServices {
  config: ServerConfig;
  store: SkillShareerStore;
  indexAdapters: IndexAdapter[];
  ai: AiProviders;
  knowledgeRepo: KnowledgeRepository | undefined;
  artifactRepo: ArtifactRepository | undefined;
  // ... more repos
}
```

**Extension:** Add `eventBus` field:
```typescript
import type { LifecycleEventBus } from './lifecycle/event-bus.js';

export interface SkillShareerServices {
  // ... existing fields ...
  eventBus: LifecycleEventBus;
}
```

Follow the same pattern as other service fields (direct property, not optional since event bus is always available).

---

### `packages/server/src/app.ts` (MODIFY — extend)

**Self-reference** — current server wiring.

**Decoration pattern** (lines 159-180):
```typescript
app.decorate('skillShareer', {
  config,
  store: createSkillShareerStore(config),
  indexAdapters: buildDefaultIndexAdapters(),
  ai: createAiProviders(config.ai),
  knowledgeRepo: undefined,
  // ...
});
```

**Extension:** Create event bus and register subscribers in `onReady` hook, following the existing onReady pattern (lines 204-238):
```typescript
// In app.ts decoration (line 159):
import { LifecycleEventBus } from './lib/lifecycle/event-bus.js';
import { createIndexingSubscriber } from './lib/lifecycle/subscribers/indexing.js';
import { createConflictSubscriber } from './lib/lifecycle/subscribers/conflict.js';

app.decorate('skillShareer', {
  // ... existing fields ...
  eventBus: new LifecycleEventBus(),
});

// In onReady hook:
app.addHook('onReady', async () => {
  const { eventBus, store, indexAdapters } = app.skillShareer;
  eventBus.onDomainEvent('knowledge.approved', createIndexingSubscriber(store, indexAdapters));
  eventBus.onDomainEvent('knowledge.approved', createConflictSubscriber(store));
  eventBus.onDomainEvent('knowledge.deactivated', createIndexingSubscriber(store, indexAdapters));
  // ... register for other events
  eventBus.on('error', ({ event, error }) => {
    app.log.error({ event, error }, 'Event subscriber error');
  });
});
```

Follow the fire-and-forget pattern from app.ts lines 224-232:
```typescript
void processPendingCandidates({ ... })
  .then(({ processed, errors }) => {
    app.log.info({ processed, errors }, 'Candidate recovery complete');
  })
  .catch((error) => {
    app.log.error({ error }, 'Candidate recovery failed');
  });
```

## Shared Patterns

### Post-Commit Error Isolation
**Source:** `packages/server/src/routes/review.ts` lines 193-226
**Apply to:** All event subscribers (via event bus), all route post-commit blocks

The existing pattern wraps each post-commit side effect in try/catch with logging. The event bus centralizes this — each handler is wrapped in try/catch automatically. Routes no longer need individual try/catch blocks for side effects.

```typescript
// From review.ts lines 193-208:
try {
  await runKnowledgeIndexEvent({
    services: { store: app.skillShareer.store, data: await app.skillShareer.store.snapshot() },
    entryId,
    previousState,
    nextState,
    reason: `reviewer-${payload.decision}`,
    adapters: app.skillShareer.indexAdapters,
  });
} catch (indexingError) {
  app.log.error({ indexingError, entryId }, 'Post-commit indexing failed');
}
```

### Dual-Write Repository Pattern
**Source:** `packages/server/src/routes/review.ts` lines 176-191
**Apply to:** All routes that modify lifecycle state

The dual-write to `knowledgeRepo.updateLifecycle()` stays in routes (not moved to event bus). Per RESEARCH.md: "Event emission stays at the route level (post-commit). The repository's `updateLifecycle()` remains a persistence operation."

```typescript
// From review.ts lines 176-191:
const knowledgeRepo = app.skillShareer.knowledgeRepo;
if (knowledgeRepo) {
  try {
    await knowledgeRepo.updateLifecycle(entryId, nextState, {
      actorId: auth.actorId,
      note: `reviewer-${payload.decision}`,
    });
  } catch (repoError) {
    app.log.error({ repoError, entryId }, 'Failed to update lifecycle in knowledge repository');
  }
}
```

### Fastify Service Decoration
**Source:** `packages/server/src/app.ts` lines 159-180
**Apply to:** Event bus initialization

```typescript
// From app.ts lines 159-180:
app.decorate('skillShareer', {
  config,
  store: createSkillShareerStore(config),
  indexAdapters: buildDefaultIndexAdapters(),
  ai: createAiProviders(config.ai),
  knowledgeRepo: undefined,
  // ... pattern for adding eventBus here
});
```

### Vitest Test Structure
**Source:** `packages/server/src/lib/lifecycle/state-machine.test.ts`
**Apply to:** All new test files (event-bus.test.ts, subscribers.test.ts)

```typescript
// From state-machine.test.ts lines 1-9:
import { describe, expect, it } from 'vitest';
import type { LifecycleState } from '@trapmap/contracts';
import {
  getValidTransitions,
  isTerminalState,
  isValidTransition,
  transitionLifecycleState,
} from './state-machine.js';

describe('lifecycle state machine', () => {
  describe('isValidTransition', () => {
    it('allows agent-pass → approved', () => {
      expect(isValidTransition('agent-pass', 'approved')).toBe(true);
    });
    // ... individual test cases per transition
  });
});
```

### Type Definition Style
**Source:** `packages/server/src/lib/indexing/types.ts`
**Apply to:** `lifecycle/types.ts`

```typescript
// From indexing/types.ts lines 9-48:
/**
 * Normalized index document produced by the normalization stage.
 * All adapters consume this single canonical representation.
 */
export interface NormalizedIndexDocument {
  /** Entry ID */
  entryId: string;
  /** Team ID (null for global entries) */
  teamId: string | null;
  // ... JSDoc on every field
}
```

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `packages/server/src/lib/lifecycle/event-bus.ts` | utility | event-driven | Zero EventEmitter usage in codebase today — greenfield pattern |
| `packages/server/src/lib/lifecycle/subscribers/` (directory) | service | event-driven | No subscriber/observer pattern exists in codebase — greenfield |

For these two, the RESEARCH.md code examples (Pattern 2 and Pattern 3) provide the target implementation directly.

## Metadata

**Analog search scope:** `packages/server/src/lib/`, `packages/server/src/routes/`
**Files scanned:** 15
**Pattern extraction date:** 2026-05-07
