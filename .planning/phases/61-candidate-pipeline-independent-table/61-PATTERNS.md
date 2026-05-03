# Phase 61: Candidate Pipeline Independent Table - Pattern Map

**Mapped:** 2026-05-03
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/server/src/lib/persistence/schema.ts` | config | CRUD | `packages/server/src/lib/persistence/schema.ts` (itself, add table) | exact |
| `packages/server/src/lib/candidates/pg-repository.ts` | service | CRUD | `packages/server/src/lib/queue/task-queue.ts` | exact |
| `packages/server/src/lib/candidates/repository.ts` | service | CRUD | `packages/server/src/lib/candidates/pg-detector.ts` | role-match |
| `packages/server/src/lib/candidates/processor.ts` | service | event-driven | `packages/server/src/lib/candidates/processor.ts` (itself, modify) | exact |
| `packages/server/src/lib/candidates/index.ts` | config | transform | `packages/server/src/lib/candidates/index.ts` (itself, modify) | exact |
| `packages/server/src/lib/persistence/migrate-candidates.ts` | utility | batch | `packages/server/src/lib/persistence/backfill-indexes.ts` | exact |
| `packages/server/src/lib/candidates/pg-repository.test.ts` | test | CRUD | `packages/server/src/lib/candidates/reconcile.test.ts` | role-match |
| `packages/server/src/lib/candidates/repository.test.ts` | test | CRUD | `packages/server/src/lib/candidates/reconcile.test.ts` | role-match |
| `packages/server/src/lib/persistence/migrate-candidates.test.ts` | test | batch | `packages/server/src/lib/candidates/reconcile.test.ts` | role-match |

## Pattern Assignments

### `packages/server/src/lib/persistence/schema.ts` (config, CRUD - MODIFY)

**Analog:** itself, lines 1-107 (existing table definitions)

**Action:** Append a new `candidates` table definition after the existing `knowledgeKeywords` table (after line 107).

**Existing table pattern to follow** (lines 28-61, knowledgeEmbeddings):
```typescript
export const knowledgeEmbeddings = pgTable(
  'knowledge_embeddings',
  {
    id: text('id').primaryKey(),
    entryId: text('entry_id').notNull(),
    revision: integer('revision').notNull(),
    contentHash: text('content_hash').notNull(),
    vector: vector('vector', { dimensions: 384 }).notNull(),
    teamId: text('team_id'),
    scope: text('scope').notNull(),
    requiredLevel: integer('required_level').notNull().default(0),
    labels: jsonb('labels').notNull().$type<string[]>().default([]),
    status: text('status').notNull().default('synced'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('knowledge_embeddings_entry_revision_idx').on(table.entryId, table.revision),
  ],
);
```

**Imports already present** (lines 1):
```typescript
import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, vector } from 'drizzle-orm/pg-core';
```

**New table definition to add:**
```typescript
export const candidates = pgTable(
  'candidates',
  {
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
  },
  (table) => [
    // For listByStatus() queries used by processor and routes
    // Index created via ensureSchema in PgCandidateRepository
  ],
);
```

**Note:** Additional type imports from `@trapmap/contracts` needed at top of file for the `$type<>()` calls.

---

### `packages/server/src/lib/candidates/pg-repository.ts` (service, CRUD - NEW)

**Analog:** `packages/server/src/lib/queue/task-queue.ts`

**Why this analog:** Both are standalone PostgreSQL-backed modules that accept a `Pool`, use `pool.connect()` + `BEGIN`/`COMMIT` for transactions, and have an `ensureSchema()` lazy initialization pattern. The task-queue also uses both Drizzle queries and raw SQL.

**Imports pattern** (task-queue.ts lines 10-13):
```typescript
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { Pool } from 'pg';
```

**Constructor + Pool pattern** (task-queue.ts lines 114-122):
```typescript
export function createTaskQueue(config: TaskQueueConfig) {
  const { pool, ... } = config;
  const db = drizzle(pool, { schema: { taskQueue } });
  let initialized = false;
```

**ensureSchema pattern** (task-queue.ts lines 127-150):
```typescript
async function ensureSchema(): Promise<void> {
  if (initialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_queue (...)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS task_queue_type_status_priority_idx ...
  `);
  initialized = true;
}
```

**Transaction + row-level locking pattern** (postgres-store.ts lines 46-82):
```typescript
const client = await this.pool.connect();
try {
  await client.query('BEGIN');
  const { rows } = await client.query<{ data: StoreData | null }>(
    'SELECT data FROM store_snapshot WHERE key = $1 FOR UPDATE',
    ['main'],
  );
  // ... mutation logic ...
  await client.query('COMMIT');
  return result;
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  client.release();
}
```

**Interface pattern** -- define a `CandidateRepository` interface with these methods:
```typescript
export interface CandidateRepository {
  insert(candidate: CandidateSubmission): Promise<void>;
  getById(candidateId: string): Promise<CandidateSubmission | null>;
  updateStatus(candidateId: string, status: CandidateStatus, error?: string): Promise<void>;
  attachAnalysis(candidateId: string, snapshot: AnalysisSnapshot): Promise<void>;
  attachDuplicateCase(candidateId: string, duplicateCase: DuplicateCase): Promise<void>;
  attachManualResult(candidateId: string, result: ManualResultSubmission, reviewedBy: string): Promise<void>;
  listByStatus(status: CandidateStatus): Promise<CandidateSubmission[]>;
  markResolved(candidateId: string, resolvedBy: string): Promise<void>;
}
```

**Implementation pattern:** Class-based, constructor takes `Pool`, uses `pool.connect()` for updates needing row-level `SELECT ... FOR UPDATE`, uses `pool.query()` for reads.

---

### `packages/server/src/lib/candidates/repository.ts` (service, CRUD - NEW)

**Analog:** `packages/server/src/lib/candidates/pg-detector.ts`

**Why this analog:** pg-detector.ts wraps a PostgreSQL-backed operation with a fallback path (in-memory when feature flag off). The dual-write repository similarly wraps the primary PgCandidateRepository with a fallback that also shadows to JSONB.

**Imports pattern** (pg-detector.ts lines 13-21):
```typescript
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import type { DuplicateCase, DuplicateMatch } from '@trapmap/contracts';
import { generateEmbedding } from '../embeddings.js';
import { createDuplicateCaseId } from '../ids.js';
import { knowledgeEmbeddings, knowledgeKeywords } from '../persistence/schema.js';
import type { KnowledgeRecord, SkillArtifactRecord } from '../store.js';
import { nowIso } from '../store.js';
```

**Dual-write adapter pattern:**
```typescript
import type { CandidateRepository } from './pg-repository.js';
import type { SkillShareerStore, StoreData } from '../store.js';

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

  async updateStatus(candidateId: string, status: CandidateStatus, error?: string): Promise<void> {
    await this.primary.updateStatus(candidateId, status, error);
    // Shadow write to JSONB
    await this.store.transact((data) => {
      updateCandidateStatus({ data, candidateId, status, error });
    });
  }
  // ... similar for attachAnalysis, attachDuplicateCase, etc.
}
```

**Factory function pattern:**
```typescript
export function createCandidateRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): CandidateRepository {
  if (config.pool) {
    const pgRepo = new PgCandidateRepository(config.pool);
    return new DualWriteCandidateRepository(pgRepo, config.store);
  }
  // Fallback for tests (JsonStore without pool): use in-memory store.ts functions
  return new InMemoryCandidateRepository(config.store);
}
```

---

### `packages/server/src/lib/candidates/processor.ts` (service, event-driven - MODIFY)

**Analog:** itself (modify in place)

**Current CandidateProcessorServices interface** (lines 35-42):
```typescript
export interface CandidateProcessorServices {
  store: SkillShareerStore;
  getSnapshot: () => Promise<StoreData>;
  pool?: Pool;
  usePgDuplicateDetection?: () => boolean;
}
```

**Action:** Add `candidateRepo?: CandidateRepository` to the interface. Modify `processCandidate()` to use `candidateRepo` directly instead of `store.transact()` for status transitions.

**Current transact() call sites to replace** (lines 73-79, 82-88, 142-162, 167-174):
```typescript
// Phase 1: Queue the candidate
await services.store.transact(async (txData) => {
  updateCandidateStatus({ data: txData, candidateId, status: 'queued' });
});

// Phase 2: Start analysis
await services.store.transact(async (txData) => {
  updateCandidateStatus({ data: txData, candidateId, status: 'analyzing' });
});

// Phase 5: Store results
await services.store.transact(async (txData) => {
  attachAnalysisSnapshot({ data: txData, candidateId, snapshot: result.analysisSnapshot });
  if (result.duplicateCase) {
    attachDuplicateCase({ data: txData, candidateId, duplicateCase: result.duplicateCase });
  }
  updateCandidateStatus({ data: txData, candidateId, status: finalStatus });
});

// Error handler
await services.store.transact(async (txData) => {
  updateCandidateStatus({ data: txData, candidateId, status: 'error', error: errorMessage });
});
```

**Replacement pattern** (when `candidateRepo` is available):
```typescript
// Phase 1: Queue the candidate
await services.candidateRepo!.updateStatus(candidateId, 'queued');

// Phase 2: Start analysis
await services.candidateRepo!.updateStatus(candidateId, 'analyzing');

// Phase 5: Store results
await services.candidateRepo!.attachAnalysis(candidateId, result.analysisSnapshot);
if (result.duplicateCase) {
  await services.candidateRepo!.attachDuplicateCase(candidateId, result.duplicateCase);
}
await services.candidateRepo!.updateStatus(candidateId, finalStatus);

// Error handler
await services.candidateRepo!.updateStatus(candidateId, 'error', errorMessage);
```

**Fallback pattern:** When `candidateRepo` is undefined (JsonStore tests), keep using `store.transact()` as today.

**Also modify** `processCandidateWithRetry()`, `processPendingCandidates()`, `scheduleCandidateProcessing()`, `createCandidateProcessingHandler()` to pass through `candidateRepo`.

---

### `packages/server/src/lib/candidates/index.ts` (config, transform - MODIFY)

**Analog:** itself (modify in place)

**Current barrel exports** (lines 1-12):
```typescript
export * from './types.js';
export * from './fingerprint.js';
export * from './detector.js';
export * from './store.js';
export * from './processor.js';
```

**Action:** Add new exports:
```typescript
export * from './repository.js';
export * from './pg-repository.js';
```

---

### `packages/server/src/lib/persistence/migrate-candidates.ts` (utility, batch - NEW)

**Analog:** `packages/server/src/lib/persistence/backfill-indexes.ts`

**Why this analog:** backfill-indexes.ts is the established pattern for one-time migration scripts that read from the JSONB snapshot and write to relational tables. Same structure: config interface, batch processing, progress reporting, dry-run mode.

**Config interface pattern** (backfill-indexes.ts lines 23-34):
```typescript
export interface BackfillConfig {
  pool: Pool;
  store: SkillShareerStore;
  batchSize?: number;
  dryRun?: boolean;
  onProgress?: (info: { processed: number; total: number; entryId: string }) => void;
}
```

**Result interface pattern** (backfill-indexes.ts lines 36-52):
```typescript
export interface BackfillResult {
  totalEntries: number;
  entriesSynced: number;
  entriesSkipped: number;
  errors: BackfillError[];
  durationMs: number;
}
```

**Core batch processing pattern** (backfill-indexes.ts lines 66-143):
```typescript
export async function backfillKnowledgeIndexes(config: BackfillConfig): Promise<BackfillResult> {
  const { pool, store, batchSize = 50, dryRun = false, onProgress } = config;
  const startTime = Date.now();
  const result: BackfillResult = { ... };

  const data = await store.snapshot();
  const approvedEntries = data.knowledgeEntries.filter(...);

  for (let i = 0; i < approvedEntries.length; i += batchSize) {
    const batch = approvedEntries.slice(i, i + batchSize);
    for (const entry of batch) {
      try {
        if (dryRun) { result.entriesSkipped++; }
        else { /* do actual work */ }
        onProgress?.({ ... });
      } catch (error) {
        result.errors.push({ entryId: entry.id, error: ... });
      }
    }
  }

  result.durationMs = Date.now() - startTime;
  return result;
}
```

**Adaptation for candidate migration:**
- Read `data.candidateSubmissions` and `data.duplicateCases` from snapshot
- For each candidate, INSERT into the `candidates` table via `PgCandidateRepository.insert()`
- Skip candidates that already exist (by checking `getById`)
- Log count of migrated, skipped (already exist), and errored candidates

---

### `packages/server/src/lib/candidates/pg-repository.test.ts` (test, CRUD - NEW)

**Analog:** `packages/server/src/lib/candidates/reconcile.test.ts`

**Why this analog:** reconcile.test.ts is the established test pattern in the candidates module. Uses vitest, creates test helper functions for data, tests pure logic.

**Test structure pattern** (reconcile.test.ts lines 11-16):
```typescript
import type { CandidateSubmission, ManualResultSubmission } from '@trapmap/contracts';
import { describe, expect, it } from 'vitest';
import type { KnowledgeRecord, SkillArtifactRecord, StoreData } from '../store.js';
import { JsonStore, type SkillShareerStore, nowIso } from '../store.js';
```

**Test helper pattern** (reconcile.test.ts lines 29-60):
```typescript
function createTestCandidate(overrides: Partial<CandidateSubmission> = {}): CandidateSubmission {
  return {
    id: 'candidate_1',
    sourceType: 'trap',
    submittedBy: 'user_1',
    // ... all required fields
    ...overrides,
  };
}

function createTestData(overrides: Partial<StoreData> = {}): StoreData {
  return {
    counters: {},
    users: [],
    // ... all required fields
    ...overrides,
  };
}
```

**For pg-repository.test.ts:** Use `pg-mem` (available as devDependency) to create an in-memory PostgreSQL instance, or mock the Pool. Test each method of PgCandidateRepository: insert, getById, updateStatus, attachAnalysis, attachDuplicateCase, attachManualResult, listByStatus, markResolved.

---

### `packages/server/src/lib/candidates/repository.test.ts` (test, CRUD - NEW)

**Analog:** `packages/server/src/lib/candidates/reconcile.test.ts`

**Test focus:** Verify that `DualWriteCandidateRepository` calls both the primary repository AND the store.transact() for each operation. Use mock implementations to verify call counts and argument forwarding.

**Mock store pattern** (reconcile.test.ts lines 459-469):
```typescript
function createMockStore(): { store: SkillShareerStore; data: StoreData } {
  const data = createTestData();
  const store = {
    nextId: (d: StoreData, prefix: string) => {
      const nextValue = (d.counters[prefix] ?? 0) + 1;
      d.counters[prefix] = nextValue;
      return `${prefix}_${nextValue}`;
    },
  } as unknown as SkillShareerStore;
  return { store, data };
}
```

---

### `packages/server/src/lib/persistence/migrate-candidates.test.ts` (test, batch - NEW)

**Analog:** `packages/server/src/lib/candidates/reconcile.test.ts`

**Test focus:** Verify migration script reads candidates from JSONB, inserts into relational table, handles duplicates (skip already-migrated), reports correct counts.

---

## Shared Patterns

### PostgreSQL Pool Access (from PostgresStore)

**Source:** `packages/server/src/lib/persistence/postgres-store.ts` line 28-30
**Apply to:** All files that need PostgreSQL access (pg-repository, repository, migrate-candidates)

```typescript
getPool(): Pool {
  return this.pool;
}
```

Routes and services access the pool via `app.skillShareer.store` -- if it is a `PostgresStore`, `getPool()` is available; if `JsonStore`, pool is undefined.

### Transaction with Row-Level Locking

**Source:** `packages/server/src/lib/persistence/postgres-store.ts` lines 50-81
**Apply to:** PgCandidateRepository.updateStatus(), attachAnalysis(), attachDuplicateCase()

```typescript
const client = await this.pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT id FROM candidates WHERE id = $1 FOR UPDATE', [candidateId]);
  // ... update ...
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  client.release();
}
```

### ID Generation

**Source:** `packages/server/src/lib/ids.ts` lines 1-10
**Apply to:** PgCandidateRepository.insert() for new candidates

```typescript
import { createPrefixedId } from '../ids.js';
// Usage: const id = createPrefixedId('candidate');
```

**Important:** During dual-write, the ID must be generated first, then used for BOTH the relational insert AND the JSONB push. This preserves compatibility with `store.nextId()` counter-based IDs in the JSONB path.

### Error Handling

**Source:** `packages/server/src/lib/errors.ts` lines 1-13
**Apply to:** All new files

```typescript
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
```

Repository-level errors should use standard `Error` throws. Route handlers convert these to `AppError` for HTTP responses.

### Auth Pattern in Routes

**Source:** `packages/server/src/routes/candidates.ts` lines 106-107
**Apply to:** No new routes, but route modifications need to preserve this

```typescript
const auth = await resolveAuthContext(app.skillShareer, request);
requirePermission(auth, 'knowledge:submit');
```

### StoreData Candidate Functions (existing, unchanged)

**Source:** `packages/server/src/lib/candidates/store.ts` lines 59-89
**Apply to:** Dual-write adapter shadow writes

```typescript
export function updateCandidateStatus(args: {
  data: StoreData;
  candidateId: string;
  status: CandidateStatus;
  error?: string;
}): CandidateSubmission { ... }
```

These functions remain in use for:
1. Tests using JsonStore (no pool)
2. The JSONB shadow write inside `DualWriteCandidateRepository`
3. Read operations from JSONB during dual-write period

### ensureSchema Pattern

**Source:** `packages/server/src/lib/queue/task-queue.ts` lines 127-150
**Apply to:** PgCandidateRepository constructor or init method

```typescript
let initialized = false;

async function ensureSchema(): Promise<void> {
  if (initialized) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS candidates (...)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates (status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_candidates_team ON candidates (team_id) WHERE team_id IS NOT NULL`);
  initialized = true;
}
```

### Drizzle Query Builder Usage

**Source:** `packages/server/src/lib/queue/task-queue.ts` lines 182-191
**Apply to:** Simple queries in PgCandidateRepository (inserts, reads)

```typescript
const db = drizzle(pool, { schema: { candidates } });
await db.insert(candidates).values({ ... });
await db.select().from(candidates).where(eq(candidates.id, candidateId));
```

For complex updates with conditional column sets (like `updateStatus` with dynamic timestamp columns), use raw SQL via `pool.query()` instead.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | | | All files have close analogs in the codebase |

## Metadata

**Analog search scope:** `packages/server/src/lib/candidates/`, `packages/server/src/lib/persistence/`, `packages/server/src/lib/queue/`, `packages/server/src/routes/`
**Files scanned:** 15
**Pattern extraction date:** 2026-05-03
