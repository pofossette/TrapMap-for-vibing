# Phase 69: Add Governance and Auth Route Tests - Research

**Researched:** 2026-05-04
**Domain:** Test coverage for security-critical modules (governance, auth routes, candidate detection)
**Confidence:** HIGH

## Summary

Phase 69 covers test creation for five source files in three categories: (1) governance module functions in `permissions.ts` and `eligibility.ts`, which are pure functions taking typed inputs and returning booleans or throwing `AppError`; (2) Fastify route handlers in `auth.ts` and `access-keys.ts`, which require `buildServer()` integration tests using `app.inject()`; and (3) the candidate duplicate detector in `detector.ts`, which is a pure async function with internal helper functions that can be tested indirectly through `detectDuplicates()`.

The codebase uses Vitest with `forks` pool (single fork, maxConcurrency 1). Two distinct testing patterns are used: (a) pure unit tests with direct function imports and hand-crafted test data (see `reconcile.test.ts`, `activation-policy.test.ts`); and (b) Fastify integration tests using `buildServer()`, `app.inject()`, and `store.transact()` to set up users/teams/memberships/sessions (see `operations.test.ts`, `review.test.ts`). Both patterns are well-established and should be followed.

All five target files have zero existing test coverage. The governance and detector modules are pure functions ideal for unit tests. The auth and access-keys routes require Fastify integration tests because they depend on `app.skillShareer` services, Zod schema validation, and session management.

**Primary recommendation:** Write pure unit tests for governance (permissions, eligibility) and detector modules. Write Fastify integration tests for auth and access-keys routes. Follow the existing helper patterns from `reconcile.test.ts` (factory functions) and `review.test.ts` (buildServer + store.transact setup).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- The existing governance logic is correct and needs tests, not fixes
- Auth routes follow standard Fastify patterns that are testable
- Mock-based unit tests are sufficient (no real auth provider needed)
- Achieve >80% coverage on governance module
- Achieve >70% coverage on auth routes
- Cover all permission check paths (allow/deny)
- Cover all security level transitions

### Claude's Discretion
- Test structure and organization within files
- Which edge cases to prioritize
- Whether to share helper factories across test files

### Deferred Ideas (OUT OF SCOPE)
- Fuzz testing for auth endpoints
- Rate limiting tests
- Session fixation prevention tests
- Multi-factor authentication tests
- OAuth/OIDC integration tests
- Adding new security features
- Modifying existing permission logic
- Performance testing
- Integration testing with external auth providers
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-02 | Governance module and auth routes have test coverage for security-critical paths | Source code analysis of all 5 target files, test pattern documentation, helper factory patterns from existing tests |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Governance permission checks (RBAC) | API / Backend | - | Pure server-side logic, no browser involvement |
| Governance eligibility (security levels) | API / Backend | - | Data filtering based on security classification |
| Auth route handlers | API / Backend | - | Fastify route handlers with session management |
| Access key management | API / Backend | - | API key CRUD with security level enforcement |
| Duplicate detection | API / Backend | - | Algorithm logic with text similarity scoring |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | (workspace) | Test framework | Already configured in `vitest.config.ts`, all 60+ test files use it [VERIFIED: codebase] |
| fastify | (workspace) | HTTP framework | Routes are Fastify plugins, tested via `app.inject()` [VERIFIED: codebase] |
| zod | (workspace) | Schema validation | Used in contracts for request/response parsing [VERIFIED: codebase] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @trapmap/contracts | (workspace) | Shared schemas and types | All test files import types from here |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| buildServer integration tests | Pure mock-based route tests | Integration tests are the established pattern and test real Zod validation; mocks would miss schema errors |

**Installation:**
No new packages needed. Everything is already in the workspace.

## Architecture Patterns

### System Architecture Diagram

```
Test Entry Points
       |
       v
  +-----------+  Pure Functions  +------------------+
  | Unit Tests|---------------->| permissions.ts   |
  | (vitest)  |---------------->| eligibility.ts   |
  |           |---------------->| detector.ts      |
  +-----------+                  +------------------+
       |
       | For route tests
       v
  +------------------+  buildServer()  +------------------+
  | Integration Tests|--------------->| Fastify app       |
  | (app.inject())   |               | with skillShareer  |
  +------------------+               +------------------+
       |                                    |
       | store.transact() setup             v
       |                            +------------------+
       +--------------------------->| JsonStore         |
                                    | (file-backed)     |
                                    +------------------+
```

### Recommended Project Structure
```
packages/server/src/
├── lib/
│   ├── governance/
│   │   ├── permissions.ts      (SOURCE)
│   │   ├── permissions.test.ts (NEW)
│   │   ├── eligibility.ts      (SOURCE)
│   │   └── eligibility.test.ts (NEW)
│   └── candidates/
│       ├── detector.ts         (SOURCE)
│       └── detector.test.ts    (NEW)
├── routes/
│   ├── auth.ts                 (SOURCE)
│   ├── auth.test.ts            (NEW)
│   ├── access-keys.ts          (SOURCE)
│   └── access-keys.test.ts     (NEW)
```

### Pattern 1: Pure Unit Tests (Governance + Detector)

**What:** Direct function import, hand-crafted test data objects, no server or mocks needed.
**When to use:** For modules that are pure functions or depend only on types.
**Example:**
```typescript
// From reconcile.test.ts pattern
import { describe, expect, it } from 'vitest';
import { isGovernanceEligible } from './eligibility.js';
import type { GovernanceContext, GovernedEntity } from './types.js';

// Factory function for test data
function createTestContext(overrides: Partial<GovernanceContext> = {}): GovernanceContext {
  return {
    teamId: null,
    securityLevel: 5,
    isSystemAdmin: false,
    ...overrides,
  };
}

describe('isGovernanceEligible', () => {
  it('returns false when entity is not approved', () => {
    const context = createTestContext();
    const entity = createTestEntity({ lifecycleState: 'submitted' });
    expect(isGovernanceEligible(entity, context)).toBe(false);
  });
});
```

### Pattern 2: Fastify Integration Tests (Auth + Access-Keys Routes)

**What:** Use `buildServer()`, set up store data via `store.transact()`, test routes via `app.inject()`.
**When to use:** For route handlers that depend on `app.skillShareer` services.
**Example:**
```typescript
// From review.test.ts pattern
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../app.js';
import { hashSecret, nowIso } from '../lib/store.js';

describe('auth routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildServer();
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns 401 for invalid access key', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { accessKey: 'invalid_key_that_is_16ch' },
    });
    expect(response.statusCode).toBe(401);
  });
});
```

### Anti-Patterns to Avoid
- **Do not import from `../lib/rbac.js` in governance tests** -- the governance `permissions.ts` re-exports from its own module; test the governance functions directly, not the underlying `rbac.ts`.
- **Do not mock `tokenize` in detector tests** -- `tokenize` is a simple pure function from `fingerprint.ts`; use the real implementation.
- **Do not test via `app.inject()` for pure functions** -- governance and detector are pure functions; use direct imports.
- **Do not share mutable state across tests** -- the existing pattern creates fresh `app` per `beforeEach`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test data factories | Inline object literals in every test | Factory functions with `overrides` spread pattern (see `reconcile.test.ts`) | Reduces boilerplate, ensures forward-compatible with type changes |
| Auth header creation | Manual Bearer string construction | Copy the `getSystemAdminAuth()` pattern from `decay.test.ts` | Handles both login-based and direct session creation approaches |
| Session setup | Complex multi-step setup per test | `store.transact()` batch setup in `beforeEach` | Single transaction, consistent state |

**Key insight:** The codebase already has all the testing infrastructure needed. No new test utilities, helpers, or fixtures are required. The `buildServer()` function handles in-memory JsonStore creation automatically when `VITEST=true`.

## Common Pitfalls

### Pitfall 1: Login route requires systemAdminKey config
**What goes wrong:** Tests for `POST /v1/auth/login` with `systemAdminKey` will fail if the server config has `systemAdminKey: null` (the default).
**Why it happens:** `buildServer()` uses `loadConfig()` which reads `TRAPMAP_SYSTEM_ADMIN_KEY` env var. In test env without that var, it defaults to `null`.
**How to avoid:** Pass `systemAdminKey` via `buildServer({ config: { systemAdminKey: 'test-admin-key' } })` or use the `getSystemAdminAuth()` helper from `decay.test.ts` that falls back to direct session creation.
**Warning signs:** Login returns 500 with `system_admin_not_configured`.

### Pitfall 2: Access key login requires pre-existing access key and membership
**What goes wrong:** Testing `POST /v1/auth/login` with `accessKey` will always fail because no access keys exist in a fresh store.
**Why it happens:** The login route looks up `findAccessKeyByToken(data, payload.accessKey)` which requires a matching unrevoked access key record with the correct hash.
**How to avoid:** Set up user, team, membership, and access key records in `store.transact()` before testing the access key login flow.
**Warning signs:** Login returns 401 with `invalid_access_key`.

### Pitfall 3: Detector internal functions are not exported
**What goes wrong:** Attempting to test `overlapScore()`, `keywordOverlapPercent()`, `checkTrapDuplicate()`, or `checkSkillDuplicate()` directly.
**Why it happens:** These are module-private functions, not exported.
**How to avoid:** Test them indirectly through `detectDuplicates()` which is the only exported function (besides `getDetectionVersion()`). Construct inputs that exercise specific code paths.
**Warning signs:** Import errors for internal functions.

### Pitfall 4: requireHigherLevel boundary condition
**What goes wrong:** `requireHigherLevel(auth, targetLevel, nextLevel)` throws when `auth.securityLevel <= targetLevel OR auth.securityLevel <= nextLevel`. The default for `nextLevel` equals `targetLevel`, making it effectively `auth.securityLevel <= targetLevel`.
**Why it happens:** The function requires a *strictly higher* level. A caller at level 5 cannot operate on a target at level 5.
**How to avoid:** Test boundary cases explicitly: same level should throw, one level higher should pass.
**Warning signs:** Tests pass when they should fail (or vice versa) at boundary values.

### Pitfall 5: governance permissions.ts mirrors rbac.ts but is a different module
**What goes wrong:** Testing `permissions.ts` functions by importing from `rbac.ts`.
**Why it happens:** `permissions.ts` has `hasPermission` and `requirePermission` that delegate to `auth.effectivePermissions.includes(permission)` -- same logic as `rbac.ts` but they are separate functions operating on `ResolvedAuthContext`.
**How to avoid:** Import from `./permissions.js` (the governance module) not `../rbac.js`. The governance module's `requireTeamAccess` and `requireHigherLevel` are also separate copies.
**Warning signs:** Tests pass but don't actually test the governance module.

### Pitfall 6: Detector requires `lifecycleState: 'approved'` on entries
**What goes wrong:** Tests create trap entries or skill artifacts without setting `lifecycleState: 'approved'`, resulting in zero matches even with identical content.
**Why it happens:** `detectDuplicates()` skips non-approved entries: `if (entry.lifecycleState !== 'approved') continue`.
**How to avoid:** Always set `lifecycleState: 'approved'` on test entries that should be compared.
**Warning signs:** `detectDuplicates` returns empty matches when content is identical.

## Code Examples

### Governance Permissions Test Pattern

```typescript
// Source: Derived from reconcile.test.ts factory pattern
import { describe, expect, it } from 'vitest';
import type { ResolvedAuthContext } from '../context.js';
import {
  extractGovernanceContext,
  hasPermission,
  requirePermission,
  requireTeamAccess,
  requireHigherLevel,
} from './permissions.js';
import { AppError } from '../errors.js';

function createTestAuth(overrides: Partial<ResolvedAuthContext> = {}): ResolvedAuthContext {
  return {
    subjectType: 'user',
    actorId: 'user_1',
    handle: 'testuser',
    activeTeamId: 'team_1',
    securityLevel: 5,
    effectivePermissions: ['session:read', 'team:list'],
    user: null,
    membership: null,
    team: null,
    ...overrides,
  };
}

describe('requirePermission', () => {
  it('throws AppError(403) when permission is missing', () => {
    const auth = createTestAuth({ effectivePermissions: ['session:read'] });
    expect(() => requirePermission(auth, 'knowledge:review' as any))
      .toThrow(AppError);
  });

  it('does not throw when permission is present', () => {
    const auth = createTestAuth({ effectivePermissions: ['knowledge:review'] });
    expect(() => requirePermission(auth, 'knowledge:review' as any)).not.toThrow();
  });
});

describe('requireTeamAccess', () => {
  it('bypasses for system-admin', () => {
    const auth = createTestAuth({
      subjectType: 'system-admin',
      activeTeamId: null,
    });
    expect(() => requireTeamAccess(auth, 'any-team')).not.toThrow();
  });

  it('throws when activeTeamId does not match', () => {
    const auth = createTestAuth({ activeTeamId: 'team_1' });
    expect(() => requireTeamAccess(auth, 'team_2')).toThrow(AppError);
  });
});

describe('requireHigherLevel', () => {
  it('throws when caller level equals target level', () => {
    const auth = createTestAuth({ securityLevel: 5 });
    expect(() => requireHigherLevel(auth, 5)).toThrow(AppError);
  });

  it('passes when caller level exceeds target level', () => {
    const auth = createTestAuth({ securityLevel: 6 });
    expect(() => requireHigherLevel(auth, 5)).not.toThrow();
  });
});
```

### Governance Eligibility Test Pattern

```typescript
import { describe, expect, it } from 'vitest';
import { isGovernanceEligible, matchesGovernanceFilters, filterGovernedEntities } from './eligibility.js';
import type { GovernanceContext, GovernedEntity, GovernanceFilters } from './types.js';

function createTestEntity(overrides: Partial<GovernedEntity & { labels: string[] }> = {}): GovernedEntity & { labels: string[] } {
  return {
    teamId: null,
    scope: 'global',
    requiredLevel: 0,
    lifecycleState: 'approved',
    labels: [],
    ...overrides,
  };
}

function createTestContext(overrides: Partial<GovernanceContext> = {}): GovernanceContext {
  return {
    teamId: null,
    securityLevel: 5,
    isSystemAdmin: false,
    ...overrides,
  };
}

describe('isGovernanceEligible', () => {
  it('returns false for non-approved entity', () => {
    const entity = createTestEntity({ lifecycleState: 'submitted' });
    expect(isGovernanceEligible(entity, createTestContext())).toBe(false);
  });

  it('system admin bypasses all checks', () => {
    const entity = createTestEntity({
      lifecycleState: 'approved',
      requiredLevel: 10,
      teamId: 'other-team',
      decayState: 'expired',
    });
    const ctx = createTestContext({ isSystemAdmin: true, securityLevel: 0 });
    expect(isGovernanceEligible(entity, ctx)).toBe(true);
  });

  it('returns false when caller level < required level', () => {
    const entity = createTestEntity({ requiredLevel: 8 });
    const ctx = createTestContext({ securityLevel: 3 });
    expect(isGovernanceEligible(entity, ctx)).toBe(false);
  });

  it('returns false for expired decay state', () => {
    const entity = createTestEntity({ decayState: 'expired' });
    expect(isGovernanceEligible(entity, createTestContext())).toBe(false);
  });

  it('includes expired when excludeDecayed is false', () => {
    const entity = createTestEntity({ decayState: 'expired', requiredLevel: 0 });
    expect(isGovernanceEligible(entity, createTestContext(), { excludeDecayed: false })).toBe(true);
  });

  it('returns false for team-scoped entity with wrong team', () => {
    const entity = createTestEntity({ teamId: 'team_A' });
    const ctx = createTestContext({ teamId: 'team_B' });
    expect(isGovernanceEligible(entity, ctx)).toBe(false);
  });
});
```

### Detector Test Pattern

```typescript
import { describe, expect, it } from 'vitest';
import { detectDuplicates, getDetectionVersion } from './detector.js';
import type { DuplicateDetectionInput } from './types.js';
import type { KnowledgeRecord, SkillArtifactRecord } from '../store.js';
import { nowIso } from '../store.js';

// Use factory functions from reconcile.test.ts pattern
function createTestTrap(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  return {
    id: 'trap_1', teamId: null, scope: 'global', labels: ['test'],
    shortcut: 'Test', detail: 'Detail', requiredLevel: 0,
    lifecycleState: 'approved', ownerUserId: 'user_1',
    // ... full record fields
  };
}

describe('detectDuplicates', () => {
  it('returns no matches for empty corpus', async () => {
    const input: DuplicateDetectionInput = {
      candidateId: 'cand_1', candidateFingerprint: 'hash',
      candidateKeywords: ['test'], candidateTokens: ['test'],
      trapEntries: [], skillArtifacts: [], threshold: 0.3,
    };
    const result = await detectDuplicates(input);
    expect(result.duplicateCase).toBeNull();
  });

  it('detects high-overlap trap match', async () => {
    const trap = createTestTrap({
      shortcut: 'Same title', detail: 'Same detail text here',
      lifecycleState: 'approved',
    });
    const input: DuplicateDetectionInput = {
      candidateId: 'cand_1', candidateFingerprint: 'hash',
      candidateKeywords: ['same', 'title'],
      candidateTokens: ['same', 'title', 'detail', 'text', 'here'],
      trapEntries: [trap], skillArtifacts: [], threshold: 0.3,
    };
    const result = await detectDuplicates(input);
    expect(result.duplicateCase).not.toBeNull();
    expect(result.duplicateCase!.matches.length).toBeGreaterThan(0);
  });

  it('skips non-approved entries', async () => {
    const trap = createTestTrap({ lifecycleState: 'submitted' });
    // ... identical content
    const result = await detectDuplicates(input);
    expect(result.duplicateCase).toBeNull();
  });

  it('limits matches to top 10', async () => { /* ... */ });
});
```

### Auth Route Test Pattern

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../app.js';
import { hashSecret, nowIso } from '../lib/store.js';

describe('auth routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildServer();
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('POST /v1/auth/login', () => {
    it('returns 401 for invalid access key', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { accessKey: 'invalid_key_16chars!' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('creates system-admin session with valid key', async () => {
      // Need to either: configure systemAdminKey or create session directly
      // See decay.test.ts getSystemAdminAuth() pattern
    });
  });

  describe('POST /v1/auth/logout', () => {
    it('returns ok even without session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/logout',
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().ok).toBe(true);
    });
  });

  describe('GET /v1/auth/session', () => {
    it('returns unauthenticated when no token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/auth/session',
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().authenticated).toBe(false);
    });
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Jest | Vitest | Pre-existing | All tests use vitest imports, no jest globals |

**Deprecated/outdated:**
- None identified; the test infrastructure is current.

## Source Code Analysis: Complete Function Inventory

### governance/permissions.ts (5 exported functions)

| Function | Signature | Returns | Throws | Key Test Scenarios |
|----------|-----------|---------|--------|--------------------|
| `extractGovernanceContext(auth)` | `(ResolvedAuthContext) => GovernanceContext` | `{ teamId, securityLevel, isSystemAdmin }` | never | system-admin detection, team scoping |
| `hasPermission(auth, permission)` | `(ResolvedAuthContext, Permission) => boolean` | true/false | never | permission present, permission absent |
| `requirePermission(auth, permission)` | `(ResolvedAuthContext, Permission) => void` | void | `AppError(403, 'forbidden')` | has permission (no throw), missing permission (throw) |
| `requireTeamAccess(auth, teamId)` | `(ResolvedAuthContext, string) => void` | void | `AppError(403, 'team_mismatch')` | system-admin bypass, matching team, mismatched team |
| `requireHigherLevel(auth, targetLevel, nextLevel?)` | `(ResolvedAuthContext, number, number?) => void` | void | `AppError(403, 'insufficient_level')` | system-admin bypass, higher level ok, equal level throws, lower level throws |

### governance/eligibility.ts (4 exported functions)

| Function | Signature | Returns | Key Test Scenarios |
|----------|-----------|---------|--------------------|
| `isGovernanceEligible(entity, context, options?)` | `(GovernedEntity, GovernanceContext, EligibilityOptions?) => boolean` | boolean | non-approved rejected, system-admin bypass, decay state filtering, security level check, team access check, excludeDecayed option |
| `matchesGovernanceFilters(entity, filters)` | `(GovernedEntity & {labels}, GovernanceFilters) => boolean` | boolean | empty filters pass, scope filter, label filter (all must match), partial label fail |
| `isGovernedEntityAccessible(entity, context, filters, options?)` | `(entity, context, filters, options?) => boolean` | boolean | combines eligibility + filters |
| `filterGovernedEntities(entities, context, filters, options?)` | `(T[], ...) => T[]` | filtered array | empty array, mix of eligible/ineligible |

### candidates/detector.ts (2 exported functions, 5 private helpers)

| Export | Signature | Key Test Scenarios |
|--------|-----------|--------------------|
| `detectDuplicates(input)` | `(DuplicateDetectionInput) => Promise<DuplicateDetectionResult>` | empty corpus, trap match, skill match, cross-entity, boundary thresholds, non-approved skip, result limiting to 10, match sorting by similarity |
| `getDetectionVersion()` | `() => string` | returns `'1.0.0'` |

Private functions (tested indirectly via `detectDuplicates`):
- `overlapScore(a, b)` -- Jaccard-like: empty sets, identical sets, partial overlap
- `keywordOverlapPercent(a, b)` -- empty arrays, case-insensitive, shared count / max size
- `toMatchType(score, isExactFingerprint)` -- exact, high-overlap (>=0.72), semantic-similar
- `checkTrapDuplicate(...)` -- similarity below threshold returns null, above returns match
- `checkSkillDuplicate(...)` -- no profile returns null, fingerprint match = exact

Key constants:
- `HIGH_OVERLAP_THRESHOLD = 0.72`
- `MEDIUM_OVERLAP_THRESHOLD = 0.38`
- `DETECTION_VERSION = '1.0.0'`

### routes/auth.ts (4 route handlers)

| Route | Method | Key Test Scenarios |
|-------|--------|--------------------|
| `/v1/auth/login` | POST | system admin login (valid key, invalid key, no key configured), access key login (valid key, invalid key, revoked key, no membership), response includes session and x-session-token header |
| `/v1/auth/session` | GET | authenticated session returns session, unauthenticated returns `{authenticated: false}` |
| `/v1/auth/logout` | POST | valid token deletes session, no token returns ok |
| `/v1/teams/select` | POST | team membership check, system-admin team selection, invalid session |

### routes/access-keys.ts (1 route handler)

| Route | Method | Key Test Scenarios |
|-------|--------|--------------------|
| `/v1/access-keys` | POST | member not found, team/member mismatch, require team access, require higher level, successful key creation, response includes plaintext key |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Detector private functions can be adequately tested through `detectDuplicates()` public API | Architecture | May need to export helpers for direct testing if coverage is insufficient |
| A2 | `buildServer()` in test env creates a usable JsonStore without external dependencies | Architecture | Tests would fail at setup if store initialization requires DB |
| A3 | The `tokenize` function from `fingerprint.ts` is stable and deterministic for test assertions | Detector tests | Similarity scores would be non-deterministic |

**All three assumptions are low-risk** -- A1 is mitigated by the well-defined internal function signatures, A2 is confirmed by reading `buildServer()` which uses `createSkillShareerStore(config)` with a generated temp file, A3 is confirmed by `tokenize()` being a pure function that lowercases and splits on non-alphanumeric characters.

## Open Questions

1. **Should `detector.ts` internal functions be exported for testing?**
   - What we know: They are currently private. Testing through `detectDuplicates()` covers them but makes boundary value tests (like `overlapScore` with empty sets) harder to isolate.
   - Recommendation: Test through the public API first. If coverage is below 80%, consider exporting internals with a `_` prefix or a test-only export.

2. **Should auth route tests use `buildServer({ config: { systemAdminKey: 'test-key' } })` or direct session creation?**
   - What we know: Both patterns exist in the codebase. `decay.test.ts` uses login with fallback; `review.test.ts` creates sessions directly in `store.transact()`.
   - Recommendation: Use direct session creation for most tests (simpler, more reliable). Use the login endpoint for tests that specifically validate the login flow itself.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified -- all tests use in-memory store and vitest, no DB or external services needed)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (workspace configuration) |
| Config file | `packages/server/vitest.config.ts` |
| Quick run command | `cd packages/server && npx vitest run src/lib/governance/permissions.test.ts` |
| Full suite command | `cd packages/server && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-02 | Governance permission checks (allow/deny) | unit | `vitest run src/lib/governance/permissions.test.ts -t "requirePermission"` | Wave 0 |
| TEST-02 | Governance team access enforcement | unit | `vitest run src/lib/governance/permissions.test.ts -t "requireTeamAccess"` | Wave 0 |
| TEST-02 | Governance security level hierarchy | unit | `vitest run src/lib/governance/permissions.test.ts -t "requireHigherLevel"` | Wave 0 |
| TEST-02 | Eligibility lifecycle check | unit | `vitest run src/lib/governance/eligibility.test.ts -t "isGovernanceEligible"` | Wave 0 |
| TEST-02 | Eligibility decay state filtering | unit | `vitest run src/lib/governance/eligibility.test.ts -t "decay"` | Wave 0 |
| TEST-02 | Eligibility scope/label filters | unit | `vitest run src/lib/governance/eligibility.test.ts -t "matchesGovernanceFilters"` | Wave 0 |
| TEST-02 | Auth login flow | integration | `vitest run src/routes/auth.test.ts -t "login"` | Wave 0 |
| TEST-02 | Auth session status | integration | `vitest run src/routes/auth.test.ts -t "session"` | Wave 0 |
| TEST-02 | Auth logout | integration | `vitest run src/routes/auth.test.ts -t "logout"` | Wave 0 |
| TEST-02 | Access key creation | integration | `vitest run src/routes/access-keys.test.ts -t "access-keys"` | Wave 0 |
| TEST-02 | Duplicate detection | unit | `vitest run src/lib/candidates/detector.test.ts -t "detectDuplicates"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/server && npx vitest run src/lib/governance/ src/lib/candidates/detector.test.ts src/routes/auth.test.ts src/routes/access-keys.test.ts`
- **Per wave merge:** `cd packages/server && npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/server/src/lib/governance/permissions.test.ts` -- covers TEST-02 permission checks
- [ ] `packages/server/src/lib/governance/eligibility.test.ts` -- covers TEST-02 eligibility checks
- [ ] `packages/server/src/routes/auth.test.ts` -- covers TEST-02 auth flow
- [ ] `packages/server/src/routes/access-keys.test.ts` -- covers TEST-02 key management
- [ ] `packages/server/src/lib/candidates/detector.test.ts` -- covers TEST-02 duplicate detection

No framework or config gaps -- vitest is already configured and working.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Session-based auth via access keys or system admin key |
| V3 Session Management | yes | Token-based sessions with SHA-256 hashing |
| V4 Access Control | yes | RBAC with role templates, permission checks, team scoping |
| V5 Input Validation | yes | Zod schema validation on all route inputs |
| V6 Cryptography | yes | SHA-256 for token/key hashing (via `node:crypto`) |

### Known Threat Patterns for Fastify + RBAC Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Permission bypass | Elevation of Privilege | `requirePermission()` checks on every route |
| Team boundary violation | Information Disclosure | `requireTeamAccess()` for team-scoped resources |
| Security level downgrade | Elevation of Privilege | `requireHigherLevel()` for operations on other members |
| Token theft | Spoofing | SHA-256 token hashing, no plaintext storage |
| Expired session reuse | Repudiation | Session expiry checks (though not fully tested in this phase) |

## Sources

### Primary (HIGH confidence)
- Source code analysis of all 5 target files (permissions.ts, eligibility.ts, auth.ts, access-keys.ts, detector.ts)
- Supporting modules (context.ts, errors.ts, rbac.ts, session.ts, types.ts, fingerprint.ts, store.ts)
- Existing test patterns from 60+ test files in the codebase
- vitest.config.ts configuration

### Secondary (MEDIUM confidence)
- Contract schema analysis (auth.ts, common.ts, team.ts, decay.ts in packages/contracts/src/domain/)

### Tertiary (LOW confidence)
- None -- all findings are from direct source code analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all from direct codebase analysis
- Architecture: HIGH - test patterns verified from existing test files
- Pitfalls: HIGH - identified from reading source code logic and route implementations

**Research date:** 2026-05-04
**Valid until:** 2026-06-04 (stable codebase, no framework changes expected)
