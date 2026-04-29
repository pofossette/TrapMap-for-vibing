---
phase: 43-migrate-store-and-indexing-persistence-to-database-backed-li
verified: 2026-04-29
status: complete
verifier: gsd-verifier (Phase 46 backfill)
---

# Phase 43 Verification: Migrate store and indexing persistence to database-backed libraries

**Phase Goal:** Replace the file-backed `JsonStore` with a Drizzle/PostgreSQL-backed compatibility store that keeps the current `StoreData` snapshot/transaction contract and moves store plus indexing state off the filesystem without a route-by-route rewrite.

## Must-Have Verification

### P43-01: Database-backed Store Foundation

| Must-Have | Evidence | Status |
|-----------|----------|--------|
| Drizzle schema for store_snapshot JSONB table | `packages/server/src/lib/persistence/schema.ts` line 10: `storeSnapshot = pgTable('store_snapshot', ...)` | ✅ Verified |
| PostgresStore implements SkillShareerStore | `packages/server/src/lib/persistence/postgres-store.ts` line 19: `class PostgresStore implements SkillShareerStore` | ✅ Verified |
| createSkillShareerStore factory for runtime selection | `packages/server/src/lib/persistence/create-store.ts` line 17: `export function createSkillShareerStore(config)` | ✅ Verified |
| Factory selects PostgresStore when TRAPMAP_DATABASE_URL set | `create-store.ts` line 20: `return new PostgresStore(pool)` | ✅ Verified |
| Factory selects JsonStore otherwise | `create-store.ts` line 23: `return new JsonStore(config.dataFile)` | ✅ Verified |
| JSONB snapshot pattern (single row) | `postgres-store.ts` uses `SELECT data FROM store_snapshot WHERE key = 'main'` | ✅ Verified |
| FOR UPDATE row-level locking in transact | `postgres-store.ts` uses `SELECT ... FOR UPDATE` inside transactions | ✅ Verified |
| Lazy schema creation (no migration bootstrap) | `postgres-store.ts` uses `CREATE TABLE IF NOT EXISTS` on first access | ✅ Verified |

### P43-02: Store Contract Propagation

| Must-Have | Evidence | Status |
|-----------|----------|--------|
| All production modules use SkillShareerStore (not JsonStore) | Verified via typecheck — zero production JsonStore imports outside persistence layer | ✅ Verified |
| Shared contract test runner for any SkillShareerStore | `store.test.ts` line 17: `runSharedStoreContractTests()` function | ✅ Verified |
| PostgresStore regression tests pass | 8 tests pass against pg-mem backed PostgresStore | ✅ Verified |

### P43-03: Test and Verification Cleanup

| Must-Have | Evidence | Status |
|-----------|----------|--------|
| All test type annotations widened to SkillShareerStore | 12 test files modified: events, retrieval-workflow, retrieval, derive, model, edit, reconcile, graph, pipeline, reconcile-indexing, operations, retrieval-route | ✅ Verified |
| JsonStore contract tests added to shared runner | `store.test.ts` runs both JsonStore and PostgresStore through same contract tests | ✅ Verified |
| Assignability tests proving interchangeable implementations | 3 runtime selection tests + structural equivalence test in `store.test.ts` | ✅ Verified |
| Server typecheck passes | Verified during execution | ✅ Verified |

## Codebase Artifact Verification

| Artifact | Path | Exists | Verified |
|----------|------|--------|----------|
| Drizzle schema | `packages/server/src/lib/persistence/schema.ts` | ✅ | ✅ |
| PostgresStore | `packages/server/src/lib/persistence/postgres-store.ts` | ✅ | ✅ |
| Store factory | `packages/server/src/lib/persistence/create-store.ts` | ✅ | ✅ |
| Store tests | `packages/server/src/lib/store.test.ts` | ✅ | ✅ (18 tests) |

## Key Truths Preserved

1. **SkillShareerStore interface** — The shared interface remains the sole production contract; all routes and services depend on it, not on concrete store classes.
2. **Runtime selection** — `createSkillShareerStore` selects PostgresStore or JsonStore based on `TRAPMAP_DATABASE_URL` env var, with no route-level changes needed.
3. **JSONB snapshot pattern** — A single `store_snapshot` row holds the full `StoreData` as JSONB, preserving the existing snapshot/transact contract for future relational decomposition.
4. **Raw SQL over Drizzle queries** — Uses `pool.query()` directly because pg-mem (test doubles) does not support Drizzle's prepared statement system. Drizzle schema retained for future migration tooling.
5. **Backward compatibility** — Both JsonStore and PostgresStore pass identical contract tests, proving behavioral parity.

## Test Coverage

- **store.test.ts**: 18 tests total
  - Shared contract tests: 5 tests per implementation (JsonStore + PostgresStore = 10)
  - Factory selection tests: 2 (JsonStore without URL, PostgresStore with URL)
  - Assignability tests: 3 (runtime selection, structural equivalence)
  - Additional PostgresStore-specific: 3 (empty snapshot, ID allocation, transaction semantics)

## Conclusion

Phase 43 successfully migrated the persistence layer from file-backed JsonStore to a Drizzle/PostgreSQL-backed PostgresStore while preserving the existing SkillShareerStore contract. All 3 plans completed, all must-haves verified, and the server typecheck passes cleanly.

**Overall Phase Status:** ✅ **COMPLETE**

---
*Verified: 2026-04-29 by Phase 46 verification backfill*
