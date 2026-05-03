# Phase 68: Fix Failing Unit Tests - Restore CI Baseline - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Mode:** Derived from test coverage analysis and CI baseline restoration need

<domain>
## Phase Boundary

Phase 68 should fix all failing unit tests to restore a green CI baseline before adding new test coverage.

This phase is about diagnosing test failures, aligning test expectations with current code behavior, and ensuring the existing test suite passes completely.

In scope:
- Diagnose and fix all 6 failing test files
- Fix 38 failing test cases across those files
- Ensure `pnpm test` exits with 0
- Restore CI pipeline test step to green status

Out of scope:
- Adding new test coverage
- Refactoring test architecture
- Introducing coverage tooling
- Performance optimizations

</domain>

<decisions>
## Implementation Decisions

### Why this phase must come first

- New test coverage cannot be reliably added while existing tests are failing
- CI baseline must be green to catch regressions from new tests
- Failing tests indicate code/test drift that needs resolution before expansion

### Working assumptions

- The failing tests represent valid test cases that need fixing, not tests to be deleted
- The failures are due to code refactoring that changed behavior without updating tests
- Test data structures (like `latestRevision.derived`) have evolved

### Target direction

- Fix tests by updating test data and assertions to match current production code
- Do NOT modify production code to make tests pass unless a genuine bug is found
- Document any behavioral changes discovered during the fix process

</decisions>

<code_context>
## Existing Code Insights

### Known failing test files

From `pnpm test` output (2026-05-04):

1. **`packages/server/src/lib/artifacts/derive.test.ts`**
   - Multiple `TypeError: Cannot read properties of undefined (reading 'derived')`
   - Lines 397, 414, 432 - accessing `latestRevision.derived` when undefined
   - Issue: Test data structure mismatch with current artifact revision shape

2. **`packages/server/src/lib/retrieval/assembly.test.ts`**
   - `AssertionError: expected undefined to be defined` at line 66
   - Issue: `boundaryExplanation` field not being populated on `ScoredEntry`

3. **Additional failing files** (need investigation):
   - 4 more test files with failures

### Test execution summary

```
Test Files  6 failed | 87 passed | 1 skipped (94)
Tests       38 failed | 1687 passed | 18 skipped (1743)
Duration    30.69s
```

### Root cause analysis directions

- **derive.test.ts**: Check `ArtifactRevision` type definition for `derived` field optionality
- **assembly.test.ts**: Check `toRetrievalMatch` function and `ScoredEntry.boundaryExplanation` mapping

</code_context>

<specifics>
## Specific Actions

1. Run detailed test output:
   ```bash
   pnpm test -- --reporter=verbose 2>&1 | less
   ```

2. For each failing test file:
   - Read the test file
   - Read the corresponding production code
   - Identify the data structure mismatch
   - Update test fixtures and assertions

3. Verify fix:
   ```bash
   pnpm test  # Should exit 0
   ```

4. Run in isolation to catch flaky tests:
   ```bash
   pnpm vitest run <file> --reporter=verbose
   ```

</specifics>

<deferred>
## Deferred Ideas

- Adding `test:coverage` script (Phase 71)
- Setting up coverage thresholds
- Migrating to different test framework
- Adding snapshot testing

</deferred>
