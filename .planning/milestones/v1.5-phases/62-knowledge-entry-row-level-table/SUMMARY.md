# Phase 62-03: Migration Script and Module Integration

## Summary

Successfully implemented migration tooling to backfill existing knowledge entries from JSONB snapshot to the new relational tables, following the same pattern as Phase 61's migrate-candidates.ts.

## Tasks Completed

### Task 1: Create Migration Script ✅

Created `packages/server/src/lib/persistence/migrate-knowledge.ts`:
- `MigrationConfig` interface with pool, store, dryRun, batchSize, onProgress options
- `MigrationResult` interface with totalEntries, migrated, skipped, errors, durationMs
- `migrateKnowledgeEntries()` function that:
  - Reads `data.knowledgeEntries` from store snapshot
  - Checks if entries already exist in relational table (idempotent)
  - Inserts entries via `PgKnowledgeRepository` including nested data
  - Reports progress via callback
  - Collects errors without stopping
  - Supports dry-run mode
  - Synchronizes SEQUENCE to max(existing_ids) + 1 after migration

### Task 2: Create Migration Tests ✅

Created `packages/server/src/lib/persistence/migrate-knowledge.test.ts`:
- Dry-run mode test (no data written)
- Basic migration test (entries moved correctly)
- Idempotent migration test (safe to run multiple times)
- Error handling test (errors recorded, processing continues)
- Nested data migration test (revisions, lifecycle events)
- SEQUENCE synchronization test
- Progress callback test
- Empty store handling test
- Non-standard ID handling test

Also created `packages/server/src/lib/lifecycle/state-machine.ts` which was missing but required by pg-repository.ts.

### Task 3: Update Knowledge Module Exports ✅

Updated `packages/server/src/lib/knowledge/index.ts` to export `PgKnowledgeRepository` from `./pg-repository.js`.

## Acceptance Criteria Status

- [x] Migration script exists with dry-run and progress callback support
- [x] Migration handles nested data (revisions, lifecycle events)
- [x] Migration is idempotent (safe to run multiple times)
- [x] Migration preserves existing entry IDs
- [x] Migration synchronizes SEQUENCE to max(existing_ids) + 1
- [x] Migration records errors without stopping
- [x] Tests cover all migration scenarios (9 tests pass)
- [x] Knowledge module exports updated
- [ ] All existing tests pass (pre-existing failures unrelated to changes)
- [ ] Type checking passes (pre-existing errors unrelated to changes)

## Files Modified

- `packages/server/src/lib/persistence/migrate-knowledge.ts` (new)
- `packages/server/src/lib/persistence/migrate-knowledge.test.ts` (new)
- `packages/server/src/lib/lifecycle/state-machine.ts` (new - was missing)
- `packages/server/src/lib/knowledge/index.ts` (modified)

## Commits

1. `feat(62-03): add migration script for knowledge entries to relational tables`
2. `test(62-03): add tests for knowledge entry migration`
3. `feat(62-03): add lifecycle state machine for knowledge entries`
4. `feat(62-03): export PgKnowledgeRepository from knowledge module`

## Notes

- The lifecycle state-machine module was referenced by pg-repository.ts but was missing from the codebase. Created it to enable tests to run.
- Pre-existing test failures in evidence, rerank, and retrieval-workflow modules are unrelated to this phase's changes.
- Build errors in CLI package are pre-existing issues with missing schema exports.
