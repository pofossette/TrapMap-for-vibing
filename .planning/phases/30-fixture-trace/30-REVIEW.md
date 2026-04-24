---
phase: 30-fixture-trace
reviewed: 2026-04-24T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - evals/retrieval/lib/adapters.ts
  - evals/retrieval/lib/assertions.test.ts
  - evals/retrieval/lib/assertions.ts
  - evals/retrieval/lib/report.test.ts
  - evals/retrieval/lib/report.ts
  - evals/retrieval/lib/types.ts
  - evals/retrieval/run.ts
  - evals/summary/lib/types.ts
  - evals/summary/run.ts
  - packages/contracts/src/domain/evals/report.ts
  - packages/contracts/src/domain/retrieval.ts
  - packages/server/src/app.ts
  - packages/server/src/lib/retrieval/orchestrator.ts
  - packages/server/src/lib/retrieval/routing.test.ts
  - packages/server/src/lib/retrieval/summary.ts
  - packages/server/src/lib/retrieval/types.ts
  - packages/server/src/routes/retrieval.test.ts
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
status: issues_found
---

# Phase 30: Code Review Report

**Reviewed:** 2026-04-24
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

This review covers the evaluation infrastructure files for retrieval and summary evaluation runners, retrieval contracts, the server app, orchestrator, summary builder, and associated tests. The code is well-structured with strong TypeScript contracts, comprehensive test coverage for governance assertions and report building, and proper separation between execution adapters and business logic.

The codebase demonstrates mature evaluation infrastructure with appropriate schema validation, deterministic test fixtures, and proper governance filtering. No critical issues were found. Three warnings and one info item were identified, all related to type safety, semantic correctness, and dead code.

## Warnings

### WR-01: `as any` Assertions Bypass Type Checking in Summary Runner

**File:** `evals/summary/run.ts:282,288`
**Issue:** The `retrievalCase` object is cast to `any` to satisfy `seedScenarioFixtures` and `executeThroughRoute`, which expect `RetrievalEvalCase`. This bypasses TypeScript's type checking entirely. If the constructed object shape is incorrect, runtime failures will occur instead of compile-time errors.
**Fix:** Define a minimal adapter type that both `SummaryEvalCase` and `RetrievalEvalCase` satisfy, or explicitly construct a full `RetrievalEvalCase` with all required fields:
```typescript
// Option: Define a shared minimal type
interface ScenarioExecutable {
  scenarioId: string;
  endpoint: string;
  request: Record<string, unknown>;
}
```
Then update `seedScenarioFixtures` and `executeThroughRoute` to accept this shared type.

### WR-02: Execution Degradation Uses Wrong Failure Kind

**File:** `evals/retrieval/lib/assertions.ts:234`
**Issue:** When execution is degraded (e.g., route errors), the verdict has `kind: 'execution'` but the nested `failure.kind` is `'shape-mismatch'`. This semantic mismatch could confuse downstream failure analysis tools that categorize failures by `failure.kind`. The code even has a comment "Reusing existing kind" acknowledging this is intentional but misleading.
**Fix:** Add `'execution-error'` to the `GovernanceFailureKind` union (already exists in the contracts layer at `report.ts:105`) and use it here:
```typescript
failure: {
  kind: 'execution-error',
  description: `Execution degraded: ${degradedWarnings.map((w) => w.message).join('; ')}`,
  ids: [],
},
```

### WR-03: Session ID Collision Risk Under Concurrent Execution

**File:** `evals/retrieval/lib/adapters.ts:119`
**Issue:** The session record ID is constructed as `session_${Date.now()}` with no randomization. If multiple eval contexts are created within the same millisecond (e.g., parallel test runs), the session IDs will collide. The token at line 115 includes a random suffix, but the session record ID does not.
**Fix:** Include the random suffix in the session ID to match the token pattern:
```typescript
const id = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
data.sessions.push({
  id,
  // ...
});
```

## Info

### IN-01: Redundant Error Handler Branch in Server

**File:** `packages/server/src/app.ts:98-103`
**Issue:** The `isAppError(error)` check at line 91 (which is `value instanceof AppError`) makes the subsequent `error instanceof AppError` check at line 98 unreachable. Both branches produce identical output. This is dead code that increases maintenance burden.
**Fix:** Remove the redundant second branch (lines 98-103).

---

_Reviewed: 2026-04-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
