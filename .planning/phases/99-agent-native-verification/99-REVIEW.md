---
phase: 99-agent-native-verification
reviewed: 2026-05-06T00:00:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - packages/cli/src/lib/markdown-formatter.test.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 99: Code Review Report

**Reviewed:** 2026-05-06T00:00:00Z
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

Reviewed the test file `packages/cli/src/lib/markdown-formatter.test.ts` against the implementation at `packages/cli/src/lib/markdown-formatter.ts` and the contract types from `@trapmap/contracts`. The test file provides good coverage of the main formatting paths (traps, skills, routing trace, capsule fallback, truncation limits) but has gaps in escape character coverage and contract fidelity in mock data. No critical (blocker) issues found. Three warnings and three informational findings identified.

## Warnings

### WR-01: Missing test coverage for backslash and underscore escaping in `escapeMarkdown`

**File:** `packages/cli/src/lib/markdown-formatter.test.ts:5-21`
**Issue:** The `escapeMarkdown` function in the implementation (lines 28-35 of `markdown-formatter.ts`) escapes five character types: backslashes (`\`), backticks, asterisks, underscores, and square brackets. The test only covers backticks, asterisks, and brackets. Backslash escaping (`\` -> `\\`) and underscore escaping (`_` -> `\_`) are untested. Since this function is a security-critical markdown injection prevention layer (it sanitizes knowledge content from the retrieval pipeline), incomplete escape coverage means a regression in these two transformations would go undetected.
**Fix:** Add two test cases to the `escapeMarkdown` describe block:
```typescript
it('escapes backslashes', () => {
  expect(escapeMarkdown('path\\to\\file')).toBe('path\\\\to\\\\file');
});

it('escapes underscores', () => {
  expect(escapeMarkdown('snake_case_var')).toBe('snake\\_case\\_var');
});
```

### WR-02: Test mocks omit required contract fields on `activationRefs` sub-objects

**File:** `packages/cli/src/lib/markdown-formatter.test.ts:98, 207-209, 354-355`
**Issue:** Multiple mock objects are missing required fields from `@trapmap/contracts` schemas:

- **References missing `mediaType`** (required by `clientManifestReferenceSchema`, no default): lines 98, 207
- **Assets missing `mediaType`** (required by `clientManifestAssetSchema`, no default): lines 208, 354-355
- **Script missing `sha256` and `capability`** (required by `clientManifestScriptSchema`, no default): line 209

Test files are excluded from TypeScript type checking via `packages/cli/tsconfig.json` (`"exclude": ["src/**/*.test.ts"]`), so these incomplete type representations will never be caught by `tsc`. This means contract evolution (e.g., adding a new required field that the formatter starts using) could silently break test validity without compile-time feedback.
**Fix:** Add the missing fields to all mock objects. For example:
```typescript
// References (lines 98, 207)
references: [{ path: 'ref/guide.md', sha256: 'abc', sizeBytes: 100, mediaType: 'text/markdown' }],

// Assets (lines 208, 354-355)
assets: [{ path: 'assets/config.json', sha256: 'def456', sizeBytes: 500, mediaType: 'application/json' }],

// Scripts (line 209)
scripts: [{ path: 'scripts/deploy.sh', sha256: 'ghi789', capability: 'Deploy service', defaultPolicy: 'allow-with-approval' }],
```

### WR-03: Test name "respects maxSkills option for capsule fallback" is semantically misleading

**File:** `packages/cli/src/lib/markdown-formatter.test.ts:306`
**Issue:** The test at line 306 is named "respects maxSkills option for capsule fallback" but it validates capsule count truncation, not skill truncation. The formatter implementation reuses the `maxSkills` option to limit capsules in the fallback path (line 180 of `markdown-formatter.ts`), which conflates two different domain concepts. The test name documents this conflation rather than flagging it. If someone later adds a separate `maxCapsules` option, this test name would be confusing. More importantly, the test name does not communicate what is actually being validated.
**Fix:** At minimum, rename the test to clarify intent:
```typescript
it('uses maxSkills as capsule limit in fallback path', () => {
```
Ideally, the formatter should also support a separate `maxCapsules` option to decouple the two limits.

## Info

### IN-01: No test coverage for entry fallback rendering path

**File:** `packages/cli/src/lib/markdown-formatter.test.ts`
**Issue:** The implementation's `formatLoadContext` has an `else` branch (line 176 of `markdown-formatter.ts`) that renders `### Entries (from fallback)` with a "not implemented yet" message for the `routeFamily: 'entry'` fallback path. This path is not exercised by any test. While the path is currently a placeholder, having no test means a future implementation could silently change the output format.
**Fix:** Add a test for the entry fallback path:
```typescript
it('renders not-implemented message for entry fallback', () => {
  const response: GraphPlanSearchResponse = {
    routingTrace: mockTrace,
    plan: null,
    fallback: { routeFamily: 'entry', response: { /* minimal entry fallback data */ } },
  };
  const result = formatLoadContext(response);
  expect(result).toContain('### Entries (from fallback)');
  expect(result).toContain('not implemented yet');
});
```

### IN-02: No tests for markdown comment marker pairing and uniqueness

**File:** `packages/cli/src/lib/markdown-formatter.test.ts`
**Issue:** Several tests check for `<!-- trapmap-load-context -->` via `toContain`, but only one test (line 56) also checks for the closing marker `<!-- /trapmap-load-context -->`. No test verifies that the markers appear exactly once or in the correct order. If the implementation were to emit duplicate or unclosed comment blocks, the existing tests would not catch it.
**Fix:** Add a reusable helper assertion to key tests:
```typescript
function assertCommentPairing(result: string) {
  const openCount = (result.match(/<!-- trapmap-load-context -->/g) || []).length;
  const closeCount = (result.match(/<!-- \/trapmap-load-context -->/g) || []).length;
  expect(openCount).toBe(1);
  expect(closeCount).toBe(1);
  expect(result.indexOf('<!-- trapmap-load-context -->')).toBeLessThan(
    result.indexOf('<!-- /trapmap-load-context -->')
  );
}
```

### IN-03: Optional contract fields (`errorText`, `conflicts`) on capsule matches are untested

**File:** `packages/cli/src/lib/markdown-formatter.test.ts`
**Issue:** The `capsuleMatchSchema` in contracts includes optional fields `errorText` (string, max 500) and `conflicts` (array of conflict hints). The capsule fallback test mocks do not include these fields. While the current formatter implementation does not render these fields, having test coverage for their presence would provide a regression signal if they are rendered in the future.
**Fix:** No immediate action needed unless the formatter is extended to render error text or conflict hints.

---

_Reviewed: 2026-05-06T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
