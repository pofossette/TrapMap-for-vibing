---
phase: 59-ownership-verification-sla-management
reviewed: 2026-05-03T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - packages/cli/src/commands/maintenance.ts
  - packages/cli/src/index.ts
  - packages/contracts/src/domain/artifacts.ts
  - packages/contracts/src/domain/knowledge.ts
  - packages/contracts/src/domain/maintenance.ts
  - packages/contracts/src/index.ts
  - packages/server/src/app.ts
  - packages/server/src/lib/maintenance/batch.test.ts
  - packages/server/src/lib/maintenance/batch.ts
  - packages/server/src/lib/maintenance/model.test.ts
  - packages/server/src/lib/maintenance/model.ts
  - packages/server/src/lib/store.ts
  - packages/server/src/lib/user-ops-log.ts
  - packages/server/src/routes/maintenance.test.ts
  - packages/server/src/routes/maintenance.ts
findings:
  critical: 1
  warning: 2
  info: 4
  total: 7
status: issues_found
---

# Phase 59: Code Review Report

**Reviewed:** 2026-05-03T00:00:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed the Phase 59 maintenance feature: ownership verification and SLA management for knowledge entries. The feature adds maintenance metadata contracts, a batch mutation service, CLI commands, and Fastify routes with filtering and dry-run support.

The implementation follows established patterns from the decay feature (decay.ts, decay/batch.ts). Contract schemas are well-structured with proper Zod validation. Test coverage is reasonable for both unit and integration levels.

One critical issue was found: the `maintenanceMetaSchema` in contracts uses a nested `maintainer: actorRefSchema` shape, but the store writes flat fields (`maintainerUserId`, `maintainerHandle`, `maintainerLevel`). This creates a latent validation failure if any code path applies the contract schema directly to stored data.

Two warnings: the injected `now` timestamp is bypassed by `nowIso()` in the execution path (breaking deterministic testing), and a post-mutation re-plan in the batch route produces misleading response items.

## Critical Issues

### CR-01: Data shape mismatch between store record and contract schema for maintenanceMeta

**File:** `packages/server/src/lib/maintenance/batch.ts:211-224`
**Issue:** The `assign-owner` action writes `maintenanceMeta` with flat fields (`maintainerUserId`, `maintainerHandle`, `maintainerLevel`, `reviewBy`), which matches `MaintenanceMetaRecord` in `store.ts:204-213`. However, the contract-level `maintenanceMetaSchema` (in `maintenance.ts:23-28`) defines `maintainer` as a nested `actorRefSchema` object -- not flat fields. The route in `maintenance.ts:141-143` calls `toActorRefFromRecord(entry.maintenanceMeta)` to bridge this for read paths, but the data stored on disk does not match the contract schema shape.

The `extend-review` and `mark-verified` actions (batch.ts lines 229-254) initialize `maintenanceMeta` with flat fields when null, which further entrenches this mismatch. The contract schema has `maintainer: actorRefSchema.nullable()` while the store uses separate `maintainerUserId`/`maintainerHandle`/`maintainerLevel` fields.

If any downstream consumer applies `maintenanceMetaSchema.parse()` directly to stored data (e.g., during export, PostgreSQL migration, or any serialization that validates against the contract), it will reject the records. The `knowledgeEntrySchema` at `knowledge.ts:119` includes `maintenanceMeta: maintenanceMetaSchema` -- if this schema is ever used to parse a `KnowledgeRecord`, it will fail.

**Fix:** Either (a) align `maintenanceMetaSchema` with the flat store record shape, adding separate nullable fields for maintainer ID/handle/level, or (b) change the write path to store data in the contract's nested shape and update `MaintenanceMetaRecord` accordingly. Option (a) is lower-risk since it matches the established store pattern:

```typescript
// Option (a): Update maintenanceMetaSchema to match store shape
export const maintenanceMetaSchema = z.object({
  maintainerUserId: entityIdSchema.nullable().default(null),
  maintainerHandle: z.string().nullable().default(null),
  maintainerLevel: z.number().int().nullable().default(null),
  reviewBy: isoTimestampSchema.nullable().default(null),
});
```

## Warnings

### WR-01: Injected `now` timestamp bypassed by `nowIso()` call in execute path

**File:** `packages/server/src/lib/maintenance/batch.ts:208`
**Issue:** The `executeMaintenanceOperation` function accepts a `now: Date` parameter for deterministic testing, but inside the loop it calls `nowStr = nowIso()` (which is `new Date().toISOString()`) instead of `now.toISOString()`. This means the `updatedAt` timestamps and `decayMeta.lastVerifiedAt` values written during execution use wall-clock time rather than the injected timestamp. Tests in `batch.test.ts` do not assert exact `updatedAt` values for the mutated entries, so this has not been caught. The `computeDefaultReviewBy` function on line 238 also calls `Date.now()` directly rather than using the injected `now`, meaning the review-by date is not deterministic in tests.

**Fix:** Replace `const nowStr = nowIso()` on line 208 with `const nowStr = now.toISOString()`:

```typescript
const nowStr = now.toISOString();
```

Also update `computeDefaultReviewBy` to accept an optional `now` parameter, or compute the review-by date inline using the injected `now` value.

### WR-02: Post-mutation plan call produces misleading response items

**File:** `packages/server/src/routes/maintenance.ts:291-303`
**Issue:** After executing the batch operation via `store.transact()`, the code takes a fresh snapshot and calls `planMaintenanceOperation` again to build the response items. Since the data is already mutated, `planMaintenanceOperation` sees the updated state and produces plan items as if the operation could be applied again. For example, after an `assign-owner` operation, `currentMaintainer` in the response will show the newly assigned maintainer, and `proposedChange` will say "Assign maintainer to X" even though that change was already applied. This is misleading to API consumers who expect the response to reflect what *was* done, not what *could be* done to the current state.

**Fix:** Build the response items from the `plan` computed *before* execution, or from the `mutatedRecords` return value, rather than re-planning against the already-mutated data. Cache the pre-mutation plan and use it for response construction.

## Info

### IN-01: Missing `decayMeta` field on KnowledgeRecord type

**File:** `packages/server/src/lib/store.ts:215-244`
**Issue:** The `KnowledgeRecord` interface does not include a `decayMeta` field, but the code in `batch.ts:261-271` and `maintenance.ts:111-119` accesses `entry.decayMeta` via `any` casts or type assertions. This is an existing pattern from the decay feature but creates a type safety gap where TypeScript cannot catch incorrect property access on `decayMeta`.

**Fix:** Add `decayMeta` to `KnowledgeRecord` in `store.ts` with the appropriate type, eliminating the need for `any` casts in consuming code.

### IN-02: Maintenance commands not listed in `api:list` output

**File:** `packages/cli/src/index.ts:78-114`
**Issue:** The `maintenance-list`, `maintenance-assign`, and `maintenance-verify` CLI commands are registered but not included in the `api:list` command output. Users running `trapmap api:list` will not discover these commands.

**Fix:** Add maintenance commands to the `availableCommands` array, gated by an appropriate visibility flag (e.g., `visibility.allowKnowledgeUpdate`).

### IN-03: Maintenance routes not in documentedRoutes array

**File:** `packages/server/src/app.ts:39-78`
**Issue:** The `documentedRoutes` array in `app.ts` does not include the new maintenance endpoints (`GET /v1/operations/maintenance/entries` and `POST /v1/operations/maintenance/batch`). The routes are registered and functional, but they are not discoverable via the `/meta/routes` endpoint.

**Fix:** Add `'GET /v1/operations/maintenance/entries'` and `'POST /v1/operations/maintenance/batch'` to the `documentedRoutes` array.

### IN-04: Redundant error handler branches in app.ts

**File:** `packages/server/src/app.ts:231-244`
**Issue:** The error handler checks `isAppError(error)` (a type guard function) and then separately checks `error instanceof AppError`. Since `isAppError` checks the same condition, the second branch (lines 239-244) is unreachable dead code. This is a pre-existing issue not introduced in Phase 59.

**Fix:** Remove the redundant `instanceof AppError` branch (lines 239-244).

---

_Reviewed: 2026-05-03T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
