# Phase 49: Time-based Decay in Retrieval - Research

**Gathered:** 2026-05-02
**Status:** Research complete
**Requirement:** DECAY-02

## Summary

Phase 49 requires implementing freshness-based ranking multipliers with configurable decay curves for three knowledge types: evergreen, versioned, and volatile. This research identifies the key integration points, existing patterns to follow, and technical decisions needed for planning.

---

## 1. Existing Decay Implementation Patterns

### 1.1 Contracts Layer (`packages/contracts/src/domain/decay.ts`)

The existing decay contracts provide:

```typescript
// State enum for lifecycle transitions
decayStateSchema = z.enum(['active', 'review-due', 'stale', 'expired', 'superseded'])

// Configuration for state transitions (days-based thresholds)
decayConfigSchema = z.object({
  reviewDueDays: z.number().int().min(1).max(3650).default(90),
  staleDays: z.number().int().min(1).max(3650).default(180),
  expireDays: z.number().int().min(1).max(3650).default(365),
  enabled: z.boolean().default(false),
})

// Metadata attached to knowledge records
decayMetaSchema = z.object({
  lastVerifiedAt: isoTimestampSchema,
  decayState: decayStateSchema,
  supersededById: entityIdSchema.nullable().default(null),
  decayStateComputedAt: isoTimestampSchema,
})
```

**Pattern to follow:** Add new schemas following the same Zod pattern with defaults and bounds validation.

### 1.2 State Machine (`packages/server/src/lib/decay/state-machine.ts`)

The state machine provides deterministic decay state computation:

```typescript
export function computeDecayState(
  entry: DecayableEntry | null,
  config: DecayConfig,
  now: Date = new Date(),
): { decayState: DecayState; decayStateComputedAt: string }
```

**Key patterns:**
- Pure functions with injected `now` for deterministic testing
- Age computed in days from `lastVerifiedAt`
- Priority-ordered state transitions (superseded > expired > stale > review-due > active)
- Default config matches schema defaults

### 1.3 Configuration Loading (`packages/server/src/lib/decay/config.ts`)

Environment-based configuration follows the feature-flags pattern:

```typescript
const ENV_VARS = {
  reviewDueDays: 'TRAPMAP_DECAY_REVIEW_DUE_DAYS',
  staleDays: 'TRAPMAP_DECAY_STALE_DAYS',
  expireDays: 'TRAPMAP_DECAY_EXPIRE_DAYS',
  enabled: 'TRAPMAP_DECAY_ENABLED',
}

export function loadDecayConfig(): DecayConfig
```

**Pattern to follow:** Add new environment variables for freshness decay config (e.g., `TRAPMAP_FRESHNESS_VOLATILE_HALF_LIFE_DAYS`).

### 1.4 Rerank Soft Decay (`packages/server/src/lib/retrieval/rerank.ts`)

Phase 48 already implements soft decay penalty:

```typescript
export const DEFAULT_STALE_DECAY_PENALTY = 0.1;

export interface RerankConfig {
  staleDecayPenalty?: number;  // Default 0.1, set to 0 to disable
}

// Applied after boosts, before [0,1] capping:
if (staleDecayPenalty > 0 && hasStaleDecayState(candidate)) {
  finalScore -= staleDecayPenalty;
}
```

**Integration point:** Freshness multiplier should be applied AFTER stale penalty, as a multiplicative factor rather than additive penalty.

---

## 2. Freshness Types Integration with DecayMeta

### 2.1 Design Options

| Option | Pros | Cons |
|--------|------|------|
| **A: Add to DecayMeta** | Unified decay metadata; no schema proliferation | Mixes lifecycle state with freshness type |
| **B: Separate field on record** | Clear separation of concerns | Additional field on every record |
| **C: FreshnessConfig in DecayMeta** | Configurable per-entry | More complex schema |

### 2.2 Recommended Approach (Option A)

Add `freshnessType` to `DecayMeta`:

```typescript
export const freshnessTypeSchema = z.enum(['evergreen', 'versioned', 'volatile']);
export type FreshnessType = z.infer<typeof freshnessTypeSchema>;

export const decayMetaSchema = z.object({
  lastVerifiedAt: isoTimestampSchema,
  decayState: decayStateSchema,
  supersededById: entityIdSchema.nullable().default(null),
  decayStateComputedAt: isoTimestampSchema,
  freshnessType: freshnessTypeSchema.default('evergreen'),  // NEW
});
```

**Rationale:**
- Freshness type is decay-related metadata
- Default `evergreen` ensures backward compatibility
- Clean addition without breaking existing records

### 2.3 Freshness Type Semantics

| Type | Decay Behavior | Use Cases |
|------|----------------|-----------|
| **evergreen** | No time-based decay | Reference docs, best practices, stable patterns |
| **versioned** | Step decay on version mismatch | Version-specific traps, API version notes |
| **volatile** | Exponential decay over time | Incident workarounds, temporary fixes, beta features |

---

## 3. Decay Curve Mathematics

### 3.1 Exponential Decay Formula

```typescript
/**
 * Exponential decay: multiplier decreases by half every halfLifeDays.
 * Formula: floor + (1 - floor) * (0.5 ^ (ageDays / halfLifeDays))
 *
 * @param ageDays - Age of entry in days
 * @param halfLifeDays - Days for multiplier to halve
 * @param floor - Minimum multiplier (default 0.3)
 * @returns Multiplier in [floor, 1.0]
 */
function exponentialDecay(ageDays: number, halfLifeDays: number, floor: number): number {
  const decayFactor = Math.pow(0.5, ageDays / halfLifeDays);
  return floor + (1 - floor) * decayFactor;
}
```

**Example with halfLifeDays=30, floor=0.3:**
- Day 0: 1.0
- Day 30: 0.65 (halfway to floor)
- Day 60: 0.475
- Day 90: 0.3875
- Day ∞: 0.3 (floor)

### 3.2 Linear Decay Formula

```typescript
/**
 * Linear decay: multiplier decreases linearly until reaching floor.
 * Formula: max(floor, 1 - (ageDays / zeroDays) * (1 - floor))
 *
 * @param ageDays - Age of entry in days
 * @param zeroDays - Days until floor is reached
 * @param floor - Minimum multiplier
 * @returns Multiplier in [floor, 1.0]
 */
function linearDecay(ageDays: number, zeroDays: number, floor: number): number {
  const rate = (1 - floor) / zeroDays;
  return Math.max(floor, 1 - ageDays * rate);
}
```

### 3.3 Step Decay Formula

```typescript
/**
 * Step decay: binary multiplier based on condition.
 * Used for versioned content where mismatch = immediate penalty.
 *
 * @param matches - Whether the version/context matches
 * @param matchMultiplier - Multiplier when matching (default 1.0)
 * @param mismatchMultiplier - Multiplier when not matching (default 0.5)
 */
function stepDecay(matches: boolean, matchMultiplier = 1.0, mismatchMultiplier = 0.5): number {
  return matches ? matchMultiplier : mismatchMultiplier;
}
```

### 3.4 Recommended Defaults

```typescript
export const DEFAULT_FRESHNESS_CONFIG = {
  evergreen: { enabled: false },  // No decay
  versioned: {
    enabled: true,
    mode: 'step' as const,
    matchMultiplier: 1.0,
    mismatchMultiplier: 0.5,
  },
  volatile: {
    enabled: true,
    mode: 'exponential' as const,
    halfLifeDays: 30,
    floor: 0.3,
  },
};
```

---

## 4. Retrieval Pipeline Integration Point

### 4.1 Current Rerank Pipeline (from `rerank.ts`)

```
1. Base score: combinedScore from merge stage
2. Both-channel boost: +0.15 if semantic AND keyword
3. Token density boost: +0.10 if >50% query tokens matched
4. Stale decay penalty: -0.10 if decayState === 'stale'
5. Cap at [0, 1]
```

### 4.2 Proposed Freshness Integration

```
1. Base score: combinedScore from merge stage
2. Both-channel boost: +0.15 if semantic AND keyword
3. Token density boost: +0.10 if >50% query tokens matched
4. Stale decay penalty: -0.10 if decayState === 'stale'
5. Freshness multiplier: *= computeFreshnessMultiplier(entry, now)  [NEW]
6. Cap at [0, 1]
```

**Key decision:** Apply as multiplicative factor AFTER all additive boosts/penalties.

**Rationale:**
- Multiplicative preserves relative ranking differences
- Additive penalties can push scores negative; multiplier cannot
- Applied after stale penalty allows both to compound

### 4.3 Implementation Location

**Primary:** `packages/server/src/lib/retrieval/rerank.ts`

```typescript
// Add to RerankConfig
export interface RerankConfig {
  bothChannelBoost?: number;
  tokenDensityBoost?: number;
  maxCandidates?: number;
  staleDecayPenalty?: number;
  freshnessConfig?: FreshnessDecayConfig;  // NEW
}

// Add freshness multiplier application
export function rerankCandidates(
  mergedCandidates: MergedCandidate[],
  queryTokens: string[],
  config?: RerankConfig,
): MergedCandidate[] {
  // ... existing logic ...

  // Apply freshness decay multiplier (new)
  const freshnessConfig = config?.freshnessConfig ?? DEFAULT_FRESHNESS_CONFIG;
  if (freshnessConfig.enabled) {
    const multiplier = computeFreshnessMultiplier(candidate.entry, freshnessConfig, now);
    finalScore *= multiplier;
  }

  // Cap at 1.0 (existing)
  finalScore = Math.min(1, Math.max(0, finalScore));
}
```

**New module:** `packages/server/src/lib/decay/freshness.ts`

```typescript
// Pure functions for freshness decay computation
export function computeFreshnessMultiplier(
  entry: { decayMeta: DecayMeta | null },
  config: FreshnessDecayConfig,
  now: Date,
): number;

export function exponentialDecay(ageDays: number, halfLifeDays: number, floor: number): number;
export function linearDecay(ageDays: number, zeroDays: number, floor: number): number;
export function stepDecay(matches: boolean, matchMultiplier: number, mismatchMultiplier: number): number;
```

---

## 5. Exposing Decay Multiplier in Retrieval Explanations

### 5.1 Current Citation Schema (`packages/contracts/src/domain/retrieval.ts`)

```typescript
export const retrievalCitationSchema = z.object({
  source: z.object({
    entryId: entityIdSchema,
    scope: scopeSchema,
    shortcut: z.string(),
  }),
  snippet: z.string().min(1),
  tags: z.array(labelSchema),
  recallChannels: z.array(z.enum(['semantic', 'keyword', 'graph'])).min(1),
  scores: z.object({
    semantic: z.number().min(0).max(1).nullable(),
    keyword: z.number().min(0).max(1).nullable(),
    graph: z.number().min(0).max(1).nullable(),
    preRerank: z.number().min(0).max(1),
    final: z.number().min(0).max(1),
  }),
});
```

### 5.2 Proposed Addition

Add `decayMultiplier` to scores object:

```typescript
scores: z.object({
  semantic: z.number().min(0).max(1).nullable(),
  keyword: z.number().min(0).max(1).nullable(),
  graph: z.number().min(0).max(1).nullable(),
  preRerank: z.number().min(0).max(1),
  final: z.number().min(0).max(1),
  decayMultiplier: z.number().min(0).max(1).optional(),  // NEW
}),
```

### 5.3 Alternative: Match Reason Text

Also expose in human-readable form via `generateMatchReason` in `assembly.ts`:

```typescript
export function generateMatchReason(
  entry: { labels: string[]; scope: string; decayMeta?: DecayMeta | null },
  score: number,
  filters: RetrievalQuery['filters'],
  decayMultiplier?: number,  // NEW optional param
): string {
  const parts: string[] = [];
  // ... existing logic ...

  // Add decay info if applied
  if (decayMultiplier !== undefined && decayMultiplier < 1.0) {
    parts.push(`freshness: ${(decayMultiplier * 100).toFixed(0)}%`);
  }

  return `${baseReason} (score: ${score.toFixed(2)})`;
}
```

---

## 6. Configuration Patterns

### 6.1 Environment Variables

Follow existing pattern from `decay/config.ts`:

```typescript
const FRESHNESS_ENV_VARS = {
  evergreenEnabled: 'TRAPMAP_FRESHNESS_EVERGREEN_ENABLED',
  versionedEnabled: 'TRAPMAP_FRESHNESS_VERSIONED_ENABLED',
  versionedMismatchMultiplier: 'TRAPMAP_FRESHNESS_VERSIONED_MISMATCH_MULTIPLIER',
  volatileEnabled: 'TRAPMAP_FRESHNESS_VOLATILE_ENABLED',
  volatileHalfLifeDays: 'TRAPMAP_FRESHNESS_VOLATILE_HALF_LIFE_DAYS',
  volatileFloor: 'TRAPMAP_FRESHNESS_VOLATILE_FLOOR',
};

export function loadFreshnessConfig(): FreshnessDecayConfig;
```

### 6.2 Schema Definition

```typescript
// In packages/contracts/src/domain/decay.ts

export const freshnessDecayModeSchema = z.enum(['exponential', 'linear', 'step']);

export const evergreenDecayConfigSchema = z.object({
  enabled: z.literal(false),  // Evergreen never decays
});

export const versionedDecayConfigSchema = z.object({
  enabled: z.boolean().default(true),
  mode: z.literal('step'),
  matchMultiplier: z.number().min(0).max(1).default(1.0),
  mismatchMultiplier: z.number().min(0).max(1).default(0.5),
});

export const volatileDecayConfigSchema = z.object({
  enabled: z.boolean().default(true),
  mode: z.enum(['exponential', 'linear']).default('exponential'),
  halfLifeDays: z.number().int().min(1).max(3650).default(30),
  zeroDays: z.number().int().min(1).max(3650).default(90),  // For linear mode
  floor: z.number().min(0).max(0.9).default(0.3),
});

export const freshnessDecayConfigSchema = z.object({
  evergreen: evergreenDecayConfigSchema.default({ enabled: false }),
  versioned: versionedDecayConfigSchema.default({ enabled: true, mode: 'step', matchMultiplier: 1.0, mismatchMultiplier: 0.5 }),
  volatile: volatileDecayConfigSchema.default({ enabled: true, mode: 'exponential', halfLifeDays: 30, floor: 0.3 }),
});
```

### 6.3 Default Values Summary

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `volatile.halfLifeDays` | 30 | 1-3650 | Days for volatile content to lose half its value |
| `volatile.floor` | 0.3 | 0-0.9 | Minimum multiplier for volatile content |
| `versioned.mismatchMultiplier` | 0.5 | 0-1 | Multiplier when version doesn't match |
| `evergreen.enabled` | false | - | Evergreen content never decays by time |

---

## 7. Key Technical Decisions for Planning

### 7.1 Required Decisions

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Where to store freshness type? | DecayMeta vs separate field | **DecayMeta** - cleaner, backward compatible |
| When to apply freshness multiplier? | Before vs after stale penalty | **After** - both effects compound |
| Multiplicative or additive? | Multiply vs add/subtract | **Multiplicative** - preserves relative ranking |
| Default freshness type for existing records? | evergreen vs volatile | **evergreen** - safest default |
| Include decay multiplier in citations? | Optional vs required field | **Optional** - backward compatible |

### 7.2 Out of Scope (Deferred in CONTEXT.md)

- Version-mismatch detection for versioned freshness type (requires version extraction)
- Machine learning to auto-classify freshness type from content
- Decay curve visualization dashboard
- Per-team freshness configuration overrides

### 7.3 Testing Strategy

Following existing patterns from `decay/state-machine.test.ts`:

1. **Unit tests for decay curves:**
   - Test exponential decay at various ages
   - Test floor is respected
   - Test boundary conditions (age=0, age=∞)

2. **Unit tests for freshness multiplier computation:**
   - Test each freshness type
   - Test with null DecayMeta (defaults to evergreen)
   - Test with disabled freshness config

3. **Integration tests for rerank:**
   - Test freshness multiplier applied correctly
   - Test interaction with stale penalty
   - Test score capping after multiplier

---

## 8. Files to Create/Modify

### 8.1 New Files

| File | Purpose |
|------|---------|
| `packages/server/src/lib/decay/freshness.ts` | Freshness decay curve functions |
| `packages/server/src/lib/decay/freshness.test.ts` | Unit tests for decay curves |

### 8.2 Modified Files

| File | Changes |
|------|---------|
| `packages/contracts/src/domain/decay.ts` | Add freshnessTypeSchema, freshnessDecayConfigSchema, update decayMetaSchema |
| `packages/server/src/lib/decay/config.ts` | Add loadFreshnessConfig() |
| `packages/server/src/lib/retrieval/rerank.ts` | Apply freshness multiplier, add to RerankConfig |
| `packages/contracts/src/domain/retrieval.ts` | Add decayMultiplier to citation scores |
| `packages/server/src/lib/retrieval/assembly.ts` | Pass decayMultiplier to generateMatchReason |
| `packages/server/src/lib/store.ts` | Update DecayMeta on records |

---

## 9. Open Questions

1. **Version mismatch detection:** How should versioned content detect version mismatch?
   - Requires context about current target version
   - May need Phase 51 (BOUND-01) boundary schema for version constraints

2. **Freshness type assignment:** Who sets the freshness type?
   - Author at submission time?
   - Auto-detected from content?
   - Admin override?

3. **Freshness type transitions:** Can freshness type change over time?
   - e.g., volatile → evergreen after stabilization?
   - Requires re-verification workflow

---

## 10. References

- Phase 48 context: `.planning/phases/48-decay-state-transitions/`
- Decay contracts: `packages/contracts/src/domain/decay.ts`
- State machine: `packages/server/src/lib/decay/state-machine.ts`
- Rerank module: `packages/server/src/lib/retrieval/rerank.ts`
- Governance eligibility: `packages/server/src/lib/governance/eligibility.ts`
- Retrieval assembly: `packages/server/src/lib/retrieval/assembly.ts`

---

*Research completed: 2026-05-02*
