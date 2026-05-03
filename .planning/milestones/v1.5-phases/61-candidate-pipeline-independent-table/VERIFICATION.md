# Phase 61 Verification: Candidate Pipeline Independent Table

**Phase:** 61-candidate-pipeline-independent-table
**Goal:** Extract candidate submissions from the single-row JSONB snapshot into a dedicated `candidates` table with row-level locking, eliminating the 3-4× transact amplification per candidate and enabling concurrent processing of independent candidates.
**Requirement ID:** WRITE-01
**Verification Date:** 2026-05-03
**Status:** ✅ PASSED

---

## Requirement Cross-Reference

| Requirement | Source | Status | Notes |
|-------------|--------|--------|-------|
| WRITE-01 | PROJECT.md L37 | ✅ Complete | "候选管道独立表（candidates + PgCandidateRepository）" |

---

## Must-Haves Verification

### Plan 61-01: Schema and Repository

#### Truths

| Truth | Status | Evidence |
|-------|--------|----------|
| candidates table exists in PostgreSQL with row-level granularity via Drizzle schema | ✅ | `schema.ts:122-157` exports `candidates = pgTable('candidates', {...})` with 17 columns |
| CandidateRepository interface defines all CRUD operations for candidate data | ✅ | `repository.ts:27-80` exports interface with 8 methods |
| PgCandidateRepository implements insert/updateStatus/attachAnalysis/attachDuplicateCase/listByStatus/getById with single-row operations | ✅ | `pg-repository.ts:31-361` implements all 8 methods |
| Row-level SELECT FOR UPDATE locking works on individual candidate rows | ✅ | `pg-repository.ts:141,209,248,288,339` - 5 FOR UPDATE statements |

#### Artifacts

| Artifact | Expected | Actual | Status |
|----------|----------|--------|--------|
| `packages/server/src/lib/persistence/schema.ts` | exports `candidates` pgTable | ✅ Line 122: `export const candidates = pgTable` | ✅ |
| `packages/server/src/lib/candidates/repository.ts` | exports `CandidateRepository` interface | ✅ Line 27: `export interface CandidateRepository` | ✅ |
| `packages/server/src/lib/candidates/pg-repository.ts` | exports `PgCandidateRepository` class | ✅ Line 31: `export class PgCandidateRepository implements CandidateRepository` | ✅ |
| `packages/server/src/lib/candidates/pg-repository.test.ts` | contains test suite | ✅ 19 tests pass | ✅ |

#### Key Links

| From | To | Via | Pattern | Status |
|------|-----|-----|---------|--------|
| `pg-repository.ts` | `schema.ts` | import candidates | `import { candidates } from '../persistence/schema.js'` | ✅ |
| `pg-repository.ts` | `repository.ts` | implements interface | `implements CandidateRepository` | ✅ |

---

### Plan 61-02: Dual-Write Repository and Processor Integration

#### Truths

| Truth | Status | Evidence |
|-------|--------|----------|
| DualWriteCandidateRepository writes to both PgCandidateRepository and JSONB snapshot for every operation | ✅ | `repository.ts:119-189` - all mutation methods call primary then store.transact() |
| Candidate processor uses candidateRepo directly instead of store.transact() for status transitions | ✅ | `processor.ts:76-77,89-90,153-158,186-187,222-224,366-370` - 6 conditional branches |
| Existing JsonStore tests continue to work unchanged (fallback path when no pool) | ✅ | All `else` branches retain original `store.transact()` calls |
| Barrel exports include new repository and pg-repository modules | ✅ | `index.ts:13-14` exports both modules |

#### Artifacts

| Artifact | Expected | Actual | Status |
|----------|----------|--------|--------|
| `packages/server/src/lib/candidates/repository.ts` | exports `DualWriteCandidateRepository` | ✅ Line 119: `export class DualWriteCandidateRepository` | ✅ |
| `packages/server/src/lib/candidates/processor.ts` | contains `candidateRepo?: CandidateRepository` | ✅ Line 44 | ✅ |
| `packages/server/src/lib/candidates/index.ts` | exports repository modules | ✅ Lines 13-14 | ✅ |
| `packages/server/src/lib/candidates/repository.test.ts` | test suite | ✅ 19 tests pass | ✅ |

#### Key Links

| From | To | Via | Pattern | Status |
|------|-----|-----|---------|--------|
| `processor.ts` | `repository.ts` | import and use | `import type { CandidateRepository }` + `candidateRepo?.updateStatus` | ✅ |
| `repository.ts` | `pg-repository.ts` | DualWrite wraps Pg | `require('./pg-repository.js')` in factory | ✅ |

---

### Plan 61-03: Migration Script

#### Truths

| Truth | Status | Evidence |
|-------|--------|----------|
| Migration script reads candidateSubmissions from JSONB and inserts into candidates table | ✅ | `migrate-candidates.ts:87-88,114` - reads from store.snapshot() |
| Migration skips candidates that already exist in the relational table | ✅ | `migrate-candidates.ts:110-112` - checks `getById()` returns non-null |
| Migration reports correct counts: migrated, skipped, errored | ✅ | `migrate-candidates.ts:44-55` - MigrationResult interface |
| Migration supports dry-run mode | ✅ | `migrate-candidates.ts:29,105-107` - dryRun flag skips all inserts |

#### Artifacts

| Artifact | Expected | Actual | Status |
|----------|----------|--------|--------|
| `packages/server/src/lib/persistence/migrate-candidates.ts` | exports `migrateCandidates` | ✅ Line 74: `export async function migrateCandidates` | ✅ |
| `packages/server/src/lib/persistence/migrate-candidates.test.ts` | test suite | ✅ 12 tests pass | ✅ |

#### Key Links

| From | To | Via | Pattern | Status |
|------|-----|-----|---------|--------|
| `migrate-candidates.ts` | `pg-repository.ts` | Uses PgCandidateRepository | Line 21: `import { PgCandidateRepository }` | ✅ |
| `migrate-candidates.ts` | `store.ts` | Reads snapshot | Line 87: `await store.snapshot()` | ✅ |

---

## Test Results

| Test File | Tests | Status |
|-----------|-------|--------|
| `pg-repository.test.ts` | 19 | ✅ Pass |
| `repository.test.ts` | 19 | ✅ Pass |
| `migrate-candidates.test.ts` | 12 | ✅ Pass |
| **Total** | **50** | **✅ All Pass** |

**Note:** Pre-existing test failures in unrelated files (rerank.test.ts, decay/*.ts, feedback/*.ts) do not affect Phase 61 verification.

---

## TypeScript Compilation

**Status:** ⚠️ Pre-existing errors in unrelated files

Phase 61 files compile correctly:
- `schema.ts` - No errors
- `repository.ts` - No errors
- `pg-repository.ts` - No errors
- `processor.ts` - No errors
- `migrate-candidates.ts` - No errors

Errors exist in unrelated modules (decay, evidence, feedback) from prior phases.

---

## Goal Achievement Assessment

| Goal Component | Status | Evidence |
|----------------|--------|----------|
| Dedicated `candidates` table | ✅ | Drizzle schema with 17 columns |
| Row-level locking | ✅ | SELECT FOR UPDATE on all mutation operations |
| Eliminates transact amplification | ✅ | 6 conditional branches in processor bypass transact() when pool available |
| Concurrent processing enabled | ✅ | Individual row locks vs whole-snapshot lock |
| Migration path provided | ✅ | migrateCandidates() with idempotency and dry-run |

---

## Summary

**Phase 61 is COMPLETE.**

All must_haves are satisfied:
- ✅ candidates table schema with 17 columns
- ✅ CandidateRepository interface with 8 methods
- ✅ PgCandidateRepository with row-level SELECT FOR UPDATE locking
- ✅ DualWriteCandidateRepository for transition period
- ✅ InMemoryCandidateRepository for JsonStore compatibility
- ✅ Processor integration with conditional repository usage
- ✅ Migration script with idempotency and dry-run mode
- ✅ 50 tests passing

**WRITE-01 requirement is fulfilled.**

---

*Verified: 2026-05-03*
