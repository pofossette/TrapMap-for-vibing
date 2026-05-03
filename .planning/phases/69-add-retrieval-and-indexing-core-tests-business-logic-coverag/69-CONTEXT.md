# Phase 69: Add Governance and Auth Route Tests - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Mode:** Derived from test coverage analysis - security critical paths

<domain>
## Phase Boundary

Phase 69 should add tests for the governance module (permissions, eligibility), authentication-related routes, and the candidate detection system to ensure security-critical code paths are covered.

This phase is about protecting the security boundary of the application through comprehensive test coverage.

In scope:
- `governance/permissions.ts` - RBAC permission checks
- `governance/eligibility.ts` - Security level filtering
- `routes/auth.ts` - Authentication flow
- `routes/access-keys.ts` - API key management
- `candidates/detector.ts` - Duplicate detection (security-sensitive, prevents duplicate submissions)
- Related helper functions and edge cases

Out of scope:
- Adding new security features
- Modifying existing permission logic
- Performance testing
- Integration testing with external auth providers

</domain>

<decisions>
## Implementation Decisions

### Why governance and auth are prioritized

- Security-critical code has the highest testing priority
- Permission bugs can lead to data leaks or unauthorized access
- Auth route failures can block all system access
- These modules have 0% test coverage currently

### Working assumptions

- The existing governance logic is correct and needs tests, not fixes
- Auth routes follow standard Fastify patterns that are testable
- Mock-based unit tests are sufficient (no real auth provider needed)

### Target direction

- Achieve >80% coverage on governance module
- Achieve >70% coverage on auth routes
- Cover all permission check paths (allow/deny)
- Cover all security level transitions

</decisions>

<code_context>
## Existing Code Insights

### Governance module structure

```
packages/server/src/lib/governance/
├── types.ts          ❌ No tests
├── index.ts          ❌ No tests
├── permissions.ts    ❌ No tests - RBAC permission checks
└── eligibility.ts    ❌ No tests - Security level filtering
```

### Auth-related routes without tests

```
packages/server/src/routes/
├── auth.ts           ❌ No tests - Authentication flow
├── access-keys.ts    ❌ No tests - API key management
├── teams.ts          ❌ No tests - Team membership (related)
└── members.ts        ❌ No tests - Member management (related)
```

### Candidate detection (security-sensitive)

```
packages/server/src/lib/candidates/
├── detector.ts       ❌ No tests - Duplicate detection (HIGH PRIORITY)
├── fingerprint.ts    ✅ Has tests (tokenize)
├── reconcile.ts      ✅ Has tests
├── processor.ts      ❌ No tests (lower priority)
└── repository.ts     ✅ Has tests
```

**Why detector.ts is security-critical:**
- Prevents duplicate knowledge entries from polluting the system
- Uses overlap thresholds (HIGH: 0.72, MEDIUM: 0.38) for similarity detection
- Incorrect detection can lead to data quality issues or false rejections
- Cross-entity detection (trap vs skill) has complex logic

### Related test patterns to follow

Existing route tests in the codebase:
- `routes/operations.test.ts` - Uses `pg-mem` for in-memory database
- `routes/knowledge.test.ts` - Tests route handlers with mock request/response
- `routes/retrieval.test.ts` - Tests authentication requirements

### Key security scenarios to test

**Permissions (RBAC):**
- Admin can access all resources
- Member can access team resources
- Non-member cannot access restricted resources
- Role hierarchy is respected

**Eligibility (Security Levels):**
- Public entries visible to all
- Internal entries visible to authenticated users
- Confidential entries visible to authorized roles
- Security level escalation is blocked

**Auth Routes:**
- Valid credentials return session token
- Invalid credentials return 401
- Token refresh works correctly
- Logout invalidates session

</code_context>

<specifics>
## Specific Test Files to Create

1. `packages/server/src/lib/governance/permissions.test.ts`
   ```typescript
   // Test: checkPermission() for various role/operation combinations
   // Test: role hierarchy escalation
   // Test: team-scoped permission boundaries
   ```

2. `packages/server/src/lib/governance/eligibility.test.ts`
   ```typescript
   // Test: filterBySecurityLevel() for each level
   // Test: user clearance level vs entry security level
   // Test: bulk eligibility filtering
   ```

3. `packages/server/src/routes/auth.test.ts`
   ```typescript
   // Test: POST /auth/login with valid/invalid credentials
   // Test: POST /auth/refresh token rotation
   // Test: POST /auth/logout session invalidation
   ```

4. `packages/server/src/routes/access-keys.test.ts`
   ```typescript
   // Test: API key creation, listing, revocation
   // Test: Key expiration handling
   // Test: Key scope restrictions
   ```

5. `packages/server/src/lib/candidates/detector.test.ts`
   ```typescript
   // Test: detectDuplicates() with various input combinations
   // Test: Boundary values at HIGH_OVERLAP_THRESHOLD (0.72) and MEDIUM_OVERLAP_THRESHOLD (0.38)
   // Test: Exact fingerprint match detection
   // Test: Cross-entity duplicate detection (trap vs skill)
   // Test: Result limiting (top 10 matches)
   // Test: overlapScore() edge cases (empty sets, identical sets)
   // Test: keywordOverlapPercent() with various keyword combinations
   ```

</specifics>

<deferred>
## Deferred Ideas

- Fuzz testing for auth endpoints
- Rate limiting tests
- Session fixation prevention tests
- Multi-factor authentication tests
- OAuth/OIDC integration tests

</deferred>
