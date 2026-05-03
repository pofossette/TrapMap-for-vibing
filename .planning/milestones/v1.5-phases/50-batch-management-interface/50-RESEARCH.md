# Phase 50: Batch Management Interface - Research

**Researched:** 2026-05-02
**Domain:** CLI batch operations over decay-aware knowledge lifecycle
**Confidence:** HIGH

## Summary

Phase 50 builds a batch management interface that enables maintainers to discover, inspect, and act upon outdated or erroneous knowledge entries. It sits on top of the lifecycle state machine (Phase 48) and freshness decay (Phase 49), adding a CLI-driven discovery and action layer. The existing operations route (`/v1/operations/knowledge`) already provides a list endpoint with filtering by `lifecycleState`, `scope`, `requiredLevelMax`, and `ownerUserId`, but it lacks decay-state awareness and batch mutation capabilities.

The four success criteria map to: (1) extending the existing list endpoint with decay-state filters and age-based filtering, (2) new server-side batch mutation endpoints for extend/mark-review/deactivate/supersede, (3) leveraging the existing retrieval pipeline with a lifecycle-state facet for discovery, and (4) a dry-run mode that simulates batch mutations without persisting changes.

**Primary recommendation:** Extend the existing operations pattern -- add a `decay-stale` CLI subcommand for discovery, a `decay-batch` subcommand for mutations, and wire them to new server endpoints under `/v1/operations/decay/` that reuse the pure functions from `decay/state-machine.ts` and `decay/supersede.ts`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DECAY-03 | Maintainer can perform batch management of outdated/erroneous knowledge through retrieval-based discovery interface | Existing list endpoint pattern + decay state machine + retrieval pipeline provide all building blocks; this phase adds the batch management surface on top |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Stale/expired entry discovery | API / Backend | -- | Server computes decay states from `decayMeta` using `computeDecayState`; CLI is a thin HTTP client |
| Batch action execution (extend, mark-review, deactivate, supersede) | API / Backend | -- | All mutations require `store.transact()` and lifecycle event logging; must be atomic per batch |
| Retrieval-based discovery with lifecycle facet | API / Backend | -- | Reuses existing retrieval pipeline (`filters.ts`, `rerank.ts`) with decay-state enrichment |
| Dry-run preview | API / Backend | -- | Server simulates mutations in-memory without calling `store.transact()` |
| CLI command surface | Browser / Client | -- | CLI is a Commander-based HTTP client that formats server responses |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| commander | already installed | CLI command framework | Existing pattern across all CLI commands [VERIFIED: codebase] |
| zod | already installed | Schema validation | Existing pattern in contracts and route handlers [VERIFIED: codebase] |
| fastify | already installed | HTTP server framework | Existing pattern in all route files [VERIFIED: codebase] |
| vitest | already installed | Test framework | Existing pattern; vitest.config.ts at repo root [VERIFIED: codebase] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @trapmap/contracts | workspace | Shared Zod schemas and types | All new schemas for batch operations |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `/v1/operations/decay/` routes | Extend existing `/v1/operations/knowledge` route | New routes keep decay concerns isolated; existing route is already long (1000+ lines) |

**Installation:**
No new packages needed. All dependencies are already in the project.

## Architecture Patterns

### System Architecture Diagram

```
CLI (Commander)                         Server (Fastify)
    |                                       |
    v                                       v
trapmap decay-stale           GET /v1/operations/decay/entries
  --state <state>         --->|  filter entries by decay state
  --age-min <days>            |  compute age from decayMeta.lastVerifiedAt
  --age-max <days>            |  apply category/label filters
  --category <labels>         |  return enriched list items
  --dry-run                   |
    |                         |
    v                         |
trapmap decay-batch           |
  --action extend         --->|  POST /v1/operations/decay/batch
  --action deactivate         |    validate entries exist and are eligible
  --action mark-review        |    compute planned changes
  --action supersede          |    if dry-run: return plan without persisting
  --entries <ids>             |    if !dry-run: store.transact() for each entry
  --query <search>            |    log lifecycle events per entry
  --dry-run                   |    return batch results
    |                         |
    v                         |
trapmap decay-search      --->|  POST /v1/operations/decay/search
  --state <state>             |    reuse retrieval pipeline
  --pattern <text>            |    add lifecycle-state facet filter
                              |    return matches with decay metadata
```

### Recommended Project Structure
```
packages/contracts/src/domain/
  decay.ts                    # (exists) Add batch operation schemas
  operations.ts               # (exists) Add batch management schemas

packages/server/src/lib/decay/
  state-machine.ts            # (exists) Reuse computeDecayState
  config.ts                   # (exists) Reuse loadDecayConfig
  supersede.ts                # (exists) Reuse supersedeEntry
  freshness.ts                # (exists) Reuse computeFreshnessMultiplier
  batch.ts                    # NEW: batch mutation logic (pure functions)
  batch.test.ts               # NEW: batch mutation tests

packages/server/src/routes/
  decay.ts                    # NEW: batch management routes
  decay.test.ts               # NEW: route tests

packages/cli/src/commands/
  decay.ts                    # NEW: CLI commands for decay management
  decay.test.ts               # NEW: CLI command tests

packages/server/src/lib/knowledge.ts  # (exists) Extend toKnowledgeListItem
```

### Pattern 1: Batch Mutation with Dry-Run
**What:** Server-side batch operations that first validate all targets, compute planned changes, then optionally persist.
**When to use:** All batch actions (extend, mark-review, deactivate, supersede).
**Example:**
```typescript
// packages/server/src/lib/decay/batch.ts

interface BatchOperationInput {
  entryIds: string[];
  action: 'extend' | 'mark-review' | 'deactivate' | 'supersede';
  dryRun: boolean;
  actorId: string;
  // Action-specific params
  extendDays?: number;
  replacementId?: string; // for supersede
}

interface BatchOperationPlan {
  entries: Array<{
    entryId: string;
    currentDecayState: DecayState;
    proposedDecayState: DecayState;
    proposedChange: string; // human-readable description
    eligible: boolean;
    reason?: string; // if not eligible
  }>;
  totalAffected: number;
}

function planBatchOperation(
  data: StoreData,
  input: BatchOperationInput,
  config: DecayConfig,
  now: Date,
): BatchOperationPlan {
  // Pure function: compute what would change without mutating
}
```

### Pattern 2: Decay-State Enriched Listing
**What:** Extend the existing knowledge list pattern to include computed decay state and age.
**When to use:** The `decay-stale` CLI command.
**Example:**
```typescript
// New response schema in contracts
const decayAwareListItemSchema = knowledgeListItemSchema.extend({
  decayState: decayStateSchema.nullable(),
  freshnessType: freshnessTypeSchema.nullable(),
  ageDays: z.number().nullable(),
  lastVerifiedAt: isoTimestampSchema.nullable(),
  supersededById: entityIdSchema.nullable(),
});
```

### Pattern 3: Retrieval-Based Discovery with Decay Facet
**What:** Reuse the retrieval pipeline but add a decay-state filter that runs before recall.
**When to use:** The `decay-search` CLI command for pattern-based discovery.
**Example:**
```typescript
// Extend retrieval filters to support decay state facet
const decaySearchQuerySchema = z.object({
  pattern: z.string().min(1).max(2000),
  decayStates: z.array(decayStateSchema).min(1),
  labels: z.array(labelSchema).optional(),
  scope: scopeSchema.optional(),
  limit: z.number().int().min(1).max(100).default(25),
});
```

### Anti-Patterns to Avoid
- **Mutating entries without lifecycle events:** Every batch action must push a `KnowledgeLifecycleEventRecord` to `entry.lifecycleHistory` -- this is the audit trail.
- **Running batch mutations outside `store.transact()`:** All mutations must be inside a single transaction for consistency.
- **Computing decay state in the CLI:** Decay computation must happen server-side using the same `computeDecayState` function the retrieval pipeline uses.
- **Skipping permission checks on batch operations:** Each batch mutation must require `knowledge:update` permission, same as existing edit/deactivate endpoints.
- **Omitting dry-run from supersede:** Supersede is destructive (sets `supersededById`); dry-run must show exactly what would change.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Decay state computation | Custom age calculation in batch handler | `computeDecayState` from `decay/state-machine.ts` | Already handles null decayMeta, superseded sticky state, threshold ordering |
| Supersede logic | Custom supersededById assignment | `supersedeEntry` from `decay/supersede.ts` | Already validates self-supersede, approved state, creates lifecycle events |
| Freshness multiplier | Custom decay curve calculation | `computeFreshnessMultiplier` from `decay/freshness.ts` | Already handles evergreen/versioned/volatile with configurable curves |
| Retrieval filtering with decay | Custom filter pipeline | `filterGovernedEntities` with `excludeDecayed: false` from `governance/eligibility.ts` | Already handles security, team, scope, label, and decay filtering |
| Config loading | Custom env var reading | `loadDecayConfig` from `decay/config.ts` | Already validates via Zod, provides defaults |
| Lifecycle event creation | Manual event object construction | Follow existing pattern in `deactivate` route (lifecycleHistory.push + audit event) | Consistent audit trail format |

**Key insight:** The Phase 48/49 infrastructure provides all the pure functions needed. This phase is primarily a routing and CLI surface layer that composes existing primitives.

## Common Pitfalls

### Pitfall 1: Missing Decay State Computation
**What goes wrong:** Listing entries without computing their current decay state -- using the stored `decayMeta.decayState` instead of recomputing.
**Why it happens:** `decayMeta.decayState` may be stale if `decayStateComputedAt` is old; the state is lazily computed.
**How to avoid:** Always call `computeDecayState(entry.decayMeta, config, now)` when listing, not `entry.decayMeta?.decayState`.
**Warning signs:** Entries showing `active` state even though their `lastVerifiedAt` is older than `reviewDueDays`.

### Pitfall 2: Batch Size Explosion
**What goes wrong:** Processing hundreds of entries in a single `store.transact()` call, causing memory or performance issues.
**Why it happens:** The in-memory store iterates all entries per lookup; large batches amplify this.
**How to avoid:** Cap batch size at 100 entries per request. For larger operations, require multiple calls with pagination.
**Warning signs:** Batch requests taking > 5 seconds, or memory warnings in logs.

### Pitfall 3: Supersede Without Replacement
**What goes wrong:** Calling supersede action without providing a `replacementId`, leaving entries orphaned.
**Why it happens:** The supersede action requires a replacement entry to link to.
**How to avoid:** Validate `replacementId` is provided and exists before executing supersede batch action.
**Warning signs:** Entries with `supersededById: null` but `decayState: 'superseded'`.

### Pitfall 4: Extending Lifecycle Without Updating `lastVerifiedAt`
**What goes wrong:** "Extend lifecycle" action sets a new threshold but doesn't reset `lastVerifiedAt`, so the entry immediately re-enters the same decay state.
**Why it happens:** `computeDecayState` uses `lastVerifiedAt` as the age baseline; extending without resetting has no effect.
**How to avoid:** The "extend" action must update `decayMeta.lastVerifiedAt` to `now`, which effectively resets the decay clock.
**Warning signs:** Dry-run shows entry would move from `stale` to `active`, but after apply it stays `stale`.

### Pitfall 5: Dry-Run Inconsistency
**What goes wrong:** Dry-run plan shows different results than the actual apply because state changed between dry-run and apply.
**Why it happens:** Another user or process mutated entries between the dry-run request and the apply request.
**How to avoid:** Document that dry-run is a point-in-time snapshot. Consider adding an `If-None-Match` style checksum for critical operations, but this is likely overkill for v1.5 scope.
**Warning signs:** User reports "dry-run said 5 entries, but only 3 were actually changed."

## Code Examples

### Decay-State Enriched List Response Schema
```typescript
// Source: New schemas to add to packages/contracts/src/domain/decay.ts

export const decayAwareListItemSchema = z.object({
  id: entityIdSchema,
  scope: scopeSchema,
  labels: z.array(labelSchema),
  shortcut: z.string(),
  lifecycleState: lifecycleStateSchema,
  requiredLevel: securityLevelSchema,
  updatedAt: z.string(),
  // Decay-specific fields
  decayState: decayStateSchema.nullable(),
  freshnessType: freshnessTypeSchema.nullable(),
  ageDays: z.number().nullable(),
  lastVerifiedAt: isoTimestampSchema.nullable(),
  supersededById: entityIdSchema.nullable(),
});

export const decayEntryListRequestSchema = z.object({
  decayStates: z.array(decayStateSchema).optional(),
  ageMinDays: z.number().int().min(0).optional(),
  ageMaxDays: z.number().int().min(0).optional(),
  labels: z.array(labelSchema).optional(),
  scope: scopeSchema.optional(),
  limit: z.number().int().min(1).max(100).default(25),
});

export const decayEntryListResponseSchema = z.object({
  items: z.array(decayAwareListItemSchema),
  total: z.number().int().min(0),
});
```

### Batch Operation Request/Response Schemas
```typescript
// Source: New schemas to add to packages/contracts/src/domain/decay.ts

export const batchActionSchema = z.enum([
  'extend',
  'mark-review',
  'deactivate',
  'supersede',
]);

export const batchOperationRequestSchema = z.object({
  action: batchActionSchema,
  entryIds: z.array(entityIdSchema).min(1).max(100),
  dryRun: z.boolean().default(false),
  // Action-specific parameters
  extendDays: z.number().int().min(1).max(3650).optional(), // for 'extend'
  replacementId: entityIdSchema.optional(), // for 'supersede'
});

export const batchOperationItemSchema = z.object({
  entryId: entityIdSchema,
  shortcut: z.string(),
  currentDecayState: decayStateSchema.nullable(),
  proposedDecayState: decayStateSchema.nullable(),
  changeDescription: z.string(),
  eligible: z.boolean(),
  ineligibilityReason: z.string().nullable(),
});

export const batchOperationResponseSchema = z.object({
  action: batchActionSchema,
  dryRun: z.boolean(),
  items: z.array(batchOperationItemSchema),
  totalEligible: z.number().int().min(0),
  totalIneligible: z.number().int().min(0),
  appliedAt: isoTimestampSchema.nullable(), // null when dryRun=true
});
```

### CLI Command Registration Pattern
```typescript
// Source: Following existing pattern from packages/cli/src/commands/operations.ts

export function registerDecayCommands(
  program: Command,
  options: { allowManage: boolean },
): void {
  program
    .command('decay-stale')
    .description('List knowledge entries by decay state')
    .option('--state <states>', 'Filter by decay state (comma-separated: active,review-due,stale,expired,superseded)')
    .option('--age-min <days>', 'Minimum age in days')
    .option('--age-max <days>', 'Maximum age in days')
    .option('--label <labels>', 'Filter by labels (comma-separated)')
    .option('--scope <scope>', 'Filter by scope (global or project)')
    .option('--limit <n>', 'Maximum entries to return', '25')
    .option('--json', 'Output JSON')
    .action(async (flags) => {
      const state = await loadCliState();
      requireSessionToken(state);
      // ... build query params, call API, format output
    });

  program
    .command('decay-batch')
    .description('Apply batch operations to decayed entries')
    .requiredOption('--action <action>', 'Action: extend, mark-review, deactivate, supersede')
    .requiredOption('--entries <ids>', 'Comma-separated entry IDs')
    .option('--extend-days <n>', 'Days to extend lifecycle (for extend action)')
    .option('--replacement <id>', 'Replacement entry ID (for supersede action)')
    .option('--dry-run', 'Show what would change without applying')
    .option('--json', 'Output JSON')
    .action(async (flags) => {
      // ...
    });

  program
    .command('decay-search')
    .description('Search entries matching patterns with lifecycle state facet')
    .argument('[pattern]', 'Search pattern')
    .option('--state <states>', 'Filter by decay state (comma-separated)')
    .option('--label <labels>', 'Filter by labels (comma-separated)')
    .option('--scope <scope>', 'Filter by scope')
    .option('--limit <n>', 'Maximum results', '25')
    .option('--json', 'Output JSON')
    .action(async (pattern, flags) => {
      // ... reuse retrieval endpoint with decay-state facet
    });
}
```

### Server Route Pattern
```typescript
// Source: Following existing pattern from packages/server/src/routes/operations.ts

import { computeDecayState } from '../lib/decay/state-machine.js';
import { loadDecayConfig } from '../lib/decay/config.js';

app.get('/v1/operations/decay/entries', async (request) => {
  const auth = await resolveAuthContext(app.skillShareer, request);
  requirePermission(auth, 'knowledge:export');

  const query = decayEntryListRequestSchema.parse(request.query);
  const data = await app.skillShareer.store.snapshot();
  const config = loadDecayConfig();

  let entries = data.knowledgeEntries;

  // Permission filtering (same pattern as existing list endpoint)
  if (auth.subjectType !== 'system-admin') {
    entries = entries.filter((entry) =>
      auth.securityLevel > entry.requiredLevel ||
      (entry.teamId && auth.activeTeamId === entry.teamId)
    );
  }

  // Compute and filter by decay state
  const enrichedEntries = entries.map((entry) => {
    const decayResult = computeDecayState(entry.decayMeta, config);
    const ageDays = entry.decayMeta
      ? (Date.now() - new Date(entry.decayMeta.lastVerifiedAt).getTime()) / (86400000)
      : null;
    return { entry, decayState: decayResult.decayState, ageDays };
  });

  // Apply filters
  // ... filter by decayStates, ageMinDays, ageMaxDays, labels, scope

  return decayEntryListResponseSchema.parse({ items, total });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual per-entry inspection | Batch listing with decay-state facets | Phase 50 | Maintainability at scale |
| Individual deactivate/supersede endpoints | Batch mutation with dry-run preview | Phase 50 | Safety for bulk operations |
| List-only discovery | Retrieval-based pattern matching with lifecycle facet | Phase 50 | Discovery beyond simple listing |

**Deprecated/outdated:**
- None in this phase; all Phase 48/49 APIs remain stable.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `knowledge:update` permission is sufficient for all batch mutations (extend, mark-review, deactivate, supersede) | Architecture Patterns | May need a separate `knowledge:decay-manage` permission if governance requires finer-grained access |
| A2 | Batch size cap of 100 entries is acceptable for v1.5 | Pitfalls | May need server-side pagination or streaming for larger corpora |
| A3 | `mark-review` action sets `decayMeta.lastVerifiedAt` to now and resets decay state to `active` (equivalent to "extend with 0 extra days") | Code Examples | The semantics of "mark for review" could mean different things -- clarify with product intent |
| A4 | Retrieval-based discovery reuses the existing v1 retrieval endpoint with added decay-state filter params | Architecture Patterns | If the retrieval pipeline cannot easily accept decay-state filtering, a separate search endpoint may be needed |

## Open Questions

1. **"Mark for review" semantics**
   - What we know: The success criteria list "mark for review" as a batch action.
   - What's unclear: Does this mean (a) marking the entry's `decayState` as `review-due` explicitly, or (b) resetting the verification clock so the entry stays `active` longer? Option (a) is a manual state override; option (b) is effectively "extend lifecycle".
   - Recommendation: Treat "mark for review" as setting `decayState` to `review-due` explicitly, overriding the age-based computation. This creates a manual review queue distinct from automatic transitions. If the intent is "extend", that should be a separate action.

2. **Retrieval-based discovery endpoint**
   - What we know: Success criteria 3 says "search for entries matching patterns with lifecycle state facet".
   - What's unclear: Should this be a new endpoint or an extension of the existing `/v1/retrieval/search` with a decay-state filter?
   - Recommendation: Create a dedicated `/v1/operations/decay/search` endpoint that reuses retrieval pipeline internals but returns decay-enriched results. This avoids polluting the retrieval contract with admin-only decay metadata.

3. **Batch supersede with different replacements**
   - What we know: The batch action "supersede with replacement" requires a replacement ID.
   - What's unclear: Can each entry in a batch be superseded by a different replacement, or is one replacement used for all entries?
   - Recommendation: For v1.5, one replacement for all entries in the batch. If per-entry replacements are needed, use the existing single-entry supersede endpoint iteratively.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (workspace project config) |
| Config file | `vitest.config.ts` (repo root) |
| Quick run command | `pnpm test --project server -- packages/server/src/lib/decay/batch.test.ts` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DECAY-03 | List entries by decay state with age filtering | unit | `pnpm test --project server -- packages/server/src/lib/decay/batch.test.ts` | Wave 0 |
| DECAY-03 | Batch extend lifecycle | unit | `pnpm test --project server -- packages/server/src/lib/decay/batch.test.ts` | Wave 0 |
| DECAY-03 | Batch mark for review | unit | `pnpm test --project server -- packages/server/src/lib/decay/batch.test.ts` | Wave 0 |
| DECAY-03 | Batch deactivate | unit | `pnpm test --project server -- packages/server/src/lib/decay/batch.test.ts` | Wave 0 |
| DECAY-03 | Batch supersede | unit | `pnpm test --project server -- packages/server/src/lib/decay/batch.test.ts` | Wave 0 |
| DECAY-03 | Dry-run mode returns plan without persisting | unit | `pnpm test --project server -- packages/server/src/lib/decay/batch.test.ts` | Wave 0 |
| DECAY-03 | Decay list route with filters | integration | `pnpm test --project server -- packages/server/src/routes/decay.test.ts` | Wave 0 |
| DECAY-03 | Batch operation route | integration | `pnpm test --project server -- packages/server/src/routes/decay.test.ts` | Wave 0 |
| DECAY-03 | CLI decay-stale command | unit | `pnpm test --project cli -- packages/cli/src/commands/decay.test.ts` | Wave 0 |
| DECAY-03 | CLI decay-batch command | unit | `pnpm test --project cli -- packages/cli/src/commands/decay.test.ts` | Wave 0 |
| DECAY-03 | CLI decay-search command | unit | `pnpm test --project cli -- packages/cli/src/commands/decay.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test --project server -- packages/server/src/lib/decay/batch.test.ts`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/server/src/lib/decay/batch.ts` -- batch mutation pure functions
- [ ] `packages/server/src/lib/decay/batch.test.ts` -- batch mutation tests
- [ ] `packages/server/src/routes/decay.ts` -- batch management routes
- [ ] `packages/server/src/routes/decay.test.ts` -- route tests
- [ ] `packages/cli/src/commands/decay.ts` -- CLI commands
- [ ] `packages/cli/src/commands/decay.test.ts` -- CLI tests

## Sources

### Primary (HIGH confidence)
- Codebase inspection of `packages/contracts/src/domain/decay.ts` -- decay state schema, DecayMeta type [VERIFIED]
- Codebase inspection of `packages/server/src/lib/decay/state-machine.ts` -- computeDecayState function [VERIFIED]
- Codebase inspection of `packages/server/src/lib/decay/supersede.ts` -- supersedeEntry function [VERIFIED]
- Codebase inspection of `packages/server/src/lib/decay/freshness.ts` -- computeFreshnessMultiplier function [VERIFIED]
- Codebase inspection of `packages/server/src/lib/decay/config.ts` -- loadDecayConfig function [VERIFIED]
- Codebase inspection of `packages/server/src/lib/governance/eligibility.ts` -- isGovernanceEligible with decay filtering [VERIFIED]
- Codebase inspection of `packages/server/src/lib/retrieval/filters.ts` -- decay state in retrieval filtering [VERIFIED]
- Codebase inspection of `packages/server/src/lib/retrieval/rerank.ts` -- freshness multiplier in reranking [VERIFIED]
- Codebase inspection of `packages/server/src/routes/operations.ts` -- existing list/deactivate patterns [VERIFIED]
- Codebase inspection of `packages/server/src/routes/knowledge.ts` -- supersede route pattern [VERIFIED]
- Codebase inspection of `packages/cli/src/commands/operations.ts` -- CLI command patterns [VERIFIED]
- Codebase inspection of `packages/cli/src/index.ts` -- command registration pattern [VERIFIED]
- Codebase inspection of `packages/contracts/src/domain/operations.ts` -- existing list/deactivate schemas [VERIFIED]
- Codebase inspection of `packages/contracts/src/domain/common.ts` -- lifecycleState, permission schemas [VERIFIED]
- Phase 48-03 SUMMARY.md -- hard/soft decay integration details [VERIFIED]

### Secondary (MEDIUM confidence)
- None needed; all findings verified from codebase.

### Tertiary (LOW confidence)
- None; no assumptions used for architectural decisions.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, verified by codebase inspection
- Architecture: HIGH - follows existing patterns in operations/knowledge routes
- Pitfalls: HIGH - derived from understanding the decay state machine and store transaction model

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (stable codebase, no external dependencies)
