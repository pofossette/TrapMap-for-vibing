# Phase 102: IndexAdapter Generalization and Retrieval Plugin - Research

**Researched:** 2026-05-07
**Domain:** TypeScript registry pattern, plugin architecture, index adapter abstraction
**Confidence:** HIGH

## Summary

This phase generalizes two tightly-coupled subsystems in the TrapMap server: the indexing pipeline's adapter abstraction and the retrieval pipeline's recall channel dispatch. Currently, `IndexAdapter.kind` is a fixed union type `'vector' | 'keyword' | 'graph'`, and `KnowledgeIndexStateRecord` hardcodes three adapter fields (`vector`, `keyword`, `graph`). Adding a new index channel requires modifying type definitions, pipeline logic, and state tracking structures. On the retrieval side, `RecallChannel` is similarly fixed, `MergedCandidate` has hardcoded per-channel score fields, and `dispatchByMode` uses a switch statement for mode dispatch.

The target architecture introduces three registry patterns: an `AdapterRegistry` for indexing adapters, a `ChannelRegistry` for recall channels, and a `StrategyRegistry` for retrieval strategies. Each registry allows dynamic registration of new implementations without modifying core pipeline or orchestrator code. The `KnowledgeIndexStateRecord` changes from fixed fields to `adapters: Record<string, AdapterSyncState>`, enabling any number of adapter sync states.

**Primary recommendation:** Implement the indexing registry and retrieval channel abstraction as two independent sub-phases. The indexing side is lower risk (state migration is the main concern) while the retrieval side requires careful interface design for `RecallChannel` and `RetrievalStrategy`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Adapter registration | API / Backend | -- | Server-side indexing pipeline owns adapter lifecycle |
| Index state persistence | Database / Storage | -- | KnowledgeIndexStateRecord lives in StoreData (JSON) and PostgreSQL |
| Recall channel dispatch | API / Backend | -- | Orchestrator and recall-coordinator own channel selection |
| Strategy versioning | API / Backend | -- | routing.ts owns strategy selection and trace metadata |
| Score normalization | API / Backend | -- | Merge and rerank stages own cross-channel score fusion |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.x (already in project) | Type-safe registry interfaces | Project baseline |
| Zod | (already in @trapmap/contracts) | Runtime validation of registry entries | Project baseline |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None needed | -- | -- | This phase uses only TypeScript interfaces and built-in Map/Set |

**Installation:** No new packages required. This is a pure refactoring phase.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │              INDEXING PIPELINE               │
                    │                                             │
  NormalizedDoc ──► │  AdapterRegistry                            │
                    │    ├── vectorAdapter.sync(doc)              │
                    │    ├── keywordAdapter.sync(doc)             │
                    │    ├── graphAdapter.sync(doc)               │
                    │    └── [newAdapter.sync(doc)]  ◄── EXTENSIBLE│
                    │                                             │
                    │  KnowledgeIndexStateRecord                  │
                    │    └── adapters: Record<string, SyncState>  │
                    └─────────────────────────────────────────────┘

                    ┌─────────────────────────────────────────────┐
                    │            RETRIEVAL PIPELINE                │
                    │                                             │
  Query ──►         │  StrategyRegistry                           │
                    │    ├── V1Strategy.execute(query, channels)  │
                    │    ├── V2Strategy.execute(query, channels)  │
                    │    └── [newStrategy]           ◄── EXTENSIBLE│
                    │                                             │
                    │  ChannelRegistry                            │
                    │    ├── semanticChannel.recall(query, ctx)   │
                    │    ├── keywordChannel.recall(query, ctx)    │
                    │    ├── graphChannel.recall(query, ctx)      │
                    │    └── [newChannel.recall()]   ◄── EXTENSIBLE│
                    │                                             │
                    │  Merge/Rerank (consumes RecallCandidate[])  │
                    └─────────────────────────────────────────────┘
```

### Recommended Project Structure

```
packages/server/src/lib/indexing/
├── registry.ts                  # NEW: AdapterRegistry class
├── types.ts                     # MODIFIED: IndexAdapter.kind → string, KnowledgeIndexStateRecord → dynamic
├── adapters/
│   ├── index.ts                 # MODIFIED: buildDefaultIndexAdapters → registry.register pattern
│   ├── vector.ts                # UNCHANGED (kind: 'vector' string literal still works)
│   ├── keyword.ts               # UNCHANGED
│   ├── graph.ts                 # UNCHANGED
│   ├── pg-vector.ts             # UNCHANGED
│   └── pg-keyword.ts            # UNCHANGED
└── pipeline.ts                  # MODIFIED: iterate registry.all() instead of adapter array

packages/server/src/lib/retrieval/
├── channel-registry.ts          # NEW: ChannelRegistry class
├── strategy-registry.ts         # NEW: StrategyRegistry class
├── types.ts                     # MODIFIED: RecallChannel → string, MergedCandidate → dynamic scores
├── recall/
│   ├── semantic.ts              # MODIFIED: implement RecallChannel interface
│   ├── keyword.ts               # MODIFIED: implement RecallChannel interface
│   └── graph-assisted.ts        # MODIFIED: implement RecallChannel interface
├── recall-coordinator.ts        # MODIFIED: use ChannelRegistry instead of direct imports
├── routing.ts                   # MODIFIED: use StrategyRegistry instead of switch/if-else
└── merge.ts                     # MODIFIED: dynamic channel score merging
```

### Pattern 1: AdapterRegistry (Type-safe string registry)

**What:** A typed registry that maps string keys to adapter implementations, replacing hardcoded union types.
**When to use:** When the set of implementations is extensible but the core pipeline should not need modification.
**Example:**

```typescript
// packages/server/src/lib/indexing/registry.ts
import type { IndexAdapter, NormalizedIndexDocument, IndexSyncResult } from './types.js';

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

### Pattern 2: RecallChannel interface (Pluggable recall)

**What:** An interface that each recall module implements, enabling the orchestrator to iterate over registered channels instead of importing each one directly.
**When to use:** When adding a new recall path should not require modifying orchestrator or recall-coordinator.
**Example:**

```typescript
// packages/server/src/lib/retrieval/channel-registry.ts
import type { KnowledgeRecord } from '../store.js';
import type { RecallCandidate } from './types.js';

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

### Pattern 3: StrategyRegistry (Version dispatch)

**What:** A registry that maps strategy version strings to strategy implementations, replacing the switch/if-else dispatch in routing.ts and recall-coordinator.ts.
**When to use:** When new retrieval strategy versions should be addable without modifying core routing code.
**Example:**

```typescript
// packages/server/src/lib/retrieval/strategy-registry.ts
import type { RetrievalQuery } from '@trapmap/contracts';
import type { ChannelRegistry } from './channel-registry.js';
import type { ScoredEntry, MergedCandidate } from './types.js';

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
}
```

### Anti-Patterns to Avoid

- **Premature generalization of MergedCandidate:** Do not replace `semanticScore`/`keywordScore`/`graphScore` with a generic `Record<string, number>` in the first iteration. The rerank module uses these named fields for heuristic scoring. Instead, add a `channelScores: Record<string, number>` alongside the existing fields for backward compatibility, and deprecate the named fields later.
- **Breaking the pipeline sequential semantics:** The current pipeline executes adapters sequentially (not in parallel). The registry must preserve this behavior. Do not add `Promise.all` by default -- make it opt-in per adapter configuration.
- **Registry lookup in hot path without caching:** The retrieval orchestrator runs on every query. Registry lookups (Map.get) are O(1) and negligible, but avoid creating new arrays from `registry.all()` on every call. Cache the adapter/channel list at registration time.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dynamic key iteration on KnowledgeIndexStateRecord | Manual migration of each field | `Record<string, AdapterSyncState>` with backward-compat reader | Existing JSON data has `vector`, `keyword`, `graph` keys; the Record type reads them naturally |
| Score normalization across channels | Custom normalization per channel | Standard min-max or z-score in merge.ts | Each channel already outputs [0,1] scores; the merge weights handle fusion |
| Registry duplicate detection | Manual checks | Map.has() before Map.set() | Standard pattern, O(1) lookup |

## Common Pitfalls

### Pitfall 1: KnowledgeIndexStateRecord Migration
**What goes wrong:** Existing JSON store files have `{ vector: {...}, keyword: {...}, graph: {...} }` as top-level fields on indexState. Changing to `adapters: Record<string, AdapterSyncState>` breaks deserialization of existing data.
**Why it happens:** The JsonStore reads raw JSON and casts to StoreData. No schema migration runs on read.
**How to avoid:** Implement a migration function in the store read path that detects the old format (has `vector`/`keyword`/`graph` top-level keys) and converts to the new `adapters` format. Run this migration once on first read. Keep the old fields as optional for one release cycle.
**Warning signs:** Tests that create KnowledgeIndexStateRecord with the old format will fail after the type change.

### Pitfall 2: IndexSyncResult.adapterKind Coupling
**What goes wrong:** `IndexSyncResult.adapterKind` is currently `'vector' | 'keyword' | 'graph'`. The pipeline uses this to index into `entry.indexState[adapterKind]`. Changing to `string` requires updating all 16 occurrences across 9 files.
**Why it happens:** The adapterKind field is used as both a type discriminant and a state key.
**How to avoid:** Change `adapterKind: string` in IndexSyncResult. Update `entry.indexState[adapterKind]` to `entry.indexState.adapters[adapterKind]`. Run a project-wide grep for `adapterKind` and update all references.
**Warning signs:** TypeScript compilation errors on `entry.indexState[adapterKind]` after the type change.

### Pitfall 3: MergedCandidate Hardcoded Score Fields
**What goes wrong:** `MergedCandidate` has `semanticScore`, `keywordScore`, `graphScore` as named fields. The merge.ts and rerank.ts modules use these directly. Adding a new channel (e.g., `fulltext`) requires adding another named field.
**Why it happens:** The merge logic was designed for exactly 3 channels.
**How to avoid:** Add `channelScores: Record<string, number>` to MergedCandidate. Keep the named fields for backward compatibility. Update merge.ts to populate both the named fields and the generic map. In a future phase, deprecate the named fields.
**Warning signs:** Rerank heuristics that reference `merged.semanticScore` directly will break if the field is removed.

### Pitfall 4: dispatchByMode Switch Statement
**What goes wrong:** The `dispatchByMode` function in recall-coordinator.ts uses a switch on `mode` string. Adding new modes requires modifying this function.
**Why it happens:** The function was designed for exactly 3 modes.
**How to avoid:** Replace the switch with a strategy registry lookup. The registry maps mode strings to strategy implementations. Default to 'semantic' if mode not found (backward compatible).
**Warning signs:** Tests that call `dispatchByMode('new-mode', ...)` will throw `AppError(400, 'invalid_mode')`.

### Pitfall 5: RecallChannel Interface Granularity
**What goes wrong:** The three existing recall functions have different signatures: `semanticRecall` takes `(seed, entries, parsed, services?, auth?)`, `keywordRecall` takes `(queryText, entries)`, `graphAssistedRecall` takes `(queryText, entriesMap, config?)`. A unified `RecallChannel` interface must accommodate all three.
**Why it happens:** Each recall function evolved independently with different needs.
**How to avoid:** Define the RecallChannel interface with a common context object that carries all optional dependencies. Each channel implementation extracts what it needs from the context. Start with the minimal interface and extend as needed.
**Warning signs:** Forcing all channels to accept the same parameters will lead to unused parameters and confusion.

## Code Examples

### AdapterRegistry Usage (Indexing Pipeline)

```typescript
// packages/server/src/lib/indexing/pipeline.ts - modified syncKnowledgeIndex
// Source: Current pipeline.ts lines 164-211, adapted for registry pattern

export async function syncKnowledgeIndex(
  services: { store: SkillShareerStore; data: StoreData },
  entryId: string,
  registry: AdapterRegistry,  // Changed from adapters: IndexAdapter[]
): Promise<void> {
  const { store, data } = services;
  const entry = data.knowledgeEntries.find((e) => e.id === entryId);
  if (!entry) throw new Error(`Entry ${entryId} not found`);

  // ... lifecycle check unchanged ...

  const normalizedDocument = normalizeKnowledgeIndexDocument(entry);

  // Initialize index state if needed (new dynamic format)
  if (!entry.indexState) {
    entry.indexState = initializeIndexState(normalizedDocument, registry);
  }

  // Sync to each registered adapter
  for (const adapter of registry.all()) {
    const adapterKind = adapter.kind;
    const currentState = entry.indexState.adapters[adapterKind];

    if (!needsSync(currentState, normalizedDocument)) continue;

    const result = await adapter.sync(normalizedDocument);
    entry.indexState.adapters[adapterKind] = updateAdapterState(currentState, normalizedDocument, result);

    // ... special handling for vector/keyword payloads unchanged ...
  }
}
```

### RecallChannel Registration (Retrieval Pipeline)

```typescript
// packages/server/src/lib/retrieval/recall-coordinator.ts - modified dispatch
// Source: Current recall-coordinator.ts lines 72-94

export async function dispatchByMode(
  mode: string,
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
  channelRegistry: ChannelRegistry,
  strategyRegistry: StrategyRegistry,
  services?: SkillShareerServices,
  auth?: ResolvedAuthContext,
): Promise<{ scoredEntries: ScoredEntry[]; mergedCandidates?: MergedCandidate[] }> {
  const strategy = strategyRegistry.get(mode);
  if (!strategy) {
    throw new AppError(400, 'invalid_mode', `Invalid query mode: ${mode}`);
  }
  return strategy.execute(parsed, channelRegistry, eligibleEntries, services, auth);
}
```

### Backward-Compatible KnowledgeIndexStateRecord

```typescript
// packages/server/src/lib/indexing/types.ts - modified record
// Source: Current types.ts lines 85-96

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
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed union `kind: 'vector' \| 'keyword' \| 'graph'` | String `kind: string` | This phase | Any adapter can register with any string key |
| Hardcoded fields on KnowledgeIndexStateRecord | `adapters: Record<string, AdapterSyncState>` | This phase | Dynamic adapter state tracking |
| Direct import of recall functions | RecallChannel interface + registry | This phase | New recall channels without modifying orchestrator |
| Switch statement in dispatchByMode | StrategyRegistry lookup | This phase | New retrieval strategies without modifying coordinator |

**Deprecated/outdated:**
- `buildDefaultIndexAdapters()` returns a fixed array -- replaced by `AdapterRegistry.register()` pattern
- `buildHybridIndexAdapters()` with feature-flag branching -- replaced by conditional registration in the registry
- `dispatchByMode` switch statement -- replaced by `StrategyRegistry.get(mode)?.execute(...)`

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | KnowledgeIndexStateRecord is only persisted in JSON store (not PostgreSQL) | Pitfall 1 | If PG also persists indexState, migration surface is larger |
| A2 | The PG repository's `indexState: null` means PG does not store index state | Pitfall 1 | If PG stores indexState as JSONB column, schema migration needed |
| A3 | No external packages are needed for the registry pattern | Standard Stack | If a registry library is desired, installation step needed |
| A4 | Pipeline sequential semantics must be preserved (no parallel adapter execution) | Anti-Patterns | If parallel execution is desired, AdapterRegistry needs async iteration support |
| A5 | The `MergedCandidate` named score fields can coexist with `channelScores` map | Pitfall 3 | If strict type hygiene is required, named fields must be removed immediately |

## Open Questions

1. **Should AdapterRegistry support priority ordering?**
   - What we know: Current adapters execute in array order (vector, keyword, graph)
   - What's unclear: Whether the registry should enforce ordering or leave it to the pipeline
   - Recommendation: Keep insertion order (Map preserves it). Add a `priority` field to IndexAdapter if explicit ordering is needed later.

2. **Should RecallChannel.recall accept a context object or individual parameters?**
   - What we know: Current functions have different signatures (semantic needs services+auth, keyword does not, graph needs a Map)
   - What's unclear: The right abstraction granularity for the context
   - Recommendation: Define a `RecallContext` interface with optional fields: `{ services?: SkillShareerServices; auth?: ResolvedAuthContext; dataSnapshot?: StoreData }`. Each channel destructures what it needs.

3. **How to handle score normalization for new channels?**
   - What we know: Current channels output [0,1] scores. Merge uses weighted average (0.6 semantic, 0.4 keyword).
   - What's unclear: How to handle channels with different score distributions (e.g., BM25 has no upper bound)
   - Recommendation: Require all RecallChannel implementations to output [0,1] normalized scores. Document this contract in the interface JSDoc.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | TypeScript compilation, tests | ✓ | (project baseline) | -- |
| pnpm | Package management | ✓ | (project baseline) | -- |
| TypeScript | Type checking | ✓ | (project baseline) | -- |
| Vitest | Test execution | ✓ | (project baseline) | -- |

**Missing dependencies with no fallback:** None -- this is a pure refactoring phase with no external dependencies.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | (project config, already configured) |
| Quick run command | `pnpm test -- --run packages/server/src/lib/indexing/` or `pnpm test -- --run packages/server/src/lib/retrieval/` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| (none mapped) | AdapterRegistry register/get/all | unit | `pnpm test -- --run packages/server/src/lib/indexing/registry.test.ts` | Wave 0 |
| (none mapped) | KnowledgeIndexStateRecord backward compat | unit | `pnpm test -- --run packages/server/src/lib/indexing/pipeline.test.ts` | Yes |
| (none mapped) | ChannelRegistry register/get/all | unit | `pnpm test -- --run packages/server/src/lib/retrieval/channel-registry.test.ts` | Wave 0 |
| (none mapped) | StrategyRegistry register/get | unit | `pnpm test -- --run packages/server/src/lib/retrieval/strategy-registry.test.ts` | Wave 0 |
| (none mapped) | dispatchByMode with registry | unit | `pnpm test -- --run packages/server/src/lib/retrieval/recall-coordinator.test.ts` | Yes |
| (none mapped) | MergedCandidate backward compat | unit | `pnpm test -- --run packages/server/src/lib/retrieval/merge.test.ts` | Yes |
| (none mapped) | Full pipeline integration | integration | `pnpm test -- --run packages/server/src/lib/indexing/pipeline.test.ts` | Yes |

### Sampling Rate

- **Per task commit:** `pnpm test -- --run packages/server/src/lib/indexing/` and `pnpm test -- --run packages/server/src/lib/retrieval/`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/server/src/lib/indexing/registry.test.ts` -- covers AdapterRegistry
- [ ] `packages/server/src/lib/retrieval/channel-registry.test.ts` -- covers ChannelRegistry
- [ ] `packages/server/src/lib/retrieval/strategy-registry.test.ts` -- covers StrategyRegistry

## Sources

### Primary (HIGH confidence)
- Source code inspection of `packages/server/src/lib/indexing/types.ts` -- verified IndexAdapter interface, KnowledgeIndexStateRecord structure
- Source code inspection of `packages/server/src/lib/indexing/pipeline.ts` -- verified syncKnowledgeIndex and reconcileKnowledgeIndexes logic
- Source code inspection of `packages/server/src/lib/retrieval/types.ts` -- verified RecallChannel, MergedCandidate types
- Source code inspection of `packages/server/src/lib/retrieval/recall-coordinator.ts` -- verified dispatchByMode switch statement
- Source code inspection of `packages/server/src/lib/retrieval/routing.ts` -- verified strategy selection logic
- Source code inspection of `packages/server/src/lib/store/types/knowledge-records.ts` -- verified KnowledgeRecord.indexState field
- Source code inspection of `packages/server/src/lib/knowledge/pg-repository.ts` -- verified PG sets indexState: null (not persisted)

### Secondary (MEDIUM confidence)
- TypeScript Map insertion order behavior -- Maps preserve insertion order per ECMAScript spec [ASSUMED]

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, pure TypeScript refactoring
- Architecture: HIGH -- based on direct source code inspection of all affected files
- Pitfalls: HIGH -- migration risks identified from actual data structures in codebase

**Research date:** 2026-05-07
**Valid until:** 2026-06-07 (stable -- core patterns are well-established)
