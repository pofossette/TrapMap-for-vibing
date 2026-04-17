---
phase: 15-client-activation-for-references-assets-and-scripts
reviewed: 2025-01-17T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - packages/contracts/src/domain/retrieval.ts
  - packages/contracts/src/domain/artifacts.ts
  - packages/contracts/src/domain/operations.ts
  - packages/contracts/src/index.test.ts
  - packages/contracts/src/index.ts
  - packages/server/src/lib/retrieval/assembly.ts
  - packages/server/src/lib/retrieval/assembly.test.ts
  - packages/server/src/lib/retrieval/orchestrator.ts
  - packages/server/src/lib/retrieval.test.ts
  - packages/server/src/lib/activation-policy.ts
  - packages/server/src/lib/activation-policy.test.ts
  - packages/server/src/routes/operations.ts
  - packages/server/src/routes/operations.test.ts
  - packages/cli/src/lib/config.ts
  - packages/cli/src/lib/activation-policy.ts
  - packages/cli/src/lib/activation-policy.test.ts
  - packages/cli/src/commands/operations.ts
  - packages/cli/src/commands/operations.test.ts
  - packages/cli/src/lib/skill-artifact-export.ts
findings:
  critical: 2
  warning: 8
  info: 3
  total: 13
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2025-01-17T00:00:00Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

This review covers 19 core files from Phase 15: Client Activation for References, Assets, and Scripts. The phase introduces a four-state script activation policy vocabulary (`reference-only`, `needs-approval`, `client-executable`, `blocked`) and integrates activation hints into v2 retrieval responses sourced from governed clientManifest.

The implementation is generally well-structured with good separation of concerns between contracts, server, and CLI. Test coverage is comprehensive for new features. However, several critical issues were identified around policy enforcement, hash validation, and code quality concerns including type assertions and error handling.

## Critical Issues

### CR-01: Missing hash validation in script policy override resolution

**File:** `packages/cli/src/lib/activation-policy.ts:95-101`
**Issue:** The `resolveScriptEffectivePolicy` function accepts a `ScriptPolicyOverride` parameter with a `sha256` field but never validates that the override hash matches the metadata hash. This is a security vulnerability as it could allow policy overrides to be applied to different script versions than intended.

**Fix:**
```typescript
export function resolveScriptEffectivePolicy(
  metadata: ScriptWithPolicyMetadata,
  override: ScriptPolicyOverride | null | undefined,
): ScriptActivationPolicy {
  if (override) {
    // Validate override hash matches metadata hash
    if (override.sha256 !== metadata.sha256) {
      // Hash mismatch - ignore override and use server default
      return metadata.defaultPolicy;
    }
    const localOverride = override.overridePolicy ?? null;
    return resolveEffectivePolicy(metadata.defaultPolicy, localOverride);
  }
  return metadata.defaultPolicy;
}
```

### CR-02: Non-null assertion without guard

**File:** `packages/server/src/lib/retrieval/orchestrator.ts:353`
**Issue:** Line 353 contains a comment stating "Note: existing is guaranteed non-null by the if-check above (CR-02)" but then accesses `existing.channels.push()` without proper null checking. While the preceding `if (existing)` check does guarantee non-null, TypeScript's control flow analysis should naturally narrow the type. The comment suggests this was a problematic pattern that was addressed.

**Fix:** The code is actually correct - the `if (existing)` check on line 351 does guarantee `existing` is non-null on line 354. However, the comment referencing "CR-02" suggests this was a finding that should have been addressed. Consider removing the defensive comment if the code is correct, or add explicit type guards if TypeScript cannot narrow the type:

```typescript
if (existing) {
  // Entry exists from hybrid - add graph evidence
  existing.channels.push('graph');
  // ... rest of code
}
```

## Warnings

### WR-01: Type assertion without validation

**File:** `packages/server/src/lib/retrieval/orchestrator.ts:198`
**Issue:** Type assertion `as any` is used for `previousState` and `nextState` when calling `runKnowledgeIndexEvent`. This bypasses TypeScript's type checking and could lead to runtime errors if the values don't match expected lifecycle states.

**Fix:**
```typescript
// Define proper type for lifecycle states
type LifecycleState = 'approved' | 'submitted' | 'rejected' | 'deactivated';

// Then use proper typing
await runKnowledgeIndexEvent({
  // ...
  previousState: previousState as LifecycleState,
  nextState: nextState as LifecycleState,
  // ...
});
```

### WR-02: Potential null pointer in optional chaining

**File:** `packages/server/src/routes/operations.ts:462`
**Issue:** `result[i]?.artifactId` uses optional chaining but `result` comes from `artifactImportResponseSchema.parse()` which should ensure the array exists. This is defensive but may mask actual data issues.

**Fix:** Ensure proper validation:
```typescript
if (!result || result.length === 0 || !result[0]?.artifactId) {
  throw new AppError(500, 'invalid_response', 'No artifact ID in import response');
}
const entityId = result[0]!.artifactId; // Safe after validation
```

### WR-03: Inconsistent error handling in file operations

**File:** `packages/cli/src/commands/operations.ts:776`
**Issue:** `fs.stat()` is called with `.catch(() => null)` which silently fails. If stat fails for reasons other than ENOENT (permission denied, I/O error), the error is swallowed and the code assumes it's not a directory.

**Fix:**
```typescript
const stat = await import('node:fs/promises').then((fs) =>
  fs.stat(filePath).catch((err) => {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err; // Re-throw non-ENOENT errors
  })
);
```

### WR-04: Unchecked array access without length validation

**File:** `packages/contracts/src/index.test.ts:250-252`
**Issue:** Test accesses `response.json().events` without first validating that `events` property exists on the response.

**Fix:**
```typescript
const json = response.json();
expect(json.events).toBeDefined();
expect(Array.isArray(json.events)).toBe(true);
expect(json.events.length).toBeGreaterThanOrEqual(2);
```

### WR-05: Magic number without constant

**File:** `packages/server/src/lib/retrieval/orchestrator.ts:47`
**Issue:** `GRAPH_SCORE_BOOST_FACTOR = 0.2` is defined but its derivation and impact are not documented. This is a tuning parameter that affects scoring.

**Fix:** Add documentation:
```typescript
/**
 * Graph score boost factor for graph-assisted retrieval.
 * When a candidate is found via graph relationships, its score is boosted
 * by this fraction of the graph score to account for relationship relevance.
 *
 * Value of 0.2 means: final_score = base_score + (graph_score * 0.2)
 * This prevents graph relationships from overwhelming semantic similarity.
 */
const GRAPH_SCORE_BOOST_FACTOR = 0.2;
```

### WR-06: Missing error handling for malformed YAML

**File:** `packages/cli/src/commands/operations.ts:296-335`
**Issue:** The `parseSkillMetadata` function does naive YAML parsing by splitting on colons. This will fail on multi-line values or values containing colons.

**Fix:** Consider using a proper YAML parser or document the limitations:
```typescript
/**
 * Parses SKILL.md frontmatter to extract metadata.
 *
 * LIMITATIONS:
 * - Does not support multi-line values
 * - Does not support values containing colons
 * - Does not support YAML anchors or aliases
 *
 * For complex frontmatter, consider using a proper YAML parser.
 */
function parseSkillMetadata(content: string): { title: string; labels: string[] } | null {
  // ... existing code
}
```

### WR-07: TODO comment in production code

**File:** `packages/server/src/lib/retrieval/orchestrator.ts:419-432`
**Issue:** Large TODO comment for LLM-based refinement implementation. This should either be implemented or tracked in a task management system.

**Fix:** Either implement the feature or move the TODO to a tracking issue:
```typescript
// Refinement is deferred to future implementation
// See: https://github.com/yourorg/repo/issues/XXX
// The current design returns null to maintain best-effort behavior
```

### WR-08: Inconsistent policy enum values

**File:** `packages/contracts/src/domain/artifacts.ts:35-40, 144`
**Issue:** The four-state policy vocabulary is defined in `scriptActivationPolicySchema` but `skillScriptDescriptorSchema` still uses the old three-state `manual | auto | blocked` enum. This creates inconsistency in the contract.

**Fix:** Either update `skillScriptDescriptorSchema` to use the four-state policy or document why it uses the legacy format:
```typescript
/**
 * Script descriptor using legacy three-state policy for backward compatibility.
 * The four-state policy (scriptActivationPolicySchema) should be used for
 * new implementations. This schema exists for migration compatibility.
 */
export const skillScriptDescriptorSchema = z.object({
  // ...
  defaultPolicy: z.enum(['manual', 'auto', 'blocked']),
});
```

## Info

### IN-01: Duplicate YAML parsing logic

**File:** `packages/cli/src/commands/operations.ts:111-159, 296-335`
**Issue:** Both `parseClaudeSkill` and `parseSkillMetadata` implement similar YAML frontmatter parsing logic. This is code duplication.

**Fix:** Extract to a shared utility function.

### IN-02: Unused optional field

**File:** `packages/server/src/lib/retrieval/orchestrator.ts:354`
**Issue:** The `channels` array is pushed to but the type definition for `channels` is not visible in the provided code. Ensure this field is properly typed and used elsewhere.

**Fix:** Verify that `channels` is properly typed in the `MergedCandidate` type definition.

### IN-03: Inconsistent console.error usage

**File:** `packages/server/src/lib/retrieval/orchestrator.ts:182, 265`
**Issue:** Using `console.error` for logging in production code. Consider using a proper logging framework.

**Fix:**
```typescript
import { logger } from '../logger.js';

// Then use
logger.error(`Failed to get embedding for entry ${entry.id}:`, error);
```

---

_Reviewed: 2025-01-17T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
