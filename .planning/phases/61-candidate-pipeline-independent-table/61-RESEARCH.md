# Phase 61: Candidate Pipeline Independent Table - Research

**Researched:** 2026-05-03
**Domain:** PostgreSQL row-level table decomposition, Drizzle ORM, write-path optimization
**Confidence:** HIGH

## Summary

The candidate submission pipeline currently stores all candidate data inside a single JSONB column (`store_snapshot.data`) as part of the `StoreData` aggregate. Every mutation to any candidate requires a full `transact()` call that locks the entire single-row snapshot, serializing all writes across the system. The `processCandidate()` function makes 3-4 separate `transact()` calls per candidate (queued, analyzing, attachResults, error), each of which re-reads and re-writes the entire JSONB blob. This phase extracts candidate submissions into a dedicated `candidates` table with PostgreSQL row-level locking, so each candidate can be processed independently without blocking other candidates or unrelated store operations.

The project already uses Drizzle ORM (`drizzle-orm` 0.45.2) with `pg` 8.20.0 for PostgreSQL access. Two index tables (`knowledge_embeddings`, `knowledge_keywords`) and a task queue table (`task_queue`) already exist as independent relational tables using Drizzle schemas in `packages/server/src/lib/persistence/schema.ts`. The new `candidates` table follows this established pattern.

The dual-write period requires that every candidate mutation is written to both the new relational table AND the existing JSONB snapshot, ensuring zero behavioral change until Phase 63 removes the JSONB shadow.

**Primary recommendation:** Create a `PgCandidateRepository` class backed by a Drizzle-defined `candidates` table. Insert the repository as a new dependency alongside `SkillShareerStore`, with candidate-specific operations routed to the repository and a shadow-write adapter also updating `StoreData.candidateSubmissions`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None -- discuss phase was skipped per user setting (workflow.skip_discuss: true).

### Claude's Discretion
All implementation choices are at Claude's discretion. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None -- discuss phase skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WRITE-01 | Candidate pipeline independent table (candidates + PgCandidateRepository) | This entire research document. Core design: Drizzle table schema, repository class, dual-write adapter, migration script |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Candidate CRUD (insert/update) | API / Backend | Database / Storage | Repository pattern lives in backend, persists to PostgreSQL |
| Candidate status transitions | API / Backend | -- | Pure domain logic in processor.ts, no client involvement |
| Row-level locking | Database / Storage | -- | PostgreSQL `SELECT ... FOR UPDATE` on individual rows |
| Dual-write coordination | API / Backend | Database / Storage | Adapter writes both to relational table and JSONB snapshot |
| Migration backfill | Database / Storage | -- | One-time script reads JSONB, inserts into candidates table |
| Task queue integration | API / Backend | Database / Storage | Existing task_queue table schedules candidate processing |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.2 | PostgreSQL query builder and schema definition | Already used for knowledge_embeddings, knowledgeKeywords, taskQueue tables [VERIFIED: package.json] |
| pg | 8.20.0 | PostgreSQL client pool | Already used throughout server package [VERIFIED: package.json] |
| drizzle-kit | 0.31.10 | Schema migration generation | Already configured in drizzle.config.ts [VERIFIED: package.json] |
| nanoid | 5.1.6 | ID generation for new entities | Already used for createPrefixedId, createDuplicateCaseId [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 4.3.6 | Runtime validation of candidate shapes | Validate data before insert to maintain contract integrity |
| pg-mem | 3.0.14 | In-memory PostgreSQL for unit tests | Test repository without real PostgreSQL instance |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Drizzle schema + raw SQL | Drizzle query builder exclusively | Complex JSONB fields (originalPayload, analysisSnapshot, duplicateCase, manualResult) are easier with raw SQL insert/update; Drizzle schema is used for table definition and simple queries |
| Custom repository class | Extension of PostgresStore | PostgresStore is a compatibility wrapper for the JSONB snapshot pattern; new code should not extend it -- use a clean repository class instead |

**Installation:**
No new packages needed -- all dependencies are already installed.

**Version verification:**
```
drizzle-orm: 0.45.2 (verified npm registry)
drizzle-kit: 0.31.10 (verified npm registry)
pg: 8.20.0 (verified npm registry)
```

## Architecture Patterns

### System Architecture Diagram

```
                         routes/candidates.ts
                                |
                 +--------------+---------------+
                 |                              |
         POST /v1/candidates           GET /v1/candidates
                 |                              |
         createCandidateSubmission       getCandidateById / listByStatus
                 |                              |
         +-------+-------+              +-------+-------+
         |               |              |               |
   PgCandidateRepo  StoreData       PgCandidateRepo  StoreData
   (INSERT row)     (push to         (SELECT row)     (filter from
                    candidateSubmissions)              candidateSubmissions)
         |               |              |               |
    candidates     store_snapshot  candidates     store_snapshot
      TABLE          JSONB            TABLE          JSONB


  processCandidate() (async background)
         |
    +----+----+----+----+
    |    |    |    |    |
   queued analyzing attach finalStatus
    |    |    |    |    |
   PgCandidateRepo.updateStatus()
    |
   + dual-write to StoreData via transact()
```

### Recommended Project Structure

```
packages/server/src/lib/
  candidates/
    pg-repository.ts     # NEW: PgCandidateRepository class
    repository.ts        # NEW: CandidateRepository interface + dual-write adapter
    store.ts             # EXISTING: in-memory operations on StoreData (unchanged)
    processor.ts         # MODIFIED: accepts CandidateRepository for direct DB ops
    types.ts             # EXISTING: internal types (unchanged)
    detector.ts          # EXISTING: in-memory duplicate detection (unchanged)
    pg-detector.ts       # EXISTING: pgvector duplicate detection (unchanged)
    fingerprint.ts       # EXISTING: fingerprint computation (unchanged)
    reconcile.ts         # EXISTING: manual result resolution (unchanged)
    index.ts             # EXISTING: barrel export (updated)
  persistence/
    schema.ts            # MODIFIED: add candidates table Drizzle definition
    postgres-store.ts    # EXISTING: PostgresStore (unchanged)
    create-store.ts      # EXISTING: factory (unchanged)
    migrate-candidates.ts # NEW: backfill script
```

### Pattern 1: Repository Interface with Dual-Write Adapter

**What:** Define a `CandidateRepository` interface with two implementations: `PgCandidateRepository` (real PostgreSQL) and a dual-write wrapper that also mirrors to `StoreData`.

**When to use:** All candidate mutation operations during the dual-write period.

**Example:**
```typescript
// packages/server/src/lib/candidates/repository.ts

import type { Pool } from 'pg';
import type {
  CandidateSubmission,
  CandidateStatus,
  DuplicateCase,
  AnalysisSnapshot,
} from '@trapmap/contracts';
import type { StoreData } from '../store.js';

/**
 * Repository interface for candidate CRUD operations.
 * Abstracts away whether data lives in JSONB or a dedicated table.
 */
export interface CandidateRepository {
  insert(candidate: CandidateSubmission): Promise<void>;
  getById(candidateId: string): Promise<CandidateSubmission | null>;
  updateStatus(candidateId: string, status: CandidateStatus, error?: string): Promise<void>;
  attachAnalysis(candidateId: string, snapshot: AnalysisSnapshot): Promise<void>;
  attachDuplicateCase(candidateId: string, duplicateCase: DuplicateCase): Promise<void>;
  listByStatus(status: CandidateStatus): Promise<CandidateSubmission[]>;
  attachManualResult(
    candidateId: string,
    result: ManualResultSubmission,
    reviewedBy: string,
  ): Promise<void>;
}

/**
 * Dual-write adapter that writes to both PgCandidateRepository
 * and the legacy JSONB snapshot via transact().
 * Used during the transition period (Phase 61-63).
 */
export class DualWriteCandidateRepository implements CandidateRepository {
  constructor(
    private readonly primary: CandidateRepository,
    private readonly store: SkillShareerStore,
  ) {}

  async insert(candidate: CandidateSubmission): Promise<void> {
    await this.primary.insert(candidate);
    // Shadow write to JSONB
    await this.store.transact((data) => {
      data.candidateSubmissions.push(candidate);
    });
  }

  // ... similar dual-write for other methods
}
```

### Pattern 2: Drizzle Table Schema for Candidates

**What:** Define the `candidates` table using Drizzle ORM in the existing schema.ts file.

**When to use:** Table creation, migration generation, type-safe queries.

**Example:**
```typescript
// In packages/server/src/lib/persistence/schema.ts

export const candidates = pgTable('candidates', {
  id: text('id').primaryKey(),
  sourceType: text('source_type').notNull(), // 'trap' | 'skill'
  submittedBy: text('submitted_by').notNull(),
  teamId: text('team_id'),
  status: text('status').notNull(), // CandidateStatus enum values
  originalPayload: jsonb('original_payload').notNull().$type<CandidatePayload>(),
  analysisSnapshot: jsonb('analysis_snapshot').$type<AnalysisSnapshot>(),
  duplicateCase: jsonb('duplicate_case').$type<DuplicateCase>(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
  queuedAt: timestamp('queued_at', { withTimezone: true }),
  analyzingAt: timestamp('analyzing_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  lastError: text('last_error'),
  retryCount: integer('retry_count').notNull().default(0),
  manualResult: jsonb('manual_result').$type<ManualResultRecord>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### Pattern 3: PgCandidateRepository with Row-Level Locking

**What:** Repository implementation using raw SQL for updates with `SELECT ... FOR UPDATE` on individual rows.

**When to use:** All candidate write operations that need concurrency safety.

**Example:**
```typescript
// packages/server/src/lib/candidates/pg-repository.ts

export class PgCandidateRepository implements CandidateRepository {
  constructor(private readonly pool: Pool) {}

  async updateStatus(candidateId: string, status: CandidateStatus, error?: string): Promise<void> {
    const now = new Date().toISOString();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Lock only THIS candidate row
      await client.query(
        'SELECT id FROM candidates WHERE id = $1 FOR UPDATE',
        [candidateId],
      );
      // Update with timestamp based on status
      const timestampCol =
        status === 'queued' ? 'queued_at' :
        status === 'analyzing' ? 'analyzing_at' :
        ['ready_for_review', 'duplicate_detected', 'error', 'resolved'].includes(status) ? 'completed_at' : null;

      if (timestampCol) {
        await client.query(
          `UPDATE candidates SET status = $1, ${timestampCol} = $2, updated_at = $2
           ${status === 'error' ? ', last_error = $4, retry_count = retry_count + 1' : ''}
           WHERE id = $3`,
          status === 'error'
            ? [status, now, candidateId, error ?? 'Unknown error']
            : [status, now, candidateId],
        );
      } else {
        await client.query(
          'UPDATE candidates SET status = $1, updated_at = $2 WHERE id = $3',
          [status, now, candidateId],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
}
```

### Anti-Patterns to Avoid

- **Locking the store_snapshot row for candidate operations:** The entire point of this phase is to NOT lock the JSONB row. Every candidate operation should lock only the candidate's own row in the `candidates` table.
- **Skipping the dual-write during the transition period:** If candidate data is only in the relational table and the JSONB snapshot is stale, routes that read from JSONB (during the transition) will see stale data. Both writes must happen until Phase 63 removes JSONB.
- **Creating a Drizzle repository for all StoreData collections:** This phase only extracts `candidateSubmissions` and `duplicateCases`. The rest stays in JSONB until Phases 62-63.
- **Changing the CandidateSubmission contract type:** The Zod schema and TypeScript types in `@trapmap/contracts` are shared with the CLI package. No contract changes are needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Table schema definition | Raw SQL CREATE TABLE strings | Drizzle pgTable() | Already established pattern in schema.ts; enables drizzle-kit generate for migrations |
| JSON serialization of candidate fields | Custom JSON parse/stringify with validation | PostgreSQL JSONB columns + Zod validation on boundaries | JSONB handles nested objects natively; Zod validates at API boundary |
| ID generation for new candidates | Custom UUID or counter logic | nanoid createPrefixedId('candidate') | Matches existing pattern in store.ts nextId() |
| Transaction management for single-row updates | Manual BEGIN/COMMIT with retry | pg Pool connect + BEGIN/COMMIT (simple, established pattern) | PostgresStore already uses this pattern; no need for a transaction library |

**Key insight:** The project already has a clear pattern for independent PostgreSQL tables (knowledge_embeddings, knowledgeKeywords, task_queue). Follow that pattern exactly.

## Runtime State Inventory

> This is a greenfield table creation phase, not a rename/refactor. However, data migration from JSONB is required.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `store_snapshot.data.candidateSubmissions` -- up to N candidates in JSONB | Migration script reads and backfills into `candidates` table |
| Stored data | `store_snapshot.data.duplicateCases` -- up to N duplicate cases in JSONB | Backfill into `duplicate_cases` table (or keep embedded in candidate row since it is a 1:1 relationship) |
| Live service config | None -- no external services embed candidate strings | None |
| OS-registered state | None | None |
| Secrets/env vars | None -- candidate IDs are not used as env var keys | None |
| Build artifacts | None -- no compiled artifacts reference candidate table names | None |

## Common Pitfalls

### Pitfall 1: Dual-Write Ordering and Failure
**What goes wrong:** If the JSONB write succeeds but the relational write fails (or vice versa), the two data stores diverge.
**Why it happens:** Two separate write operations without a distributed transaction.
**How to avoid:** Write to the relational table FIRST (primary), then shadow-write to JSONB. If JSONB write fails, the relational data is still correct. During reads, prefer the relational table. Add a reconciliation check in the migration script.
**Warning signs:** Test failures where JSONB reads return stale candidate status.

### Pitfall 2: Processor Still Using transact() for Status Transitions
**What goes wrong:** The processor.ts `processCandidate()` function calls `services.store.transact()` 3-4 times per candidate. If this is not changed to use the repository directly, the entire optimization is lost.
**Why it happens:** Easy to add the repository but forget to update the processor's call sites.
**How to avoid:** The processor must accept `CandidateRepository` and call `repository.updateStatus()` directly instead of `store.transact()`. The dual-write adapter handles the JSONB shadow.
**Warning signs:** Performance profiling still shows 3-4 transact() calls per candidate.

### Pitfall 3: Missing duplicateCases Collection in Relational Table
**What goes wrong:** `StoreData.duplicateCases` is a separate array from `candidateSubmissions`. If the relational schema only has a `duplicate_case` JSONB column on the candidates table, queries like "list all duplicate cases" need a full table scan.
**Why it happens:** The existing code has `getAllDuplicateCases(data)` that reads from `data.duplicateCases`, and `attachDuplicateCase()` writes to BOTH `candidate.duplicateCase` AND `data.duplicateCases`.
**How to avoid:** Option A: Create a separate `duplicate_cases` table. Option B: Store `duplicateCase` as JSONB on the candidate row and query with `WHERE duplicate_case IS NOT NULL`. Option B is simpler and sufficient since duplicate cases have a 1:1 relationship with candidates.
**Warning signs:** Routes that query duplicate cases (GET /v1/duplicates) fail or return incomplete data.

### Pitfall 4: ID Generation Divergence
**What goes wrong:** The existing `store.nextId(data, 'candidate')` generates sequential IDs like `candidate_1`, `candidate_2`. If the relational table uses a different ID scheme, lookups will fail during the dual-write period.
**Why it happens:** Creating candidates through the repository might use nanoid while the JSONB path uses sequential counters.
**How to avoid:** Use the same `createPrefixedId('candidate')` from `ids.ts` for the relational table. Keep `store.nextId()` for the JSONB shadow write (it needs the counter in StoreData). The dual-write adapter must ensure the same ID is used for both writes.
**Warning signs:** Candidate IDs in the relational table don't match IDs in the JSONB snapshot.

### Pitfall 5: Test Compatibility with JsonStore
**What goes wrong:** All existing tests use `JsonStore` (in-memory file-based store) which does not have a PostgreSQL pool. Tests that exercise the new repository fail because there is no database.
**Why it happens:** The dual-write repository requires both a `Pool` and a `SkillShareerStore`, but tests only provide a `SkillShareerStore`.
**How to avoid:** For the JsonStore path (tests), keep using the existing in-memory functions in `store.ts`. Only use `PgCandidateRepository` when a Pool is available. The `CandidateProcessorServices` already has an optional `pool` field -- extend this pattern.
**Warning signs:** `pnpm test` fails after adding repository integration.

## Code Examples

### Drizzle Table Definition (verified pattern from existing schema.ts)
```typescript
// Source: packages/server/src/lib/persistence/schema.ts (existing pattern)
import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { AnalysisSnapshot, CandidatePayload, CandidateStatus, DuplicateCase } from '@trapmap/contracts';

export const candidates = pgTable('candidates', {
  id: text('id').primaryKey(),
  sourceType: text('source_type').notNull(),
  submittedBy: text('submitted_by').notNull(),
  teamId: text('team_id'),
  status: text('status').notNull(),
  originalPayload: jsonb('original_payload').notNull().$type<CandidatePayload>(),
  analysisSnapshot: jsonb('analysis_snapshot').$type<AnalysisSnapshot | null>(),
  duplicateCase: jsonb('duplicate_case').$type<DuplicateCase | null>(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
  queuedAt: timestamp('queued_at', { withTimezone: true }),
  analyzingAt: timestamp('analyzing_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  lastError: text('last_error'),
  retryCount: integer('retry_count').notNull().default(0),
  manualResult: jsonb('manual_result'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### Status Index for Query Efficiency
```sql
-- For listByStatus() queries used by processor and routes
CREATE INDEX idx_candidates_status ON candidates (status);
-- For team-scoped queries
CREATE INDEX idx_candidates_team ON candidates (team_id) WHERE team_id IS NOT NULL;
```

### Integration Point in CandidateProcessorServices
```typescript
// Modified from packages/server/src/lib/candidates/processor.ts
export interface CandidateProcessorServices {
  store: SkillShareerStore;
  getSnapshot: () => Promise<StoreData>;
  pool?: Pool;
  usePgDuplicateDetection?: () => boolean;
  /** NEW: Direct repository for candidate operations (bypasses transact) */
  candidateRepo?: CandidateRepository;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Full JSONB snapshot for all data | Hybrid: JSONB + independent tables | Phase 43 (db persistence) + ongoing | knowledge_embeddings and knowledgeKeywords already independent |
| `store.nextId()` sequential counters | `createPrefixedId()` nanoid | Phase 33 (async candidates) | New entities can use nanoid; existing IDs preserved during migration |
| In-memory duplicate detection only | pgvector-based detection with feature flag | Phase (pgvector migration) | pg-detector.ts already uses Drizzle; candidate table can follow same pattern |

**Deprecated/outdated:**
- `store.nextId()` for new candidate IDs: Should transition to nanoid-based `createPrefixedId('candidate')` for the relational table path, since sequential counters only exist in the JSONB `StoreData.counters`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Duplicate cases can be stored as JSONB on the candidate row (1:1 relationship) rather than in a separate table | Architecture Patterns | Low -- if a separate duplicate_cases table is needed, add it as an additional table |
| A2 | JsonStore tests don't need PgCandidateRepository -- the in-memory store.ts functions continue to work for test scenarios | Common Pitfalls | Medium -- if dual-write is mandatory for tests, tests need pg-mem or similar |
| A3 | The `ManualResultRecord` type (store.ts:14-17) can be represented as JSONB in the `manual_result` column without a separate table | Architecture Patterns | Low -- it is a simple object with no independent query needs |
| A4 | Phase 63 will handle removing the JSONB shadow writes and `StoreData.candidateSubmissions` field | Architecture Patterns | Low -- explicitly deferred in ROADMAP |
| A5 | The `createPrefixedId('candidate')` nanoid pattern is acceptable for new candidate IDs in the relational table | State of the Art | Low -- IDs are opaque strings, format doesn't affect functionality |

## Open Questions

1. **Should `duplicateCases` be a separate table or embedded in the candidates row?**
   - What we know: Current code has `data.duplicateCases` as a separate array, but `candidate.duplicateCase` also stores the same data inline. The `attachDuplicateCase()` function writes to BOTH locations.
   - What's unclear: Whether any queries need to search duplicate cases independently of candidates.
   - Recommendation: Embed `duplicateCase` as JSONB on the candidate row. The `GET /v1/duplicates` route can query `WHERE duplicate_case IS NOT NULL`. This avoids a second table and a join. If Phase 62/63 needs a separate table, it can be added later.

2. **How to handle the counter-based ID generation during dual-write?**
   - What we know: `store.nextId(data, 'candidate')` increments `data.counters.candidate` and returns `candidate_N`. The relational table path should use nanoid.
   - What's unclear: Whether any external systems depend on the sequential ID format.
   - Recommendation: Use nanoid for new candidates via the repository. The dual-write adapter calls `store.nextId()` to generate the ID first, then uses that same ID for both the relational insert and JSONB push. This preserves ID format compatibility.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | Candidate table, row-level locking | Needs verification | -- | pg-mem for tests |
| drizzle-orm | Schema definition, query building | Yes (pkg json) | 0.45.2 | -- |
| drizzle-kit | Migration generation | Yes (pkg json) | 0.31.10 | -- |
| pg Pool | PgCandidateRepository | Yes (via PostgresStore.getPool()) | 8.20.0 | -- |
| vitest | Test runner | Yes | (workspace) | -- |
| pg-mem | In-memory PG for tests | Yes (devDep) | 3.0.14 | -- |

**Missing dependencies with no fallback:**
- None -- all required dependencies are already installed.

**Missing dependencies with fallback:**
- None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | packages/server/vitest.config.ts |
| Quick run command | `pnpm --filter @trapmap/server test -- --reporter=verbose` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WRITE-01-1 | candidates table exists with row-level granularity | integration | `vitest run src/lib/candidates/pg-repository.test.ts` | No -- Wave 0 |
| WRITE-01-2 | PgCandidateRepository CRUD operations work correctly | unit | `vitest run src/lib/candidates/pg-repository.test.ts` | No -- Wave 0 |
| WRITE-01-3 | Processor uses repository directly, no transact() | unit | `vitest run src/lib/candidates/processor.test.ts` | No -- Wave 0 |
| WRITE-01-4 | Dual-write updates both relational table and JSONB | integration | `vitest run src/lib/candidates/repository.test.ts` | No -- Wave 0 |
| WRITE-01-5 | Existing candidate tests pass unchanged | regression | `vitest run src/routes/candidates.test.ts` | Yes |
| WRITE-01-6 | Migration backfill script works | integration | `vitest run src/lib/persistence/migrate-candidates.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @trapmap/server test`
- **Per wave merge:** `pnpm test && pnpm typecheck`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/lib/candidates/pg-repository.test.ts` -- covers WRITE-01-1, WRITE-01-2
- [ ] `src/lib/candidates/repository.test.ts` -- covers WRITE-01-4 (dual-write)
- [ ] `src/lib/candidates/processor.test.ts` -- covers WRITE-01-3 (no transact)
- [ ] `src/lib/persistence/migrate-candidates.test.ts` -- covers WRITE-01-6

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing session-based auth via resolveAuthContext |
| V3 Session Management | yes | Existing session token hashing |
| V4 Access Control | yes | Existing requirePermission('knowledge:review') checks |
| V5 Input Validation | yes | Zod schemas from @trapmap/contracts |
| V6 Cryptography | no | No new cryptographic operations |

### Known Threat Patterns for Candidate Pipeline

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via candidate fields | Tampering | Parameterized queries via pg driver (no string concatenation) |
| Race condition on status transition | Tampering | Row-level SELECT FOR UPDATE on individual candidate rows |
| Data divergence between relational and JSONB | Tampering | Dual-write with primary-first ordering; reconciliation in migration script |

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `packages/server/src/lib/candidates/store.ts` -- all 17 candidate operations on StoreData
- Codebase analysis: `packages/server/src/lib/candidates/processor.ts` -- processCandidate with 3-4 transact() calls
- Codebase analysis: `packages/server/src/lib/persistence/schema.ts` -- existing Drizzle table patterns
- Codebase analysis: `packages/server/src/lib/persistence/postgres-store.ts` -- PostgresStore transact pattern
- Codebase analysis: `packages/contracts/src/domain/candidates.ts` -- CandidateSubmission schema with all fields
- Codebase analysis: `packages/server/src/routes/candidates.ts` -- all 7 route handlers
- Codebase analysis: `packages/server/src/lib/candidates/reconcile.ts` -- resolution workflow with StoreData reads
- Codebase analysis: `packages/server/src/lib/queue/task-queue.ts` -- existing Drizzle table + SKIP LOCKED pattern
- Package.json: drizzle-orm 0.45.2, drizzle-kit 0.31.10, pg 8.20.0 [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)
- ROADMAP.md phase descriptions for 61-63 -- success criteria and dependency chain
- Phase 60 CONTEXT.md -- prerequisite cleanup (type dedup, lifecycle state machine)

### Tertiary (LOW confidence)
- None -- all findings verified against codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all dependencies already in use, verified in package.json
- Architecture: HIGH -- existing patterns in schema.ts and task-queue.ts provide clear templates
- Pitfalls: HIGH -- dual-write ordering, processor integration, and test compatibility issues identified from codebase analysis

**Research date:** 2026-05-03
**Valid until:** 2026-06-03 (stable -- no fast-moving dependencies)
