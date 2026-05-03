# Phase 48: Lifecycle State Machine - Pattern Map

**Mapped:** 2026-05-02
**Files analyzed:** 14 new/modified files
**Analogs found:** 14 / 14

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/contracts/src/domain/decay.ts` | model | CRUD | `packages/contracts/src/domain/common.ts` | exact |
| `packages/contracts/src/index.ts` | config | CRUD | `packages/contracts/src/index.ts` | exact (self-modify) |
| `packages/server/src/lib/decay/state-machine.ts` | service | transform | `packages/server/src/lib/retrieval/rerank.ts` | role-match |
| `packages/server/src/lib/decay/state-machine.test.ts` | test | transform | `packages/server/src/lib/retrieval/routing.test.ts` | role-match |
| `packages/server/src/lib/decay/config.ts` | config | CRUD | `packages/server/src/lib/config/feature-flags.ts` | exact |
| `packages/server/src/lib/decay/config.test.ts` | test | CRUD | `packages/contracts/src/domain/plans.test.ts` | role-match |
| `packages/server/src/lib/decay/supersede.ts` | service | CRUD | `packages/server/src/lib/knowledge.ts` | role-match |
| `packages/server/src/lib/decay/supersede.test.ts` | test | CRUD | `packages/server/src/lib/store.test.ts` | role-match |
| `packages/server/src/lib/governance/types.ts` | model | CRUD | `packages/server/src/lib/governance/types.ts` | exact (self-modify) |
| `packages/server/src/lib/governance/eligibility.ts` | service | request-response | `packages/server/src/lib/governance/eligibility.ts` | exact (self-modify) |
| `packages/server/src/lib/retrieval/rerank.ts` | service | transform | `packages/server/src/lib/retrieval/rerank.ts` | exact (self-modify) |
| `packages/server/src/lib/store.ts` | model | CRUD | `packages/server/src/lib/store.ts` | exact (self-modify) |
| `packages/server/src/routes/knowledge.ts` | route | request-response | `packages/server/src/routes/knowledge.ts` | exact (self-modify) |
| `packages/server/src/routes/traps.ts` | route | request-response | `packages/server/src/routes/traps.ts` | exact (self-modify) |
| `packages/server/src/routes/retrieval.ts` | route | request-response | `packages/server/src/routes/retrieval.ts` | exact (self-modify) |
| `packages/cli/src/commands/knowledge.ts` | component | request-response | `packages/cli/src/commands/knowledge.ts` | exact (self-modify) |

## Pattern Assignments

### `packages/contracts/src/domain/decay.ts` (model, CRUD) -- NEW FILE

**Analog:** `packages/contracts/src/domain/common.ts`

**Imports pattern** (from common.ts lines 1-2):
```typescript
import { z } from 'zod';
```

**Schema definition pattern** (from common.ts lines 3-5, 37-45):
```typescript
export const entityIdSchema = z.string().min(1).max(128);
export const isoTimestampSchema = z.iso.datetime({ offset: true });
// ...
export const lifecycleStateSchema = z.enum([
  'draft',
  'submitted',
  'agent-pass',
  'agent-rejected',
  'approved',
  'rejected',
  'deactivated',
]);
```

**Type export pattern** (from common.ts line 80):
```typescript
export type LifecycleState = z.infer<typeof lifecycleStateSchema>;
```

**What to create:** New file following same pattern -- decay state enum schema, decay config schema, decay meta schema. Reuse `entityIdSchema` and `isoTimestampSchema` from `./common.js`. Export both schemas and inferred types.

---

### `packages/contracts/src/index.ts` (config, CRUD) -- MODIFY

**Analog:** Self (lines 1-15)

**Pattern:** Add `export * from './domain/decay.js';` after the existing domain exports. The barrel file re-exports all domain modules.

**Current structure** (lines 1-14):
```typescript
export * from './domain/artifacts.js';
export * from './domain/auth.js';
export * from './domain/candidates.js';
export * from './domain/common.js';
// ... more domain exports
```

---

### `packages/server/src/lib/decay/state-machine.ts` (service, transform) -- NEW FILE

**Analog:** `packages/server/src/lib/retrieval/rerank.ts`

**Imports pattern** (from rerank.ts lines 22):
```typescript
import type { MergedCandidate, ScoredEntry } from './types.js';
```

**Pure function with config pattern** (from rerank.ts lines 40-48, 68-73):
```typescript
export interface RerankConfig {
  bothChannelBoost?: number;
  tokenDensityBoost?: number;
  maxCandidates?: number;
}

export function rerankCandidates(
  mergedCandidates: MergedCandidate[],
  queryTokens: string[],
  config?: RerankConfig,
): MergedCandidate[] {
  const bothChannelBoost = config?.bothChannelBoost ?? DEFAULT_BOTH_CHANNEL_BOOST;
  // ...
```

**What to create:** `computeDecayState(entry, config, now?)` pure function. Takes `DecayableEntry` and `DecayConfig`, returns computed decay state. No side effects. Accepts optional `now: Date` for testability. Follow the pattern of pure functions with config objects and named constants for defaults.

---

### `packages/server/src/lib/decay/state-machine.test.ts` (test, transform) -- NEW FILE

**Analog:** `packages/server/src/lib/retrieval/routing.test.ts`

**Test imports pattern** (from routing.test.ts lines 1-6):
```typescript
import { beforeEach, describe, expect, it } from 'vitest';

import type { ResolvedAuthContext } from '../context.js';
import type { KnowledgeRecord } from '../store.js';
import { nowIso } from '../store.js';
```

**Describe/it pattern** (from routing.test.ts lines 9-12):
```typescript
describe('selectRetrievalStrategy (v1)', () => {
  describe('explicit mode mapping', () => {
    it('maps semantic to local strategy with correct channels', () => {
```

**What to create:** Test suite for `computeDecayState()` covering: active entry within reviewDueDays, transition to review-due, transition to stale, transition to expired, superseded entry always returns superseded, `now` parameter controls time-based transitions, entry with no decayMeta defaults to active.

---

### `packages/server/src/lib/decay/config.ts` (config, CRUD) -- NEW FILE

**Analog:** `packages/server/src/lib/config/feature-flags.ts`

**Env-var loading pattern** (from feature-flags.ts lines 28-33, 41-48):
```typescript
const ENV_VARS = {
  usePgVectorIndex: 'FEATURE_PG_VECTOR_INDEX',
  usePgKeywordIndex: 'FEATURE_PG_KEYWORD_INDEX',
  usePgVectorRecall: 'FEATURE_PG_VECTOR_RECALL',
  usePgKeywordRecall: 'FEATURE_PG_KEYWORD_RECALL',
} as const;

export function getFeatureFlags(): RetrievalFeatureFlags {
  return {
    usePgVectorIndex: process.env[ENV_VARS.usePgVectorIndex] === 'true',
    // ...
  };
}
```

**What to create:** `loadDecayConfig()` function that reads `TRAPMAP_DECAY_REVIEW_DUE_DAYS`, `TRAPMAP_DECAY_STALE_DAYS`, `TRAPMAP_DECAY_EXPIRE_DAYS`, `TRAPMAP_DECAY_ENABLED` from env vars. Uses Zod schema from contracts for validation with defaults (90/180/365, disabled). Follows same `ENV_VARS` constant + getter function pattern.

---

### `packages/server/src/lib/decay/config.test.ts` (test, CRUD) -- NEW FILE

**Analog:** `packages/contracts/src/domain/plans.test.ts`

**Schema validation test pattern** (from plans.test.ts lines 1-2, 17-29):
```typescript
import { describe, expect, it } from 'vitest';
import { /* schemas */ } from './plans.js';

describe('plans schema contracts', () => {
  describe('planEdgeTypeSchema', () => {
    it('accepts valid plan edge types', () => {
      expect(planEdgeTypeSchema.parse('risk-blocks')).toBe('risk-blocks');
    });

    it('rejects invalid plan edge types like co-occurs-with', () => {
      expect(() => planEdgeTypeSchema.parse('co-occurs-with')).toThrow();
    });
```

**What to create:** Tests for `loadDecayConfig()` covering: default values when no env vars set, custom values from env vars, validation rejects out-of-range days, enabled flag parsing.

---

### `packages/server/src/lib/decay/supersede.ts` (service, CRUD) -- NEW FILE

**Analog:** `packages/server/src/lib/knowledge.ts` (for store mutation patterns)

**Store mutation pattern** (from routes/knowledge.ts lines 69-84, used in knowledge.ts):
```typescript
const entry = await app.skillShareer.store.transact((data) => {
  const record = createKnowledgeEntryRecord({ store, data, ... });
  data.knowledgeEntries.push(record);
  return toKnowledgeEntry(data, record);
});
```

**Error pattern** (from routes/knowledge.ts lines 29-33):
```typescript
throw new AppError(403, 'user_required', 'This workflow requires a real member account');
```

**What to create:** `supersedeEntry()` function that takes store, entryId, replacementId, actorId. Validates both entries exist and are approved. Sets `supersededById` on old entry, records lifecycle event. Uses `AppError` for validation failures.

---

### `packages/server/src/lib/decay/supersede.test.ts` (test, CRUD) -- NEW FILE

**Analog:** `packages/server/src/lib/store.test.ts`

**Store test pattern** (from store.test.ts lines 1-8, 33-42):
```typescript
import { afterEach, describe, expect, it } from 'vitest';

import { JsonStore, nowIso } from './store.js';

function createStore(): SkillShareerStore { /* ... */ }

describe('store contract', () => {
  it('initializes an empty StoreData snapshot on first read', async () => {
    const store = createStore();
    const snapshot = await store.snapshot();
    expect(snapshot.counters).toEqual({});
  });
```

**What to create:** Tests for `supersedeEntry()` using in-memory JsonStore. Covers: successful supersede sets supersededById, rejects if old entry not found, rejects if replacement not found, rejects if either entry not approved, creates lifecycle event on supersede.

---

### `packages/server/src/lib/governance/types.ts` (model, CRUD) -- MODIFY

**Analog:** Self (lines 1-34)

**Current GovernedEntity interface** (lines 25-34):
```typescript
export interface GovernedEntity {
  teamId: string | null;
  scope: Scope;
  requiredLevel: SecurityLevel;
  lifecycleState: LifecycleState;
}
```

**What to change:** Add optional decay state field:
```typescript
export interface GovernedEntity {
  teamId: string | null;
  scope: Scope;
  requiredLevel: SecurityLevel;
  lifecycleState: LifecycleState;
  /** Computed decay state (only meaningful when lifecycleState is 'approved') */
  decayState?: DecayState;
}
```

Also add `DecayState` to the import from `@trapmap/contracts`.

---

### `packages/server/src/lib/governance/eligibility.ts` (service, request-response) -- MODIFY

**Analog:** Self (lines 1-45)

**Current eligibility check** (lines 21-45):
```typescript
export function isGovernanceEligible(entity: GovernedEntity, context: GovernanceContext): boolean {
  if (entity.lifecycleState !== 'approved') {
    return false;
  }
  if (context.isSystemAdmin) {
    return true;
  }
  if (context.securityLevel < entity.requiredLevel) {
    return false;
  }
  if (entity.teamId !== null && entity.teamId !== context.teamId) {
    return false;
  }
  return true;
}
```

**What to change:** Add optional `options` parameter with `excludeDecayed` flag (defaults to true for backward compatibility). When `excludeDecayed !== false`, check that `entity.decayState` is not `'expired'` or `'superseded'`. This preserves the existing call signature while adding decay awareness.

---

### `packages/server/src/lib/retrieval/rerank.ts` (service, transform) -- MODIFY

**Analog:** Self (lines 68-123)

**Current scoring pattern** (lines 77-97):
```typescript
const reranked = mergedCandidates.map((candidate) => {
  const preRerankScore = candidate.combinedScore;
  let finalScore = preRerankScore;
  if (hasBothChannels(candidate)) {
    finalScore += bothChannelBoost;
  }
  if (queryTokens.length > 0 && candidate.tokenMatches.length > 0) {
    const density = uniqueMatchedTokens.size / queryTokens.length;
    if (density >= 0.5) {
      finalScore += tokenDensityBoost;
    }
  }
  finalScore = Math.min(1, Math.max(0, finalScore));
  return { ...candidate, combinedScore: finalScore, preRerankScore, finalScore };
});
```

**What to change:** Add a `staleDecayPenalty` boost (negative) configurable via `RerankConfig`. When a candidate's associated entity has `decayState === 'stale'`, subtract the penalty from the final score. Follow the same pattern as existing boosts.

---

### `packages/server/src/lib/store.ts` (model, CRUD) -- MODIFY

**Analog:** Self (lines 197-222)

**Current KnowledgeRecord interface** (lines 197-222):
```typescript
export interface KnowledgeRecord {
  id: string;
  teamId: string | null;
  scope: Scope;
  labels: string[];
  shortcut: string;
  detail: string;
  requiredLevel: number;
  lifecycleState: LifecycleState;
  ownerUserId: string;
  latestRevision: KnowledgeRevisionRecord;
  // ... many more fields
  createdAt: string;
  updatedAt: string;
}
```

**What to change:** Add `decayMeta: DecayMeta | null` field to both `KnowledgeRecord` (after `indexState`) and `SkillArtifactRecord` (after `lifecycleHistory`). Import `DecayMeta` from `@trapmap/contracts`. Default to `null` for backward compatibility.

---

### `packages/server/src/routes/knowledge.ts` (route, request-response) -- MODIFY

**Analog:** Self (lines 1-25, 200-296)

**Route handler pattern** (lines 39-41, 200-203):
```typescript
export const knowledgeRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/knowledge', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:submit');
    // ...
  });

  app.patch('/v1/knowledge/:entryId', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');
    // ...
  });
```

**What to change:** Add a new `POST /v1/knowledge/:entryId/supersede` route. Requires `knowledge:update` permission. Calls `supersedeEntry()` from `../lib/decay/supersede.js`. Follow same pattern: resolveAuth, requirePermission, parse body, store.transact, logUserOperation, return parsed response.

---

### `packages/server/src/routes/traps.ts` (route, request-response) -- MODIFY

**Analog:** `packages/server/src/routes/knowledge.ts` (same route pattern)

**What to change:** Add `POST /v1/traps/:trapId/supersede` route following the same pattern as the knowledge supersede route, but using trap-specific error messages (`trap_not_found` etc.).

---

### `packages/server/src/routes/retrieval.ts` (route, request-response) -- MODIFY

**Analog:** Self (lines 25-56)

**Current response pattern** (lines 37-56):
```typescript
const result = await searchKnowledge(app.skillShareer, auth, query);
return retrievalResponseSchema.parse(result);
```

**What to change:** No structural route changes needed. The retrieval pipeline already delegates to governance eligibility. Once eligibility.ts integrates decay filtering, all retrieval routes automatically exclude expired/superseded entries. Optionally add decay state to response metadata in a future phase.

---

### `packages/cli/src/commands/knowledge.ts` (component, request-response) -- MODIFY

**Analog:** Self (lines 59-118)

**Command registration pattern** (lines 64-74):
```typescript
program
  .command('submit')
  .description('Submit a new knowledge entry for review')
  .requiredOption('--scope <scope>', 'Knowledge scope: global or project')
  .requiredOption('--label <label>', 'Knowledge label', collectValues, [])
  // ...
  .action(async (flags) => {
    const state = await loadCliState();
    requireSessionToken(state);
    // ...
    const response = await apiRequest<KnowledgeEntryResponse>(state, {
      method: 'POST',
      path: '/v1/knowledge',
      body: { /* ... */ },
    });
    // ...
  });
```

**What to change:** Add a `supersede` subcommand under the knowledge command. Takes `<entryId>` argument and `--replacement <replacementId>` required option. Calls `POST /v1/knowledge/:entryId/supersede` API. Uses same `apiRequest` + `printResult` pattern. Only registered when `options.allowSubmit` is true (already gated by `knowledge:update` permission in CLI index).

---

## Shared Patterns

### Authentication & Authorization
**Source:** `packages/server/src/lib/governance/permissions.ts` lines 15-21, 34-38
**Apply to:** New supersede routes in knowledge.ts and traps.ts
```typescript
import { AppError } from '../lib/errors.js';
import { resolveAuthContext } from '../lib/session.js';
import { requirePermission } from '../lib/rbac.js';

// Every route handler starts with:
const auth = await resolveAuthContext(app.skillShareer, request);
requirePermission(auth, 'knowledge:update');
```

### Error Handling
**Source:** `packages/server/src/lib/errors.ts` lines 1-13
**Apply to:** All service and route files
```typescript
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
```

### Store Transaction Pattern
**Source:** `packages/server/src/routes/knowledge.ts` lines 69-84
**Apply to:** supersede.ts mutation logic
```typescript
const result = await app.skillShareer.store.transact((data) => {
  const entry = data.knowledgeEntries.find((candidate) => candidate.id === entryId);
  if (!entry) {
    throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
  }
  // ... mutate entry
  return entry;
});
```

### Zod Schema Definition Pattern
**Source:** `packages/contracts/src/domain/common.ts` lines 1-5, 37-45, 74-80
**Apply to:** `packages/contracts/src/domain/decay.ts`
```typescript
import { z } from 'zod';

export const someEnumSchema = z.enum(['value1', 'value2']);
export const someObjectSchema = z.object({
  field1: entityIdSchema,
  field2: isoTimestampSchema,
  field3: z.number().int().min(1).max(3650).default(90),
});
export type SomeType = z.infer<typeof someObjectSchema>;
```

### Barrel Export Pattern
**Source:** `packages/contracts/src/index.ts` line 1-14
**Apply to:** Adding decay.ts exports
```typescript
export * from './domain/decay.js';
```

### User Operation Logging
**Source:** `packages/server/src/routes/knowledge.ts` lines 87-95
**Apply to:** New supersede route handlers
```typescript
void logUserOperation(app.skillShareer.config.userOpsLog, {
  timestamp: nowIso(),
  actorId: auth.actorId,
  actorHandle: auth.handle,
  action: 'supersede',
  targetId: entryId,
  teamId: auth.activeTeamId,
  metadata: { replacementId },
});
```

### GovernedEntity Adapter Pattern
**Source:** `packages/server/src/lib/retrieval/filters.ts` lines 30-38
**Apply to:** Places where decay state needs to be added to entity before eligibility check
```typescript
function toGovernedEntity(entry: KnowledgeRecord) {
  return {
    teamId: entry.teamId,
    scope: entry.scope,
    requiredLevel: entry.requiredLevel,
    lifecycleState: entry.lifecycleState,
    labels: entry.labels,
    // Phase 48: add decayState computed from decayMeta
    decayState: computeDecayStateForEntry(entry),
  };
}
```

### CLI Command Registration
**Source:** `packages/cli/src/commands/knowledge.ts` lines 120-171
**Apply to:** New supersede CLI subcommand
```typescript
program
  .command('supersede')
  .description('Supersede a knowledge entry with a replacement')
  .argument('<entryId>', 'Knowledge entry to supersede')
  .requiredOption('--replacement <id>', 'ID of the replacement entry')
  .option('--json', 'Output JSON')
  .action(async (entryId: string, flags: { replacement: string; json?: boolean }) => {
    const state = await loadCliState();
    requireSessionToken(state);
    const response = await apiRequest<KnowledgeEntryResponse>(state, {
      method: 'POST',
      path: `/v1/knowledge/${entryId}/supersede`,
      body: { replacementId: flags.replacement },
    });
    const parsed = knowledgeEntryResponseSchema.parse(response.data);
    printResult(parsed, flags, ({ entry }) => [
      `Superseded ${entry.id}`,
      `Decay state: ${entry.lifecycleState}`,
    ].join('\n'));
  });
```

## No Analog Found

All files have close analogs in the codebase. No files require external pattern references.

## Metadata

**Analog search scope:**
- `packages/contracts/src/domain/` (schema definitions)
- `packages/server/src/config.ts` (config loading)
- `packages/server/src/lib/config/` (feature flags)
- `packages/server/src/lib/governance/` (eligibility, permissions)
- `packages/server/src/lib/retrieval/` (rerank, filters, orchestrator)
- `packages/server/src/lib/store.ts` (record types)
- `packages/server/src/routes/` (route handlers)
- `packages/cli/src/commands/` (CLI commands)

**Files scanned:** 30+
**Pattern extraction date:** 2026-05-02
