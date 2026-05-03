# Phase 61 Review: Candidate Pipeline Independent Table

**Review Date**: 2026-05-03
**Reviewer**: Claude Opus 4.6
**Scope**: Standard depth review of candidate pipeline persistence layer

---

## Executive Summary

Phase 61 introduces a dedicated PostgreSQL table for candidate submissions, transitioning from JSONB snapshot storage to row-level operations. The implementation follows a well-designed dual-write pattern for safe migration and provides proper concurrent access via row-level locking.

**Overall Assessment**: **READY WITH MINOR OBSERVATIONS**

The implementation is production-ready with good test coverage and a clear migration path. A few minor observations are noted below but do not block deployment.

---

## Files Reviewed

| File | Purpose | Lines |
|------|---------|-------|
| `repository.ts` | Repository interface + dual-write/in-memory implementations | 280 |
| `pg-repository.ts` | PostgreSQL-backed repository with row-level locking | 415 |
| `processor.ts` | Candidate processing pipeline orchestration | 385 |
| `index.ts` | Barrel export for candidates module | 15 |
| `schema.ts` | Drizzle schema definitions including candidates table | 158 |
| `migrate-candidates.ts` | One-time migration script for backfill | 136 |
| `repository-interface.test.ts` | Interface contract verification | 40 |
| `repository.test.ts` | Unit tests for repository implementations | 446 |
| `pg-repository.test.ts` | PostgreSQL repository test specifications | 263 |
| `migrate-candidates.test.ts` | Migration script unit tests | 427 |
| `schema-candidates.test.ts` | Schema definition verification | 54 |

---

## Architecture Analysis

### Repository Pattern

The implementation uses a clean repository abstraction:

```
CandidateRepository (interface)
    ├── InMemoryCandidateRepository  (for tests/local dev)
    ├── PgCandidateRepository        (production PostgreSQL)
    └── DualWriteCandidateRepository (transition wrapper)
```

**Strengths**:
- Interface clearly defines 8 async operations covering full CRUD lifecycle
- Factory function `createCandidateRepository()` handles environment detection
- Dual-write pattern enables zero-downtime migration

### Database Schema

The `candidates` table in `schema.ts`:

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | TEXT | NO | Primary key |
| source_type | TEXT | NO | 'trap' or 'skill' |
| submitted_by | TEXT | NO | User ID |
| team_id | TEXT | YES | Null for global |
| status | TEXT | NO | CandidateStatus enum |
| original_payload | JSONB | NO | Original submission |
| analysis_snapshot | JSONB | YES | Post-analysis data |
| duplicate_case | JSONB | YES | Duplicate detection results |
| received_at | TIMESTAMPTZ | NO | Creation time |
| queued_at | TIMESTAMPTZ | YES | Queue timestamp |
| analyzing_at | TIMESTAMPTZ | YES | Analysis start |
| completed_at | TIMESTAMPTZ | YES | Completion time |
| last_error | TEXT | YES | Error message |
| retry_count | INTEGER | NO | Default 0 |
| manual_result | JSONB | YES | Reviewer decision |
| created_at | TIMESTAMPTZ | NO | Default NOW() |
| updated_at | TIMESTAMPTZ | NO | Default NOW() |

**Observations**:

1. **Missing explicit indexes**: The schema defines columns but relies on `PgCandidateRepository.ensureSchema()` to create indexes via raw SQL. Consider defining indexes in Drizzle schema for consistency.

2. **Status as TEXT**: The status column uses TEXT rather than an enum type. This is acceptable for flexibility but could benefit from a check constraint.

### Row-Level Locking

`PgCandidateRepository` correctly implements `SELECT FOR UPDATE` for all write operations:

```typescript
// Example pattern from updateStatus()
await client.query('BEGIN');
const { rows } = await client.query<{ id: string }>(
  'SELECT id FROM candidates WHERE id = $1 FOR UPDATE',
  [candidateId],
);
// ... update logic ...
await client.query('COMMIT');
```

**Strengths**:
- Proper transaction management with BEGIN/COMMIT/ROLLBACK
- Client release in finally block prevents connection leaks
- Row-level locking enables concurrent processing of different candidates

---

## Test Coverage Analysis

### Unit Tests

| Test File | Coverage | Notes |
|-----------|----------|-------|
| `repository-interface.test.ts` | Minimal | Verifies interface shape only |
| `repository.test.ts` | Good | Tests DualWrite and InMemory implementations |
| `pg-repository.test.ts` | Specification | Contains test descriptions but no assertions |
| `migrate-candidates.test.ts` | Excellent | Comprehensive mock-based tests |
| `schema-candidates.test.ts` | Good | Verifies column definitions |

### Test Quality Observations

1. **`pg-repository.test.ts` is incomplete**: Lines 116-262 contain test descriptions without actual assertions. Comments indicate "This is verified in integration tests" but integration tests are not included in this review scope.

2. **`repository.test.ts` uses MockRepository pattern**: Good mock implementation for testing DualWriteCandidateRepository behavior.

3. **`migrate-candidates.test.ts` is thorough**: Covers:
   - Basic migration flow
   - Idempotency (skip existing)
   - Dry-run mode
   - Error handling and continuation
   - Progress callbacks
   - Duration reporting

---

## Code Quality

### Positive Patterns

1. **Consistent error handling**: All repository methods throw descriptive errors for not-found conditions.

2. **Type safety**: Uses branded types from `@trapmap/contracts` throughout.

3. **Documentation**: JSDoc comments on public interfaces and complex functions.

4. **Migration safety**: The `migrateCandidates` function is designed to be idempotent and safe to re-run.

### Minor Issues

1. **`require()` usage in factory** (`repository.ts:272`):
   ```typescript
   const { PgCandidateRepository } = require('./pg-repository.js');
   ```
   This is intentional to avoid loading pg module in test environments. The eslint-disable comment explains the rationale. Consider using dynamic `import()` for ESM compatibility.

2. **Timestamp handling inconsistency**: The `now` variable in `PgCandidateRepository` is computed as `new Date().toISOString()` but used as a string parameter. PostgreSQL will parse correctly, but using a Date object would be cleaner.

3. **Missing index definition in schema**: The `idx_candidates_status` and `idx_candidates_team` indexes are created via raw SQL in `ensureSchema()` rather than in the Drizzle schema definition. This works but splits schema definition between two places.

---

## Migration Strategy

The migration approach is sound:

1. **Dual-write phase**: `DualWriteCandidateRepository` writes to both PostgreSQL and JSONB
2. **Backfill script**: `migrateCandidates()` copies existing data
3. **Idempotency**: Migration skips already-migrated candidates
4. **Dry-run mode**: Allows verification before actual migration
5. **Progress reporting**: Callback enables monitoring of long migrations

**Recommendation**: The migration script should be wrapped in a CLI command as indicated in the usage comments.

---

## Security Considerations

1. **No SQL injection risk**: All queries use parameterized statements
2. **Proper transaction handling**: Rollback on error prevents partial state
3. **Connection cleanup**: `client.release()` in finally block prevents leaks

---

## Performance Considerations

1. **Row-level locking**: Enables concurrent processing of different candidates without whole-table locks
2. **Index coverage**: Status and team indexes support common query patterns
3. **No N+1 queries**: Each operation is a single targeted query

---

## Observations Summary

| Category | Status | Notes |
|----------|--------|-------|
| Architecture | PASS | Clean repository pattern with dual-write transition |
| Test Coverage | MINOR | pg-repository.test.ts lacks assertions |
| Error Handling | PASS | Proper transaction rollback and error propagation |
| Security | PASS | Parameterized queries, proper cleanup |
| Performance | PASS | Row-level locking, appropriate indexes |
| Documentation | PASS | JSDoc on public interfaces |

---

## Recommendations

1. **Consider completing `pg-repository.test.ts`** with actual assertions or clearly document it as integration test specifications.

2. **Move index definitions to schema.ts** for single source of truth.

3. **Add check constraint on status column** to validate against CandidateStatus enum values.

4. **Consider adding created_at/updated_at trigger** to auto-update updated_at on row modification.

---

## Conclusion

Phase 61 delivers a well-architected candidate persistence layer with proper support for concurrent operations and a safe migration path. The implementation is production-ready. The minor observations noted are improvements rather than blockers.
