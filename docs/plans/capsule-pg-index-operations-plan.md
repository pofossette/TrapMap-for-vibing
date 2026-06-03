# Capsule PG Index Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Wire capsule PG keyword/vector indexes into production lifecycle maintenance and expose stable repair/health operations.

**Architecture:** Reuse the existing `createCapsuleIndexSync()` and `index-rebuild.ts` helper set. The work is to hook them into lifecycle writes, stale-row removal, startup ensure, and one stable operator surface.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, Drizzle, pgvector, Vitest.

---

## Scope

- `packages/server/src/lib/retrieval/capsules/repositories/index-sync.ts`
- `packages/server/src/lib/retrieval/capsules/repositories/index-rebuild.ts`
- `packages/server/src/lib/retrieval/capsules/repositories/pg-capsule-vector.ts`
- `packages/server/src/bootstrap/bootstrap-repositories.ts`
- operator route/script location to be chosen

## Phase 0: Freeze maintenance model

- [x] Confirm which operations are correctness-critical versus operator-only:
  - lifecycle sync on approve
  - stale row removal on leave-approved or capsule deletion
  - startup HNSW ensure
  - rebuild/health/orphan cleanup entrypoints

**Completion standard**

- The chosen maintenance model is documented before implementation fan-out starts.

**Document updates**

- [x] Update `plan.md` index status when this sub-plan starts.

**Test and eval updates**

- [x] Record baseline tests:
  - `rtk pnpm test -- --run packages/server/src/__tests__/lib/retrieval/capsule-index-sync.test.ts packages/server/src/__tests__/lib/retrieval/capsule-index-rebuild.test.ts`

**Example structure or code**

```ts
interface CapsuleIndexMaintenance {
  syncArtifactCapsules(artifact: SkillArtifactRecord): Promise<SyncResult>;
  removeCapsuleIndex(capsuleId: string): Promise<void>;
}
```

## Phase 1: Lifecycle sync for keyword/vector rows

- [x] Call `syncArtifactCapsules()` from the shared artifact indexing path on approved artifacts.
- [x] Ensure failures are surfaced in a way that tests and operators can inspect.

**Completion standard**

- Approved artifacts with derived capsules populate both index tables without manual rebuild.

**Document updates**

- [x] Update `docs/architecture/components/RETRIEVAL.md`.

**Test and eval updates**

- [x] Add integration coverage that approved artifact lifecycle writes produce searchable capsule rows.

**Example structure or code**

```ts
const result = await capsuleIndexSync.syncArtifactCapsules(artifact);
```

## Phase 2: Stale capsule row cleanup

- [x] Remove rows for capsules that disappear between revisions.
- [x] Remove rows when artifact leaves `approved`.

**Completion standard**

- Old capsule IDs do not remain queryable after revision changes or lifecycle regressions.

**Document updates**

- [x] Update `docs/architecture/components/INDEXING.md`.

**Test and eval updates**

- [x] Extend `capsule-index-sync.test.ts` with removed-capsule and leave-approved cases.

**Example structure or code**

```ts
for (const staleCapsuleId of staleCapsuleIds) {
  await capsuleIndexSync.removeCapsuleIndex(staleCapsuleId);
}
```

## Phase 3: Startup ensure for capsule vector index

- [x] Call `ensureCapsuleVectorIndex()` during PG bootstrap.
- [x] Keep failure handling aligned with existing trap vector index behavior.

**Completion standard**

- PG startup attempts to ensure the capsule HNSW index automatically.

**Document updates**

- [x] Update `docs/operations/ENVIRONMENT.md` and `docs/reference/PERFORMANCE.md`.

**Test and eval updates**

- [x] Add bootstrap test coverage for capsule vector index ensure behavior.

**Example structure or code**

```ts
await ensureVectorIndex(pool);
await ensureCapsuleVectorIndex(pool);
```

## Phase 4: Stable operator surface

- [x] Choose and implement one stable operator path for:
  - full rebuild
  - artifact-scoped rebuild
  - health report
  - orphan cleanup

**Completion standard**

- Operators no longer need ad hoc library calls to repair capsule index drift.

**Document updates**

- [x] Update `docs/operations/ENVIRONMENT.md`
- [x] Update `docs/operations/TESTING.md`
- [x] Update `docs/architecture/components/RETRIEVAL.md`

**Test and eval updates**

- [x] Add tests for the chosen route/script surface.

**Example structure or code**

```ts
const report = await verifyCapsuleIndexHealth({ pool, artifacts });
```

## Phase 5: Verification and closeout

- [x] Run focused tests.
- [x] Run `rtk pnpm typecheck`.
- [x] Update completion notes.

**Completion standard**

- Lifecycle sync, stale cleanup, startup ensure, and operator repair are all covered by tests and docs.
