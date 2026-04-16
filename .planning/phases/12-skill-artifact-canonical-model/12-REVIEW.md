---
phase: 12-skill-artifact-canonical-model
reviewed: 2026-04-16T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - packages/contracts/src/domain/artifacts.ts
  - packages/contracts/src/index.ts
  - packages/contracts/src/index.test.ts
  - packages/server/src/lib/artifacts/model.ts
  - packages/server/src/lib/artifacts/model.test.ts
  - packages/server/src/lib/artifacts/derive.ts
  - packages/server/src/lib/artifacts/derive.test.ts
  - packages/server/src/lib/store.ts
  - packages/server/src/routes/review.test.ts
  - packages/server/src/routes/knowledge.test.ts
  - packages/server/src/routes/operations.test.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-04-16T00:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

This review covers the Phase 12 implementation of the skill artifact canonical model. The code introduces a new artifact aggregate root with proper governance inheritance, derivation patterns for profiles/capsules, and additive coexistence with legacy knowledge entries.

**Overall Assessment:** The implementation is solid with good separation of concerns. Schema definitions are comprehensive and test coverage is thorough. Issues found are primarily related to error handling and defensive programming.

## Warnings

### WR-01: Missing error handling when `data.users.find()` returns undefined

**File:** `packages/server/src/lib/artifacts/model.ts:33-39`

**Issue:** The `getUser()` function throws an error when a user is not found, but this error could crash the entire request if a user is deleted or an ID is corrupted. No validation is performed before accessing the result.

```typescript
function getUser(data: StoreData, userId: string) {
  const user = data.users.find((candidate) => candidate.id === userId);
  if (!user) {
    throw new Error(`User not found: ${userId}`);  // Generic error - no error code
  }
  return user;
}
```

**Fix:** Use a domain-specific error type that can be caught and handled at the route level:

```typescript
class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`User not found: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}

function getUser(data: StoreData, userId: string) {
  const user = data.users.find((candidate) => candidate.id === userId);
  if (!user) {
    throw new UserNotFoundError(userId);
  }
  return user;
}
```

### WR-02: Array mutation in `applyDerivedArtifactOutputs` without defensive copy

**File:** `packages/server/src/lib/artifacts/model.ts:550-553`

**Issue:** The function mutates the `artifact.history` array directly by replacing an element. If the `historyIndex` is -1 (not found), no error is thrown, potentially leaving the system in an inconsistent state.

```typescript
const historyIndex = artifact.history.findIndex((h) => h.revision === revision.revision);
if (historyIndex !== -1) {
  artifact.history[historyIndex] = revision;  // Direct mutation
}
```

**Fix:** Add defensive check for missing revisions:

```typescript
const historyIndex = artifact.history.findIndex((h) => h.revision === revision.revision);
if (historyIndex === -1) {
  throw new Error(`Revision ${revision.revision} not found in artifact history`);
}
artifact.history[historyIndex] = revision;
```

## Info

### IN-01: Console.log statements in test files

**File:** `packages/server/src/routes/review.test.ts:203`, `packages/server/src/routes/knowledge.test.ts:201,478`, `packages/server/src/routes/operations.test.ts:262`

**Issue:** Test files contain `console.log('Error response:', response.json())` statements that clutter test output when tests fail. These should be removed or replaced with proper assertion messages.

**Fix:** Remove console.log statements or use proper test reporting:

```typescript
if (response.statusCode !== 200) {
  const error = response.json();
  throw new Error(`Expected 200, got ${response.statusCode}: ${JSON.stringify(error)}`);
}
```

### IN-02: Inconsistent error handling in `buildSkillProfile`

**File:** `packages/server/src/lib/artifacts/derive.ts:119-123`

**Issue:** When `eligibleFiles.length === 0`, the function returns `null` but there's no comment explaining why this is valid. The caller `deriveSkillArtifactOutputs` doesn't check for null profile before using it.

**Fix:** Add a comment explaining the null case and document the contract:

```typescript
// Returns null if no files are eligible for derivation.
// This is valid for artifacts with only assets/scripts (no SKILL.md or references/)
if (eligibleFiles.length === 0) {
  return null;
}
```

### IN-03: Magic number for capsule ID generation

**File:** `packages/server/src/lib/artifacts/derive.ts:76`

**Issue:** The capsule ID uses `.slice(0, 16)` without explanation. This is a collision risk for artifacts with many capsules.

```typescript
return createHash('sha256').update(input).digest('hex').slice(0, 16);
```

**Fix:** Add a constant with explanation:

```typescript
// First 16 hex chars = 64 bits of entropy, sufficient for capsule uniqueness within artifacts
const CAPSULE_ID_LENGTH = 16;

function buildCapsuleId(...) {
  const input = `${artifactId}:${revision}:${sourceHash}:${index}`;
  return createHash('sha256').update(input).digest('hex').slice(0, CAPSULE_ID_LENGTH);
}
```

### IN-04: Duplicate `applyDerivedArtifactOutputs` function

**File:** `packages/server/src/lib/artifacts/model.ts:476-556` and `packages/server/src/lib/artifacts/derive.ts:339-367`

**Issue:** The same function name `applyDerivedArtifactOutputs` exists in both files with nearly identical implementations. This creates confusion about which one to use and violates DRY principles.

**Fix:** Consolidate to a single implementation in the model.ts file and export it for use in derive.ts:

```typescript
// In model.ts - keep this one
export function applyDerivedArtifactOutputs(...) { ... }

// In derive.ts - remove duplicate, import from model
import { applyDerivedArtifactOutputs } from './model.js';
```

---

_Reviewed: 2026-04-16T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
