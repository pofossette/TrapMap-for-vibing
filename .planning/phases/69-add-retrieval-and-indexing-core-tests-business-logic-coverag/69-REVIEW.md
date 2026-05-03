---
status: clean
phase: 69-add-retrieval-and-indexing-core-tests-business-logic-coverag
files_reviewed: 5
depth: standard
critical: 0
warning: 0
info: 0
total: 0
reviewed: 2026-05-04
---

# Phase 69 Review: Retrieval and Indexing Core Tests (Business Logic Coverage)

**Review Date:** 2026-05-04
**Reviewer:** Claude (automated review)
**Files Reviewed:**
- `packages/server/src/lib/candidates/detector.test.ts`
- `packages/server/src/lib/governance/eligibility.test.ts`
- `packages/server/src/lib/governance/permissions.test.ts`
- `packages/server/src/routes/access-keys.test.ts`
- `packages/server/src/routes/auth.test.ts`

---

## Summary

Phase 69 adds 93 test cases across 5 test files covering governance permissions, eligibility checks, duplicate detection, and auth routes. All tests pass and follow established patterns. No issues found.

---

## File-by-File Analysis

### 1. detector.test.ts (18 tests)

**Scope:** Unit tests for `detectDuplicates()` and `getDetectionVersion()` in `candidates/detector.ts`

**Coverage Assessment:**
| Function | Coverage | Notes |
|----------|----------|-------|
| `getDetectionVersion()` | Tested | Returns '1.0.0' |
| `detectDuplicates()` | Comprehensive | Empty corpus, threshold, lifecycle filtering, trap/skill matches, exact fingerprint, sorting, limiting |
| `overlapScore()` (internal) | Exercised | Via public API with deterministic tokenize() |
| `keywordOverlapPercent()` (internal) | Exercised | Via overlapDetails assertions |
| `checkTrapDuplicate()` (internal) | Exercised | Via trap match tests |
| `checkSkillDuplicate()` (internal) | Exercised | Via skill match tests |
| `toMatchType()` (internal) | Exercised | All 3 branches: exact, high-overlap, semantic-similar |

**Strengths:**
- Uses real `tokenize()` function for deterministic overlap scores
- Factory functions (`createTestTrap`, `createTestSkill`, `createTestInput`) with spread overrides for readable test data
- Tests all lifecycle states (submitted, agent-pass, approved) for filtering
- Verifies structural fields (entityType, entityId, similarityScore, matchType, overlapDetails)
- Tests boundary condition: top-10 match limiting

**Test Quality:** Good - no issues found.

---

### 2. eligibility.test.ts (36 tests)

**Scope:** Unit tests for all 4 exported functions in `governance/eligibility.ts`

**Coverage Assessment:**
| Function | Tests | Coverage |
|----------|-------|----------|
| `isGovernanceEligible()` | 19 | lifecycle states, decay states, security levels, team access, system-admin bypass, excludeDecayed option |
| `matchesGovernanceFilters()` | 8 | Empty filters, scope match/mismatch, label AND semantics |
| `isGovernedEntityAccessible()` | 4 | Combined eligibility + filters (both true/false combinations) |
| `filterGovernedEntities()` | 5 | Empty input, mixed input, preservation of references |

**Strengths:**
- Exhaustive lifecycle state coverage: submitted, agent-pass, rejected, deactivated, approved
- Decay state coverage: expired, superseded, active, aging
- Security level boundary: less than, equal to, greater than requiredLevel
- Team access: matching teamId, mismatching teamId, null teamId (global entity)
- System-admin bypass tested before decay check (line 97-104)
- `excludeDecayed` option explicitly tested for both true and false

**Test Quality:** Good - no issues found.

---

### 3. permissions.test.ts (22 tests)

**Scope:** Unit tests for all 5 exported functions in `governance/permissions.ts`

**Coverage Assessment:**
| Function | Tests | Coverage |
|----------|-------|----------|
| `extractGovernanceContext()` | 5 | teamId extraction, securityLevel extraction, isSystemAdmin (true/false), null teamId |
| `hasPermission()` | 3 | Permission present, permission absent, system-admin with permission |
| `requirePermission()` | 4 | No throw when present, throw with 403/forbidden, error message contains permission, multiple permissions |
| `requireTeamAccess()` | 4 | System-admin bypass, matching teamId, mismatching teamId, null teamId |
| `requireHigherLevel()` | 6 | System-admin bypass, higher level OK, equal level throws, lower level throws, nextLevel parameter, default nextLevel |

**Strengths:**
- Uses try/catch with `expect.unreachable()` pattern for AppError assertions (verifies statusCode AND code fields)
- Tests both securityLevel <= targetLevel AND securityLevel <= nextLevel conditions (line 215-226)
- Verifies error messages contain relevant context (permission name)

**Test Quality:** Good - no issues found.

---

### 4. access-keys.test.ts (5 tests)

**Scope:** Integration tests for `POST /v1/access-keys` route

**Coverage Assessment:**
| Scenario | Status Code | Tested |
|----------|-------------|--------|
| Member not found | 404 | Yes |
| Team mismatch | 400 | Yes |
| Permission denied | 403 | Yes |
| Successful creation | 200 | Yes |
| Creation with notes | 200 | Yes |

**Strengths:**
- Uses `buildServer()` with unique data files for test isolation
- Creates proper test fixtures: admin user with `member:key:create` permission, target user with lower security level
- Verifies stored key hash matches plaintext key
- Uses separate `userRoleApp` instance for permission-denied test to avoid polluting shared state

**Test Quality:** Good - no issues found.

---

### 5. auth.test.ts (12 tests)

**Scope:** Integration tests for auth routes: `POST /v1/auth/login`, `GET /v1/auth/session`, `POST /v1/auth/logout`, `POST /v1/teams/select`

**Coverage Assessment:**
| Route | Scenarios | Tests |
|-------|-----------|-------|
| `POST /v1/auth/login` | System admin key valid/invalid/not configured, access key valid/invalid | 5 |
| `GET /v1/auth/session` | No token, valid session | 2 |
| `POST /v1/auth/logout` | No token (still OK), valid logout deletes session | 2 |
| `POST /v1/teams/select` | No session, valid team switch, not a member | 3 |

**Strengths:**
- Uses separate `localApp` instances for system admin key tests to isolate config
- Verifies `x-session-token` header in login responses
- Verifies session is actually deleted after logout (queries store)
- Tests team selection authorization: user must be member of target team

**Test Quality:** Good - no issues found.

---

## Cross-Cutting Analysis

### Test Patterns Used

1. **Factory Functions with Overrides:**
   - `createTestAuth()`, `createTestEntity()`, `createTestContext()`, `createTestFilters()`
   - `createTestTrap()`, `createTestSkill()`, `createTestInput()`
   - Pattern: `return { ...defaults, ...overrides }` for flexible test data

2. **AppError Assertion Pattern:**
   ```typescript
   try {
     fn();
     expect.unreachable('should have thrown');
   } catch (err) {
     expect(err).toBeInstanceOf(AppError);
     expect((err as AppError).statusCode).toBe(403);
     expect((err as AppError).code).toBe('expected_code');
   }
   ```
   - Superior to `expect().toThrow()` because it verifies error fields

3. **Integration Test Isolation:**
   - Unique data files: `/tmp/trapmap-test-${Date.now()}-${Math.random()}.json`
   - Separate `buildServer()` instances for tests requiring special config

### Coverage Gaps (Intentional)

The following are intentionally not tested in this phase:

1. **detector.ts edge cases:**
   - `MEDIUM_OVERLAP_THRESHOLD` (0.38) constant - only `HIGH_OVERLAP_THRESHOLD` (0.72) is tested
   - Empty `candidateTokens` - not explicitly tested but covered by "empty corpus" case

2. **eligibility.ts edge cases:**
   - `decayState: undefined` explicitly vs implicitly - tested via default `createTestEntity()`
   - `boundary` field on GovernedEntity - not used in eligibility logic, correctly untested

3. **Route error paths:**
   - Expired session token for team selection - not tested
   - Malformed request bodies - rely on Zod schema validation

These gaps are acceptable for the stated scope of "business logic coverage."

---

## Security Review

All authentication and authorization patterns are correctly tested:

| Check | Implementation | Test Coverage |
|-------|---------------|---------------|
| Session required | `resolveAuthContext()` | Tested via 401 responses |
| Permission check | `requirePermission()` | Tested via 403 responses |
| Team access | `requireTeamAccess()` | Tested via team_mismatch |
| Level escalation | `requireHigherLevel()` | Tested via insufficient_level |
| System admin bypass | `isSystemAdmin: true` | Tested in all governance functions |

No security issues detected.

---

## Verification Commands

```bash
# Run all tests
npx vitest run packages/server/src/lib/candidates/detector.test.ts \
  packages/server/src/lib/governance/eligibility.test.ts \
  packages/server/src/lib/governance/permissions.test.ts \
  packages/server/src/routes/access-keys.test.ts \
  packages/server/src/routes/auth.test.ts

# Expected: PASS (93) FAIL (0)
# Actual: PASS (93) FAIL (0) ✓

# Verify TypeScript compilation
npx tsc --noEmit -p packages/server/tsconfig.json
# Expected: success ✓
```

---

## Recommendations

None. The implementation is correct and complete.

---

## Conclusion

**Status: APPROVED**

Phase 69 test files are:
- Comprehensive in coverage
- Following established patterns
- Correctly testing security boundaries
- Well-isolated with factory functions

No issues requiring remediation.

---

*Review completed: 2026-05-04*
