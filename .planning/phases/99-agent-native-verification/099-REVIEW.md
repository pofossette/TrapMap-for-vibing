---
phase: 99-agent-native-verification
reviewed: 2026-05-07T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - packages/cli/src/lib/markdown-formatter.test.ts
  - packages/skills/trapmap-knowledge-workflow/references/retrieval.md
findings:
  critical: 0
  warning: 0
  info: 4
  total: 4
status: issues_found
---

# Phase 99: Code Review Report

**Reviewed:** 2026-05-07T00:00:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Reviewed one test file (`markdown-formatter.test.ts`) and one documentation reference (`retrieval.md`). The production formatter implementation (`markdown-formatter.ts`) was cross-referenced to validate test correctness against contract types. The formatter code itself is well-structured with consistent escaping and defensive null handling. The primary findings are contract drift in test mock data (test files are excluded from TypeScript compilation per `packages/cli/tsconfig.json`) and one minor escaping inconsistency in the capsule fallback formatter.

## Info

### IN-01: Test mock trace uses invalid enum values for contract types

**File:** `packages/cli/src/lib/markdown-formatter.test.ts:38-40`
**Issue:** The `mockTrace` object uses `selectedMode: 'graph-assisted'` which is not a valid `RetrievalStrategy` value (valid: `naive|local|global|hybrid|mix|auto`), and `routingReason: 'test'` which is not a valid `RoutingReason` value (12 valid codes defined in `routingReasonSchema`). These are stale values from before the Phase 29 strategy unification. The test file is excluded from TypeScript compilation (`"exclude": ["src/**/*.test.ts"]` in `packages/cli/tsconfig.json`), so the type violations pass silently. The tests still verify formatter output correctly because the formatter renders enum values as raw strings.
**Fix:** Update the mock to use valid enum values:
```typescript
const mockTrace = {
  selectedMode: 'mix' as const,
  routeFamily: 'capsule' as const,
  routingReason: 'graph-plan-selected' as const,
  channelsUsed: ['semantic', 'keyword'],
  fallbackTarget: null,
  confidenceScore: 0.85,
  confidenceBucket: 'high' as const,
};
```
Update the corresponding assertion at line 164 from `'Mode: graph-assisted'` to `'Mode: mix'`.

### IN-02: Script mock missing required schema fields and uses invalid policy value

**File:** `packages/cli/src/lib/markdown-formatter.test.ts:209`
**Issue:** The script object `{ path: 'scripts/deploy.sh', defaultPolicy: 'allow-with-approval' }` is missing required fields `sha256` (64-char hex string) and `capability` (1-280 char string) per `clientManifestScriptSchema`. Additionally, `'allow-with-approval'` is not a valid `compatibleScriptActivationPolicySchema` value (valid: `blocked|reference-only|needs-approval|client-executable|manual|auto`). The formatter only reads `path` and `defaultPolicy`, so tests pass at runtime, but the mock does not represent valid contract data.
**Fix:**
```typescript
scripts: [{
  path: 'scripts/deploy.sh',
  sha256: 'a'.repeat(64),
  capability: 'Deploys the application',
  defaultPolicy: 'needs-approval',
}],
```
Update the assertion at line 226 from `'allow-with-approval'` to `'needs-approval'`.

### IN-03: Graph plan mocks omit `citations` field from `graphPlanSchema`

**File:** `packages/cli/src/lib/markdown-formatter.test.ts:77,107,147,187,219,274,367`
**Issue:** All `graph` objects in plan mocks (7 occurrences) include `nodes`, `edges`, and `focus` but omit `citations` which is defined in `graphPlanSchema`. Zod's `.default([])` fills this at parse time, so runtime behavior is unaffected, but the TypeScript object literal does not match the schema shape. This is invisible because test files are excluded from `tsc`.
**Fix:** Add `citations: []` to each `graph` object, e.g.:
```typescript
graph: { nodes: [], edges: [], citations: [], focus: { blockingTrapNodeIds: [], recommendedSkillNodeIds: [] } },
```

### IN-04: Capsule labels not escaped with `escapeMarkdown` in fallback formatter

**File:** `packages/cli/src/lib/markdown-formatter.ts:144`
**Issue:** `formatCapsuleFallback` outputs `cap.labels.join(', ')` without applying `escapeMarkdown()`. All other user-facing strings in the formatter (trap labels, skill labels, evidence, situation, problem, goal, capsuleId) are properly escaped. If capsule labels contain markdown special characters (`` ` ``, `*`, `_`, `[`, `]`), they could inject unintended markdown formatting into the output.
**Fix:**
```typescript
`   - Labels: ${cap.labels.map(l => escapeMarkdown(l)).join(', ')}`,
```

---

_Reviewed: 2026-05-07T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
