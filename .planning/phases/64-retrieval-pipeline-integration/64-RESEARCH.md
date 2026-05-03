# Phase 64: Retrieval Pipeline Integration - Research

**Researched:** 2026-05-03
**Domain:** Retrieval pipeline wiring -- freshness decay scoring + conflict display
**Confidence:** HIGH

## Summary

Phase 64 wires two existing but disconnected subsystems into the live retrieval pipeline: (1) freshness decay scoring via `computeFreshnessMultiplier`, and (2) conflict hint enrichment via `enrichMatchesWithConflicts`. Both features are fully implemented and tested in isolation but are NOT called from the pipeline orchestrator or the rerank module.

The freshness decay system (`packages/server/src/lib/decay/freshness.ts`) computes score multipliers based on entry age and freshness type (evergreen/versioned/volatile). The rerank module (`packages/server/src/lib/retrieval/rerank.ts`) already has a `staleDecayPenalty` for binary stale-state penalty but does NOT use the continuous freshness multiplier. The test file `rerank.test.ts` already contains tests that reference `freshnessConfig` and `decayMultiplier` on `RerankConfig` and `MergedCandidate` respectively -- these fields do not yet exist in the implementation.

The conflict enrichment system (`packages/server/src/lib/conflict/enrich.ts`) provides `enrichMatchesWithConflicts()` which builds a `Map<string, ConflictHint[]>` from store data. The assembly module (`assembly.ts`) already accepts `conflictHints` as a 4th parameter to `assembleResponseBuckets()` and wires it into `toRetrievalMatch()`. The CLI (`packages/cli/src/commands/retrieval.ts`) already renders conflict hints. However, the orchestrator never calls `enrichMatchesWithConflicts` and never passes `conflictHints` to `assembleResponseBuckets`.

**Primary recommendation:** This is a pure wiring phase -- import existing functions into the orchestrator and rerank, pass their outputs through the pipeline, and fix the test-implementation gap where tests reference unimplemented fields.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None -- discuss phase was skipped per user setting.

### Claude's Discretion
All implementation choices are at Claude's discretion. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None -- discuss phase was skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DECAY-02 | Retrieval ranking applies freshness multiplier with configurable decay curves for three knowledge types (evergreen / versioned / volatile) | `computeFreshnessMultiplier` in `freshness.ts` fully implemented with exponential/linear/step decay; needs wiring into `rerankCandidates` via `RerankConfig.freshnessConfig` field |
| CONFLICT-02 | Retrieval results display conflict relationships with context allowing users to choose appropriate solutions | `enrichMatchesWithConflicts` in `enrich.ts` fully implemented; `conflictHints` param already in `assembleResponseBuckets`; orchestrator needs to call and thread through |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Freshness decay scoring | API / Backend (rerank) | -- | Score multiplier computed server-side during retrieval ranking |
| Conflict enrichment | API / Backend (orchestrator) | -- | Conflict lookup built from store data, threaded to assembly |
| Conflict display | CLI (output formatting) | -- | CLI already renders conflict hints; no changes needed |
| Decay configuration | API / Backend (config) | -- | `FreshnessDecayConfig` loaded server-side |

## Standard Stack

### Core
All libraries already in the project. No new dependencies needed.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | existing | Test framework | Project standard |
| zod | existing | Schema validation | Already used for `FreshnessDecayConfig`, `ConflictHint` |

### Installation
No new packages needed. This phase wires existing code only.

## Architecture Patterns

### System Architecture Diagram

```
                    searchKnowledge (orchestrator.ts)
                              |
            +-----------------+------------------+
            |                                    |
    [eligibility filter]              [boundary filter]
            |                                    |
            +-----------------+------------------+
                              |
                        dispatchByMode
                              |
           +------------------+------------------+
           |                  |                  |
     semanticRecall    hybridRecall    graphAssistedRecall
           |                  |                  |
           |         rerankCandidates (rerank.ts)
           |                  |
           |     +------------+------------+
           |     |                         |
           |  [stale penalty]    [FRESHNESS MULTIPLIER]  <-- NEW: import computeFreshnessMultiplier
           |     |                         |
           |     +------------+------------+
           |                  |
           |         scoredEntries
           |                  |
           +------------------+------------------+
                              |
                    [CONFLICT ENRICHMENT]  <-- NEW: call enrichMatchesWithConflicts
                              |
                    assembleResponseBuckets  <-- passes conflictHints
                              |
                    buildRetrievalResponse
                              |
                        CLI output
                    (already renders conflicts)
```

### Recommended Project Structure
```
packages/server/src/lib/
  retrieval/
    orchestrator.ts      # MODIFY: thread freshness config + conflict hints
    rerank.ts            # MODIFY: add freshnessConfig to RerankConfig, apply multiplier
    types.ts             # MODIFY: add decayMultiplier to MergedCandidate
    assembly.ts          # NO CHANGE: already accepts conflictHints
  decay/
    freshness.ts         # NO CHANGE: computeFreshnessMultiplier already complete
  conflict/
    enrich.ts            # NO CHANGE: enrichMatchesWithConflicts already complete
packages/cli/src/commands/
  retrieval.ts           # NO CHANGE: already renders conflicts
```

### Pattern 1: Config-through-function-parameter
**What:** Pass `freshnessConfig` as an optional field on `RerankConfig` rather than loading config inside rerank.
**When to use:** When the function is a pure scoring function that should not have I/O dependencies.
**Why:** The rerank module is a pure function -- it takes candidates and config, returns ranked candidates. Config loading belongs to the orchestrator.

### Pattern 2: Map-threading for enrichment data
**What:** Build a `Map<string, ConflictHint[]>` once, thread it through assembly.
**When to use:** When enrichment data must be looked up per-entry during assembly.
**Why:** O(n) lookup instead of O(n^2) for conflict resolution per entry.

### Anti-Patterns to Avoid
- **Loading config inside rerank.ts:** The rerank module is pure. Config loading (`loadDecayConfig` / `DEFAULT_FRESHNESS_CONFIG`) should happen in the orchestrator, then be passed via `RerankConfig.freshnessConfig`.
- **Calling enrichment inside assembly.ts:** Assembly is a pure shaping function. The orchestrator should call `enrichMatchesWithConflicts` and pass the result to assembly.
- **Duplicating decay logic:** The rerank already has `hasStaleDecayState` for binary stale penalty. Freshness multiplier is additive and continuous. Do NOT merge them -- both apply independently.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Freshness multiplier | Decay math in rerank | `computeFreshnessMultiplier` from `decay/freshness.ts` | Already tested, handles all 3 types, respects config |
| Conflict lookup | Per-entry scan of conflicts array | `enrichMatchesWithConflicts` from `conflict/enrich.ts` | O(n) via Map, includes governance filtering |

**Key insight:** Both subsystems are complete and tested. This phase is 100% wiring -- no new algorithms or data structures.

## Common Pitfalls

### Pitfall 1: Test-Implementation Gap
**What goes wrong:** `rerank.test.ts` already tests `freshnessConfig` on `RerankConfig` and `decayMultiplier` on `MergedCandidate` -- but these fields do NOT exist in the implementation. Tests will fail if the implementation doesn't match.
**Why it happens:** Tests were written speculatively (possibly alongside a prior plan) without implementing the fields.
**How to avoid:** Add `freshnessConfig?: FreshnessDecayConfig` to `RerankConfig` and `decayMultiplier?: number` to `MergedCandidate`. Apply the multiplier inside `rerankCandidates`. Existing tests should pass.
**Warning signs:** TypeScript compilation errors in test file referencing non-existent fields.

### Pitfall 2: Missing `decayMeta` on `KnowledgeRecord` Type
**What goes wrong:** `KnowledgeRecord` in `store.ts` does NOT declare `decayMeta` as a property. Code throughout the codebase uses `entry.decayMeta` via `as KnowledgeRecord` casts. The rerank test does the same.
**Why it happens:** `decayMeta` is dynamically set on entries but the type was never updated.
**How to avoid:** This is a pre-existing type debt. For this phase, follow the existing pattern (cast or access via optional chaining). Do NOT attempt to fix the `KnowledgeRecord` type definition as that would be scope creep.
**Warning signs:** TypeScript strict mode would flag these. Current codebase uses casts.

### Pitfall 3: Orchestrator `boundaryContext` Reference Errors
**What goes wrong:** The orchestrator references `parsed.boundaryContext` on lines 246, 299, 522, 622 but this field does NOT exist on the retrieval query schema. This causes 4 TypeScript compilation errors.
**Why it happens:** Boundary context support was partially implemented but never added to the query schema.
**How to avoid:** These are pre-existing errors. Do NOT attempt to fix them in this phase -- it is out of scope. Focus only on adding conflict hints and freshness wiring.
**Warning signs:** `tsc --noEmit` shows 4 errors about `boundaryContext` on the orchestrator.

### Pitfall 4: Score Bounds Violation
**What goes wrong:** Applying both freshness multiplier AND stale penalty could drive scores below 0.
**Why it happens:** The multiplier is in [0, 1] and stale penalty subtracts a fixed amount. Combined with other boosts/penalties, the total could underflow.
**How to avoid:** The rerank already clamps scores to [0, 1] at line 124. Ensure the freshness multiplier is applied BEFORE this clamping step.
**Warning signs:** Negative scores in test output.

### Pitfall 5: Conflict Hints for Empty Conflict Store
**What goes wrong:** If no conflicts exist in the store, `enrichMatchesWithConflicts` returns an empty Map. Passing this to `assembleResponseBuckets` is safe (it checks `.get()`), but the orchestrator must handle the `data.conflicts` array being empty.
**Why it happens:** Fresh installs or test fixtures may have zero conflicts.
**How to avoid:** The enrichment function handles this gracefully. Just ensure the orchestrator always calls it with the store's `conflicts` array (which defaults to `[]`).

## Code Examples

### Example 1: Adding `freshnessConfig` to `RerankConfig` (rerank.ts)

```typescript
// Source: Codebase analysis of rerank.ts + rerank.test.ts expectations
import type { FreshnessDecayConfig } from '@trapmap/contracts';
import { computeFreshnessMultiplier } from '../decay/freshness.js';

export interface RerankConfig {
  bothChannelBoost?: number;
  tokenDensityBoost?: number;
  maxCandidates?: number;
  staleDecayPenalty?: number;
  boundaryContext?: BoundaryContext;
  /** Freshness decay configuration for age-based scoring (DECAY-02) */
  freshnessConfig?: FreshnessDecayConfig;
}
```

### Example 2: Applying freshness multiplier in `rerankCandidates`

```typescript
// Inside the candidate mapping loop in rerankCandidates():
// Apply freshness decay multiplier
if (config?.freshnessConfig) {
  const multiplier = computeFreshnessMultiplier(
    candidate.entry,
    config.freshnessConfig,
  );
  finalScore *= multiplier;
  candidate.decayMultiplier = multiplier;
}
```

### Example 3: Adding `decayMultiplier` to `MergedCandidate` (types.ts)

```typescript
// Source: rerank.test.ts expectations (lines 212-213, 235)
export interface MergedCandidate {
  // ... existing fields ...
  /** Score delta from boundary matching */
  boundaryScoreDelta?: number;
  /** Applied freshness decay multiplier (DECAY-02) */
  decayMultiplier?: number;
}
```

### Example 4: Threading conflict hints in the orchestrator

```typescript
// Source: orchestrator.ts lines 296-301, enriched to pass conflict hints
import { enrichMatchesWithConflicts } from '../conflict/enrich.js';

// After getting scoredEntries and before assembly:
const conflictHints = enrichMatchesWithConflicts(
  scoredEntries.map(e => ({ entryId: e.entry.id })),
  data,  // StoreData
  { teamId: auth.activeTeamId, requiredLevel: auth.securityLevel },
);

const { globalConstraints, projectKnowledge } = assembleResponseBuckets(
  scoredEntries,
  parsed.filters,
  citations,
  conflictHints,  // NEW: pass conflict hints
);
```

### Example 5: Orchestrator passing freshness config to rerank

```typescript
// In hybridRecall and graphAssistedRecall within orchestrator.ts:
import { DEFAULT_FRESHNESS_CONFIG } from '../decay/freshness.js';

const rerankedCandidates = rerankCandidates(mergedCandidates, queryTokens, {
  maxCandidates: parsed.maxResults,
  boundaryContext: parsed.boundaryContext,
  freshnessConfig: DEFAULT_FRESHNESS_CONFIG,  // NEW
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Binary stale penalty only | Continuous freshness multiplier + binary stale penalty | This phase | More nuanced scoring that respects entry type and age |
| No conflict display | Conflict hints in retrieval results | This phase | Users can see conflicting entries and choose appropriately |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `DEFAULT_FRESHNESS_CONFIG` is the right config to use (not loaded from store/user config) | Architecture Patterns | If freshness config should be per-team, need config loading |
| A2 | `decayMeta` is always set on entries at runtime despite not being in the TypeScript type | Common Pitfalls | If some entries lack `decayMeta`, `computeFreshnessMultiplier` handles null gracefully |
| A3 | Conflict enrichment should use `auth.activeTeamId` and `auth.securityLevel` for governance | Code Examples | If governance context is different, need to adjust the governance object |
| A4 | The orchestrator is the right place to call `enrichMatchesWithConflicts` (not inside assembly) | Architecture Patterns | If conflict lookup needs assembly context, different placement needed |

## Open Questions

1. **Freshness config source:** Should `freshnessConfig` come from `DEFAULT_FRESHNESS_CONFIG` hardcoded, or be loaded from a store/user configuration?
   - What we know: `DEFAULT_FRESHNESS_CONFIG` is defined in `freshness.ts`. `loadDecayConfig()` exists in `decay/config.ts` but returns `DecayConfig` (lifecycle thresholds), not `FreshnessDecayConfig` (scoring curves).
   - What's unclear: Whether there is or should be a separate config loading mechanism for freshness scoring curves.
   - Recommendation: Use `DEFAULT_FRESHNESS_CONFIG` for now. The `FreshnessDecayConfig` has sensible defaults. A future phase can add configuration persistence.

2. **Conflict enrichment for v2 capsule path:** Should `searchKnowledgeV2` also show conflicts?
   - What we know: v2 uses capsule-based retrieval, not entry-based. Conflict detection is entry-based.
   - What's unclear: Whether capsules need conflict display.
   - Recommendation: Out of scope for this phase. DECAY-02 and CONFLICT-02 are entry-retrieval focused per the requirements. v2 capsule conflict can be a future enhancement.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies -- pure code wiring of existing modules)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | `packages/server/vitest.config.ts` |
| Quick run command | `cd packages/server && npx vitest run --passWithNoTests` |
| Full suite command | `cd packages/server && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DECAY-02 | Freshness multiplier applied to volatile entries in rerank | unit | `cd packages/server && npx vitest run src/lib/retrieval/rerank.test.ts` | YES - has freshness tests |
| DECAY-02 | Freshness multiplier compounds with stale penalty | unit | `cd packages/server && npx vitest run src/lib/retrieval/rerank.test.ts` | YES |
| DECAY-02 | No decay when freshness config has types disabled | unit | `cd packages/server && npx vitest run src/lib/retrieval/rerank.test.ts` | YES |
| DECAY-02 | preRerankScore preserved with freshness applied | unit | `cd packages/server && npx vitest run src/lib/retrieval/rerank.test.ts` | YES |
| CONFLICT-02 | Conflict hints passed to assembly | unit | `cd packages/server && npx vitest run src/lib/conflict/enrich.test.ts` | YES |
| CONFLICT-02 | Conflict data visible in CLI output | integration | `cd packages/cli && npx vitest run` | PARTIAL - CLI renders conflicts but no E2E test |

### Sampling Rate
- **Per task commit:** `cd packages/server && npx vitest run src/lib/retrieval/rerank.test.ts src/lib/conflict/enrich.test.ts`
- **Per wave merge:** `cd packages/server && npx vitest run`
- **Phase gate:** `cd packages/server && npx vitest run` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Orchestrator-level integration test: verify `searchKnowledge` returns matches with conflict hints when conflicts exist -- covers CONFLICT-02 E2E
- [ ] Orchestrator-level integration test: verify `searchKnowledge` returns lower scores for volatile vs evergreen entries -- covers DECAY-02 E2E

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | Governance filtering in `enrichMatchesWithConflicts` respects teamId and requiredLevel |
| V5 Input Validation | yes | Zod schemas for all config objects |

### Known Threat Patterns for Retrieval Pipeline

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Information disclosure via conflict hints | Information Disclosure | Governance filter in `getConflictHints` -- team-scoped entries hidden from other teams |

## Sources

### Primary (HIGH confidence)
- `packages/server/src/lib/decay/freshness.ts` - freshness multiplier implementation (verified by reading)
- `packages/server/src/lib/conflict/enrich.ts` - conflict enrichment implementation (verified by reading)
- `packages/server/src/lib/retrieval/rerank.ts` - current rerank implementation (verified by reading)
- `packages/server/src/lib/retrieval/orchestrator.ts` - pipeline orchestration (verified by reading)
- `packages/server/src/lib/retrieval/assembly.ts` - response assembly with conflict support (verified by reading)
- `packages/server/src/lib/retrieval/types.ts` - MergedCandidate type definition (verified by reading)
- `packages/server/src/lib/retrieval/rerank.test.ts` - existing test expectations (verified by reading)
- `packages/contracts/src/domain/decay.ts` - FreshnessDecayConfig, DecayMeta schemas (verified by reading)
- `packages/contracts/src/domain/conflict.ts` - ConflictHint, ConflictRelation schemas (verified by reading)
- `packages/contracts/src/domain/retrieval.ts` - retrievalMatchSchema with conflicts field (verified by reading)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, all code already in project
- Architecture: HIGH - all wiring points identified by reading source code
- Pitfalls: HIGH - test-implementation gap confirmed by reading both test and implementation files

**Research date:** 2026-05-03
**Valid until:** 2026-06-03 (stable codebase, no external deps)
