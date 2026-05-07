# Phase 102: IndexAdapter Generalization and Retrieval Plugin - Pattern Map

**Mapped:** 2026-05-07
**Files analyzed:** 17 (6 new, 11 modified)
**Analogs found:** 14 / 17

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/server/src/lib/indexing/registry.ts` | utility | transform | `packages/server/src/lib/indexing/adapters/vector.ts` (interface shape) | role-match |
| `packages/server/src/lib/indexing/types.ts` | model | transform | (self — modify in place) | exact |
| `packages/server/src/lib/indexing/adapters/index.ts` | config | transform | (self — modify in place) | exact |
| `packages/server/src/lib/indexing/pipeline.ts` | service | CRUD | (self — modify in place) | exact |
| `packages/server/src/lib/indexing/events.ts` | service | event-driven | (self — modify in place) | exact |
| `packages/server/src/lib/retrieval/channel-registry.ts` | utility | transform | `packages/server/src/lib/indexing/registry.ts` (new, same pattern) | exact |
| `packages/server/src/lib/retrieval/strategy-registry.ts` | utility | transform | `packages/server/src/lib/indexing/registry.ts` (new, same pattern) | exact |
| `packages/server/src/lib/retrieval/types.ts` | model | transform | (self — modify in place) | exact |
| `packages/server/src/lib/retrieval/recall/semantic.ts` | service | request-response | (self — modify in place) | exact |
| `packages/server/src/lib/retrieval/recall/keyword.ts` | service | request-response | (self — modify in place) | exact |
| `packages/server/src/lib/retrieval/recall/graph-assisted.ts` | service | request-response | (self — modify in place) | exact |
| `packages/server/src/lib/retrieval/recall-coordinator.ts` | controller | request-response | (self — modify in place) | exact |
| `packages/server/src/lib/retrieval/routing.ts` | controller | request-response | (self — modify in place) | exact |
| `packages/server/src/lib/retrieval/merge.ts` | service | transform | (self — modify in place) | exact |
| `packages/server/src/lib/indexing/registry.test.ts` | test | -- | `packages/server/src/lib/retrieval/merge.test.ts` | role-match |
| `packages/server/src/lib/retrieval/channel-registry.test.ts` | test | -- | `packages/server/src/lib/retrieval/merge.test.ts` | role-match |
| `packages/server/src/lib/retrieval/strategy-registry.test.ts` | test | -- | `packages/server/src/lib/retrieval/merge.test.ts` | role-match |

## Pattern Assignments

### `packages/server/src/lib/indexing/registry.ts` (utility, transform) — NEW

**Analog:** `packages/server/src/lib/indexing/adapters/vector.ts` (for IndexAdapter interface shape)

No existing registry pattern in codebase. This is the first registry module. Pattern is a typed `Map<string, T>` wrapper.

**Imports pattern** (follow project convention from `packages/server/src/lib/indexing/types.ts` lines 1-11):
```typescript
import type { IndexAdapter } from './types.js';
```

**Core pattern** — Map-based registry with duplicate detection:
```typescript
export class AdapterRegistry {
  private readonly adapters = new Map<string, IndexAdapter>();

  register(adapter: IndexAdapter): void {
    if (this.adapters.has(adapter.kind)) {
      throw new Error(`Adapter '${adapter.kind}' is already registered`);
    }
    this.adapters.set(adapter.kind, adapter);
  }

  get(kind: string): IndexAdapter | undefined {
    return this.adapters.get(kind);
  }

  all(): IndexAdapter[] {
    return Array.from(this.adapters.values());
  }

  kinds(): string[] {
    return Array.from(this.adapters.keys());
  }

  has(kind: string): boolean {
    return this.adapters.has(kind);
  }
}
```

**Key constraint:** Map preserves insertion order (ECMAScript spec), so adapter execution order matches registration order. This preserves the current sequential semantics of the pipeline.

---

### `packages/server/src/lib/indexing/types.ts` (model, transform) — MODIFY

**Current state** (lines 85-96, 148-161):

```typescript
// Current KnowledgeIndexStateRecord — hardcoded fields
export interface KnowledgeIndexStateRecord {
  contentHash: string;
  normalizedAt: string;
  vector: AdapterSyncState;     // hardcoded
  keyword: AdapterSyncState;    // hardcoded
  graph: AdapterSyncState;      // hardcoded
}

// Current IndexAdapter.kind — fixed union
export interface IndexAdapter {
  kind: 'vector' | 'keyword' | 'graph';  // fixed union
  sync(document: NormalizedIndexDocument): Promise<IndexSyncResult>;
  remove(ref: { entryId: string; revision: number }): Promise<void>;
}
```

**Target state:**
```typescript
export interface KnowledgeIndexStateRecord {
  contentHash: string;
  normalizedAt: string;
  /** Dynamic adapter states keyed by adapter.kind */
  adapters: Record<string, AdapterSyncState>;
  // Backward-compat aliases (deprecated, will be removed)
  /** @deprecated Use adapters['vector'] */
  vector?: AdapterSyncState;
  /** @deprecated Use adapters['keyword'] */
  keyword?: AdapterSyncState;
  /** @deprecated Use adapters['graph'] */
  graph?: AdapterSyncState;
}

export interface IndexAdapter {
  kind: string;  // was: 'vector' | 'keyword' | 'graph'
  sync(document: NormalizedIndexDocument): Promise<IndexSyncResult>;
  remove(ref: { entryId: string; revision: number }): Promise<void>;
}
```

**Also modify** `IndexSyncResult.adapterKind` (line 103):
```typescript
// Current
adapterKind: 'vector' | 'keyword' | 'graph';
// Target
adapterKind: string;
```

**Migration concern:** Existing JSON store files have `{ vector: {...}, keyword: {...}, graph: {...} }` as top-level fields on indexState. A migration function is needed in the store read path. See Pitfall 1 in RESEARCH.md.

---

### `packages/server/src/lib/indexing/adapters/index.ts` (config, transform) — MODIFY

**Current state** (lines 67-69, 82-114):
```typescript
export function buildDefaultIndexAdapters(): IndexAdapter[] {
  return [vectorIndexAdapter, keywordIndexAdapter, graphIndexAdapter];
}

export function buildHybridIndexAdapters(config?: { ... }): IndexAdapter[] {
  // ... builds array with conditional pg adapters
}
```

**Target state** — return AdapterRegistry instead of array:
```typescript
import { AdapterRegistry } from '../registry.js';

export function buildDefaultAdapterRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry();
  registry.register(vectorIndexAdapter);
  registry.register(keywordIndexAdapter);
  registry.register(graphIndexAdapter);
  return registry;
}

export function buildHybridAdapterRegistry(config?: { ... }): AdapterRegistry {
  const registry = new AdapterRegistry();
  // ... conditional registration of pg vs in-memory adapters
  return registry;
}
```

**Keep old functions** as deprecated wrappers for backward compatibility during migration.

---

### `packages/server/src/lib/indexing/pipeline.ts` (service, CRUD) — MODIFY

**Current state** — `syncKnowledgeIndex` (lines 122-226):

Key sections to modify:

**Function signature** (line 122-126):
```typescript
// Current
export async function syncKnowledgeIndex(
  services: { store: SkillShareerStore; data: StoreData },
  entryId: string,
  adapters: IndexAdapter[],
): Promise<void>

// Target
export async function syncKnowledgeIndex(
  services: { store: SkillShareerStore; data: StoreData },
  entryId: string,
  registry: AdapterRegistry,
): Promise<void>
```

**Adapter iteration** (line 164-211):
```typescript
// Current — hardcoded array iteration with adapterKinds literal
const adapterKinds = ['vector', 'keyword', 'graph'] as const;
for (const adapter of adapters) {
  const adapterKind = adapter.kind;
  const currentState = entry.indexState[adapterKind];
  // ...
}

// Target — registry iteration with dynamic state access
for (const adapter of registry.all()) {
  const adapterKind = adapter.kind;
  const currentState = entry.indexState.adapters[adapterKind];
  // ...
}
```

**initializeIndexState** (lines 42-56):
```typescript
// Current — hardcoded three fields
function initializeIndexState(normalizedDocument): KnowledgeIndexStateRecord {
  return {
    contentHash: normalizedDocument.contentHash,
    normalizedAt: normalizedDocument.normalizedAt,
    vector: initializeAdapterState(),
    keyword: initializeAdapterState(),
    graph: initializeAdapterState(),
  };
}

// Target — dynamic from registry
function initializeIndexState(
  normalizedDocument: NormalizedIndexDocument,
  registry: AdapterRegistry,
): KnowledgeIndexStateRecord {
  const adapters: Record<string, AdapterSyncState> = {};
  for (const kind of registry.kinds()) {
    adapters[kind] = initializeAdapterState();
  }
  return {
    contentHash: normalizedDocument.contentHash,
    normalizedAt: normalizedDocument.normalizedAt,
    adapters,
  };
}
```

**reconcileKnowledgeIndexes** (lines 243-336) — same pattern: change `adapters: IndexAdapter[]` to `registry: AdapterRegistry`, update `needsSync` calls to use `entry.indexState.adapters[kind]`.

---

### `packages/server/src/lib/indexing/events.ts` (service, event-driven) — MODIFY

**Current state** (lines 14-16):
```typescript
import type { IndexAdapter } from './types.js';
```

The `runKnowledgeIndexEvent` function accepts `adapters: IndexAdapter[]` and passes it to `syncKnowledgeIndex`. Change to accept `AdapterRegistry` and pass through.

---

### `packages/server/src/lib/retrieval/channel-registry.ts` (utility, transform) — NEW

**Analog:** `packages/server/src/lib/indexing/registry.ts` (same Map-based pattern)

**Imports pattern:**
```typescript
import type { KnowledgeRecord } from '../store.js';
import type { RecallCandidate } from './types.js';
```

**Core pattern:**
```typescript
export interface RecallChannel {
  readonly name: string;
  recall(queryText: string, entries: KnowledgeRecord[]): Promise<RecallCandidate[]>;
}

export class ChannelRegistry {
  private readonly channels = new Map<string, RecallChannel>();

  register(channel: RecallChannel): void {
    if (this.channels.has(channel.name)) {
      throw new Error(`Channel '${channel.name}' is already registered`);
    }
    this.channels.set(channel.name, channel);
  }

  get(name: string): RecallChannel | undefined {
    return this.channels.get(name);
  }

  all(): RecallChannel[] {
    return Array.from(this.channels.values());
  }
}
```

**Note on RecallChannel interface:** The three existing recall functions have different signatures (see Pitfall 5 in RESEARCH.md). The `RecallChannel.recall` interface uses a minimal common signature. Each implementation wraps the existing function and extracts what it needs from the arguments. A `RecallContext` with optional fields may be needed:
```typescript
export interface RecallContext {
  services?: SkillShareerServices;
  auth?: ResolvedAuthContext;
  dataSnapshot?: StoreData;
}
```

---

### `packages/server/src/lib/retrieval/strategy-registry.ts` (utility, transform) — NEW

**Analog:** `packages/server/src/lib/indexing/registry.ts` (same Map-based pattern)

**Imports pattern:**
```typescript
import type { RetrievalQuery } from '@trapmap/contracts';
import type { KnowledgeRecord } from '../store.js';
import type { ChannelRegistry } from './channel-registry.js';
import type { MergedCandidate, ScoredEntry } from './types.js';
```

**Core pattern:**
```typescript
export interface RetrievalStrategy {
  readonly version: string;
  execute(
    query: RetrievalQuery,
    channels: ChannelRegistry,
    eligibleEntries: KnowledgeRecord[],
  ): Promise<{ scoredEntries: ScoredEntry[]; mergedCandidates?: MergedCandidate[] }>;
}

export class StrategyRegistry {
  private readonly strategies = new Map<string, RetrievalStrategy>();

  register(strategy: RetrievalStrategy): void {
    this.strategies.set(strategy.version, strategy);
  }

  get(version: string): RetrievalStrategy | undefined {
    return this.strategies.get(version);
  }

  all(): RetrievalStrategy[] {
    return Array.from(this.strategies.values());
  }
}
```

---

### `packages/server/src/lib/retrieval/types.ts` (model, transform) — MODIFY

**Current state:**

`RecallChannel` (line 71):
```typescript
export type RecallChannel = 'semantic' | 'keyword' | 'graph';
```

`MergedCandidate` (lines 103-128):
```typescript
export interface MergedCandidate {
  entry: KnowledgeRecord;
  semanticScore: number;      // hardcoded
  keywordScore: number;       // hardcoded
  graphScore?: number;        // hardcoded
  combinedScore: number;
  tokenMatches: TokenMatchDetail[];
  channels: RecallChannel[];
  preRerankScore: number;
  finalScore: number;
  // ... boundary fields
}
```

**Target state:**
```typescript
// RecallChannel becomes string (or keep as type alias for clarity)
export type RecallChannel = string;

export interface MergedCandidate {
  entry: KnowledgeRecord;
  semanticScore: number;      // keep for backward compat
  keywordScore: number;       // keep for backward compat
  graphScore?: number;        // keep for backward compat
  /** Generic channel scores for extensibility */
  channelScores: Record<string, number>;  // NEW
  combinedScore: number;
  tokenMatches: TokenMatchDetail[];
  channels: RecallChannel[];
  preRerankScore: number;
  finalScore: number;
  // ... boundary fields unchanged
}
```

**Also update** `RoutingChannel` (line 224):
```typescript
// Current
export type RoutingChannel = RecallChannel | 'capsule' | 'profile' | 'plan';
// Target — RecallChannel is now string, so RoutingChannel is effectively string
export type RoutingChannel = string;
```

---

### `packages/server/src/lib/retrieval/recall/semantic.ts` (service, request-response) — MODIFY

**Current exports** (lines 14-60):
```typescript
export function buildEmbeddingText(entry: KnowledgeRecord): string { ... }
export function cosineSimilarity(a: number[], b: number[]): number { ... }
export async function getQueryEmbedding(seed: string): Promise<number[]> { ... }
export async function optimizedSemanticRecall(...): Promise<{ scoredEntries: ... }> { ... }
```

**Target:** Wrap as a `RecallChannel` implementation:
```typescript
import type { RecallChannel } from '../channel-registry.js';

export const semanticChannel: RecallChannel = {
  name: 'semantic',
  async recall(queryText, entries) {
    const queryVector = await getQueryEmbedding(queryText);
    const { scoredEntries } = await optimizedSemanticRecall(queryVector, entries, undefined);
    return scoredEntries.map(({ entry, score }) => ({
      entry,
      channel: 'semantic',
      score,
      tokenMatches: [],
    }));
  },
};
```

Keep existing functions exported for direct use in `recall-coordinator.ts` during migration.

---

### `packages/server/src/lib/retrieval/recall/keyword.ts` (service, request-response) — MODIFY

**Current exports** (lines 22-50):
```typescript
export function tokenize(text: string): string[] { ... }
export function normalizeQuery(query: string): string[] { ... }
export async function keywordRecall(queryText, entries): Promise<RecallCandidate[]> { ... }
```

**Target:** Wrap as a `RecallChannel` implementation:
```typescript
import type { RecallChannel } from '../channel-registry.js';

export const keywordChannel: RecallChannel = {
  name: 'keyword',
  async recall(queryText, entries) {
    return keywordRecall(queryText, entries);
  },
};
```

---

### `packages/server/src/lib/retrieval/recall/graph-assisted.ts` (service, request-response) — MODIFY

**Current signature:**
```typescript
export async function graphAssistedRecall(
  queryText: string,
  entriesMap: Map<string, KnowledgeRecord>,
  config?: GraphScoringConfig,
): Promise<RecallCandidate[]>
```

**Target:** Wrap as a `RecallChannel`:
```typescript
import type { RecallChannel } from '../channel-registry.js';

export const graphChannel: RecallChannel = {
  name: 'graph',
  async recall(queryText, entries) {
    const entriesMap = new Map(entries.map((e) => [e.id, e]));
    return graphAssistedRecall(queryText, entriesMap);
  },
};
```

---

### `packages/server/src/lib/retrieval/recall-coordinator.ts` (controller, request-response) — MODIFY

**Current state** — `dispatchByMode` (lines 72-94):
```typescript
export async function dispatchByMode(
  mode: string,
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
  services?: SkillShareerServices,
  auth?: ResolvedAuthContext,
): Promise<{ scoredEntries: ScoredEntry[]; mergedCandidates?: MergedCandidate[] }> {
  switch (mode) {
    case 'semantic':
      return await semanticRecall(seed, eligibleEntries, parsed, services, auth);
    case 'hybrid':
      return await hybridRecall(seed, eligibleEntries, parsed, services, auth);
    case 'graph-assisted':
      return await graphAssistedRecall(seed, eligibleEntries, parsed);
    default:
      throw new AppError(400, 'invalid_mode', `Invalid query mode: ${mode}. ...`);
  }
}
```

**Target** — strategy registry lookup:
```typescript
export async function dispatchByMode(
  mode: string,
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
  strategyRegistry: StrategyRegistry,
  channelRegistry: ChannelRegistry,
  services?: SkillShareerServices,
  auth?: ResolvedAuthContext,
): Promise<{ scoredEntries: ScoredEntry[]; mergedCandidates?: MergedCandidate[] }> {
  const strategy = strategyRegistry.get(mode);
  if (!strategy) {
    throw new AppError(400, 'invalid_mode', `Invalid query mode: ${mode}. ...`);
  }
  return strategy.execute(parsed, channelRegistry, eligibleEntries, services, auth);
}
```

The existing `semanticRecall`, `hybridRecall`, `graphAssistedRecall` functions remain as implementation details, wrapped by strategy objects.

---

### `packages/server/src/lib/retrieval/routing.ts` (controller, request-response) — MODIFY

**Current state** — `selectRetrievalStrategy` (lines 64-81):
```typescript
export function selectRetrievalStrategy(requestedMode: string, seed: string): RetrievalDecision {
  const strategy = V1_MODE_TO_STRATEGY[requestedMode] ?? 'local';
  const channelsPlanned = getV1ChannelsPlanned(requestedMode);
  // ...
}
```

This file maps public modes to internal strategies. With a StrategyRegistry, the mapping can be driven by the registry. However, the routing logic is about *selecting* which strategy to use, not executing it. The routing file can remain largely unchanged — it just needs to be aware that strategy versions are now dynamic strings rather than a fixed set.

**Minimal change:** Update `V1_MODE_TO_STRATEGY` to accept dynamic strategy keys, or keep the mapping table and validate against the registry at startup.

---

### `packages/server/src/lib/retrieval/merge.ts` (service, transform) — MODIFY

**Current state** — `mergeCandidates` (lines 58-138):
```typescript
export function mergeCandidates(
  semanticCandidates: RecallCandidate[],
  keywordCandidates: RecallCandidate[],
  config?: MergeConfig,
): MergedCandidate[] {
  // Builds MergedCandidate with hardcoded semanticScore/keywordScore fields
}
```

**Target** — add `channelScores` map alongside named fields:
```typescript
// In the merged candidate construction:
mergedMap.set(entryId, {
  entry: candidate.entry,
  semanticScore: candidate.score,
  keywordScore: 0,
  graphScore: 0,
  channelScores: { semantic: candidate.score },  // NEW
  combinedScore,
  // ... rest unchanged
});
```

**Also update** `mergeCandidatesWithGraph` in `recall-coordinator.ts` (lines 348-386) to populate `channelScores`.

---

### Test Files — NEW

**Analog:** `packages/server/src/lib/retrieval/merge.test.ts` (lines 1-60)

**Test pattern:**
```typescript
import { describe, expect, it } from 'vitest';

describe('AdapterRegistry', () => {
  it('registers and retrieves adapters by kind', () => {
    const registry = new AdapterRegistry();
    const mockAdapter = { kind: 'test', sync: vi.fn(), remove: vi.fn() };
    registry.register(mockAdapter);
    expect(registry.get('test')).toBe(mockAdapter);
  });

  it('throws on duplicate registration', () => {
    const registry = new AdapterRegistry();
    const mockAdapter = { kind: 'test', sync: vi.fn(), remove: vi.fn() };
    registry.register(mockAdapter);
    expect(() => registry.register(mockAdapter)).toThrow("already registered");
  });

  it('preserves insertion order in all()', () => {
    // ...
  });
});
```

Same pattern for `channel-registry.test.ts` and `strategy-registry.test.ts`.

---

## Shared Patterns

### Registry Pattern (Map-based)
**Source:** New — `packages/server/src/lib/indexing/registry.ts`
**Apply to:** All three registry files (AdapterRegistry, ChannelRegistry, StrategyRegistry)

All three registries follow the identical pattern:
- Private `Map<string, T>` field
- `register(item)` with duplicate detection via `Map.has()`
- `get(key)` returning `T | undefined`
- `all()` returning `T[]` via `Array.from(map.values())`
- Optional `has(key)` and `keys()` helpers

### Import Convention
**Source:** `packages/server/src/lib/indexing/types.ts` lines 1-11
**Apply to:** All new files

```typescript
import type { SomeType } from './types.js';  // relative .js extension
import type { SomeType } from '@trapmap/contracts';  // package import
```

Project uses `.js` extensions in relative imports (TypeScript ESM convention).

### Test Pattern
**Source:** `packages/server/src/lib/retrieval/merge.test.ts` lines 1-25
**Apply to:** All new test files

```typescript
import { describe, expect, it, vi } from 'vitest';
// vi.fn() for mocks, describe/it/expect for assertions
// Helper functions at top of file for test data construction
```

### Error Handling
**Source:** `packages/server/src/lib/retrieval/recall-coordinator.ts` lines 88-93
**Apply to:** StrategyRegistry lookup failures

```typescript
import { AppError } from '../errors.js';
throw new AppError(400, 'invalid_mode', `Invalid query mode: ${mode}`);
```

### Backward Compatibility Pattern
**Source:** `packages/server/src/lib/retrieval/types.ts` lines 103-128 (MergedCandidate)
**Apply to:** KnowledgeIndexStateRecord migration

Keep deprecated fields as optional (`field?: Type`) with `@deprecated` JSDoc. New code uses the dynamic alternative. Old code continues to work until deprecated fields are removed in a future phase.

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `packages/server/src/lib/indexing/registry.ts` | utility | transform | No registry pattern exists in codebase — this is the first |
| `packages/server/src/lib/retrieval/channel-registry.ts` | utility | transform | Same — first registry in retrieval subsystem |
| `packages/server/src/lib/retrieval/strategy-registry.ts` | utility | transform | Same — first registry in retrieval subsystem |

All three registry files follow the same pattern described in RESEARCH.md Pattern 1/2/3. The codebase has no prior registry implementation to copy from.

## Metadata

**Analog search scope:** `packages/server/src/lib/indexing/`, `packages/server/src/lib/retrieval/`, `packages/contracts/src/domain/`
**Files scanned:** 45
**Pattern extraction date:** 2026-05-07
