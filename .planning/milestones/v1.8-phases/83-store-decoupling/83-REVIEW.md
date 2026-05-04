---
status: issues_found
phase: 83
phase_name: Store Decoupling
files_reviewed: 12
critical: 1
warning: 2
info: 8
total: 11
review_depth: standard
review_date: 2026-05-05
---

# Review: Phase 83 Store Decoupling

**Review Date**: 2026-05-05
**Reviewer**: Claude
**Diff Base**: 0e09c230cda6b5d9253f0b51d23ad42f8523bbee

## Summary

This review covers the Repository pattern implementation for decoupling store operations from PostgreSQL. The implementation introduces repositories for Session, AccessKey, User, Team, and Membership entities with InMemory implementations that wrap the existing SkillShareerStore.

---

## Critical Issues

### 1. Race Condition in Repository `nextId()` Methods

**Files**: `lib/auth/repository.ts`, `lib/users/repository.ts`, `lib/teams/repository.ts`

**Severity**: High

The `nextId()` methods in all InMemory repositories call `snapshot()` first, then `store.nextId()`:

```typescript
// lib/users/repository.ts:56-59
async nextId(): Promise<string> {
  const data = await this.store.snapshot();
  return this.store.nextId(data, 'user');
}
```

This is non-atomic. If two concurrent requests call `nextId()`, they could receive the same ID:

1. Request A calls `snapshot()`, gets data with counter=5
2. Request B calls `snapshot()`, gets same data with counter=5
3. Both call `store.nextId(data, 'user')`, both get "user_5"

**Recommendation**: Either:
- Remove `nextId()` from the public interface and only generate IDs inside `transact()` calls
- Make `nextId()` call `transact()` internally to ensure atomicity

---

### 2. Silent Failure in Update Operations

**Files**: `lib/auth/repository.ts:163-171`, `lib/users/repository.ts:77-85`, `lib/teams/repository.ts:88-96`

**Severity**: Medium

All `update()` methods silently do nothing if the record is not found:

```typescript
// lib/teams/repository.ts:88-96
async update(teamId: string, updates: Partial<TeamRecord>): Promise<void> {
  await this.store.transact((data) => {
    const team = data.teams.find((t) => t.id === teamId);
    if (team) {  // <-- Silent failure if not found
      Object.assign(team, updates);
      team.updatedAt = new Date().toISOString();
    }
  });
}
```

This could mask bugs where callers expect an update to occur.

**Recommendation**: Either:
- Throw an error if the record is not found (consistent with `updateActiveTeam` which throws)
- Document the silent failure behavior in the interface JSDoc
- Return a boolean indicating whether the update was applied

---

## Security Issues

### 3. Inconsistent Repository Availability Checks

**File**: `lib/session.ts:239`, `lib/session.ts:494`

**Severity**: Medium

`resolveAuthContext()` requires ALL four repositories to be present:

```typescript
if (sessionRepo && userRepo && teamRepo && membershipRepo) {
```

But `getSessionStatus()` only checks `sessionRepo`:

```typescript
if (sessionRepo) {
  const session = await sessionRepo.getByTokenHash(hashSecret(token));
  return session ? getSessionResponse(services, session) : null;
}
```

`getSessionResponse()` internally checks for all repos again, but this creates an inconsistent code path where:
- `getSessionStatus()` uses `sessionRepo` for lookup
- `getSessionResponse()` falls back to `store.snapshot()` for user/team/membership data

This could lead to partial repository usage in edge cases.

**Recommendation**: Apply consistent check - either require all repos or none:

```typescript
if (sessionRepo && userRepo && teamRepo && membershipRepo) {
  // Use all repos
} else {
  // Use store fallback
}
```

---

### 4. Unnecessary Store Access in auth.ts

**File**: `routes/auth.ts:54-55`

**Severity**: Low

When `accessKeyRepo` is available, the code still calls `store.snapshot()`:

```typescript
const accessKey = app.skillShareer.accessKeyRepo
  ? await findAccessKeyByToken(app.skillShareer.accessKeyRepo, payload.accessKey)
  : await findAccessKeyByToken(await app.skillShareer.store.snapshot(), payload.accessKey);

// ...

const data = await app.skillShareer.store.snapshot();  // <-- Always called
const userId = data.memberships.find((membership) => membership.id === accessKey.memberId)?.userId ?? null;
```

This means even with repositories, the store is still accessed to resolve `userId` from `accessKey.memberId`.

**Recommendation**: Add `membershipRepo.listByMember()` usage or include `userId` in AccessKeyRecord.

---

## Code Quality Issues

### 5. Fragile Duck-Typing Pattern

**File**: `lib/session.ts:127`, `lib/session.ts:171`, `lib/session.ts:193`, `lib/session.ts:531`

**Severity**: Low

The duck-typing checks for repository vs store are fragile:

```typescript
if ('create' in repoOrStore) {
```

If `SkillShareerStore` ever adds a `create` method, this check would incorrectly identify it as a repository.

**Recommendation**: Use a more robust type guard:

```typescript
function isSessionRepository(obj: unknown): obj is SessionRepository {
  return obj !== null &&
         typeof obj === 'object' &&
         'create' in obj &&
         'getByTokenHash' in obj &&
         'deleteByTokenHash' in obj;
}
```

Or use a symbol branding approach:

```typescript
const SESSION_REPO_SYMBOL = Symbol('SessionRepository');
interface SessionRepository {
  readonly [SESSION_REPO_SYMBOL]: true;
  // ...
}
```

---

### 6. Duplicate Helper Functions

**File**: `lib/session.ts:72-90`, `lib/session.ts:96-111`

**Severity**: Low (maintainability)

Two nearly identical functions exist:

- `findMembershipForTeam(data: StoreData, userId, activeTeamId)` - works with StoreData
- `findMembershipForTeamFromList(memberships: MembershipRecord[], activeTeamId)` - works with array

The logic is duplicated.

**Recommendation**: Extract the common membership selection logic:

```typescript
function selectMembershipFromList(
  memberships: MembershipRecord[],
  activeTeamId: string | null,
): MembershipRecord | null {
  if (memberships.length === 0) return null;
  if (!activeTeamId) return memberships[0] ?? null;
  return memberships.find(m => m.teamId === activeTeamId) ?? memberships[0] ?? null;
}
```

---

### 7. Interface Inconsistency: Return Types

**File**: `lib/auth/repository.ts:50`

**Severity**: Low

`SessionRepository.updateActiveTeam()` returns `SessionRecord`, but other update methods return `void`:

```typescript
updateActiveTeam(sessionId: string, teamId: string | null): Promise<SessionRecord>;

// vs

update(userId: string, updates: Partial<UserRecord>): Promise<void>;
```

This inconsistency makes the interface harder to use predictably.

**Recommendation**: Either:
- All update methods return the updated record
- All update methods return void
- Document the difference in JSDoc

---

### 8. Missing Error Type for Repository Operations

**File**: `lib/auth/repository.ts:130-132`

**Severity**: Low

`InMemorySessionRepository.updateActiveTeam()` throws a generic `Error`:

```typescript
if (!session) {
  throw new Error(`Session ${sessionId} not found`);
}
```

Other parts of the codebase use `AppError` for consistent error handling.

**Recommendation**: Use `AppError` for consistency:

```typescript
if (!session) {
  throw new AppError(404, 'session_not_found', `Session ${sessionId} not found`);
}
```

---

## Type Safety Issues

### 9. Implicit Any in Store Transact Callback

**File**: `lib/auth/repository.ts:122-125`

The callback in `deleteByTokenHash` has implicit return type:

```typescript
await this.store.transact((data) => {
  data.sessions = data.sessions.filter((s) => s.tokenHash !== tokenHash);
  // No explicit return
});
```

**Recommendation**: Add explicit return type annotation or return statement for clarity.

---

### 10. Non-Null Assertion Without Check

**File**: `lib/session.ts:262`, `lib/session.ts:394`

Non-null assertion used after null check on different property:

```typescript
const user = await userRepo.getById(session.userId ?? '');  // Line 262

if (!user) {
  throw new AppError(401, 'unauthorized', 'Session user no longer exists');
}
```

This is actually correct (the fallback `?? ''` ensures no null), but the pattern `session.userId ?? ''` is used instead of asserting `session.userId` is non-null after checking `session.subjectType !== 'system-admin'`.

**Recommendation**: Add explicit type narrowing or document the pattern:

```typescript
if (session.subjectType !== 'system-admin' && !session.userId) {
  throw new AppError(500, 'invalid_session', 'User session missing userId');
}
```

---

## Missing Test Coverage

### 11. No Tests for Edge Cases

**File**: `lib/session.test.ts`

The test file covers happy paths but misses:

1. Concurrent `nextId()` calls (race condition test)
2. Update operations on non-existent records
3. Repository method behavior when store operations fail
4. Error propagation from `transact()` to repository callers

**Recommendation**: Add tests for:
- Race conditions in ID generation
- Error cases in repository methods
- Edge cases (empty results, null values, concurrent access)

---

## Positive Findings

1. **Consistent Interface Design**: All repositories follow the same pattern with `nextId()`, `insert()`, `getById()`, and `update()` methods.

2. **Backward Compatibility**: The fallback patterns correctly handle both repository and store paths.

3. **Token Security**: Session tokens are properly hashed before storage using `hashSecret()`.

4. **Authorization**: Routes properly check permissions via `requirePermission()`, `requireTeamAccess()`, and `requireHigherLevel()`.

5. **Factory Pattern**: Repository creation is centralized in factory functions with clear TODOs for future PostgreSQL implementations.

6. **Type Exports**: Interfaces are properly exported from index files for external use.

---

## Recommendations Summary

| Priority | Issue | Action |
|----------|-------|--------|
| High | Race condition in `nextId()` | Make ID generation atomic or remove from public API |
| Medium | Silent failure in updates | Throw error or return boolean |
| Medium | Inconsistent repo checks | Apply consistent all-or-nothing check |
| Low | Fragile duck-typing | Add robust type guards |
| Low | Duplicate helper functions | Extract common logic |
| Low | Interface inconsistency | Unify update return types |
| Low | Missing test coverage | Add edge case tests |
