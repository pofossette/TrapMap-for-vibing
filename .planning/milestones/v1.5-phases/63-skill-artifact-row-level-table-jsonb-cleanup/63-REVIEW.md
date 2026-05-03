# Phase 63 Review: Skill Artifact Row-Level Table JSONB Cleanup

## Summary

This review analyzes the skill artifact persistence layer during the transition from JSONB snapshot storage to row-level PostgreSQL tables. The codebase is in Phase 63 (WRITE-03), which aims to move skill artifacts from `data.skillArtifacts` JSONB array to dedicated PostgreSQL tables.

## Files Reviewed

| File | Purpose |
|------|---------|
| `schema.ts` | Drizzle ORM schema definitions for skill_artifacts, artifact_revisions, artifact_lifecycle_events |
| `repository.ts` | ArtifactRepository interface, DualWriteArtifactRepository, InMemoryArtifactRepository |
| `pg-repository.ts` | PostgreSQL implementation with row-level locking |
| `model.ts` | Domain model functions for artifact creation/manipulation |
| `migrate-artifacts.ts` | One-time migration script for JSONB to PostgreSQL |
| `migrate-artifacts.test.ts` | Migration tests |
| `store.ts` | SkillArtifactRecord type and StoreData interface |
| `context.ts` | SkillShareerServices type definition |
| `app.ts` | Application bootstrap and artifactRepo initialization |
| `operations.ts` | HTTP routes using artifactRepo and skillArtifacts |
| `index.ts` | Barrel export for artifacts module |

---

## Findings

### F1: Dual-Write Pattern Not Fully Implemented

**Location**: `repository.ts:366-380`, `operations.ts`

**Issue**: The `createArtifactRepository` factory function (lines 366-380) returns a raw `PgArtifactRepository` when a PostgreSQL pool is available, without wrapping it in `DualWriteArtifactRepository`. However, `operations.ts` continues to write to `data.skillArtifacts` via `store.transact()` calls, creating a de facto dual-write but in an ad-hoc manner.

```typescript
// repository.ts:376-377
// Phase 63: PostgreSQL-only, no JSONB shadow writes
return new PgArtifactRepository(config.pool);
```

**Impact**: Inconsistent persistence behavior. The code comment says "PostgreSQL-only, no JSONB shadow writes" but `operations.ts` still updates `data.skillArtifacts` directly.

**Recommendation**: Either:
1. Remove JSONB writes entirely from `operations.ts` if Phase 63 is complete, or
2. Use `DualWriteArtifactRepository` wrapper for transitional consistency

---

### F2: Direct JSONB Access in Routes

**Location**: `operations.ts:608, 735, 874-876, 909, 1065-1072, 1157-1163, 1194, 1284-1290, 1346-1353, 1435-1441, 1576-1581`

**Issue**: Multiple routes directly access and mutate `data.skillArtifacts` via `store.transact()` instead of using `artifactRepo` consistently:

```typescript
// operations.ts:608
const artifact = data.skillArtifacts?.find((a) => a.id === artifactId);

// operations.ts:874-876
if (!data.skillArtifacts) {
  data.skillArtifacts = [];
}
```

**Impact**: Bypasses the repository abstraction, making the transition incomplete and creating maintenance burden.

**Recommendation**: Refactor routes to use `artifactRepo.getById()`, `artifactRepo.updateLifecycle()`, etc. for consistency.

---

### F3: Missing Repository Method for Review Operations

**Location**: `repository.ts:31-104`

**Issue**: The `ArtifactRepository` interface lacks methods for review-specific operations that are performed in `operations.ts`:
- Adding review notes
- Recording review decisions
- Updating agent review status

These operations currently go through `store.transact()` directly.

**Impact**: Review operations bypass the repository layer, creating inconsistent persistence patterns.

**Recommendation**: Add repository methods:
- `appendReviewNote(artifactId, note)`
- `recordReviewDecision(artifactId, decision)`
- `updateAgentReview(artifactId, review)`

---

### F4: appendSkillArtifactRevision Asymmetric Persistence

**Location**: `model.ts:446-449`

**Issue**: The `appendSkillArtifactRevision` function updates the artifact in-memory first, then optionally persists via `artifactRepo.appendRevision()`. However, it doesn't update the full artifact state (metadata counters, lifecycleHistory) via repository:

```typescript
// model.ts:446-449
// Persist using repository if available
if (args.artifactRepo) {
  await args.artifactRepo.appendRevision(args.artifact.id, revision);
}
```

The in-memory artifact has `metadata`, `lifecycleHistory`, `agentReview`, and `reviewNotes` updated (lines 407-444), but `appendRevision` only persists the revision itself.

**Impact**: Data inconsistency between in-memory state and PostgreSQL for non-revision fields when using repository.

**Recommendation**: Either expand `appendRevision` to handle full artifact updates, or add separate repository methods for metadata/lifecycle updates.

---

### F5: Sequence Synchronization Hash Collision Risk

**Location**: `migrate-artifacts.ts:195-203`

**Issue**: The `simpleHash` function for non-standard artifact IDs uses a simple hash that could produce collisions:

```typescript
// migrate-artifacts.ts:195-203
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
```

**Impact**: Low risk but could cause sequence conflicts for non-standard IDs if hash collisions occur.

**Recommendation**: Use a cryptographic hash (e.g., SHA-256 truncated) or ensure all artifact IDs follow the `artifact_N` format.

---

### F6: PgArtifactRepository.ensureSchema Called on Every Operation

**Location**: `pg-repository.ts:45-132`

**Issue**: Every repository method calls `ensureSchema()` which checks `this.initialized` flag. While the check is fast, the schema creation DDL is run on first use per repository instance.

```typescript
// pg-repository.ts:45-47
private async ensureSchema(): Promise<void> {
  if (this.initialized) return;
  // ... DDL statements
}
```

**Impact**: Minor performance overhead on first operation. If multiple `PgArtifactRepository` instances are created, each runs DDL independently.

**Recommendation**: Consider schema migration via dedicated migration tool (e.g., Drizzle Kit) rather than auto-creation.

---

### F7: Missing Foreign Key Constraints

**Location**: `pg-repository.ts:74-103`, `schema.ts:404-547`

**Issue**: The child tables (`artifact_revisions`, `artifact_lifecycle_events`) don't have foreign key constraints to `skill_artifacts.id`:

```typescript
// pg-repository.ts:74-88 - No REFERENCES constraint
CREATE TABLE IF NOT EXISTS artifact_revisions (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,  // No FK constraint
  ...
)
```

**Impact**: Orphaned rows possible if artifact deleted without cascade. Referential integrity not enforced at database level.

**Recommendation**: Add foreign key constraints with appropriate cascade behavior:
```sql
artifact_id TEXT NOT NULL REFERENCES skill_artifacts(id) ON DELETE CASCADE
```

---

### F8: Drizzle Schema Not Used for Queries

**Location**: `pg-repository.ts`

**Issue**: The `PgArtifactRepository` uses raw SQL queries via `pool.query()` instead of Drizzle ORM query builder, despite importing and setting up Drizzle:

```typescript
// pg-repository.ts:36-38
this.db = drizzle(pool, {
  schema: { skillArtifacts },
});

// But then uses raw SQL:
// pg-repository.ts:157-180
await client.query(
  `INSERT INTO skill_artifacts (...) VALUES ($1, $2, ...)`,
  [...]
);
```

**Impact**:
- Drizzle schema is effectively unused
- No type safety for queries
- Manual parameter binding error-prone

**Recommendation**: Use Drizzle query builder for type-safe queries, or remove Drizzle dependency if raw SQL is preferred.

---

### F9: Index Coverage Gaps

**Location**: `pg-repository.ts:106-129`, `schema.ts:393-397`

**Issue**: Missing indexes for common query patterns:
- No index on `owner_user_id` for listing by owner
- No composite index on `(lifecycle_state, team_id)` for filtered lists
- No index on `artifact_revisions.submitted_at` for chronological queries

**Impact**: Suboptimal query performance for common operations.

**Recommendation**: Add indexes based on query patterns identified in `operations.ts`.

---

### F10: JSONB Labels vs Array Type

**Location**: `pg-repository.ts:59`, `schema.ts:346`

**Issue**: Labels are stored as JSONB but Drizzle schema and row types expect `string[]`:

```typescript
// pg-repository.ts:59
labels JSONB NOT NULL DEFAULT '[]',

// schema.ts:346
labels: jsonb('labels').notNull().$type<string[]>().default([]),
```

PostgreSQL returns JSONB as parsed JSON, but the row type in `pg-repository.ts` expects `string[]` directly:

```typescript
// pg-repository.ts:592
labels: string[];
```

**Impact**: Potential type mismatch if PostgreSQL returns JSON-parsed array vs native array.

**Recommendation**: Use PostgreSQL array type (`text[]`) for labels, or ensure consistent JSON handling.

---

## Positive Observations

### P1: Row-Level Locking Pattern

**Location**: `pg-repository.ts:281-285, 339-342, 403-406, 533-536`

The repository correctly uses `SELECT FOR UPDATE` for row-level locking during concurrent updates, preventing race conditions.

### P2: Transaction Safety

**Location**: `pg-repository.ts:152-232, 277-325, 334-385, 398-432, 528-576`

All write operations use transactions with proper rollback on error, ensuring data consistency.

### P3: Migration Idempotency

**Location**: `migrate-artifacts.ts:82-149`

The migration script correctly handles idempotency by checking for existing artifacts before insertion, making it safe to run multiple times.

### P4: Sequence Synchronization

**Location**: `migrate-artifacts.ts:160-189`

Post-migration sequence synchronization ensures new IDs don't collide with migrated artifacts.

---

## Recommendations Summary

| Priority | Finding | Action |
|----------|---------|--------|
| High | F1 | Clarify dual-write strategy; either use DualWriteArtifactRepository or remove JSONB writes |
| High | F2 | Refactor operations.ts to use artifactRepo consistently |
| High | F4 | Ensure appendSkillArtifactRevision persists all updated fields |
| Medium | F3 | Add review-related repository methods |
| Medium | F7 | Add foreign key constraints to child tables |
| Medium | F8 | Use Drizzle query builder or remove unused dependency |
| Low | F5 | Improve non-standard ID hash function |
| Low | F6 | Consider dedicated migration tool |
| Low | F9 | Add missing indexes for query patterns |
| Low | F10 | Clarify labels column type (JSONB vs text[]) |

---

## Test Coverage Assessment

**Location**: `migrate-artifacts.test.ts`

Tests cover:
- Dry-run mode
- Idempotent migration
- Artifact data preservation
- Sequence synchronization
- Error handling
- Nested data migration
- Progress callbacks
- Non-standard IDs

**Missing Tests**:
- Concurrent migration attempts
- Large-scale migration performance
- Rollback scenarios
- Integration tests with actual PostgreSQL

---

## Conclusion

Phase 63 has established the foundational infrastructure for row-level skill artifact storage, but the transition from JSONB is incomplete. The main blockers are:

1. Routes still use direct `data.skillArtifacts` access instead of repository
2. Review operations lack repository methods
3. Dual-write pattern is implemented ad-hoc rather than systematically

Completing the transition requires refactoring `operations.ts` to use the repository pattern consistently and adding missing repository methods for all artifact mutations.
