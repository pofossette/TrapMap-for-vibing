# Phase 59: Pattern Map

## File Mappings

| Target File | Analog File | Pattern Type |
|-------------|-------------|--------------|
| `packages/contracts/src/domain/maintenance.ts` | `packages/contracts/src/domain/evidence.ts` | schema |
| `packages/contracts/src/domain/knowledge.ts` | `packages/contracts/src/domain/artifacts.ts` (evidenceMeta) | schema extension |
| `packages/contracts/src/domain/artifacts.ts` | Same file (evidenceMeta pattern) | schema extension |
| `packages/contracts/src/index.ts` | Same file (evidence export) | export |
| `packages/server/src/lib/store.ts` | Same file (decayMeta pattern) | record type |
| `packages/server/src/lib/maintenance/model.ts` | `packages/server/src/lib/evidence/model.ts` | validation helpers |
| `packages/server/src/lib/maintenance/batch.ts` | `packages/server/src/lib/decay/batch.ts` | batch operations |
| `packages/server/src/routes/maintenance.ts` | `packages/server/src/routes/decay.ts` | route handlers |
| `packages/server/src/app.ts` | Same file (decayRoutes) | route wiring |
| `packages/cli/src/commands/maintenance.ts` | `packages/cli/src/commands/decay.ts` | CLI commands |
| `packages/cli/src/index.ts` | Same file (registerDecayCommands) | command wiring |

## Pattern Details

### `packages/contracts/src/domain/maintenance.ts` (NEW)

**Source:** `packages/contracts/src/domain/evidence.ts`
**Pattern:** Standalone schema file for metadata type

```typescript
// From evidence.ts - schema pattern
import { z } from 'zod';

import { actorRefSchema, isoTimestampSchema } from './common.js';

export const evidenceMetaSchema = z.object({
  sourceType: evidenceSourceTypeSchema,
  sourceRef: z.string().max(500).optional(),
  evidenceLevel: evidenceLevelSchema,
  verifiedAt: isoTimestampSchema,
  verifiedBy: actorRefSchema,
});
```

**Adaptation needed:**
- Import `actorRefSchema`, `isoTimestampSchema` from `./common.js`
- Create `maintenanceMetaSchema` with `maintainer` (ActorRef nullable) and `reviewBy` (ISO timestamp nullable)
- Create `maintenanceActionSchema` enum: `'assign-owner'`, `'extend-review'`, `'mark-verified'`
- Create `maintenanceAwareListItemSchema` extending `decayAwareListItemSchema`
- Create `maintenanceEntryListRequestSchema` for filter params
- Create `maintenanceBatchOperationRequestSchema` and response schemas
- Export all types

---

### `packages/contracts/src/domain/knowledge.ts` (MODIFY)

**Source:** `packages/contracts/src/domain/artifacts.ts` (evidenceMeta addition)
**Pattern:** Add nullable metadata field to main schema

```typescript
// From artifacts.ts - evidenceMeta addition (lines 370-372)
export const skillArtifactSchema = z
  .object({
    // ... existing fields ...
    /** Evidence and provenance metadata (null if not yet verified) */
    evidenceMeta: evidenceMetaSchema.nullable().default(null),
  })
  .merge(auditMetadataSchema);
```

**Adaptation needed:**
- Import `maintenanceMetaSchema` from `./maintenance.js`
- Add `maintenanceMeta: maintenanceMetaSchema.nullable().default(null)` to `knowledgeEntrySchema`
- Add import at top of file

---

### `packages/contracts/src/domain/artifacts.ts` (MODIFY)

**Source:** Same file (evidenceMeta pattern)
**Pattern:** Same as knowledge.ts - add nullable metadata field

```typescript
// From artifacts.ts - evidenceMeta addition (lines 370-372)
    /** Evidence and provenance metadata (null if not yet verified) */
    evidenceMeta: evidenceMetaSchema.nullable().default(null),
```

**Adaptation needed:**
- Import `maintenanceMetaSchema` from `./maintenance.js`
- Add `maintenanceMeta: maintenanceMetaSchema.nullable().default(null)` to `skillArtifactSchema`

---

### `packages/contracts/src/index.ts` (MODIFY)

**Source:** Same file (decay exports pattern)
**Pattern:** Export new domain module

```typescript
// From index.ts - export pattern
export * from './domain/artifacts.js';
export * from './domain/auth.js';
// ... other exports ...
```

**Adaptation needed:**
- Add `export * from './domain/maintenance.js';`

---

### `packages/server/src/lib/store.ts` (MODIFY)

**Source:** Same file (decayMeta pattern in batch.ts)
**Pattern:** Add metadata record interface

```typescript
// From decay/batch.ts - decayMeta structure (lines 278-284)
entry.decayMeta = {
  lastVerifiedAt: nowStr,
  decayState: 'active' as DecayState,
  supersededById: entry.decayMeta?.supersededById ?? null,
  decayStateComputedAt: nowStr,
  freshnessType: entry.decayMeta?.freshnessType ?? 'evergreen',
};
```

**Adaptation needed:**
- Add `MaintenanceMetaRecord` interface:
  ```typescript
  export interface MaintenanceMetaRecord {
    maintainerUserId: string | null;
    maintainerHandle: string | null;
    maintainerLevel: number | null;
    reviewBy: string | null;
  }
  ```
- Add `maintenanceMeta: MaintenanceMetaRecord | null;` to `KnowledgeRecord` interface
- Add same field to `SkillArtifactRecord` interface
- No changes to `EMPTY_STORE` needed (nullable field)

---

### `packages/server/src/lib/maintenance/model.ts` (NEW)

**Source:** `packages/server/src/lib/evidence/model.ts`
**Pattern:** Validation helpers for metadata

```typescript
// From evidence/model.ts
import type { EvidenceMeta, EvidenceLevel, EvidenceSourceType } from '@trapmap/contracts';
import { evidenceLevelSchema, evidenceMetaSchema, evidenceSourceTypeSchema } from '@trapmap/contracts';

export const DEFAULT_EVIDENCE_LEVEL: EvidenceLevel = 'anecdotal';
export const DEFAULT_SOURCE_TYPE: EvidenceSourceType = 'internal-experience';

export function createDefaultEvidenceMeta(
  verifiedAt: string,
  verifiedBy: ActorRef,
): EvidenceMeta {
  return {
    sourceType: DEFAULT_SOURCE_TYPE,
    evidenceLevel: DEFAULT_EVIDENCE_LEVEL,
    verifiedAt,
    verifiedBy,
  };
}

export function validateEvidence(evidence: unknown): EvidenceMeta {
  return evidenceMetaSchema.parse(evidence);
}
```

**Adaptation needed:**
- Import `MaintenanceMeta`, `MaintenanceAction` from contracts
- Create `validateMaintenanceMeta()` function
- Create `computeDefaultReviewBy(days: number): string` helper
- Create `isReviewOverdue(reviewBy: string | null, now: Date): boolean` helper
- Create `isStaleVerification(lastVerifiedAt: string | null, staleDays: number, now: Date): boolean` helper

---

### `packages/server/src/lib/maintenance/batch.ts` (NEW)

**Source:** `packages/server/src/lib/decay/batch.ts`
**Pattern:** Plan and execute batch operations

```typescript
// From decay/batch.ts - core pattern (lines 68-239)
export interface BatchOperationInput {
  entryIds: string[];
  action: BatchAction;
  actorId: string;
  extendDays?: number;
  replacementId?: string;
}

export interface BatchOperationPlanItem {
  entryId: string;
  shortcut: string;
  currentDecayState: DecayState | null;
  proposedDecayState: DecayState | null;
  changeDescription: string;
  eligible: boolean;
  ineligibilityReason: string | null;
}

export function planBatchOperation(
  data: StoreData,
  input: BatchOperationInput,
  config: DecayConfig,
  now: Date,
): BatchOperationPlanItem[] { /* ... */ }

export function executeBatchOperation(
  store: SkillShareerStore,
  data: StoreData,
  input: BatchOperationInput,
  config: DecayConfig,
  now: Date,
): KnowledgeRecord[] { /* ... */ }
```

**Adaptation needed:**
- Create `MaintenanceOperationInput` interface with `entryIds`, `action`, `actorId`, `newMaintainerId?`, `extendDays?`
- Create `MaintenanceOperationPlanItem` interface
- Create `planMaintenanceOperation()` function with logic for:
  - `assign-owner`: Set maintainer fields
  - `extend-review`: Set new reviewBy date
  - `mark-verified`: Update both `maintenanceMeta.reviewBy` AND `decayMeta.lastVerifiedAt`
- Create `executeMaintenanceOperation()` function that mutates entries
- Follow same eligibility checking pattern (approved entries only)

---

### `packages/server/src/routes/maintenance.ts` (NEW)

**Source:** `packages/server/src/routes/decay.ts`
**Pattern:** Route handlers for list and batch operations

```typescript
// From decay.ts - route structure (lines 71-194)
export const decayRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/operations/decay/entries', async (request, reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');
    const query = decayEntryListRequestSchema.parse(request.query);
    // ... filter and return
  });

  app.post('/v1/operations/decay/batch', async (request, reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');
    const body = batchOperationRequestSchema.parse(request.body);
    // ... plan or execute
  });
};
```

**Adaptation needed:**
- Create `maintenanceRoutes: FastifyPluginAsync`
- Add `GET /v1/operations/maintenance/entries`:
  - Requires `knowledge:export` permission
  - Supports filters: `missingOwner`, `reviewOverdue`, `staleVerification`, `scope`, `labels`, `limit`
  - Returns `maintenanceAwareListItemSchema` items
- Add `POST /v1/operations/maintenance/batch`:
  - Requires `knowledge:update` permission
  - Supports actions: `assign-owner`, `extend-review`, `mark-verified`
  - Dry-run mode returns plan without executing
  - Logs operations via `logUserOperation()`
- Add `POST /v1/operations/maintenance/search` (optional, follows decay pattern)

---

### `packages/server/src/app.ts` (MODIFY)

**Source:** Same file (decayRoutes pattern)
**Pattern:** Import and register routes

```typescript
// From app.ts (lines 27, 139)
import { decayRoutes } from './routes/decay.js';
// ...
app.register(decayRoutes);
```

**Adaptation needed:**
- Add `import { maintenanceRoutes } from './routes/maintenance.js';`
- Add `app.register(maintenanceRoutes);` after decayRoutes

---

### `packages/cli/src/commands/maintenance.ts` (NEW)

**Source:** `packages/cli/src/commands/decay.ts`
**Pattern:** CLI commands with options and API calls

```typescript
// From decay.ts - command pattern (lines 59-121)
export function registerDecayCommands(
  program: Command,
  options: DecayCommandOptions,
): void {
  if (!options.allowManage) return;

  program
    .command('decay-stale')
    .description('List knowledge entries by decay state')
    .option('--state <states>', 'Filter by decay state (comma-separated)')
    .option('--limit <n>', 'Maximum entries to return', '25')
    .option('--json', 'Output JSON')
    .action(async (flags) => {
      const state = await loadCliState();
      requireSessionToken(state);
      const queryParams = new URLSearchParams();
      // ... build query params
      const response = await apiRequest<DecayEntryListResponse>(state, { path });
      printResult(parsed, flags, formatDecayList);
    });
}
```

**Adaptation needed:**
- Create `MaintenanceCommandOptions` interface with `allowManage: boolean`
- Create `registerMaintenanceCommands(program, options)` function
- Add `maintenance-list` command:
  - Options: `--missing-owner`, `--overdue`, `--stale`, `--scope`, `--limit`, `--json`
  - Calls `GET /v1/operations/maintenance/entries`
- Add `maintenance-assign` command:
  - Required: `--entries <ids>`, `--owner <userId>`
  - Options: `--dry-run`, `--json`
  - Calls `POST /v1/operations/maintenance/batch` with `action: 'assign-owner'`
- Add `maintenance-verify` command:
  - Required: `--entries <ids>`
  - Options: `--extend-days <n>`, `--dry-run`, `--json`
  - Calls `POST /v1/operations/maintenance/batch` with `action: 'mark-verified'`
- Create `formatMaintenanceList()` and `formatMaintenanceBatch()` formatters

---

### `packages/cli/src/index.ts` (MODIFY)

**Source:** Same file (registerDecayCommands pattern)
**Pattern:** Import and register CLI commands

```typescript
// From index.ts (lines 5, 148)
import { registerDecayCommands } from './commands/decay.js';
// ...
registerDecayCommands(program, { allowManage: visibility.allowKnowledgeUpdate });
```

**Adaptation needed:**
- Add `import { registerMaintenanceCommands } from './commands/maintenance.js';`
- Add `registerMaintenanceCommands(program, { allowManage: visibility.allowKnowledgeUpdate });`

---

## Summary

**Wave 0 (Contracts):** 4 files (1 new, 3 modified)
**Wave 1 (Server Model):** 3 files (2 new, 1 modified)
**Wave 2 (Server Routes):** 2 files (1 new, 1 modified)
**Wave 3 (CLI):** 2 files (1 new, 1 modified)

**Total:** 11 files (5 new, 6 modified)

**Key architectural decisions:**
1. Separate maintenance module (not extending decay) for clean separation of concerns
2. `maintenanceMeta` nullable for backward compatibility with existing entries
3. `mark-verified` action updates both `maintenanceMeta.reviewBy` AND `decayMeta.lastVerifiedAt` for consistency
4. Reuse existing batch operation patterns from Phase 48 (Decay)
