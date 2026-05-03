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
  info: 3
  total: 6
status: issues_found
---

# Phase 59: Code Review Report

**Reviewed:** 2026-05-03
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed the Phase 59 maintenance feature: ownership verification and SLA management for knowledge entries. The feature adds maintenance metadata contracts, a batch mutation service, CLI commands, and Fastify routes with filtering and dry-run support.

The codebase follows established patterns from the decay feature (decay.ts, decay/batch.ts). Contract schemas are well-structured with proper Zod validation. Test coverage is reasonable for both unit and integration levels.

One critical issue was found: the `assign-owner` action writes flat `maintenanceMeta` fields (`maintainerUserId`, `maintainerHandle`, `maintainerLevel`) that match the store-level `MaintenanceMetaRecord` shape but conflict with the contract-level `maintenanceMetaSchema`, which expects a nested `maintainer` object of type `ActorRef`. This creates a data shape mismatch between what the route returns and what the contract schema validates.

Two warnings involve an injected timestamp being bypassed by `nowIso()` in the execution path, and an incorrect `newMaintainerHandle` assignment that uses the actor's handle instead of the new maintainer's handle.

## Critical Issues

### CR-01: Data shape mismatch between store record and contract schema for maintenanceMeta

**File:** `packages/server/src/lib/maintenance/batch.ts:211-224`
**Issue:** The `assign-owner` action writes `maintenanceMeta` with flat fields (`maintainerUserId`, `maintainerHandle`, `maintainerLevel`, `reviewBy`), which matches `MaintenanceMetaRecord` in `store.ts:204-213`. However, the contract-level `maintenanceMetaSchema` (in `maintenance.ts:23-28`) defines `maintainer` as a nested `actorRefSchema` object -- not flat fields. The route in `maintenance.ts:141-143` calls `toActorRefFromRecord(entry.maintenanceMeta)` to bridge this, but the response items go through `maintenanceBatchOperationItemSchema` validation which expects `currentMaintainer: actorRefSchema.nullable()` -- and that field is populated from the plan's `currentMaintainer` which comes from `toActorRefFromRecord`. This means the data stored on disk does not match the contract schema shape, and any code that tries to `maintenanceMetaSchema.parse(entry.maintenanceMeta)` directly will fail.

Additionally, the `extend-review` and `mark-verified` actions (lines 229-254) initialize `maintenanceMeta` with flat fields when null, which further entrenches this mismatch. The contract schema has `maintainer: actorRefSchema.nullable()` while the store uses separate `maintainerUserId`/`maintainerHandle`/`maintainerLevel` fields.

This is a cross-cutting concern: the store record shape and contract schema shape diverge. The `toActorRefFromRecord` function bridges them for read paths, but the write path directly stores the flat record. If any downstream consumer (serialization, export, PostgreSQL migration) applies the contract schema to the stored data, it will reject the records.

**Fix:** Either (a) align `maintenanceMetaSchema` with the flat store record shape, adding separate nullable fields for maintainer ID/handle/level, or (b) change the write path to store data in the contract's nested shape and update `MaintenanceMetaRecord` accordingly. Option (a) is lower-risk since it matches the established store pattern. The contract schema should be:

```typescript
export const maintenanceMetaSchema = z.object({
  maintainerUserId: entityIdSchema.nullable().default(null),
  maintainerHandle: z.string().nullable().default(null),
  maintainerLevel: z.number().int().nullable().default(null),
  reviewBy: isoTimestampSchema.nullable().default(null),
});
```

Or if the nested `ActorRef` shape is preferred for the API layer, ensure `toActorRefFromRecord` is consistently applied at all read boundaries.

## Warnings

### WR-01: Injected `now` timestamp bypassed by `nowIso()` call in execute path

**File:** `packages/server/src/lib/maintenance/batch.ts:208`
**Issue:** The `executeMaintenanceOperation` function accepts a `now: Date` parameter for deterministic testing, but inside the loop it calls `nowStr = nowIso()` (which is `new Date().toISOString()`) instead of `now.toISOString()`. This means the `updatedAt` timestamps and `decayMeta.lastVerifiedAt` values written during execution use wall-clock time rather than the injected timestamp. Tests in `batch.test.ts` do not assert exact `updatedAt` values for the mutated entries, so this has not been caught.

**Fix:** Replace `const nowStr = nowIso()` on line 208 with `const nowStr = now.toISOString()`:

```typescript
const nowStr = now.toISOString();
```

### WR-02: Incorrect newMaintainerHandle assignment in batch route

**File:** `packages/server/src/routes/maintenance.ts:236-238`
**Issue:** When building the `input` object for the `assign-owner` action, the route sets `newMaintainerHandle` to `auth.handle` (the requesting admin's handle), not the new maintainer's handle. This means if admin "alice" assigns "bob" as maintainer, the stored handle will be "alice" instead of "bob". The CLI command correctly passes `--owner-handle` from flags, but the server route always uses the actor's handle.

**Fix:** The `maintenanceBatchOperationRequestSchema` does not currently accept a `newMaintainerHandle` field. Add it to the request schema and use it in the route:

```typescript
// In maintenance.ts contract:
newMaintainerHandle: z.string().min(1).max(280).optional(),

// In maintenance.ts route, replace lines 236-238:
...(body.newMaintainerHandle !== undefined
  ? { newMaintainerHandle: body.newMaintainerHandle }
  : {}),
```

## Info

### IN-01: Missing `decayMeta` field on KnowledgeRecord type

**File:** `packages/server/src/lib/store.ts:215-244`
**Issue:** The `KnowledgeRecord` interface does not include a `decayMeta` field, but the code in `batch.ts:261-271` and `maintenance.ts:111-119` accesses `entry.decayMeta` via `any` casts or type assertions. This is an existing pattern from the decay feature but creates a type safety gap where TypeScript cannot catch incorrect property access on `decayMeta`.

**Fix:** Add `decayMeta` to `KnowledgeRecord` in `store.ts` with the appropriate type, eliminating the need for `any` casts in consuming code.

### IN-02: Maintenance commands not listed in `api:list` output

**File:** `packages/cli/src/index.ts:78-114`
**Issue:** The `maintenance-list`, `maintenance-assign`, and `maintenance-verify` CLI commands are registered but not included in the `api:list` command output. Users running `trapmap api:list` will not discover these commands.

**Fix:** Add maintenance commands to the `availableCommands` array, gated by an appropriate visibility flag (e.g., `visibility.allowKnowledgeUpdate`).

### IN-03: Redundant error handler branches in app.ts

**File:** `packages/server/src/app.ts:231-244`
**Issue:** The error handler checks `isAppError(error)` (which is a type guard function) and then separately checks `error instanceof AppError`. Since `isAppError` presumably checks the same condition, the second branch (lines 239-244) is unreachable dead code. This is a pre-existing issue not introduced in Phase 59.

**Fix:** Remove the redundant `instanceof AppError` branch (lines 239-244).

---

_Reviewed: 2026-05-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
