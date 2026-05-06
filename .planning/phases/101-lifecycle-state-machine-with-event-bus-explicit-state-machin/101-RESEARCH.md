# Phase 101: Lifecycle State Machine with Event Bus - Research

**Researched:** 2026-05-07
**Domain:** State machine patterns, Node.js EventEmitter, event-driven architecture
**Confidence:** HIGH

## Summary

Phase 101 builds on an already-robust lifecycle state machine (`packages/server/src/lib/lifecycle/state-machine.ts`, 30 passing tests) and a well-defined `KnowledgeRepository` interface. The core state machine logic (VALID_TRANSITIONS map, isValidTransition, transitionLifecycleState) is solid and needs only enhancement, not replacement.

The primary work is: (1) enriching the state machine with transition metadata (event names, guard functions), (2) creating an in-process event bus with error isolation, (3) extracting scattered side-effect calls from 6 route files into event subscribers, and (4) wiring everything together through the existing `SkillShareerServices` decoration on the Fastify instance.

The codebase has zero EventEmitter usage today — the server uses imperative post-commit calls for side effects. This phase introduces a new architectural pattern (event-driven decoupling) that will be the foundation for future extensibility.

**Primary recommendation:** Build a thin `LifecycleEventBus` class wrapping Node.js `EventEmitter` with error-isolated async dispatch, then progressively migrate route files to emit events instead of calling side effects directly.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| State transition validation | API / Backend | — | Server owns business rules |
| Event emission | API / Backend | — | Events are in-process, emitted after domain state commits |
| Index synchronization | API / Backend | — | Indexing adapters are server-side services |
| Audit recording | API / Backend | — | Audit events are written to store within server |
| Conflict detection | API / Backend | — | Pure computation over knowledge entries |
| Candidate processing | API / Backend | — | Already uses task queue / fire-and-forget pattern |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| (No REQUIREMENTS.md found) | Phase requirements TBD from CONTEXT.md goal description | All findings below support the CONTEXT.md goal: centralize state transitions and decouple side effects via events |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `events` (built-in) | Node 20.19.5 [VERIFIED: `node --version`] | EventEmitter base for domain event bus | Zero dependencies, well-tested, synchronous dispatch |
| vitest | 3.2.4 [VERIFIED: `npx vitest --version`] | Unit and integration tests | Already used project-wide |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 4.3.6 [VERIFIED: `packages/server/package.json`] | Event payload validation | If event payloads need runtime validation (optional) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Node.js EventEmitter | Custom pub/sub | No benefit — EventEmitter is battle-tested, synchronous, and built-in |
| EventEmitter | `mitt` or `eventemitter3` | Unnecessary dependency — built-in EventEmitter suffices for in-process use |
| Synchronous dispatch | `async/await` per subscriber | CONTEXT.md mandates synchronous ordering; async dispatch loses ordering guarantees |

**Installation:** No new packages needed. Node.js EventEmitter is built-in.

## Architecture Patterns

### System Architecture Diagram

```
HTTP Request
    │
    ▼
Route Handler (knowledge.ts, review.ts, etc.)
    │
    ├─ 1. store.transact() ──► Domain state mutation (lifecycleState change)
    │
    ├─ 2. stateMachine.executeTransition(entryId, newState, ctx)
    │       │
    │       ├─ Validates transition (isValidTransition)
    │       ├─ Emits domain event (eventBus.emit(eventName, payload))
    │       │       │
    │       │       ├─► IndexingSubscriber.runKnowledgeIndexEvent()
    │       │       ├─► AuditSubscriber.recordAudit()
    │       │       ├─► ConflictSubscriber.detectConflicts()
    │       │       └─► [Future subscribers...]
    │       │
    │       └─ Each subscriber wrapped in try/catch (error isolation)
    │
    └─ 3. Return HTTP response (does NOT wait for subscribers)
```

### Recommended Project Structure

```
packages/server/src/lib/lifecycle/
├── state-machine.ts          # Existing: transition validation (ENHANCED)
├── state-machine.test.ts     # Existing: 30 tests (EXTENDED)
├── event-bus.ts              # NEW: LifecycleEventBus class
├── event-bus.test.ts         # NEW: Event bus unit tests
├── transitions.ts            # NEW: Transition table with event metadata
├── types.ts                  # NEW: Domain event type definitions
└── subscribers/              # NEW: Event subscriber implementations
    ├── indexing.ts           # Extracted from routes (calls runKnowledgeIndexEvent)
    ├── audit.ts              # Extracted from routes (calls createAuditEvent)
    ├── conflict.ts           # Extracted from routes (calls detectConflicts)
    └── subscribers.test.ts   # NEW: Subscriber unit tests
```

### Pattern 1: Enhanced State Machine with Transition Metadata

**What:** Extend the existing VALID_TRANSITIONS map to include event names and optional guard functions for each transition.

**When to use:** Every lifecycle state transition.

**Example:**
```typescript
// Source: packages/server/src/lib/lifecycle/transitions.ts (NEW)

import type { LifecycleState } from '@trapmap/contracts';

export interface TransitionDefinition {
  from: LifecycleState;
  to: LifecycleState;
  event: string;
  guard?: (ctx: TransitionContext) => boolean | Promise<boolean>;
}

export interface TransitionContext {
  entryId: string;
  actorId: string;
  reason: string;
  metadata?: Record<string, unknown>;
}

export const TRANSITIONS: TransitionDefinition[] = [
  // Submit
  { from: 'draft',             to: 'submitted',      event: 'knowledge.submitted' },
  // Agent review
  { from: 'submitted',        to: 'agent-pass',      event: 'knowledge.agent-reviewed' },
  { from: 'submitted',        to: 'agent-rejected',  event: 'knowledge.agent-reviewed' },
  // Human review
  { from: 'agent-pass',       to: 'approved',        event: 'knowledge.approved' },
  { from: 'agent-pass',       to: 'rejected',        event: 'knowledge.rejected' },
  { from: 'agent-rejected',   to: 'approved',        event: 'knowledge.approved' },  // reviewer override
  { from: 'agent-rejected',   to: 'rejected',        event: 'knowledge.rejected' },
  // Resubmission
  { from: 'rejected',         to: 'agent-pass',      event: 'knowledge.resubmitted' },
  { from: 'rejected',         to: 'agent-rejected',  event: 'knowledge.resubmitted' },
  { from: 'agent-rejected',   to: 'agent-pass',      event: 'knowledge.resubmitted' },
  // Re-review
  { from: 'approved',         to: 'agent-pass',      event: 'knowledge.re-review' },
  { from: 'approved',         to: 'agent-rejected',  event: 'knowledge.re-review' },
  // Deactivation
  { from: 'approved',         to: 'deactivated',     event: 'knowledge.deactivated' },
  { from: 'rejected',         to: 'deactivated',     event: 'knowledge.deactivated' },
  { from: 'agent-pass',       to: 'deactivated',     event: 'knowledge.deactivated' },
  { from: 'agent-rejected',   to: 'deactivated',     event: 'knowledge.deactivated' },
  // Self-transitions (revision stays in same state)
  { from: 'agent-pass',       to: 'agent-pass',      event: 'knowledge.agent-reviewed' },
  { from: 'agent-rejected',   to: 'agent-rejected',  event: 'knowledge.agent-reviewed' },
];
```

### Pattern 2: Event Bus with Error Isolation

**What:** A `LifecycleEventBus` class that extends Node.js EventEmitter with async-safe, error-isolated dispatch.

**When to use:** All domain event emission from the state machine.

**Example:**
```typescript
// Source: packages/server/src/lib/lifecycle/event-bus.ts (NEW)

import { EventEmitter } from 'node:events';

export interface DomainEvent {
  name: string;
  entryId: string;
  previousState: string;
  nextState: string;
  actorId: string;
  reason: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export type DomainEventHandler = (event: DomainEvent) => void | Promise<void>;

export class LifecycleEventBus extends EventEmitter {
  /**
   * Emit a domain event. Synchronous dispatch in registration order.
   * Each handler is wrapped in try/catch — one failure does not block others.
   * Async handlers are fire-and-forget (caller does not await them).
   */
  emitDomainEvent(event: DomainEvent): void {
    const handlers = this.listeners(event.name);

    for (const handler of handlers) {
      try {
        const result = handler(event);
        // If handler returns a Promise, catch its errors asynchronously
        if (result && typeof result === 'object' && 'catch' in result) {
          (result as Promise<void>).catch((error) => {
            this.emit('error', { event, error, handler: handler.name });
          });
        }
      } catch (error) {
        // Synchronous error isolation — log but don't propagate
        this.emit('error', { event, error, handler: handler.name });
      }
    }
  }

  /**
   * Register a domain event handler.
   * Wraps the handler to maintain registration order.
   */
  onDomainEvent(eventName: string, handler: DomainEventHandler): this {
    return this.on(eventName, handler);
  }
}
```

### Pattern 3: Subscriber Extraction

**What:** Move side-effect logic from route files into standalone subscriber functions that receive a `DomainEvent`.

**When to use:** For indexing, audit, conflict detection, and any future side effects.

**Example:**
```typescript
// Source: packages/server/src/lib/lifecycle/subscribers/indexing.ts (NEW)

import type { LifecycleState } from '@trapmap/contracts';
import type { IndexAdapter } from '../../indexing/types.js';
import { runKnowledgeIndexEvent } from '../../indexing/events.js';
import type { SkillShareerStore } from '../../store.js';
import type { DomainEventHandler } from '../event-bus.js';

export function createIndexingSubscriber(
  store: SkillShareerStore,
  adapters: IndexAdapter[],
): DomainEventHandler {
  return async (event) => {
    const previousState = event.previousState as LifecycleState;
    const nextState = event.nextState as LifecycleState;

    if (previousState === nextState) return;

    const data = await store.snapshot();
    await runKnowledgeIndexEvent({
      services: { store, data },
      entryId: event.entryId,
      previousState,
      nextState,
      reason: event.reason,
      adapters,
    });
  };
}
```

### Pattern 4: Route Migration (Before/After)

**What:** Replace inline side-effect calls in routes with `eventBus.emitDomainEvent()`.

**Example (review.ts approve path):**
```typescript
// BEFORE (current):
// Inside store.transact():
applyReviewDecision(...);
data.auditEvents.push(auditEvent);
// After transact:
await runKnowledgeIndexEvent(...);
if (nextState === 'approved') {
  await detectConflicts(...);
}

// AFTER (target):
// Inside store.transact():
applyReviewDecision(...);
// After transact:
eventBus.emitDomainEvent({
  name: 'knowledge.approved',
  entryId,
  previousState,
  nextState,
  actorId: auth.actorId,
  reason: 'reviewer-approve',
  timestamp: nowIso(),
});
// Subscribers handle indexing, audit, conflict detection automatically
```

### Anti-Patterns to Avoid

- **Awaiting event handlers in the route response path:** Subscribers should be fire-and-forget from the HTTP perspective. The route returns immediately after emitting. If a subscriber needs to signal completion, use a separate mechanism (task queue, webhook).
- **Putting business logic in event handlers:** Event handlers are for side effects only. State mutations happen in `store.transact()` BEFORE the event is emitted.
- **Tight coupling between subscribers:** Subscribers should not depend on each other's execution order for correctness. Registration order provides deterministic ordering, but each subscriber should be independently correct.
- **Event payload bloat:** Keep event payloads minimal (entryId, states, actorId, reason). Subscribers fetch their own data from the store if needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Event pub/sub | Custom observer pattern | Node.js EventEmitter | Built-in, well-tested, synchronous dispatch, zero dependencies |
| Error isolation | Manual try/catch in each route | Event bus with per-handler isolation | Centralized, consistent, prevents forgotten error handling |
| Transition validation | Inline if/switch in routes | Existing `transitionLifecycleState()` + transition table | Already exists with 30 tests; enhance rather than rebuild |

**Key insight:** The existing `transitionLifecycleState()` function already validates transitions correctly. This phase enhances it with event emission metadata — it does NOT replace the validation logic.

## Common Pitfalls

### Pitfall 1: Double-Write During Migration
**What goes wrong:** During incremental migration, some routes use the event bus while others still call side effects directly. This can cause double indexing or double audit entries.
**Why it happens:** The migration is gradual — not all routes are converted in one commit.
**How to avoid:** Migrate one route at a time. After migrating a route, REMOVE the direct side-effect calls. Use feature flags if needed for rollback safety.
**Warning signs:** Duplicate audit events, duplicate index syncs for the same entry.

### Pitfall 2: Async Subscriber Errors Silently Lost
**What goes wrong:** An async subscriber throws after the route has already returned. The error is unhandled.
**Why it happens:** Fire-and-forget pattern without proper error catching.
**How to avoid:** The event bus MUST wrap async handler results in `.catch()` and emit an `'error'` event. The app.ts error handler should listen to this event and log.
**Warning signs:** Missing audit events, index out of sync with domain state.

### Pitfall 3: Transaction Boundary Violation
**What goes wrong:** A subscriber tries to call `store.transact()` while the original transaction is still open (nested transaction).
**Why it happens:** Event is emitted inside `store.transact()` callback.
**How to avoid:** ALWAYS emit events AFTER `store.transact()` commits (post-commit pattern). This is already the pattern used in the codebase — formalize it.
**Warning signs:** StoreData corruption, deadlocks.

### Pitfall 4: Lost Event Context
**What goes wrong:** Subscriber needs data that was available during the transaction (e.g., the entry's state before mutation) but the transaction has committed and the snapshot has changed.
**Why it happens:** Event payload doesn't carry enough context.
**How to avoid:** Include `previousState` and `nextState` in every event. Subscribers should fetch fresh snapshots for current data but use event payload for transition context.
**Warning signs:** Subscribers reading stale data, incorrect indexing decisions.

## Code Examples

### Existing State Machine (to be enhanced, not replaced)
```typescript
// Source: packages/server/src/lib/lifecycle/state-machine.ts
const VALID_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  draft: ['submitted'],
  submitted: ['agent-pass', 'agent-rejected'],
  'agent-pass': ['approved', 'rejected', 'deactivated', 'agent-pass'],
  'agent-rejected': ['agent-pass', 'rejected', 'approved', 'deactivated', 'agent-rejected'],
  approved: ['deactivated', 'agent-pass', 'agent-rejected'],
  rejected: ['agent-pass', 'agent-rejected', 'deactivated'],
  deactivated: [],
};

export function transitionLifecycleState(
  entry: LifecycleTransitionable,
  newState: LifecycleState,
  context: string,
): void {
  if (!isValidTransition(currentState, newState)) {
    throw new Error(`Invalid lifecycle transition: ${currentState} → ${newState} (${context})`);
  }
  entry.lifecycleState = newState;
}
```

### Existing Post-Commit Pattern (to be replaced with event emission)
```typescript
// Source: packages/server/src/routes/review.ts (current pattern)
const reviewedEntry = await app.skillShareer.store.transact((data) => {
  // ... domain mutations ...
  applyReviewDecision({ ... });
  data.auditEvents.push(auditEvent);
  return toKnowledgeEntry(data, entry);
});

// Post-commit side effects (to be replaced by event emission)
if (entryId && previousState && nextState && previousState !== nextState) {
  await runKnowledgeIndexEvent({ ... });
  if (nextState === 'approved') {
    await detectConflicts({ ... });
  }
}
```

### Existing KnowledgeRepository Interface (already has updateLifecycle)
```typescript
// Source: packages/server/src/lib/knowledge/repository.ts
export interface KnowledgeRepository {
  updateLifecycle(
    entryId: string,
    newState: LifecycleState,
    context: { actorId: string; note?: string },
  ): Promise<void>;
  appendLifecycleEvent(entryId: string, event: KnowledgeLifecycleEventRecord): Promise<void>;
  // ... other methods
}
```

## Runtime State Inventory

> Not applicable — this is a greenfield enhancement (adding event bus), not a rename/refactor. No stored data, service configs, OS state, secrets, or build artifacts reference the patterns being changed.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline if/switch for lifecycle validation | `transitionLifecycleState()` function | Phase 62 | Centralized validation, 30 tests |
| Post-commit direct calls for side effects | Same (no event bus yet) | — | This phase changes this |
| KnowledgeRepository with `updateLifecycle()` | Same | Phase 62/68 | Already uses state machine |

**Existing infrastructure this phase leverages:**
- `transitionLifecycleState()` — 30 passing tests, VALID_TRANSITIONS map
- `KnowledgeRepository.updateLifecycle()` — calls `transitionLifecycleState` internally
- `runKnowledgeIndexEvent()` — already a standalone function, easy to wrap as subscriber
- `createAuditEvent()` — already a standalone function, easy to wrap as subscriber
- `detectConflicts()` — already a standalone function, easy to wrap as subscriber
- `SkillShareerServices` interface — where event bus will be added

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Node.js EventEmitter synchronous dispatch guarantees registration-order execution | Pattern 2 | EventEmitter docs confirm this, but edge cases with `once()` or `removeListener()` during emit could affect order |
| A2 | Phase 100 has not yet been implemented (only CONTEXT.md exists) | Summary | If Phase 100 is done, routes may already use `repos.knowledge.transition()` and the migration surface changes |
| A3 | The `DomainEvent` type does not need to be in `@trapmap/contracts` | Standard Stack | If other packages need to subscribe to events, the type must be shared |
| A4 | Async subscribers can be fire-and-forget (no need to await before HTTP response) | Pattern 4 | If audit/indexing MUST complete before response, the pattern changes to awaited dispatch |

## Open Questions (RESOLVED)

1. **Should the event bus be on `SkillShareerServices` or a separate decoration?** RESOLVED: Add `eventBus: LifecycleEventBus` to `SkillShareerServices`. It's a cross-cutting service that routes and subscribers both need access to. (Plan 03 wires this.)

2. **Should `executeTransition()` be a method on the state machine or a separate orchestrator?** RESOLVED: Separate concerns. Keep `transitionLifecycleState()` pure (validation + mutation). Create `executeTransition()` as an orchestrator that calls the pure function AND emits events. This preserves testability. (Plan 02 creates executeTransition.) Note: Routes use findTransitionEvent + emitDomainEvent directly because state is already mutated inside store.transact(). executeTransition is a utility for future use cases where the caller owns the mutation.

3. **How to handle the dual-write pattern with KnowledgeRepository during migration?** RESOLVED: Event emission stays at the route level (post-commit). The repository's `updateLifecycle()` remains a persistence operation. This keeps the repository interface clean. (Plan 04 preserves dual-write.)

4. **Should audit recording remain inside `store.transact()` or move to a subscriber?** RESOLVED: Keep audit inside the transaction for now. Use the event bus for post-commit side effects only (indexing, conflict detection). Audit-as-subscriber is a future optimization that requires a separate persistence mechanism. (Plan 04 keeps audit in transact.)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Event bus, all code | ✓ | 20.19.5 | — |
| vitest | Tests | ✓ | 3.2.4 | — |
| pnpm | Package management | ✓ | (via npm) | npm |
| @trapmap/contracts | Zod schemas, types | ✓ | workspace:* | — |

**Missing dependencies with no fallback:** None

**Missing dependencies with fallback:** None — all dependencies are available.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 |
| Config file | (root vitest config, packages/server/vitest.config if exists) |
| Quick run command | `npx vitest run packages/server/src/lib/lifecycle/` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| (TBD) | State machine validates all transitions | unit | `npx vitest run packages/server/src/lib/lifecycle/state-machine.test.ts` | Yes (30 tests) |
| (TBD) | Event bus emits events in registration order | unit | `npx vitest run packages/server/src/lib/lifecycle/event-bus.test.ts` | No - Wave 0 |
| (TBD) | Event bus isolates subscriber errors | unit | `npx vitest run packages/server/src/lib/lifecycle/event-bus.test.ts` | No - Wave 0 |
| (TBD) | Async subscriber errors are caught | unit | `npx vitest run packages/server/src/lib/lifecycle/event-bus.test.ts` | No - Wave 0 |
| (TBD) | Indexing subscriber calls runKnowledgeIndexEvent | unit | `npx vitest run packages/server/src/lib/lifecycle/subscribers/` | No - Wave 0 |
| (TBD) | Audit subscriber calls createAuditEvent | unit | `npx vitest run packages/server/src/lib/lifecycle/subscribers/` | No - Wave 0 |
| (TBD) | Review route emits knowledge.approved event | integration | `npx vitest run packages/server/src/routes/review.test.ts` | Yes (extend) |
| (TBD) | Knowledge route emits knowledge.submitted event | integration | `npx vitest run packages/server/src/routes/knowledge.test.ts` | Yes (extend) |
| (TBD) | No behavior change (existing tests still pass) | regression | `npx vitest run packages/server/` | Yes |

### Sampling Rate

- **Per task commit:** `npx vitest run packages/server/src/lib/lifecycle/`
- **Per wave merge:** `npx vitest run packages/server/`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/server/src/lib/lifecycle/event-bus.ts` — LifecycleEventBus class
- [ ] `packages/server/src/lib/lifecycle/event-bus.test.ts` — Event bus unit tests (order, error isolation, async)
- [ ] `packages/server/src/lib/lifecycle/transitions.ts` — Transition table with event metadata
- [ ] `packages/server/src/lib/lifecycle/types.ts` — DomainEvent type definition
- [ ] `packages/server/src/lib/lifecycle/subscribers/indexing.ts` — Indexing subscriber
- [ ] `packages/server/src/lib/lifecycle/subscribers/audit.ts` — Audit subscriber
- [ ] `packages/server/src/lib/lifecycle/subscribers/conflict.ts` — Conflict detection subscriber
- [ ] `packages/server/src/lib/lifecycle/subscribers/subscribers.test.ts` — Subscriber unit tests

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Not affected — auth happens before state transitions |
| V3 Session Management | no | Not affected |
| V4 Access Control | yes | Guards on transitions use existing `requirePermission()` / `requireHigherLevel()` — no change |
| V5 Input Validation | yes | Transition validation via existing `isValidTransition()` — no change |
| V6 Cryptography | no | Not affected |

### Known Threat Patterns for Event-Driven Architecture

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Event injection (fake events) | Spoofing | Events emitted only from state machine — no external event sources |
| Event data leakage | Information Disclosure | Event payloads contain entryId and states only, not sensitive content |
| Subscriber denial of service | Denial of Service | Error isolation prevents one failing subscriber from blocking others |

## Sources

### Primary (HIGH confidence)
- `packages/server/src/lib/lifecycle/state-machine.ts` — Current state machine implementation (read directly)
- `packages/server/src/lib/lifecycle/state-machine.test.ts` — 30 passing tests (ran successfully)
- `packages/server/src/lib/knowledge/repository.ts` — KnowledgeRepository interface with updateLifecycle (read directly)
- `packages/server/src/routes/review.ts` — Current post-commit pattern for approve/reject (read directly)
- `packages/server/src/routes/knowledge.ts` — Current submit/resubmit/update patterns (read directly)
- `packages/server/src/lib/indexing/events.ts` — runKnowledgeIndexEvent function (read directly)
- `packages/server/src/lib/audit.ts` — createAuditEvent function (read directly)
- `packages/server/src/lib/conflict/detect.ts` — detectConflicts function (read directly)
- `packages/server/src/lib/context.ts` — SkillShareerServices interface (read directly)
- `packages/server/src/app.ts` — Server wiring, decoration, onReady hooks (read directly)
- Node.js EventEmitter docs — Synchronous dispatch, registration order [CITED: nodejs.org/api/events]

### Secondary (MEDIUM confidence)
- `packages/server/src/routes/operations/knowledge-legacy.ts` — Deactivation route pattern (read directly)
- `packages/server/src/routes/candidates.ts` — Candidate resolution with post-commit indexing (read directly)
- `packages/server/src/lib/candidates/reconcile.ts` — publishTrapCandidate creates entries at agent-pass (read directly)

### Tertiary (LOW confidence)
- None — all findings verified against source code

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Node.js EventEmitter is built-in, no new dependencies needed
- Architecture: HIGH — Existing patterns (post-commit, state machine, repository) are well-understood
- Pitfalls: MEDIUM — Event-driven architecture pitfalls are well-documented but specific to this codebase's transaction boundaries

**Research date:** 2026-05-07
**Valid until:** 2026-06-07 (30 days — stable architecture patterns)
