# Phase 60 Context: Consolidate Type Definitions, Lifecycle State Machine & Legacy Layers

## Overview

Four related cleanup tasks under the same theme — "收拢散落定义，消除遗留重复层":
1. **Type deduplication**: Eliminate duplicate interface definitions across `store.ts` and `indexing/types.ts`
2. **Lifecycle state machine**: Centralize scattered state transition logic into a single validation module
3. **embeddings.ts bridge cleanup**: Remove dead legacy embedding provider code superseded by `ai/providers.ts`
4. **pre-review LangChain de-wrapper**: Remove meaningless LangChain RunnableLambda/Document wrapping

All are low risk, no behavioral change, purely structural.

---

## Part A: Type Deduplication

### Problem

Two interfaces are defined identically in two locations:

| Interface | Location A | Location B |
|-----------|-----------|-----------|
| `AdapterSyncState` | `store.ts:170-181` | `indexing/types.ts:53-64` |
| `KnowledgeIndexStateRecord` | `store.ts:187-198` | `indexing/types.ts:85-96` |

### Current Definitions

**`AdapterSyncState`** (identical in both files):
```typescript
export interface AdapterSyncState {
  status: 'pending' | 'synced' | 'failed';
  revision: number;
  contentHash: string;
  lastSyncedAt: string | null;
  lastError: string | null;
}
```

**`KnowledgeIndexStateRecord`** (identical in both files):
```typescript
export interface KnowledgeIndexStateRecord {
  contentHash: string;
  normalizedAt: string;
  vector: AdapterSyncState;
  keyword: AdapterSyncState;
  graph: AdapterSyncState;
}
```

### Consumers

Files that import these types from `store.ts`:
- `lib/indexing/pipeline.ts` — uses `KnowledgeIndexStateRecord` (via StoreData)
- `lib/indexing/reconcile.ts` — reads `entry.indexState` (KnowledgeIndexStateRecord on KnowledgeRecord)
- `lib/indexing/adapters/*.ts` — adapter sync results feed into indexState
- `lib/persistence/backfill-indexes.ts` — reads indexState from snapshot

Files that import from `indexing/types.ts`:
- `lib/context.ts:6` — `import type { IndexAdapter } from './indexing/types.js'`
- `lib/persistence/backfill-indexes.ts:18-20` — `buildHybridIndexAdapters`, `IndexSyncResult`
- `lib/retrieval/graph-extract.ts` — `NormalizedIndexDocument`
- `lib/retrieval/plan-compiler.ts` — graph-lite documents

### Recommended Canonical Location

`indexing/types.ts` is the better canonical home because:
- It also defines `NormalizedIndexDocument`, `IndexAdapter`, `IndexSyncResult` — the full indexing type vocabulary
- `store.ts` already imports from `@trapmap/contracts` and other modules; adding an import from `indexing/types.ts` is natural
- `store.ts` is a data aggregate file (~700 lines), reducing its type surface is desirable

### Migration Plan

1. Keep definitions in `indexing/types.ts`, remove from `store.ts`
2. Add `import type { AdapterSyncState, KnowledgeIndexStateRecord } from './indexing/types.js'` to `store.ts`
3. Verify all consumers still compile (they already import from one or the other, not both)

### Additional Type: `KeywordAdapterSyncState`

`indexing/types.ts:70-80` defines `KeywordAdapterSyncState extends AdapterSyncState`. This has no duplicate — stays in `indexing/types.ts`.

---

## Part B: Lifecycle State Machine Centralization

### Problem

`LifecycleState` has 7 states defined in `contracts/src/domain/common.ts:37-45`:

```
draft | submitted | agent-pass | agent-rejected | approved | rejected | deactivated
```

State transitions are validated inconsistently across 12 locations. Most transitions have **zero** validation of the current state before assignment.

### Complete Transition Map (Current Behavior)

| # | From | To | Trigger | Location | Validates From-State? |
|---|------|----|---------|----------|-----------------------|
| 1 | (new) | submitted/agent-pass/agent-rejected | Create entry | `knowledge.ts:238,252` | N/A (new) |
| 2 | rejected/agent-rejected | agent-pass/agent-rejected | Resubmit | `knowledge.ts:334` | **YES** (`routes/knowledge.ts:177-179`) |
| 3 | agent-pass | approved/rejected | Human review | `knowledge.ts:407` | **NO** |
| 4 | any | deactivated | Admin deactivate | `operations.ts:215` | **NO** |
| 5 | approved | deactivated | Batch deactivate | `decay/batch.ts:339` | **YES** (`batch.ts:107-118`) |
| 6 | approved | (no lifecycle change) | Supersede | `decay/supersede.ts:70-77` | **YES** (both must be approved) |
| 7 | (new) | agent-pass | Candidate publish | `candidates/reconcile.ts:215,327` | N/A (new) |
| 8 | agent-pass | approved/rejected | Artifact review | `operations.ts:1473` | **NO** |
| 9 | any | deactivated | Artifact deactivate | `operations.ts:1592` | **NO** |
| 10 | approved | agent-pass/agent-rejected | Artifact edit (re-review) | `artifacts/model.ts:395` | **NO** |

**Result: 3 out of 10 transitions validate the current state.**

### All Sites With Direct `lifecycleState =` Assignment

Production code (non-test):

| File | Line | Assignment |
|------|------|-----------|
| `lib/knowledge.ts` | 238 | `lifecycleState: args.preReview.status` (create) |
| `lib/knowledge.ts` | 252 | `lifecycleState: args.preReview.status` (create return) |
| `lib/knowledge.ts` | 334 | `args.entry.lifecycleState = args.preReview.status` (resubmit) |
| `lib/knowledge.ts` | 407 | `args.entry.lifecycleState = args.decision === 'approve' ? 'approved' : 'rejected'` |
| `lib/knowledge.ts` | 447 | `latestSubmission.lifecycleState = args.entry.lifecycleState` (mirror) |
| `lib/decay/batch.ts` | 339 | `entry.lifecycleState = 'deactivated'` |
| `lib/artifacts/model.ts` | 395-396 | `args.artifact.lifecycleState = args.preReview.status === 'agent-pass' ? 'agent-pass' : 'agent-rejected'` |
| `lib/artifacts/edit.ts` | 330 | `const lifecycleState = agentReviewEvent?.state ?? 'agent-pass'` |
| `routes/operations.ts` | 215 | `entry.lifecycleState = 'deactivated'` |
| `routes/operations.ts` | 1473 | `artifact.lifecycleState = body.decision === 'approve' ? 'approved' : 'rejected'` |
| `routes/operations.ts` | 1592 | `artifact.lifecycleState = 'deactivated'` |

### Intended Transition Graph

```
(new) ──create──→ submitted / agent-pass / agent-rejected
                                         │
                   agent-pass ──review──→ approved / rejected
                                         │
                   rejected ──resubmit──→ agent-pass / agent-rejected
                                         │
                   approved ──deactivate──→ deactivated
                   approved ──edit+re-review──→ agent-pass / agent-rejected
```

### Recommended Design

Create `lib/lifecycle/state-machine.ts`:

```typescript
// Transition map: from-state → set of allowed to-states
const ALLOWED_TRANSITIONS: Record<LifecycleState, Set<LifecycleState>> = {
  'draft':          new Set(['submitted']),
  'submitted':      new Set(['agent-pass', 'agent-rejected']),
  'agent-pass':     new Set(['approved', 'rejected', 'deactivated']),
  'agent-rejected': new Set(['agent-pass', 'rejected', 'deactivated']),
  'approved':       new Set(['deactivated', 'agent-pass', 'agent-rejected']),
  'rejected':       new Set(['agent-pass', 'agent-rejected', 'deactivated']),
  'deactivated':    new Set(), // terminal
};

function transitionLifecycleState(
  entry: { lifecycleState: LifecycleState },
  nextState: LifecycleState,
  context: string, // for error messages
): void { ... }
```

Then replace all direct `entry.lifecycleState = ...` calls with `transitionLifecycleState(entry, newState, context)`.

### Note: `draft` State

`draft` is defined in the LifecycleState enum but never used in current code. New entries go directly to `submitted`, `agent-pass`, or `agent-rejected`. The state machine should still define `draft → submitted` for future use but it's not exercised today.

### Relationship to Existing Decay State Machine

`lib/decay/state-machine.ts` handles a **separate concern**: `DecayState` (active/review-due/stale/expired/superseded). This is computed from timestamps and metadata, not from explicit transitions. The two state machines don't interact directly — decay reads `lifecycleState` (filters on `approved`) but never mutates it.

---

## Part C: embeddings.ts Legacy Bridge Cleanup

### Problem

`embeddings.ts` contains a complete duplicate of the AI provider layer that was superseded by `ai/providers.ts`. At runtime the legacy code is never reached because `app.ts:130` sets a `globalProvider` that takes priority.

### Current Architecture

```
app.ts:130  →  setGlobalEmbeddingsProvider(app.skillShareer.ai.embeddings)
embeddings.ts:170-175  →  generateEmbedding() checks globalProvider first
                            ↓ (always set at startup, so never falls through)
embeddings.ts:143-164  →  getEmbeddingsAdapter() → OpenAIEmbeddings / FallbackEmbeddings (DEAD CODE)
```

### Duplicated Code

| Class | embeddings.ts | ai/providers.ts |
|-------|--------------|-----------------|
| `FallbackEmbeddings` | L35-100 (100% identical algorithm) | L56-99 |
| `OpenAIEmbeddings` | L106-137 (hardcoded model, env-var-only) | L18-50 (config-driven, provider-aware) |
| `getEmbeddingsAdapter()` | L143-164 (cached singleton factory) | Superseded by `createAiProviders()` |

### Consumers of `embeddings.ts` exports

| Export | Consumers |
|--------|-----------|
| `generateEmbedding` | `indexing/adapters/vector.ts`, `indexing/adapters/pg-vector.ts`, `retrieval/recall/semantic.ts`, `retrieval/recall/pg-vector.ts`, `retrieval/orchestrator.ts`, `candidates/pg-detector.ts` |
| `hashEmbeddingText` | `retrieval/recall/semantic.ts`, `retrieval/orchestrator.ts` |
| `setGlobalEmbeddingsProvider` | `app.ts` (sole caller) |

### Migration Plan

1. Remove from `embeddings.ts`:
   - `FallbackEmbeddings` class (L35-100)
   - `OpenAIEmbeddings` class (L106-137)
   - `getEmbeddingsAdapter()` function (L143-164)
   - `cachedAdapter` variable (L143)
   - `EmbeddingsAdapter` interface (L5-9, superseded by `EmbeddingsProvider` from `ai/types.ts`)
2. Keep in `embeddings.ts`:
   - `setGlobalEmbeddingsProvider()` — still needed as the bridge from `app.ts`
   - `generateEmbedding()` — 6 consumers, simplifies to just `globalProvider.embed(text)`
   - `hashEmbeddingText()` — 2 consumers, pure utility, no provider dependency
3. Add a guard: `generateEmbedding()` throws if `globalProvider` is null (instead of silently falling through to dead code)

### Risk

Very low. At runtime `globalProvider` is always set before any embedding call. The removed code is unreachable in production.

---

## Part D: pre-review LangChain De-wrapper

### Problem

`pre-review.ts` uses two LangChain imports (`RunnableLambda`, `Document`) that provide zero value:

```typescript
// L1-2: Only usage of these imports in the entire codebase
import { Document } from '@langchain/core/documents';
import { RunnableLambda } from '@langchain/core/runnables';

// L88: Wraps a plain async function in a LangChain Runnable
const preReviewChain = RunnableLambda.from(async (input: PreReviewInput) => {
  // ...
  const submissionDocument = new Document({ pageContent, metadata }); // L90-96
  // Document is only used as { pageContent, metadata } — a plain object would work
});

// L163-165: Only call site
export async function runPreReview(input: PreReviewInput) {
  return preReviewChain.invoke(input); // just calls the async function
}
```

No chaining, no streaming, no callbacks, no LangChain features are used. The Runnable wrapper adds a stack frame and imports `@langchain/core/runnables` + `@langchain/core/documents` for no benefit.

### Migration Plan

1. Remove imports of `Document` and `RunnableLambda`
2. Replace `Document({ pageContent, metadata })` with plain `{ pageContent, metadata }` (the function only accesses `.pageContent`)
3. Inline the async function as `runPreReview` directly — delete `preReviewChain` wrapper
4. After this change, `pre-review.ts` has zero LangChain imports. Combined with Part C cleanup, evaluate whether `@langchain/core` and `@langchain/openai` imports can be further reduced (they're still used in `ai/providers.ts` and `embeddings.ts` Part C removal target)

### Impact on LangChain Dependencies

After Parts C + D:
- `@langchain/core/runnables` — **fully removed** (only used in pre-review.ts)
- `@langchain/core/documents` — **fully removed** (only used in pre-review.ts)
- `@langchain/core/messages` — still needed by `ai/providers.ts:140` (SystemMessage, HumanMessage)
- `@langchain/openai` — still needed by `ai/providers.ts` (ChatOpenAI, OpenAIEmbeddings)

The `@langchain/core` and `@langchain/openai` packages remain as dependencies (used by `ai/providers.ts`), but two sub-imports are eliminated.

---

## Scope Boundaries

### In Scope
- **Part A**: Deduplicate `AdapterSyncState` and `KnowledgeIndexStateRecord`
- **Part B**: Create centralized lifecycle transition validation; replace direct assignments
- **Part C**: Remove dead legacy embedding providers from `embeddings.ts`
- **Part D**: Remove LangChain RunnableLambda/Document wrapping from `pre-review.ts`
- Update all affected tests

### Out of Scope
- JSONB snapshot decomposition (backlog)
- Full LangChain → openai SDK replacement (backlog — `ai/providers.ts` still uses LangChain)
- CLI RBAC decoupling (not needed)
- Changing the set of valid lifecycle states or adding new states
- Modifying the decay state machine
- Any behavioral change — this is purely structural

### Estimated Touch Points

| Part | Files Changed | New Files | Risk |
|------|--------------|-----------|------|
| A | 2 (store.ts, indexing/types.ts) | 0 | Very low |
| B | 1 new + 6-7 consumers | 1 (lifecycle/state-machine.ts) | Low |
| C | 1 (embeddings.ts) | 0 | Very low |
| D | 1 (pre-review.ts) | 0 | Very low |
