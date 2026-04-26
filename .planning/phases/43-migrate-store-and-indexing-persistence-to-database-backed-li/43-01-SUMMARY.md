---
phase: 43-migrate-store-and-indexing-persistence-to-database-backed-li
plan: 01
subsystem: database
tags: [postgresql, drizzle, pg-mem, jsonb, persistence]

# Dependency graph
requires: []
provides:
  - "Drizzle schema for store_snapshot JSONB table"
  - "PostgresStore implementing snapshot/transact/nextId against PostgreSQL"
  - "createSkillShareerStore factory for runtime store selection"
  - "Regression tests for PostgresStore using pg-mem"
affects: [43-migrate-store-and-indexing-persistence-to-database-backed-li]

# Tech tracking
tech-stack:
  added: [drizzle-orm@0.45.2, pg@8.20.0, pg-mem@3.0.14, drizzle-kit@0.31.10]
  patterns: [jsonb-snapshot-store, lazy-schema-creation, runtime-store-selection]

key-files:
  created:
    - packages/server/src/lib/persistence/schema.ts
    - packages/server/src/lib/persistence/postgres-store.ts
    - packages/server/src/lib/persistence/create-store.ts
    - packages/server/src/lib/store.test.ts
  modified:
    - packages/server/src/lib/persistence/postgres-store.ts

key-decisions:
  - "Use raw SQL via pool.query instead of Drizzle query builder for the JSONB snapshot reads/writes, because pg-mem does not support getTypeParser which Drizzle's prepared queries require; Drizzle schema retained for future relational decomposition"
  - "Use row-level FOR UPDATE locking inside transact to match JsonStore's serialized write semantics"
  - "Lazy CREATE TABLE IF NOT EXISTS on first access instead of requiring a separate migration bootstrap"

patterns-established:
  - "JSONB snapshot pattern: one StoreData row persisted as JSONB for compatibility, later phases peel domains into relational tables"
  - "Store factory pattern: createSkillShareerStore selects PostgresStore or JsonStore based on TRAPMAP_DATABASE_URL"

requirements-completed: [P43-01, P43-02]

# Metrics
duration: 12min
completed: 2026-04-26
---

# Phase 43 Plan 01: Database-backed Store Foundation Summary

**PostgreSQL persistence layer with Drizzle schema, PostgresStore using JSONB snapshot rows and FOR UPDATE locking, and runtime store factory selecting between PostgresStore and JsonStore**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-26T04:26:17Z
- **Completed:** 2026-04-26T04:38:17Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Drizzle schema definition for the store_snapshot table (JSONB + singleton key)
- PostgresStore implementation with lazy schema creation, snapshot reads, transactional writes with row-level locking, and counter-based ID allocation
- createSkillShareerStore factory routing to PostgresStore when TRAPMAP_DATABASE_URL is set, JsonStore otherwise
- Regression tests for PostgresStore (empty snapshot, persisted mutations, ID allocation) and factory selection logic, all passing against pg-mem

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the shared store contract and PostgreSQL persistence foundation** - `6e15033` (feat)
2. **Task 2: Wire runtime store selection into server config/bootstrap** - `8c31991` (fix: typecheck)

**Note:** Task 2 acceptance criteria were already satisfied by the existing codebase (app.ts used createSkillShareerStore, config.ts had databaseUrl). The Task 2 commit addressed a typecheck issue in PostgresStore discovered during verification.

## Files Created/Modified
- `packages/server/src/lib/persistence/schema.ts` - Drizzle schema for store_snapshot JSONB table
- `packages/server/src/lib/persistence/postgres-store.ts` - PostgreSQL-backed SkillShareerStore implementation
- `packages/server/src/lib/persistence/create-store.ts` - Runtime store factory (PostgresStore vs JsonStore)
- `packages/server/src/lib/store.test.ts` - Tests for PostgresStore and createSkillShareerStore

## Decisions Made
- Used raw SQL via `pool.query` instead of Drizzle's query builder because pg-mem (test doubles) does not support `getTypeParser` which Drizzle's prepared statement system requires. The Drizzle schema file is retained for future relational decomposition and migration tooling.
- Used `FOR UPDATE` row-level locking inside `transact` combined with `BEGIN/COMMIT` to preserve serialized write semantics matching JsonStore's write-chain pattern.
- Schema is created lazily via `CREATE TABLE IF NOT EXISTS` on first access so the server can start without a separate migration bootstrap step.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test passing wrapped pool object instead of pool directly**
- **Found during:** Task 1 (PostgresStore test)
- **Issue:** Test passed `{ pool: new Pool() }` to PostgresStore constructor, but the constructor expects `Pool` directly. This caused `this.pool.query is not a function`.
- **Fix:** Changed test to pass `new Pool() as unknown as Pool` directly.
- **Files modified:** src/lib/store.test.ts
- **Verification:** Tests pass
- **Committed in:** 6e15033 (part of Task 1 commit)

**2. [Rule 1 - Bug] Replaced Drizzle query builder with raw SQL for pg-mem compatibility**
- **Found during:** Task 1 (PostgresStore test)
- **Issue:** pg-mem does not support `getTypeParser` which Drizzle ORM's node-postgres session uses for prepared queries, causing `Not supported` errors.
- **Fix:** Replaced Drizzle `db.select().from().where().limit()` with raw `pool.query('SELECT data FROM store_snapshot WHERE key = $1', ['main'])`.
- **Files modified:** src/lib/persistence/postgres-store.ts
- **Verification:** Tests pass
- **Committed in:** 6e15033 (part of Task 1 commit)

**3. [Rule 1 - Bug] Added explicit row type parameters to pg query calls**
- **Found during:** Task 1 (typecheck verification)
- **Issue:** The project's ambient pg type declaration uses `QueryResult<Row = unknown>`, so `rows[0].data` was `unknown` and failed strict type checking.
- **Fix:** Passed `{ data: StoreData | null }` as the generic type parameter to `pool.query` and `client.query` calls.
- **Files modified:** src/lib/persistence/postgres-store.ts
- **Verification:** Typecheck passes for new files, tests still pass
- **Committed in:** 8c31991

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All fixes necessary for correct compilation and test execution. No scope creep.

## Issues Encountered
- Task 2 acceptance criteria were already met by the existing codebase wiring (app.ts used createSkillShareerStore, config.ts had databaseUrl), so no additional wiring code was needed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- PostgreSQL-backed store foundation is complete and tested
- Drizzle schema file ready for future relational table decomposition
- Factory pattern allows seamless switching between JsonStore and PostgresStore
- Ready for Plan 43-02 to build on this foundation

## Self-Check: PASSED

- All 4 created files verified present
- Both commits (6e15033, 8c31991) verified in git log

---
*Phase: 43-migrate-store-and-indexing-persistence-to-database-backed-li*
*Completed: 2026-04-26*
