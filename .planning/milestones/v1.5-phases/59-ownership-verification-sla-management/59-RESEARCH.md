# Phase 59: Ownership & Verification SLA Management - Research

**Researched:** 2026-05-03
**Phase Goal:** Add lightweight ownership and review-due tracking so maintainers can keep the corpus healthy without a heavy governance system.

## Domain Analysis

### Core Concepts

**MAINT-01: Ownership and Review-Due Metadata**

This phase introduces maintenance-oriented metadata distinct from existing fields:

| Field | Purpose | Relationship |
|-------|---------|--------------|
| `owner` | Current maintenance owner (who is responsible for upkeep) | Distinct from `ownerUserId` (original creator) |
| `reviewBy` | Scheduled review date (SLA target) | Independent from decay state transitions |
| `lastVerifiedAt` | When last verified by human | Already exists in `decayMeta` (Phase 48) |

**MAINT-02: Maintenance List and Batch Actions**

Operational workflows for corpus health:
- List entries missing owner assignment
- List entries with overdue review
- List entries with stale verification
- Batch actions: assign owner, extend review date, mark re-verified

### Data Model

**Existing Fields (do not duplicate):**
- `KnowledgeRecord.ownerUserId` - Original creator (line 207, store.ts)
- `KnowledgeRecord.decayMeta.lastVerifiedAt` - Last verification timestamp (Phase 48)
- `KnowledgeRecord.evidenceMeta.verifiedAt` - Evidence verification (Phase 58)
- `SkillArtifactRecord.ownerUserId` - Original creator (line 520, store.ts)

**New Fields Required:**

```typescript
// Add to KnowledgeRecord and SkillArtifactRecord
interface MaintenanceMeta {
  /** Current maintenance owner (may differ from original creator) */
  maintainerId: string | null;
  /** Actor reference for maintainer (resolved on read) */
  maintainer: ActorRef | null;
  /** Scheduled review date for SLA tracking */
  reviewBy: string | null;  // ISO timestamp
}
```

**Why new fields instead of reusing:**
1. `ownerUserId` represents original authorship, not current maintenance responsibility
2. `decayMeta.lastVerifiedAt` serves lifecycle ranking, `reviewBy` serves SLA scheduling
3. Maintenance ownership can transfer without changing original attribution

### Relationship to Existing Phases

```
Phase 48 (Lifecycle)          Phase 58 (Evidence)          Phase 59 (This Phase)
        |                             |                              |
        v                             v                              v
+------------------+          +------------------+          +------------------+
| decayMeta        |          | evidenceMeta     |          | maintenanceMeta  |
| - lastVerifiedAt |          | - verifiedAt     |          | - maintainer     |
| - decayState     |          | - verifiedBy     |          | - reviewBy       |
| - freshnessType  |          | - sourceType     |          |                  |
+------------------+          | - evidenceLevel  |          +------------------+
                              +------------------+
                                       |
                              Phase 50 (Batch Management)
                                       |
                              Reuses all three for
                              filter/act workflows
```

## Integration Points

### 1. Contracts Package

**Files to modify:**
- `packages/contracts/src/domain/common.ts` - Add `maintenanceMetaSchema`
- `packages/contracts/src/domain/knowledge.ts` - Add to `knowledgeEntrySchema`
- `packages/contracts/src/domain/artifacts.ts` - Add to `skillArtifactSchema`
- `packages/contracts/src/index.ts` - Export new types

**Pattern to follow:**
```typescript
// From decay.ts (Phase 48 pattern)
export const decayMetaSchema = z.object({
  lastVerifiedAt: isoTimestampSchema,
  decayState: decayStateSchema,
  // ...
});

// New schema following same pattern
export const maintenanceMetaSchema = z.object({
  maintainer: actorRefSchema.nullable().default(null),
  reviewBy: isoTimestampSchema.nullable().default(null),
});
```

### 2. Server Store

**Files to modify:**
- `packages/server/src/lib/store.ts` - Add `MaintenanceMetaRecord` and extend record types

**Pattern from store.ts:**
```typescript
// Lines 198-223 show KnowledgeRecord structure
export interface KnowledgeRecord {
  // ... existing fields
  ownerUserId: string;  // Original creator - DO NOT CHANGE
  // Add new field:
  maintenanceMeta: MaintenanceMetaRecord | null;
}
```

### 3. Decay Routes (Pattern to Extend)

**Files to reference:**
- `packages/server/src/routes/decay.ts` - Batch operation patterns
- `packages/cli/src/commands/decay.ts` - CLI command patterns

**Existing endpoints to mirror:**
- `GET /v1/operations/decay/entries` -> `GET /v1/operations/maintenance/entries`
- `POST /v1/operations/decay/batch` -> `POST /v1/operations/maintenance/batch`

### 4. Evidence Routes (Recent Implementation)

**Files to reference:**
- `packages/server/src/lib/evidence/model.ts` - Validation pattern
- `packages/server/src/routes/review.ts` - Review flow integration

## Technical Approach Options

### Option A: Standalone Maintenance Module (Recommended)

Create dedicated maintenance module following decay/evidence patterns.

**Structure:**
```
packages/contracts/src/domain/
  maintenance.ts                 # NEW: maintenanceMetaSchema

packages/server/src/lib/
  maintenance/
    model.ts                     # Maintenance validation helpers
    model.test.ts                # Unit tests
    batch.ts                     # Batch actions (assign, extend, verify)
    batch.test.ts                # Batch action tests

packages/server/src/routes/
  maintenance.ts                 # NEW: /v1/operations/maintenance/* routes
  maintenance.test.ts            # Route tests

packages/cli/src/commands/
  maintenance.ts                 # NEW: maintenance list/assign/verify commands
  maintenance.test.ts            # CLI tests
```

**Pros:**
- Clean separation of concerns
- Follows established patterns from decay and evidence phases
- Easy to test independently
- Clear API surface

**Cons:**
- More files to maintain
- Potential duplication with decay listing patterns

### Option B: Extend Decay Module

Add maintenance metadata to existing decay routes and CLI.

**Structure:**
- Extend `decayAwareListItemSchema` with maintenance fields
- Add maintenance actions to `batchActionSchema`
- Reuse `/v1/operations/decay/*` endpoints

**Pros:**
- Fewer new files
- Single entry point for corpus health
- Leverages existing batch infrastructure

**Cons:**
- Conflates decay (ranking) with maintenance (SLA) concerns
- Decay routes become overloaded
- Harder to reason about ownership vs freshness

**Recommendation: Option A**

Maintenance and decay serve different purposes:
- Decay = ranking and lifecycle transitions based on age
- Maintenance = accountability and scheduled review

Separate modules keep concerns clean while sharing patterns.

## Implementation Guidance

### Wave 0: Contracts (Day 1)

1. **Create maintenance schema** (`packages/contracts/src/domain/maintenance.ts`)
   ```typescript
   export const maintenanceMetaSchema = z.object({
     maintainer: actorRefSchema.nullable().default(null),
     reviewBy: isoTimestampSchema.nullable().default(null),
   });

   export const maintenanceActionSchema = z.enum([
     'assign-owner',
     'extend-review',
     'mark-verified',
   ]);
   ```

2. **Add to knowledge schema** (`packages/contracts/src/domain/knowledge.ts`)
   - Import `maintenanceMetaSchema`
   - Add `maintenanceMeta: maintenanceMetaSchema.nullable().default(null)`

3. **Add to artifact schema** (`packages/contracts/src/domain/artifacts.ts`)
   - Same pattern as knowledge

4. **Create list/filter schemas**
   ```typescript
   export const maintenanceEntryListRequestSchema = z.object({
     missingOwner: z.boolean().optional(),
     reviewOverdue: z.boolean().optional(),
     staleVerification: z.boolean().optional(),
     scope: scopeSchema.optional(),
     labels: z.array(labelSchema).optional(),
     limit: z.coerce.number().int().min(1).max(100).default(25),
   });

   export const maintenanceAwareListItemSchema = decayAwareListItemSchema.extend({
     maintainer: actorRefSchema.nullable(),
     reviewBy: isoTimestampSchema.nullable(),
   });
   ```

### Wave 1: Server Model (Day 2)

1. **Update store types** (`packages/server/src/lib/store.ts`)
   ```typescript
   export interface MaintenanceMetaRecord {
     maintainerUserId: string | null;
     maintainerHandle: string | null;
     maintainerLevel: number | null;
     reviewBy: string | null;
   }

   // Extend KnowledgeRecord
   export interface KnowledgeRecord {
     // ... existing
     maintenanceMeta: MaintenanceMetaRecord | null;
   }
   ```

2. **Create maintenance lib** (`packages/server/src/lib/maintenance/model.ts`)
   - Validation helpers
   - Default maintainer from owner if not set
   - Review date computation

3. **Create batch module** (`packages/server/src/lib/maintenance/batch.ts`)
   - `planMaintenanceOperation()` - Preview changes
   - `executeMaintenanceOperation()` - Apply changes
   - Follow pattern from `lib/decay/batch.ts`

### Wave 2: Server Routes (Day 3)

1. **Create maintenance routes** (`packages/server/src/routes/maintenance.ts`)
   - `GET /v1/operations/maintenance/entries` - List with filters
   - `POST /v1/operations/maintenance/batch` - Batch operations
   - `POST /v1/operations/maintenance/search` - Search with facets

2. **Add route tests** (`packages/server/src/routes/maintenance.test.ts`)
   - Auth requirement tests
   - Filter behavior tests
   - Batch operation tests

### Wave 3: CLI Commands (Day 4)

1. **Create maintenance commands** (`packages/cli/src/commands/maintenance.ts`)
   ```typescript
   // maintenance-list command
   program
     .command('maintenance-list')
     .description('List entries needing maintenance attention')
     .option('--missing-owner', 'Show entries without assigned maintainer')
     .option('--overdue', 'Show entries with overdue review')
     .option('--stale', 'Show entries with stale verification')
     .option('--scope <scope>', 'Filter by scope')
     .option('--limit <n>', 'Maximum results', '25')
     .option('--json', 'Output JSON')
     .action(/* ... */);

   // maintenance-assign command
   program
     .command('maintenance-assign')
     .description('Assign maintainer to entries')
     .requiredOption('--entries <ids>', 'Comma-separated entry IDs')
     .requiredOption('--owner <userId>', 'New maintainer user ID')
     .option('--dry-run', 'Preview without applying')
     .option('--json', 'Output JSON')
     .action(/* ... */);

   // maintenance-verify command
   program
     .command('maintenance-verify')
     .description('Mark entries as re-verified')
     .requiredOption('--entries <ids>', 'Comma-separated entry IDs')
     .option('--extend-days <n>', 'Extend review date by N days', parseInt)
     .option('--dry-run', 'Preview without applying')
     .option('--json', 'Output JSON')
     .action(/* ... */);
   ```

2. **Add CLI tests** (`packages/cli/src/commands/maintenance.test.ts`)

### Wave 4: Integration (Day 5)

1. **Wire up routes in app.ts**
2. **Wire up CLI commands in index.ts**
3. **Update existing batch operations to set maintenanceMeta**
4. **End-to-end verification**

## Risk Assessment

### Risk 1: Owner vs Maintainer Confusion

**What could go wrong:** Users confused by `ownerUserId` (creator) vs `maintainer` (current owner).

**Likelihood:** Medium
**Impact:** Medium

**Mitigation:**
- Clear documentation in schema comments
- Admin views show both fields with labels
- Default `maintainer` to `ownerUserId` on creation if not specified

### Risk 2: Review Date Drift from Decay States

**What could go wrong:** `reviewBy` date doesn't align with decay state transitions, creating conflicting signals.

**Likelihood:** Medium
**Impact:** Low

**Mitigation:**
- Document that `reviewBy` is SLA target, decay state is computed ranking
- Admin views can show both for comparison
- No automatic coupling - they serve different purposes

### Risk 3: Missing Maintainer on Legacy Entries

**What could go wrong:** Existing entries have no `maintenanceMeta`, null checks fail.

**Likelihood:** High
**Impact:** Low

**Mitigation:**
- Field is nullable in schema
- All access patterns check for null
- Admin view highlights "missing owner" as filter option
- Batch action to assign default maintainer

### Risk 4: Batch Action Side Effects

**What could go wrong:** Marking verified updates both `maintenanceMeta` and `decayMeta.lastVerifiedAt`, causing confusion about which is authoritative.

**Likelihood:** Medium
**Impact:** Medium

**Mitigation:**
- `mark-verified` action updates BOTH:
  - `maintenanceMeta.reviewBy` (extend by N days)
  - `decayMeta.lastVerifiedAt` (set to now)
- Document the behavior clearly
- Allow dry-run to preview changes

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.5 |
| Config file | `packages/server/vitest.config.ts` |
| Quick run command | `pnpm --filter @trapmap/server test -- --reporter=verbose` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | File Location |
|--------|----------|-----------|---------------|
| MAINT-01 | Schema validation for maintenanceMeta | unit | `packages/contracts/src/domain/maintenance.test.ts` |
| MAINT-01 | maintenanceMeta on KnowledgeRecord | unit | `packages/server/src/lib/store.test.ts` |
| MAINT-01 | maintenanceMeta on SkillArtifactRecord | unit | `packages/server/src/lib/store.test.ts` |
| MAINT-02 | List entries missing owner | unit | `packages/server/src/routes/maintenance.test.ts` |
| MAINT-02 | List entries overdue review | unit | `packages/server/src/routes/maintenance.test.ts` |
| MAINT-02 | List entries stale verification | unit | `packages/server/src/routes/maintenance.test.ts` |
| MAINT-02 | Batch assign owner | unit | `packages/server/src/lib/maintenance/batch.test.ts` |
| MAINT-02 | Batch extend review | unit | `packages/server/src/lib/maintenance/batch.test.ts` |
| MAINT-02 | Batch mark verified | unit | `packages/server/src/lib/maintenance/batch.test.ts` |
| MAINT-02 | CLI maintenance-list command | unit | `packages/cli/src/commands/maintenance.test.ts` |
| MAINT-02 | CLI maintenance-assign command | unit | `packages/cli/src/commands/maintenance.test.ts` |
| MAINT-02 | CLI maintenance-verify command | unit | `packages/cli/src/commands/maintenance.test.ts` |

### Acceptance Criteria Derivation

**From MAINT-01:**
- AC1: `maintenanceMetaSchema` validates maintainer and reviewBy fields
- AC2: KnowledgeEntry includes maintenanceMeta field
- AC3: SkillArtifact includes maintenanceMeta field
- AC4: Both fields nullable for backward compatibility

**From MAINT-02:**
- AC5: `GET /v1/operations/maintenance/entries` returns filtered list
- AC6: `--missing-owner` filter returns entries where maintainer is null
- AC7: `--overdue` filter returns entries where reviewBy < now
- AC8: `--stale` filter returns entries where lastVerifiedAt exceeds threshold
- AC9: `POST /v1/operations/maintenance/batch` executes assign-owner action
- AC10: `POST /v1/operations/maintenance/batch` executes extend-review action
- AC11: `POST /v1/operations/maintenance/batch` executes mark-verified action
- AC12: All batch actions support dry-run mode

## Security Considerations

| ASVS Category | Applies | Notes |
|---------------|---------|-------|
| V4 Access Control | Yes | Maintenance actions require `knowledge:update` permission |
| V5 Input Validation | Yes | All inputs validated via Zod schemas |

**Threat Mitigation:**
- Tampering: Only users with `knowledge:update` can modify maintenance metadata
- Audit trail: All maintenance operations logged via existing `logUserOperation` pattern

## Sources

### Primary (Codebase Analysis)
- `packages/contracts/src/domain/decay.ts` - Schema pattern for metadata
- `packages/contracts/src/domain/evidence.ts` - Recent metadata addition pattern
- `packages/contracts/src/domain/knowledge.ts` - Knowledge entry schema
- `packages/contracts/src/domain/artifacts.ts` - Skill artifact schema
- `packages/server/src/lib/store.ts` - Record types
- `packages/server/src/routes/decay.ts` - Batch operation patterns
- `packages/cli/src/commands/decay.ts` - CLI command patterns
- `.planning/phases/58-evidence-metadata-verification-surface/58-RESEARCH.md` - Phase 58 research

### Secondary (Planning Documents)
- `.planning/ROADMAP.md` - Phase definition
- `.planning/milestones/v1.5-phases/59-ownership-and-verification-sla-management/59-CONTEXT.md` - Phase context
- `.planning/REQUIREMENTS.md` - Requirement mapping

## Metadata

**Confidence:** HIGH
- Standard stack: Reuses existing zod, vitest, Fastify patterns
- Architecture: Follows Phase 48 (Decay) and Phase 58 (Evidence) patterns
- Integration: Clear extension points in store, routes, and CLI

**Research date:** 2026-05-03
**Valid until:** 2026-06-03 (stable patterns)
