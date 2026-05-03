# Phase 48: Lifecycle State Machine - Research

**Researched:** 2026-05-02
**Domain:** Knowledge lifecycle management with time-based state transitions and retrieval decay
**Confidence:** HIGH

## Summary

Phase 48 introduces a decay lifecycle state machine that operates alongside the existing approval lifecycle. The current system has a simple `lifecycleState` enum (`draft`, `submitted`, `agent-pass`, `agent-rejected`, `approved`, `rejected`, `deactivated`) governing the editorial lifecycle. This phase adds a parallel decay dimension: entries that are `approved` will automatically transition through `active -> review-due -> stale -> expired` states based on time thresholds and a `lastVerifiedAt` timestamp. The decay lifecycle feeds into the retrieval pipeline by excluding expired/superseded entries from default responses (hard decay) and applying ranking penalties to stale entries (soft decay).

The architecture must extend two existing domains: the contracts layer (`@trapmap/contracts`) for new schemas and the server governance/retrieval pipeline for decay application. The state machine is simple enough (4 states, linear progression plus manual supersede) that a hand-rolled implementation using Zod-validated transition functions is the right choice -- no XState dependency needed. Configuration should use the existing env-var + Zod validation pattern from `packages/server/src/config.ts`.

**Primary recommendation:** Extend the existing `lifecycleState` enum with decay states, add a `decayMeta` field to knowledge/artifact records, implement a pure `computeDecayState()` function for state transitions, and integrate decay filtering into the existing `governance/eligibility.ts` pipeline.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Decay state computation | API / Backend | -- | State transitions are time-based computations on server data |
| Decay configuration loading | API / Backend | -- | Config is loaded server-side via Zod-validated env vars |
| Hard decay filtering (exclusion) | API / Backend | -- | Happens in governance/eligibility before recall |
| Soft decay penalty (ranking) | API / Backend | -- | Applied in retrieval rerank stage |
| Manual supersede action | API / Backend | CLI | Admin triggers via CLI command, server executes |
| Decay state visibility | CLI | -- | Users see lifecycle state in output formatting |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | ^4.3.6 | Schema validation for decay config and state transitions | Already in use across all packages for contract validation |
| vitest | ^4.1.5 | Testing decay state transitions and decay filtering | Existing test framework in monorepo |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | -- | -- | The state machine is simple enough to implement without a library |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled FSM | XState v5 | XState adds ~30KB and complexity for a 4-state linear machine. Overkill when Zod validates transitions and tests cover edge cases. The decay machine has no parallel states, no guards beyond time checks, and no hierarchical nesting. [ASSUMED] |

**Installation:**
```bash
# No new packages needed -- zod and vitest already installed
```

**Version verification:**
```bash
npm view zod version   # 4.4.2 (already installed ^4.3.6)
npm view vitest version # 4.1.5 (already installed)
```

## Architecture Patterns

### System Architecture Diagram

```
                    Config (env vars)
                         |
                         v
              +------------------+
              | DecayConfig      |
              | (Zod-validated)  |
              +--------+---------+
                       |
   +-------------------+-------------------+
   |                                       |
   v                                       v
+------------------+              +------------------+
| computeDecayState|              | Decay Thresholds |
| (pure function)  |              | reviewDue/stale/ |
|                  |              | expire days      |
+--------+---------+              +------------------+
         |
         | (returns decay state + meta)
         v
+------------------+      +-------------------+
| Knowledge/       |      | SkillArtifact     |
| Artifact Record  |      | Record            |
| (decayMeta field)|      | (decayMeta field) |
+--------+---------+      +--------+----------+
         |                         |
         +------------+------------+
                      |
                      v
           +---------------------+
           | Governance/         |
           | Eligibility Filter  |
           | (hard decay:        |
           |  exclude expired/   |
           |  superseded)        |
           +----------+----------+
                      |
                      v
           +---------------------+
           | Retrieval Rerank    |
           | (soft decay:        |
           |  penalty for stale) |
           +----------+----------+
                      |
                      v
           +---------------------+
           | API Response        |
           | (decayState visible |
           |  in metadata)       |
           +---------------------+

Manual Admin Actions:
  supersede(entryId, replacementId) --> updates decayState, creates relationship
  extend(entryId, days)             --> resets lastVerifiedAt
```

### Recommended Project Structure
```
packages/contracts/src/domain/
  decay.ts                    # NEW: decay state enum, config schema, decay meta schema
  (update common.ts)          # extend lifecycleStateSchema with decay states

packages/server/src/lib/
  decay/
    state-machine.ts          # computeDecayState() pure function
    state-machine.test.ts     # unit tests for all transitions
    config.ts                 # loadDecayConfig() from env vars
    config.test.ts            # config validation tests
    supersede.ts              # supersedeEntry() mutation logic
    supersede.test.ts         # supersede tests
  (update governance/eligibility.ts)  # integrate hard decay filtering
  (update governance/types.ts)        # add decay fields to GovernedEntity
  (update retrieval/rerank.ts)        # apply soft decay penalty

packages/server/src/routes/
  (update knowledge.ts)       # supersede endpoint
  (update traps.ts)           # supersede endpoint for traps
  (update retrieval.ts)       # decay state in response metadata

packages/cli/src/commands/
  (update knowledge.ts)       # add supersede subcommand
```

### Pattern 1: Dual Lifecycle States
**What:** The existing `lifecycleState` handles the editorial lifecycle (draft -> submitted -> approved). The new decay lifecycle is a parallel dimension that only applies to entries where `lifecycleState === 'approved'`.
**When to use:** All approved entries get a decay state computed from their `lastVerifiedAt` timestamp and the configured thresholds.
**Example:**
```typescript
// Source: codebase analysis of existing lifecycleState in common.ts
// Existing editorial lifecycle: draft -> submitted -> agent-pass -> approved
// New decay lifecycle (parallel, only for approved entries):
// active -> review-due -> stale -> expired
// Plus manual state: superseded (set by admin action)

// The editorial lifecycleState remains authoritative for governance.
// A new decayState field is computed at query time or cached.

interface DecayMeta {
  /** When this entry was last verified by a maintainer */
  lastVerifiedAt: string; // ISO timestamp
  /** Current decay state, computed from lastVerifiedAt + config thresholds */
  decayState: 'active' | 'review-due' | 'stale' | 'expired' | 'superseded';
  /** If superseded, the ID of the replacement entry */
  supersededById: string | null;
  /** Timestamp when decay state was last computed (for caching) */
  decayStateComputedAt: string;
}
```

### Pattern 2: Pure State Computation Function
**What:** A pure function that takes an entry's metadata and config, returns the current decay state. No side effects, easily testable.
**When to use:** Every retrieval query and every admin view needs to know the current decay state.
**Example:**
```typescript
// packages/server/src/lib/decay/state-machine.ts
interface DecayConfig {
  reviewDueDays: number;  // days after lastVerifiedAt before review-due
  staleDays: number;      // days after lastVerifiedAt before stale
  expireDays: number;     // days after lastVerifiedAt before expired
}

interface DecayableEntry {
  lastVerifiedAt: string;
  decayState: DecayState;
  supersededById: string | null;
}

function computeDecayState(
  entry: DecayableEntry,
  config: DecayConfig,
  now: Date = new Date(),
): { decayState: DecayState; decayStateComputedAt: string } {
  // Manual supersede takes precedence
  if (entry.supersededById !== null) {
    return { decayState: 'superseded', decayStateComputedAt: now.toISOString() };
  }
  if (entry.decayState === 'superseded') {
    return { decayState: 'superseded', decayStateComputedAt: now.toISOString() };
  }

  const lastVerified = new Date(entry.lastVerifiedAt);
  const ageDays = (now.getTime() - lastVerified.getTime()) / (1000 * 60 * 60 * 24);

  if (ageDays >= config.expireDays) {
    return { decayState: 'expired', decayStateComputedAt: now.toISOString() };
  }
  if (ageDays >= config.staleDays) {
    return { decayState: 'stale', decayStateComputedAt: now.toISOString() };
  }
  if (ageDays >= config.reviewDueDays) {
    return { decayState: 'review-due', decayStateComputedAt: now.toISOString() };
  }
  return { decayState: 'active', decayStateComputedAt: now.toISOString() };
}
```

### Pattern 3: Decay-Aware Governance Filtering
**What:** Extend the existing `isGovernanceEligible()` to check decay state in addition to editorial lifecycle state.
**When to use:** Every retrieval path uses governance eligibility. Adding decay checks here ensures consistent behavior across v1, v2, and graph-plan routes.
**Example:**
```typescript
// Modified isGovernanceEligible in governance/eligibility.ts
// Add decayState field to GovernedEntity interface
export function isGovernanceEligible(
  entity: GovernedEntity & { decayState?: DecayState },
  context: GovernanceContext,
): boolean {
  // Existing editorial lifecycle check
  if (entity.lifecycleState !== 'approved') return false;
  // Hard decay: exclude expired and superseded from default retrieval
  if (entity.decayState === 'expired' || entity.decayState === 'superseded') return false;
  // ... rest of existing checks (security level, team access)
}
```

### Anti-Patterns to Avoid
- **Storing decay state as part of lifecycleState enum:** The existing `lifecycleState` serves the editorial workflow. Mixing decay states into it would break the approval/deactivation logic that checks `lifecycleState === 'approved'`. Keep them separate. [VERIFIED: codebase analysis of lifecycleStateSchema usage in governance, knowledge, and review modules]
- **Using a cron job for state transitions:** Computing decay state at query time from `lastVerifiedAt` is simpler and avoids background infrastructure. A cron job would require scheduling, error recovery, and stale-cache concerns. [ASSUMED]
- **Making decay state a database column:** The state is fully deterministic from `lastVerifiedAt + config + now`. A computed field avoids migration and consistency issues. If performance becomes a concern later, add a materialized/cache column. [ASSUMED]
- **Applying soft decay in the eligibility filter:** Soft decay (ranking penalty) should happen in the rerank stage, not the eligibility filter. The eligibility filter returns booleans; ranking penalties need score manipulation. [VERIFIED: codebase analysis of retrieval pipeline in orchestrator.ts shows separate eligibility -> recall -> rerank stages]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Config validation | Manual env var parsing | Zod schema with defaults (existing pattern) | Server config already uses Zod for validation -- extend the pattern |
| Time-based threshold computation | Custom date arithmetic with timezone bugs | `Date.getTime()` diff with configurable day thresholds | Simple millisecond diff is sufficient; no timezone conversion needed since all timestamps are ISO UTC |
| State transition validation | Ad-hoc if/else chains | Transition table (map of from-state to valid to-states) | Makes transitions auditable and testable; prevents invalid transitions |

**Key insight:** The decay state machine is simple enough (linear progression + manual supersede) that no state machine library is warranted. The complexity lies in integrating it correctly with the existing governance and retrieval pipelines, not in the state machine itself.

## Common Pitfalls

### Pitfall 1: Breaking Governance Eligibility
**What goes wrong:** Adding decay checks to `isGovernanceEligible()` without considering that the function is used by both retrieval (should exclude expired) and admin views (should show all states).
**Why it happens:** The governance module is shared across retrieval filters, capsule recall, and admin routes.
**How to avoid:** Add decay filtering as a separate, opt-in parameter on the eligibility check. Retrieval passes `{ excludeDecayed: true }`, admin views pass `{ excludeDecayed: false }`.
**Warning signs:** Admin routes return empty results after phase deployment.

### Pitfall 2: Treating Decay State as Persistent
**What goes wrong:** Storing `decayState` in the record and not recomputing it at query time. An entry marked `review-due` yesterday could be `stale` today, but the stored value is stale.
**Why it happens:** It feels natural to store state in the record like `lifecycleState`.
**How to avoid:** Always compute decay state from `lastVerifiedAt` at query time. Store only `lastVerifiedAt`, `supersededById`, and optionally a `decayStateComputedAt` cache timestamp. Recompute when the cache is older than a configurable threshold (or always for correctness).
**Warning signs:** Decay states don't change even after the configured number of days passes.

### Pitfall 3: Not Initializing DecayMeta for Existing Entries
**What goes wrong:** Existing approved entries don't have `decayMeta`. Code that accesses `entry.decayMeta.lastVerifiedAt` crashes or returns undefined.
**Why it happens:** Migration oversight -- new field on existing records.
**How to avoid:** Default `decayMeta` to `{ lastVerifiedAt: entry.updatedAt, decayState: 'active', supersededById: null, decayStateComputedAt: entry.updatedAt }` when the field is missing. Test with fixture data that lacks the field.
**Warning signs:** 500 errors on retrieval queries after deployment.

### Pitfall 4: Supersede Without Bidirectional Reference
**What goes wrong:** When entry A is superseded by entry B, only A gets `supersededById = B.id`. But retrieval of B should also show that it supersedes A.
**Why it happens:** Only storing the forward reference.
**How to avoid:** Store `supersededById` on the superseded entry AND a `supersedesIds: string[]` array on the replacement entry. Or store supersession relationships in a separate lookup structure that can be queried in both directions.
**Warning signs:** Admin cannot find which entries a replacement supersedes.

### Pitfall 5: Hard Decay Blocking Admin Recovery
**What goes wrong:** Once an entry is expired, admins cannot find it through retrieval because it's filtered out. They need to "extend" it but can't discover it.
**Why it happens:** Hard decay is applied before admin can see the entry.
**How to avoid:** Admin retrieval should have a flag to include decayed entries. The admin CLI command for listing stale/expired entries must bypass decay filtering.
**Warning signs:** Admins report "my entry disappeared" and cannot recover it.

## Code Examples

Verified patterns from codebase analysis:

### Decay Config Schema (contracts pattern)
```typescript
// Source: pattern from packages/server/src/config.ts
import { z } from 'zod';

export const decayConfigSchema = z.object({
  /** Days after lastVerifiedAt before entry needs review */
  reviewDueDays: z.number().int().min(1).max(3650).default(90),
  /** Days after lastVerifiedAt before entry is considered stale */
  staleDays: z.number().int().min(1).max(3650).default(180),
  /** Days after lastVerifiedAt before entry is expired */
  expireDays: z.number().int().min(1).max(3650).default(365),
  /** Whether decay is enabled (off by default for safe rollout) */
  enabled: z.boolean().default(false),
});

export type DecayConfig = z.infer<typeof decayConfigSchema>;
```

### Decay Meta Schema (contracts pattern)
```typescript
// Source: pattern from packages/contracts/src/domain/common.ts
export const decayStateSchema = z.enum([
  'active',
  'review-due',
  'stale',
  'expired',
  'superseded',
]);

export type DecayState = z.infer<typeof decayStateSchema>;

export const decayMetaSchema = z.object({
  lastVerifiedAt: isoTimestampSchema,
  decayState: decayStateSchema,
  supersededById: entityIdSchema.nullable().default(null),
  decayStateComputedAt: isoTimestampSchema,
});

export type DecayMeta = z.infer<typeof decayMetaSchema>;
```

### Config Loading (server pattern)
```typescript
// Source: pattern from packages/server/src/config.ts
function loadDecayConfig(): DecayConfig {
  return decayConfigSchema.parse({
    reviewDueDays: Number(process.env.TRAPMAP_DECAY_REVIEW_DUE_DAYS || 90),
    staleDays: Number(process.env.TRAPMAP_DECAY_STALE_DAYS || 180),
    expireDays: Number(process.env.TRAPMAP_DECAY_EXPIRE_DAYS || 365),
    enabled: process.env.TRAPMAP_DECAY_ENABLED === 'true',
  });
}
```

### Governance Integration (existing pattern)
```typescript
// Source: packages/server/src/lib/governance/eligibility.ts
// Existing code checks lifecycleState === 'approved'
// Phase 48 adds: AND decayState is not expired/superseded

export function isGovernanceEligible(
  entity: GovernedEntity,
  context: GovernanceContext,
  options?: { excludeDecayed?: boolean },
): boolean {
  if (entity.lifecycleState !== 'approved') return false;

  // Phase 48: hard decay check
  if (options?.excludeDecayed !== false) {
    const decayState = computeDecayState(entity);
    if (decayState === 'expired' || decayState === 'superseded') return false;
  }

  // ... existing security level and team checks unchanged
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Lifecycle state as editorial-only | Dual lifecycle (editorial + decay) | This phase | Entries now have time-based aging independent of editorial state |
| All approved entries equally retrievable | Decay-aware retrieval with hard/soft exclusion | This phase | Expired knowledge stops surfacing; stale knowledge gets penalized |
| Manual lifecycle management | Automatic time-based transitions | This phase | No admin action needed for entries to age through states |

**Deprecated/outdated:**
- None in this phase -- this is a greenfield feature addition

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | XState is overkill for a 4-state linear FSM | Architecture Patterns | Low -- if the state machine grows complex in future phases, XState could be adopted later without breaking changes |
| A2 | Computing decay state at query time is sufficient for performance | Pattern 2, Pitfall 2 | Medium -- if the corpus grows very large (>10K entries), recomputing on every query could be slow. Mitigated by computing only for eligible entries. |
| A3 | Default thresholds (90/180/365 days) are reasonable starting points | Code Examples | Low -- configurable via env vars; defaults can be changed without code changes |
| A4 | The `updatedAt` timestamp is a reasonable fallback for `lastVerifiedAt` on existing entries | Pitfall 3 | Low -- may cause some entries to be immediately stale. Admin can manually extend them. |
| A5 | Decay should be disabled by default (`TRAPMAP_DECAY_ENABLED=false`) for safe rollout | Code Examples | Low -- teams opt in when ready |

**If this table is empty:** All claims in this research were verified or cited -- no user confirmation needed.

## Open Questions

1. **Should decay apply to both KnowledgeRecord and SkillArtifactRecord?**
   - What we know: Both record types have `lifecycleState` and governance integration. The requirement says "knowledge entries" but SkillArtifacts are the newer canonical format.
   - What's unclear: Whether the decay state machine should apply uniformly to both record types.
   - Recommendation: Yes, apply uniformly. Both types feed into the same retrieval pipeline and share the same governance module. The `DecayMeta` should be on both record types.

2. **Should supersession be a separate data structure or inline on the record?**
   - What we know: The requirement mentions "explicit supersession relationship." Inline `supersededById` on the record is simplest.
   - What's unclear: Whether we need a richer relationship model (e.g., reason, timestamp, actor).
   - Recommendation: Start with inline `supersededById` + lifecycle event recording. A separate `supersession` table/collection can be added in Phase 55 (Conflict Detection) if needed.

3. **How does decay interact with the indexing pipeline?**
   - What we know: The indexing pipeline (`lib/indexing/events.ts`) triggers on lifecycle state changes. Expired entries should likely be removed from vector/keyword indexes.
   - What's unclear: Whether decay state transitions should trigger index updates.
   - Recommendation: For Phase 48, compute decay at query time and don't trigger index updates. This keeps the implementation simple. Phase 49 (Decay Ranking) may want to index decay state for ranking.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified -- this phase uses only existing packages: zod, vitest, existing server infrastructure)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.5 |
| Config file | packages/server/vitest.config.ts |
| Quick run command | `pnpm --filter @trapmap/server test -- --reporter=verbose` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DECAY-01 | Configure lifecycle state thresholds | unit | `pnpm --filter @trapmap/server test -- lib/decay/config.test.ts` | Wave 0 |
| DECAY-01 | Automatic state transitions (active -> review-due -> stale -> expired) | unit | `pnpm --filter @trapmap/server test -- lib/decay/state-machine.test.ts` | Wave 0 |
| DECAY-01 | State transitions based on lastVerifiedAt timestamp | unit | `pnpm --filter @trapmap/server test -- lib/decay/state-machine.test.ts` | Wave 0 |
| DECAY-04 | Hard decay: exclude expired/superseded from default retrieval | unit | `pnpm --filter @trapmap/server test -- lib/governance/eligibility.test.ts` | Wave 0 (extend existing) |
| DECAY-04 | Soft decay: ranking penalty for stale entries | unit | `pnpm --filter @trapmap/server test -- lib/retrieval/rerank.test.ts` | Wave 0 (extend existing) |
| DECAY-01 | Admin can manually supersede an entry | unit | `pnpm --filter @trapmap/server test -- lib/decay/supersede.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @trapmap/server test`
- **Per wave merge:** `pnpm test && pnpm typecheck`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/server/src/lib/decay/state-machine.test.ts` -- covers DECAY-01 state transitions
- [ ] `packages/server/src/lib/decay/config.test.ts` -- covers DECAY-01 config loading
- [ ] `packages/server/src/lib/decay/supersede.test.ts` -- covers DECAY-01 manual supersede
- [ ] Extend `packages/server/src/lib/governance/eligibility.test.ts` -- covers DECAY-04 hard decay (existing file, needs new test cases)
- [ ] Extend `packages/server/src/lib/retrieval/rerank.test.ts` -- covers DECAY-04 soft decay (existing file, needs new test cases)
- [ ] `packages/contracts/src/domain/decay.ts` -- new file for decay schemas

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Existing session system handles auth |
| V3 Session Management | no | No session changes |
| V4 Access Control | yes | Decay config changes require admin; supersede requires admin or higher-level access |
| V5 Input Validation | yes | Zod validates all decay config inputs, threshold ranges, and state transitions |
| V6 Cryptography | no | No cryptographic operations |

### Known Threat Patterns for Knowledge Lifecycle

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Config manipulation (setting expireDays=1 to force-expire entries) | Tampering | Admin-only config via env vars; Zod range validation (min 1, max 3650) |
| Unauthorized supersede (non-admin marking entries as superseded) | Elevation of Privilege | Require `knowledge:update` permission (admin-level) for supersede action |
| Decay bypass (direct API access bypassing decay filter) | Tampering | Governance eligibility is applied server-side before any data leaves the API |

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `packages/contracts/src/domain/common.ts` -- existing lifecycleStateSchema enum
- Codebase analysis: `packages/server/src/lib/governance/eligibility.ts` -- governance eligibility filtering
- Codebase analysis: `packages/server/src/lib/retrieval/orchestrator.ts` -- retrieval pipeline stages
- Codebase analysis: `packages/server/src/config.ts` -- config loading pattern
- Codebase analysis: `packages/server/src/lib/store.ts` -- KnowledgeRecord and SkillArtifactRecord types
- Codebase analysis: `packages/contracts/src/domain/knowledge.ts` -- knowledge entry contracts
- Codebase analysis: `packages/contracts/src/domain/artifacts.ts` -- skill artifact contracts
- Codebase analysis: `packages/server/src/lib/retrieval/filters.ts` -- existing eligibility filter integration

### Secondary (MEDIUM confidence)
- npm registry: zod v4.4.2, vitest v4.1.5 version verification
- XState v5 documentation patterns -- evaluated and determined unnecessary for this scope [ASSUMED]

### Tertiary (LOW confidence)
- None -- all findings are based on direct codebase analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies; reuses existing zod/vitest
- Architecture: HIGH - extends existing patterns in governance, config, and retrieval
- Pitfalls: HIGH - derived from analysis of existing code paths and integration points

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (stable -- patterns are codebase-internal, not ecosystem-dependent)
