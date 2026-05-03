# Phase 60 Patterns: Type Consolidation, Lifecycle State Machine & Legacy Layers

## Part A: Type Deduplication Pattern

### Current State (Duplication)

Both files define identical interfaces:

**`packages/server/src/lib/store.ts:170-198`**:
```typescript
export interface AdapterSyncState {
  status: 'pending' | 'synced' | 'failed';
  revision: number;
  contentHash: string;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface KnowledgeIndexStateRecord {
  contentHash: string;
  normalizedAt: string;
  vector: AdapterSyncState;
  keyword: AdapterSyncState;
  graph: AdapterSyncState;
}
```

**`packages/server/src/lib/indexing/types.ts:53-96`**:
```typescript
export interface AdapterSyncState {
  status: 'pending' | 'synced' | 'failed';
  revision: number;
  contentHash: string;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface KnowledgeIndexStateRecord {
  contentHash: string;
  normalizedAt: string;
  vector: AdapterSyncState;
  keyword: AdapterSyncState;
  graph: AdapterSyncState;
}
```

### Canonical Location

`indexing/types.ts` is the canonical home because:
1. It defines the full indexing type vocabulary (`NormalizedIndexDocument`, `IndexAdapter`, `IndexSyncResult`, `KeywordAdapterSyncState`)
2. `store.ts` already imports from other modules (`@trapmap/contracts`, `./indexing/graph-lite/documents.js`)
3. Reduces the type surface of `store.ts` (~800 lines)

### Migration Pattern

Follow the existing import pattern in `store.ts`:

```typescript
// In store.ts, replace duplicate definitions with:
import type { AdapterSyncState, KnowledgeIndexStateRecord } from './indexing/types.js';
```

**Analog**: The `GraphIndexDocumentRecord` is already imported from `./indexing/graph-lite/documents.js` in `store.ts:18`:
```typescript
import type { GraphIndexDocumentRecord } from './indexing/graph-lite/documents.js';
```

---

## Part B: Lifecycle State Machine Pattern

### Existing State Machine Analog

**`packages/server/src/lib/decay/state-machine.ts`** provides the pattern:

```typescript
import { type DecayConfig, type DecayState, decayStateSchema } from '@trapmap/contracts';

export interface DecayableEntry {
  lastVerifiedAt: string;
  decayState: DecayState;
  supersededById: string | null;
}

export const DEFAULT_DECAY_CONFIG: DecayConfig = {
  reviewDueDays: 90,
  staleDays: 180,
  expireDays: 365,
  enabled: false,
};

export function computeDecayState(
  entry: DecayableEntry | null,
  config: DecayConfig,
  now: Date = new Date(),
): { decayState: DecayState; decayStateComputedAt: string } {
  // Pure function with injected timestamp for deterministic testing
  // Priority-ordered state transitions
  // ...
}

export function isTerminalDecayState(state: DecayState): boolean {
  return state === 'superseded' || state === 'expired';
}

export function requiresAttention(state: DecayState): boolean {
  return state !== 'active';
}

export function validateDecayConfig(config: DecayConfig): boolean {
  return (
    config.reviewDueDays <= config.staleDays &&
    config.staleDays <= config.expireDays
  );
}
```

### New Lifecycle State Machine Design

Create `packages/server/src/lib/lifecycle/state-machine.ts` following the decay state machine pattern:

```typescript
import { type LifecycleState } from '@trapmap/contracts';

/**
 * Transition map: from-state → set of allowed to-states
 */
const ALLOWED_TRANSITIONS: Record<LifecycleState, Set<LifecycleState>> = {
  'draft':          new Set(['submitted']),
  'submitted':      new Set(['agent-pass', 'agent-rejected']),
  'agent-pass':     new Set(['approved', 'rejected', 'deactivated']),
  'agent-rejected': new Set(['agent-pass', 'rejected', 'deactivated']),
  'approved':       new Set(['deactivated', 'agent-pass', 'agent-rejected']),
  'rejected':       new Set(['agent-pass', 'agent-rejected', 'deactivated']),
  'deactivated':    new Set(), // terminal
};

/**
 * Validate a lifecycle state transition.
 * Returns true if the transition is allowed, false otherwise.
 */
export function isValidTransition(from: LifecycleState, to: LifecycleState): boolean {
  return ALLOWED_TRANSITIONS[from]?.has(to) ?? false;
}

/**
 * Transition an entry to a new lifecycle state.
 * Throws if the transition is invalid.
 */
export function transitionLifecycleState(
  entry: { lifecycleState: LifecycleState },
  nextState: LifecycleState,
  context: string,
): void {
  const current = entry.lifecycleState;
  if (!isValidTransition(current, nextState)) {
    throw new Error(
      `Invalid lifecycle transition: ${current} → ${nextState} (${context})`
    );
  }
  entry.lifecycleState = nextState;
}

/**
 * Check if a state is terminal (no outgoing transitions).
 */
export function isTerminalState(state: LifecycleState): boolean {
  return ALLOWED_TRANSITIONS[state]?.size === 0;
}
```

### Current Direct Assignment Sites

| File | Line | Current Code |
|------|------|--------------|
| `lib/knowledge.ts` | 238 | `lifecycleState: args.preReview.status` |
| `lib/knowledge.ts` | 252 | `lifecycleState: args.preReview.status` |
| `lib/knowledge.ts` | 334 | `args.entry.lifecycleState = args.preReview.status` |
| `lib/knowledge.ts` | 407 | `args.entry.lifecycleState = args.decision === 'approve' ? 'approved' : 'rejected'` |
| `lib/knowledge.ts` | 447 | `latestSubmission.lifecycleState = args.entry.lifecycleState` |
| `lib/decay/batch.ts` | 339 | `entry.lifecycleState = 'deactivated'` |
| `lib/artifacts/model.ts` | 292, 395-396 | `args.artifact.lifecycleState = ...` |
| `routes/operations.ts` | 215 | `entry.lifecycleState = 'deactivated'` |
| `routes/operations.ts` | 1473, 1592 | `artifact.lifecycleState = ...` |

### Migration Pattern for Assignment Sites

**Before** (in `lib/knowledge.ts:407`):
```typescript
args.entry.lifecycleState = args.decision === 'approve' ? 'approved' : 'rejected';
```

**After**:
```typescript
import { transitionLifecycleState } from './lifecycle/state-machine.js';
// ...
transitionLifecycleState(
  args.entry,
  args.decision === 'approve' ? 'approved' : 'rejected',
  'review decision'
);
```

---

## Part C: embeddings.ts Legacy Bridge Cleanup

### Current Duplicated Code

**`packages/server/src/lib/embeddings.ts:35-100`** - `FallbackEmbeddings` class:
```typescript
class FallbackEmbeddings implements EmbeddingsAdapter {
  readonly provider = 'fallback';
  readonly isConfigured = false;
  private readonly dimension = 384;

  async embed(text: string): Promise<number[]> {
    // Token-aware hash vector generation (identical algorithm)
  }
}
```

**`packages/server/src/lib/ai/providers.ts:56-99`** - Identical `FallbackEmbeddings`:
```typescript
export class FallbackEmbeddings implements EmbeddingsProvider {
  readonly provider = 'fallback';
  readonly isConfigured = false;
  private readonly dimension = 384;

  async embed(text: string): Promise<number[]> {
    // Token-aware hash vector generation (identical algorithm)
  }
}
```

### Runtime Flow (Dead Code Path)

```
app.ts:130  →  setGlobalEmbeddingsProvider(app.skillShareer.ai.embeddings)
embeddings.ts:170-175  →  generateEmbedding() checks globalProvider first
                            ↓ (always set at startup, so never falls through)
embeddings.ts:143-164  →  getEmbeddingsAdapter() → OpenAIEmbeddings / FallbackEmbeddings (DEAD CODE)
```

### Removal Pattern

**Before** (`embeddings.ts`):
```typescript
interface EmbeddingsAdapter { ... }
class FallbackEmbeddings implements EmbeddingsAdapter { ... }
class OpenAIEmbeddings implements EmbeddingsAdapter { ... }
let cachedAdapter: EmbeddingsAdapter | null = null;
export async function getEmbeddingsAdapter(): Promise<EmbeddingsAdapter> { ... }
export async function generateEmbedding(text: string): Promise<number[]> {
  if (globalProvider) {
    return globalProvider.embed(text);
  }
  const adapter = await getEmbeddingsAdapter(); // DEAD PATH
  return adapter.embed(text);
}
```

**After** (`embeddings.ts`):
```typescript
import type { EmbeddingsProvider } from './ai/types.js';

let globalProvider: EmbeddingsProvider | null = null;

export function setGlobalEmbeddingsProvider(p: EmbeddingsProvider): void {
  globalProvider = p;
}

export function hashEmbeddingText(text: string): string { ... }

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!globalProvider) {
    throw new Error('Embeddings provider not initialized. Call setGlobalEmbeddingsProvider first.');
  }
  return globalProvider.embed(text);
}
```

### Risk Assessment

Very low. At runtime `globalProvider` is always set before any embedding call (in `app.ts`). The removed code is unreachable in production.

---

## Part D: pre-review.ts LangChain De-wrapper

### Current Wrapping

**`packages/server/src/lib/pre-review.ts:1-2, 88-96, 163-165`**:
```typescript
import { Document } from '@langchain/core/documents';
import { RunnableLambda } from '@langchain/core/runnables';

const preReviewChain = RunnableLambda.from(
  async (input: PreReviewInput): Promise<AgentReviewResult> => {
    const submissionDocument = new Document({
      pageContent: `${input.submission.shortcut}\n${input.submission.detail}`,
      metadata: { labels: input.submission.labels, scope: input.submission.scope },
    });
    // ... only submissionDocument.pageContent is accessed
  },
);

export async function runPreReview(input: PreReviewInput): Promise<AgentReviewResult> {
  return preReviewChain.invoke(input);
}
```

### Why This Is Useless

1. `RunnableLambda.from(fn).invoke(x)` is equivalent to `fn(x)` - no chaining, streaming, or callbacks
2. `Document({ pageContent, metadata })` is only used as `{ pageContent, metadata }` - a plain object would work
3. Only `.pageContent` is accessed from the Document

### Unwrapping Pattern

**Before**:
```typescript
import { Document } from '@langchain/core/documents';
import { RunnableLambda } from '@langchain/core/runnables';

const preReviewChain = RunnableLambda.from(async (input: PreReviewInput) => {
  const submissionDocument = new Document({ pageContent, metadata });
  // ...
});

export async function runPreReview(input: PreReviewInput) {
  return preReviewChain.invoke(input);
}
```

**After**:
```typescript
// No LangChain imports needed

export async function runPreReview(input: PreReviewInput): Promise<AgentReviewResult> {
  const submissionContent = `${input.submission.shortcut}\n${input.submission.detail}`;
  // ... rest of the logic unchanged
}
```

### LangChain Dependency Impact After Parts C + D

| Import | Before | After |
|--------|--------|-------|
| `@langchain/core/runnables` | pre-review.ts | **removed** |
| `@langchain/core/documents` | pre-review.ts | **removed** |
| `@langchain/core/messages` | ai/providers.ts | still needed |
| `@langchain/openai` | ai/providers.ts, embeddings.ts | ai/providers.ts only |

---

## Test Impact

### Part A: Type Deduplication
- No test changes needed - types are identical
- TypeScript compiler validates correctness

### Part B: Lifecycle State Machine
- Add unit tests for `state-machine.ts`:
  - Test all valid transitions
  - Test invalid transitions throw
  - Test terminal state detection
- Existing integration tests should pass unchanged (behavior preserved)

### Part C: embeddings.ts Cleanup
- No test changes needed - same runtime behavior
- FallbackEmbeddings algorithm unchanged (moved, not modified)

### Part D: pre-review.ts De-wrapper
- No test changes needed - same output for same input
- Function remains pure with identical signature

---

## Files to Modify

| File | Part | Action |
|------|------|--------|
| `packages/server/src/lib/store.ts` | A | Remove `AdapterSyncState`, `KnowledgeIndexStateRecord`; add import |
| `packages/server/src/lib/indexing/types.ts` | A | Keep definitions (canonical location) |
| `packages/server/src/lib/lifecycle/state-machine.ts` | B | **NEW FILE** - create lifecycle state machine |
| `packages/server/src/lib/knowledge.ts` | B | Replace direct assignments with state machine calls |
| `packages/server/src/lib/decay/batch.ts` | B | Replace direct assignments with state machine calls |
| `packages/server/src/lib/artifacts/model.ts` | B | Replace direct assignments with state machine calls |
| `packages/server/src/routes/operations.ts` | B | Replace direct assignments with state machine calls |
| `packages/server/src/lib/embeddings.ts` | C | Remove `FallbackEmbeddings`, `OpenAIEmbeddings`, `getEmbeddingsAdapter`, `EmbeddingsAdapter` |
| `packages/server/src/lib/pre-review.ts` | D | Remove `RunnableLambda`, `Document`; inline the function |

---

## Validation Commands

```bash
# Type check after changes
pnpm --filter @trapmap/server tsc --noEmit

# Run all tests
pnpm test

# Check for unused LangChain imports
pnpm --filter @trapmap/server knip
```
