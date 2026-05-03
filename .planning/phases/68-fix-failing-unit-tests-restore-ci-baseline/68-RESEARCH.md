# Phase 68: Fix Failing Unit Tests - Restore CI Baseline - Research

**Researched:** 2026-05-04
**Domain:** Test repair, lifecycle state machine, data structure drift
**Confidence:** HIGH

## Summary

Phase 68 needs to fix failing unit tests to restore the CI baseline. The actual situation differs from what CONTEXT.md described: only **1 test file** is failing (`packages/server/src/routes/review.test.ts`) with **7 failing test cases**, not 6 files with 38 cases. The derive.test.ts and assembly.test.ts tests mentioned in CONTEXT.md are already passing.

The root cause is a **lifecycle state machine mismatch** in test fixtures. The lifecycle state machine (Phase 62, `transitionLifecycleState`) enforces strict state transitions: `submitted` can only transition to `agent-pass` or `agent-rejected`, not directly to `approved`. However, test fixtures create entries with `lifecycleState: 'submitted'` and then attempt reviewer approval, which throws `Invalid lifecycle transition: submitted -> approved`.

Additionally, several new required fields were added to `KnowledgeRecord` over recent phases (`decayMeta`, `evidenceMeta`, `maintenanceMeta`, `boundary`) but test fixtures in review.test.ts were not updated to include these fields.

There are already **uncommitted partial fixes** in the working tree that address some of these issues, but 7 tests still fail even with those changes. The remaining failures need the same pattern applied: ensure test fixtures use `lifecycleState: 'agent-pass'` instead of `'submitted'` and include all required fields.

**Primary recommendation:** Update all 7 failing test fixtures to use `lifecycleState: 'agent-pass'` and add missing required fields (`decayMeta`, `evidenceMeta`, `maintenanceMeta`, `boundary`) to match the current `KnowledgeRecord` type.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Test fixture data | Test (unit) | -- | Test data must match production type definitions |
| Lifecycle state machine | API / Backend | -- | State transition rules enforced server-side |
| KnowledgeRecord type | API / Backend | -- | Central data model for knowledge entries |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Phase 68 should fix all failing unit tests to restore a green CI baseline before adding new test coverage.
- The failing tests represent valid test cases that need fixing, not tests to be deleted.
- The failures are due to code refactoring that changed behavior without updating tests.
- Test data structures (like `latestRevision.derived`) have evolved.
- Fix tests by updating test data and assertions to match current production code.
- Do NOT modify production code to make tests pass unless a genuine bug is found.
- Document any behavioral changes discovered during the fix process.

### Claude's Discretion
- The specific approach to fixing each test (data update vs assertion update)
- Order of test file fixes

### Deferred Ideas (OUT OF SCOPE)
- Adding `test:coverage` script (Phase 71)
- Setting up coverage thresholds
- Migrating to different test framework
- Adding snapshot testing
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-01 | All 6 failing test files pass with 38 cases fixed (derive.test.ts, assembly.test.ts, etc.) | Actual: only 1 file (review.test.ts) with 7 failing cases. derive.test.ts and assembly.test.ts already pass. Root cause identified: lifecycle state machine mismatch + missing fields in test fixtures. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 3.2.4 | Test runner | Already configured in the project [VERIFIED: vitest run output] |
| zod | (contracts) | Schema validation | Used for runtime type checking in routes and test assertions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| vitest | jest | Project already uses vitest with workspace config -- switching is out of scope |

## Architecture Patterns

### System Architecture Diagram

```
Test Fixture (KnowledgeRecord)
       |
       v
Route Handler (review.ts POST /v1/knowledge/review)
       |
       v
applyReviewDecision()  -->  transitionLifecycleState()
       |                           |
       |                     VALID_TRANSITIONS lookup
       |                           |
       |                    [submitted] -> [agent-pass, agent-rejected]
       |                    [agent-pass] -> [approved, rejected, ...]
       |
       v
toKnowledgeEntry() --> knowledgeEntrySchema.parse() (Zod validation)
```

### Pattern 1: Lifecycle State Machine
**What:** All lifecycle transitions go through `transitionLifecycleState()` in `packages/server/src/lib/lifecycle/state-machine.ts`.
**When to use:** Any test that triggers a state change (approve, reject, deactivate).
**Key transitions:**
```
submitted -> agent-pass | agent-rejected
agent-pass -> approved | rejected | deactivated
agent-rejected -> agent-pass | rejected | approved
approved -> deactivated | agent-pass | agent-rejected
```
**Example:**
```typescript
// CORRECT: Entry must be in agent-pass state before reviewer can approve
data.knowledgeEntries.push({
  lifecycleState: 'agent-pass',  // NOT 'submitted'
  // ... other fields
});
```

### Pattern 2: KnowledgeRecord Required Fields
**What:** `KnowledgeRecord` in store.ts requires these fields that were added in recent phases.
**When to use:** Any test that creates a `KnowledgeRecord` directly.
**Required fields added since initial test creation:**
```typescript
{
  decayMeta: null,        // Phase 53: decay metadata
  evidenceMeta: null,     // Phase 56: evidence provenance
  maintenanceMeta: null,  // Phase 59: maintenance ownership
  boundary: null,         // Phase 53: boundary constraints
}
```

### Anti-Patterns to Avoid
- **Creating entries with `lifecycleState: 'submitted'` then expecting approval to work:** The state machine rejects `submitted -> approved`. Must use `agent-pass`.
- **Omitting new required fields in test fixtures:** TypeScript won't catch these at runtime in tests (the fixture is typed as `any` via `storeData`), but the Zod schema validation in `toKnowledgeEntry()` will fail.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Lifecycle state transitions | Direct property mutation | `transitionLifecycleState()` | Enforces valid transitions |
| Knowledge entry serialization | Manual object construction | `toKnowledgeEntry()` | Handles nested type conversion |

## Common Pitfalls

### Pitfall 1: Lifecycle State Machine Rejection
**What goes wrong:** Tests create entries in `submitted` state and expect approval to transition to `approved`.
**Why it happens:** The state machine was introduced in Phase 62 (refactoring). Previously, state transitions were not validated.
**How to avoid:** Use `lifecycleState: 'agent-pass'` in test fixtures that will be approved.
**Warning signs:** `Error: Invalid lifecycle transition: submitted -> approved (review decision)` logged to stderr.

### Pitfall 2: Missing New Required Fields
**What goes wrong:** Tests create KnowledgeRecord fixtures without new fields like `decayMeta`, `maintenanceMeta`, `boundary`.
**Why it happens:** These fields were added incrementally across phases 53-59. Tests written before these phases don't include them.
**How to avoid:** Always include all fields from the current `KnowledgeRecord` type definition.
**Warning signs:** Zod validation errors or `TypeError: Cannot read properties of undefined`.

### Pitfall 3: Context.md Is Stale
**What goes wrong:** CONTEXT.md describes 6 failing files with 38 cases, but the actual situation is 1 file with 7 cases.
**Why it happens:** CONTEXT.md was written based on an earlier test run, and some fixes were partially applied in uncommitted changes.
**How to avoid:** Always run `pnpm test` fresh to get current failure count.
**Warning signs:** Test counts in CONTEXT.md don't match actual test output.

### Pitfall 4: Uncommitted Partial Fixes
**What goes wrong:** Working tree has uncommitted changes that partially fix the tests but are incomplete.
**Why it happens:** Previous attempt to fix tests was abandoned mid-work.
**How to avoid:** Start by understanding what's already been changed (git diff), then complete the remaining fixes.
**Warning signs:** `git status` shows modified test files.

## Key Files and Their Roles

### Failing Test File
| File | Role | Failing Tests |
|------|------|---------------|
| `packages/server/src/routes/review.test.ts` | Integration tests for review routes with indexing | 7 tests (all HTTP 500 instead of 200) |

### Production Code Involved
| File | Role |
|------|------|
| `packages/server/src/lib/lifecycle/state-machine.ts` | Enforces valid state transitions |
| `packages/server/src/lib/knowledge.ts` | `applyReviewDecision()`, `toKnowledgeEntry()` |
| `packages/server/src/routes/review.ts` | Review route handler |
| `packages/server/src/lib/store.ts` | `KnowledgeRecord` type definition |
| `packages/contracts/src/domain/knowledge.ts` | `knowledgeEntrySchema` Zod schema |

### Already Passing (mentioned in CONTEXT.md but not failing)
| File | Status |
|------|--------|
| `packages/server/src/lib/artifacts/derive.test.ts` | 13/13 passing |
| `packages/server/src/lib/retrieval/assembly.test.ts` | 25/25 passing |

## Existing Patterns

### How Other Test Files Create KnowledgeRecord Fixtures
Tests that successfully create knowledge entries use this pattern:

```typescript
data.knowledgeEntries.push({
  id: entryId,
  teamId: null,
  scope: 'global',
  labels: ['test'],
  shortcut: 'Test Entry',
  detail: 'Test detail',
  requiredLevel: 0,
  lifecycleState: 'agent-pass',  // Correct: allows approval
  ownerUserId: userId,
  latestRevision: { /* ... */ },
  history: [/* ... */],
  metadata: { /* ... */ },
  latestSubmissionId: 'submission_1',
  submissionHistory: [],
  agentReview: null,
  reviewHistory: [],
  reviewNotes: [],
  lifecycleHistory: [],
  embeddingCache: null,
  indexState: null,
  decayMeta: null,          // Required since Phase 53
  evidenceMeta: null,       // Required since Phase 56
  maintenanceMeta: null,    // Required since Phase 59
  boundary: null,           // Required since Phase 53
  createdAt: nowIso(),
  updatedAt: nowIso(),
});
```

## Uncommitted Working Tree Changes

The working tree contains partial fixes across 14 files. These are v1.5 feature additions that were not committed. The relevant test fixes are:

1. **review.test.ts:** Changed `lifecycleState: 'submitted'` to `'agent-pass'` at lines 144, 370, 391, 726, 747; added missing fields (`decayMeta`, `evidenceMeta`, `maintenanceMeta`, `boundary`) at multiple locations.
2. **knowledge.ts:** Added `MaintenanceMetaRecord` import and `maintenanceMeta` handling in `toKnowledgeEntry()` and `createKnowledgeEntryRecord()`.
3. **contracts/src/domain/knowledge.ts:** Added `maintenanceMeta` to knowledge schemas.

These changes need to be committed as part of this phase.

## Validation Strategy

### How to Verify
1. Run full test suite: `pnpm test` -- should exit 0
2. Run failing file in isolation: `pnpm vitest run packages/server/src/routes/review.test.ts --reporter=verbose`
3. Run full suite to catch regressions: `pnpm test`

### Success Criteria
- `pnpm test` exits with code 0
- Test count: 0 failed, all passed (currently 1743 tests)
- No stderr errors from the lifecycle state machine

## Open Questions

1. **Should uncommitted production code changes be committed?**
   - What we know: The working tree has uncommitted changes to production code (knowledge.ts, store.ts, contracts, etc.) that are needed for tests to pass.
   - What's unclear: Whether these changes were supposed to be committed in v1.5 but were missed, or if they're new work.
   - Recommendation: Include all uncommitted changes in this phase's commit since they are needed for test correctness.

2. **Should CONTEXT.md be updated with correct failure count?**
   - What we know: CONTEXT.md says 6 files / 38 cases, actual is 1 file / 7 cases.
   - Recommendation: Yes, update CONTEXT.md to reflect reality.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pnpm | Package manager | Yes | (workspace) | -- |
| vitest | Test runner | Yes | 3.2.4 | -- |
| Node.js | Runtime | Yes | 20.19.5 | -- |

**Missing dependencies with no fallback:** None

## Sources

### Primary (HIGH confidence)
- Direct test execution via `pnpm test` -- verified current failure state
- Direct code reading of `packages/server/src/lib/lifecycle/state-machine.ts` -- verified state transition rules
- `git diff HEAD` output -- verified uncommitted changes
- Debug test reproduction -- confirmed root cause (lifecycle state mismatch)

### Secondary (MEDIUM confidence)
- Git log for recent phases (53-66) -- traced evolution of KnowledgeRecord type
- CONTEXT.md analysis -- identified stale information

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - verified by running tests
- Architecture: HIGH - verified by reading source code and reproducing errors
- Pitfalls: HIGH - root cause confirmed via reproduction
- Fix approach: HIGH - debug test confirmed that `agent-pass` + missing fields fixes the issue

**Research date:** 2026-05-04
**Valid until:** 2026-06-04 (stable codebase, no framework changes expected)
