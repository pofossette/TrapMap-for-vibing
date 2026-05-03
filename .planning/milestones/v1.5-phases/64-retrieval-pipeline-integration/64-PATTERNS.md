# Phase 64: Retrieval Pipeline Integration - Pattern Map

**Mapped:** 2026-05-03
**Files analyzed:** 3 (new/modified)
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/server/src/lib/retrieval/orchestrator.ts` | orchestrator | request-response | (itself -- modify existing) | exact |
| `packages/server/src/lib/retrieval/rerank.ts` | service | transform | (itself -- modify existing) | exact |
| `packages/server/src/lib/retrieval/types.ts` | model | n/a | (itself -- modify existing) | exact |

**Files NOT modified** (already complete, used as import sources):
- `packages/server/src/lib/decay/freshness.ts` -- provides `computeFreshnessMultiplier`, `DEFAULT_FRESHNESS_CONFIG`
- `packages/server/src/lib/conflict/enrich.ts` -- provides `enrichMatchesWithConflicts`
- `packages/server/src/lib/retrieval/assembly.ts` -- already accepts `conflictHints` as 4th param

## Pattern Assignments

### `packages/server/src/lib/retrieval/types.ts` (model, n/a)

**Analog:** Self -- add optional field to existing `MergedCandidate` interface

**Current interface** (lines 103-124):
```typescript
export interface MergedCandidate {
  /** The knowledge entry record */
  entry: KnowledgeRecord;
  /** Semantic channel score, or 0 if not recalled via semantic */
  semanticScore: number;
  /** Keyword channel score, or 0 if not recalled via keyword */
  keywordScore: number;
  /** Graph channel score, or 0 if not recalled via graph (optional for backward compatibility) */
  graphScore?: number;
  /** Combined score after merge, in [0, 1] - this is the pre-rerank score */
  combinedScore: number;
  /** All token matches from keyword channel (empty if keyword not used) */
  tokenMatches: TokenMatchDetail[];
  /** Which channels contributed to this candidate */
  channels: RecallChannel[];
  /** Pre-rerank score preserved for citation audit trail */
  preRerankScore: number;
  /** Final score after reranking (same as combinedScore if no rerank applied) */
  finalScore: number;
  /** Score delta from boundary matching (negative = penalty, positive = boost) */
  boundaryScoreDelta?: number;
}
```

**Change required:** Add `decayMultiplier?: number` field following the `boundaryScoreDelta` pattern -- optional number field with doc comment referencing the requirement ID. This field is tested in `rerank.test.ts` lines 212-213, 235, 260.

**Pattern to follow:** `boundaryScoreDelta` (line 123) -- same pattern of optional number with doc comment.

---

### `packages/server/src/lib/retrieval/rerank.ts` (service, transform)

**Analog:** Self -- extend existing `RerankConfig` and `rerankCandidates`

**Current RerankConfig** (lines 49-60):
```typescript
export interface RerankConfig {
  /** Boost for candidates appearing in both channels (default 0.15) */
  bothChannelBoost?: number;
  /** Boost for high token match density (default 0.10) */
  tokenDensityBoost?: number;
  /** Maximum candidates to return after rerank (default: no limit) */
  maxCandidates?: number;
  /** Penalty applied to stale entries' scores (default 0.1). Set to 0 to disable. */
  staleDecayPenalty?: number;
  /** Boundary context from query for boundary-aware scoring */
  boundaryContext?: BoundaryContext;
}
```

**Change 1 -- Add `freshnessConfig` field to RerankConfig:**
Follow the `boundaryContext` pattern (line 59): optional field with doc comment. Import `FreshnessDecayConfig` from `@trapmap/contracts`.

**Current imports** (lines 22-25):
```typescript
import type { BoundaryContext, DecayState } from '@trapmap/contracts';
import type { MergedCandidate, ScoredEntry } from './types.js';
import { computeBoundaryScoreDelta } from './boundary-match.js';
```

**New import needed:**
```typescript
import type { BoundaryContext, DecayState, FreshnessDecayConfig } from '@trapmap/contracts';
import { computeFreshnessMultiplier } from '../decay/freshness.js';
```

**Change 2 -- Apply freshness multiplier in `rerankCandidates` (lines 92-132):**

The core scoring loop currently applies boosts/penalties then clamps. The freshness multiplier should be applied AFTER all additive boosts/penalties but BEFORE the final clamp at line 124. Follow the existing `boundaryContext` conditional pattern (lines 117-121):

```typescript
// Apply boundary scoring if context provided
if (config?.boundaryContext) {
  const delta = computeBoundaryScoreDelta(candidate.entry, config.boundaryContext);
  finalScore += delta;
  candidate.boundaryScoreDelta = delta;
}
```

The freshness multiplier pattern should follow the same structure:
```typescript
// Apply freshness decay multiplier if config provided
if (config?.freshnessConfig) {
  const multiplier = computeFreshnessMultiplier(
    candidate.entry,
    config.freshnessConfig,
  );
  finalScore *= multiplier;
  candidate.decayMultiplier = multiplier;
}
```

**Key constraint:** Insert BEFORE the clamp line (line 124):
```typescript
// Cap at 1.0 to maintain score bounds
finalScore = Math.min(1, Math.max(0, finalScore));
```

This ensures scores stay in [0, 1] after both additive adjustments and multiplicative decay.

**Test expectations** (from `rerank.test.ts`):
- Lines 203-205: `freshnessConfig` passed on RerankConfig
- Lines 212-213: `decayMultiplier` defined and < 1.0 on volatile entry
- Lines 227-235: Both stale penalty and freshness multiplier compound
- Lines 255-260: No decay when `enabled: false` for all types
- Lines 274-280: `preRerankScore` preserved at 0.8, `combinedScore` < 0.8

---

### `packages/server/src/lib/retrieval/orchestrator.ts` (orchestrator, request-response)

**Analog:** Self -- wire two existing subsystems into the live pipeline

**Change 1 -- Add imports for freshness and conflict modules:**

Current imports (lines 1-55). Add near the existing retrieval imports:

```typescript
import { enrichMatchesWithConflicts } from '../conflict/enrich.js';
import { DEFAULT_FRESHNESS_CONFIG } from '../decay/freshness.js';
```

**Change 2 -- Thread `freshnessConfig` into `rerankCandidates` calls:**

There are two call sites for `rerankCandidates` in the orchestrator:

**Site A -- `hybridRecall` (line 520-523):**
```typescript
const rerankedCandidates = rerankCandidates(mergedCandidates, queryTokens, {
  maxCandidates: parsed.maxResults,
  boundaryContext: parsed.boundaryContext,
});
```

Add `freshnessConfig: DEFAULT_FRESHNESS_CONFIG` to the config object.

**Site B -- `graphAssistedRecall` (line 620-623):**
```typescript
const rerankedCandidates = rerankCandidates(finalMerged, queryTokens, {
  maxCandidates: parsed.maxResults,
  boundaryContext: parsed.boundaryContext,
});
```

Add `freshnessConfig: DEFAULT_FRESHNESS_CONFIG` to the config object.

**Pattern:** Both call sites follow the same config-through-function-parameter pattern. The config is assembled inline as an object literal with optional fields.

**Change 3 -- Build conflict hints and pass to `assembleResponseBuckets`:**

Current call (line 297-301):
```typescript
const { globalConstraints, projectKnowledge } = await timedStep(
  'assembly',
  () => Promise.resolve(assembleResponseBuckets(scoredEntries, parsed.filters, citations, parsed.boundaryContext)),
  steps,
);
```

NOTE: The current 4th argument `parsed.boundaryContext` appears to be a pre-existing error (the 4th parameter of `assembleResponseBuckets` is `conflictHints?: Map<string, ConflictHint[]>`, not `boundaryContext`). This needs to be replaced.

**New code:** Before the assembly call, build conflict hints from store data:

```typescript
// Build conflict hints from store data (CONFLICT-02)
const conflictHints = enrichMatchesWithConflicts(
  scoredEntries.map((e) => ({ entryId: e.entry.id })),
  data,  // StoreData from snapshot
  { teamId: auth.activeTeamId, requiredLevel: auth.securityLevel },
);
```

Then pass to assembly:
```typescript
const { globalConstraints, projectKnowledge } = await timedStep(
  'assembly',
  () => Promise.resolve(assembleResponseBuckets(scoredEntries, parsed.filters, citations, conflictHints)),
  steps,
);
```

**Key considerations:**
- `data` is available from the snapshot at line 234
- `auth.activeTeamId` and `auth.securityLevel` provide governance context
- `enrichMatchesWithConflicts` returns `Map<string, ConflictHint[]>` which matches the 4th param type of `assembleResponseBuckets`
- The `data.conflicts` array is always present (defaults to `[]` in `EMPTY_STORE`)

**Error handling pattern:** `enrichMatchesWithConflicts` never throws -- it gracefully handles empty arrays and missing entries. No try/catch needed around this call.

---

## Shared Patterns

### Import Convention
**Source:** `packages/server/src/lib/retrieval/orchestrator.ts` lines 1-55
**Apply to:** All modified files
```typescript
// Contracts imports: use type-only imports for TypeScript types
import type { BoundaryContext, DecayState, FreshnessDecayConfig } from '@trapmap/contracts';

// Internal imports: use .js extension for ESM resolution
import { computeFreshnessMultiplier } from '../decay/freshness.js';
import type { MergedCandidate, ScoredEntry } from './types.js';
```

### Config-Through-Function-Parameter
**Source:** `packages/server/src/lib/retrieval/rerank.ts` lines 82-86
**Apply to:** `rerankCandidates` call sites in orchestrator
```typescript
// Config is passed as optional object, not loaded inside the function
export function rerankCandidates(
  mergedCandidates: MergedCandidate[],
  queryTokens: string[],
  config?: RerankConfig,
): MergedCandidate[] { ... }
```

### Optional Conditional Scoring
**Source:** `packages/server/src/lib/retrieval/rerank.ts` lines 117-121
**Apply to:** New freshness multiplier block
```typescript
// Pattern: check config presence, compute, apply, record on candidate
if (config?.boundaryContext) {
  const delta = computeBoundaryScoreDelta(candidate.entry, config.boundaryContext);
  finalScore += delta;
  candidate.boundaryScoreDelta = delta;
}
```

### Score Clamping
**Source:** `packages/server/src/lib/retrieval/rerank.ts` line 124
**Apply to:** After all scoring adjustments
```typescript
// Final clamp ensures scores stay in [0, 1] regardless of combinations
finalScore = Math.min(1, Math.max(0, finalScore));
```

### Governance Filtering Pattern
**Source:** `packages/server/src/lib/conflict/enrich.ts` lines 74-108
**Apply to:** Conflict hint governance in orchestrator call
```typescript
// Governance object uses teamId + requiredLevel from auth context
{ teamId: auth.activeTeamId, requiredLevel: auth.securityLevel }
```

### Pipeline Step Timing
**Source:** `packages/server/src/lib/retrieval/orchestrator.ts` lines 188-194
**Apply to:** New enrichment step (if using timedStep wrapper)
```typescript
async function timedStep<T>(name: string, fn: () => Promise<T>, steps: PipelineStep[]): Promise<T> {
  const start = Date.now();
  const result = await fn();
  const latencyMs = Date.now() - start;
  steps.push({ name, latencyMs });
  return result;
}
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | | | All three modified files have exact self-analogs |

All files to modify already exist and are being extended. No new files are created. The two subsystems being wired in (`decay/freshness.ts` and `conflict/enrich.ts`) are complete with their own tests.

## Metadata

**Analog search scope:** `packages/server/src/lib/retrieval/`, `packages/server/src/lib/decay/`, `packages/server/src/lib/conflict/`
**Files scanned:** 10
**Pattern extraction date:** 2026-05-03
