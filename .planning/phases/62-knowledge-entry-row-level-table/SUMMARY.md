# Phase 62-02: PostgreSQL Knowledge Repository Implementation

## Summary

Implemented `PgKnowledgeRepository` with row-level locking for concurrent-safe operations on knowledge entries. Created comprehensive tests for all repository methods including SEQUENCE-based ID generation and lifecycle state machine integration.

## Tasks Completed

### Task 1: Implement PgKnowledgeRepository

Created `packages/server/src/lib/knowledge/pg-repository.ts` with:

- Class implementing `KnowledgeRepository` interface
- `ensureSchema()` method for idempotent table creation
- `nextId()` using PostgreSQL SEQUENCE for monotonic ID generation
- `insert()` with transaction for entries, revisions, and lifecycle events
- `getById()` reconstructing full `KnowledgeRecord` from database rows
- `updateLifecycle()` with SELECT FOR UPDATE row-level locking
- `appendRevision()` with row-level locking and latest revision update
- `appendLifecycleEvent()` for audit trail
- `listByFilter()` for filtered queries (returns lightweight records)
- `updateGovernance()` for labels and requiredLevel updates

### Task 2: Helper Functions for Row-to-Record Mapping

Added mapping functions:

- `rowToKnowledgeEntry()` - Maps database row to partial KnowledgeRecord
- `rowToKnowledgeRevision()` - Maps revision row to KnowledgeRevisionRecord
- `rowToLifecycleEvent()` - Maps lifecycle event row to record type
- `reconstructKnowledgeRecord()` - Combines all rows into full record

Defined TypeScript interfaces:

- `DrizzleKnowledgeEntryRow`
- `DrizzleKnowledgeRevisionRow`
- `DrizzleLifecycleEventRow`

### Task 3: Create Repository Tests

Created `packages/server/src/lib/knowledge/pg-repository.test.ts` with tests for:

- `nextId()` generates unique, monotonically increasing IDs
- `insert` and `getById` round-trip with all nested data
- `updateLifecycle` with valid transitions
- `updateLifecycle` rejects invalid transitions
- `appendRevision` updates entry's latest revision
- `listByFilter` with lifecycleState, teamId, ownerUserId filters
- Concurrent access with row-level locking

### Task 4: Verify Index Table Compatibility

Added verification test that:

- Inserts entry via PgKnowledgeRepository
- Manually inserts row into knowledge_embeddings
- Confirms the embedding can be queried by entry_id

## Verification

All acceptance criteria passed:

```bash
# Task 1
grep -q "export class PgKnowledgeRepository" pg-repository.ts ✓
grep -q "implements KnowledgeRepository" pg-repository.ts ✓
grep -q "async insert(entry: KnowledgeRecord)" pg-repository.ts ✓
grep -q "async getById(entryId: string)" pg-repository.ts ✓
grep -q "async updateLifecycle" pg-repository.ts ✓
grep -q "async nextId()" pg-repository.ts ✓
grep -q "nextval" pg-repository.ts ✓
grep -q "FOR UPDATE" pg-repository.ts ✓
grep -q "BEGIN" pg-repository.ts ✓
grep -q "COMMIT" pg-repository.ts ✓

# Task 2
grep -q "function rowToKnowledgeEntry" pg-repository.ts ✓
grep -q "function rowToKnowledgeRevision" pg-repository.ts ✓
grep -q "function rowToLifecycleEvent" pg-repository.ts ✓
grep -q "interface DrizzleKnowledgeEntryRow" pg-repository.ts ✓

# Task 3 & 4
All test cases present and index table compatibility test included ✓
```

## Threat Model Mitigations

| Threat | Mitigation | Status |
|--------|------------|--------|
| SQL injection | Parameterized queries via pg driver | ✓ |
| Race condition on lifecycle transitions | SELECT FOR UPDATE row-level locking | ✓ |
| Concurrent revision number assignment | Transaction-scoped INSERT | ✓ |

## Files Created/Modified

- `packages/server/src/lib/persistence/schema.ts` - Added knowledge_entries, knowledge_revisions, lifecycle_events tables
- `packages/server/src/lib/knowledge/repository.ts` - Interface and in-memory/dual-write implementations
- `packages/server/src/lib/knowledge/pg-repository.ts` - PostgreSQL implementation
- `packages/server/src/lib/knowledge/index.ts` - Barrel export
- `packages/server/src/lib/knowledge/pg-repository.test.ts` - Tests

## Notes

- Tests require `DATABASE_URL` or `TRAPMAP_DATABASE_URL` environment variable for PostgreSQL connection
- The knowledge module (`knowledge/` directory) is created alongside existing `knowledge.ts` file for backward compatibility
- Pre-existing type errors in the codebase (decayMeta, evidenceMeta) are unrelated to this implementation
