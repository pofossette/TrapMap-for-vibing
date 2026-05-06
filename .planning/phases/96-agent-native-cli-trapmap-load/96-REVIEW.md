---
phase: 96-agent-native-cli-trapmap-load
reviewed: 2026-05-06T12:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - packages/cli/src/commands/load.ts
  - packages/cli/src/commands/load.test.ts
  - packages/cli/src/lib/markdown-formatter.ts
  - packages/cli/src/lib/markdown-formatter.test.ts
  - packages/cli/src/index.ts
  - .claude/skills/trapmap-knowledge-workflow/SKILL.md
  - .claude/skills/trapmap-knowledge-workflow/references/retrieval.md
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 96: Code Review Report

**Reviewed:** 2026-05-06T12:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed the `trapmap load` command implementation, its markdown formatter, CLI registration, and accompanying skill documentation. The command wiring in `index.ts` is correct -- `registerLoadCommand` is called with the `allowSearch` visibility flag and the load command appears in `api:list` output. The formatter in `markdown-formatter.ts` handles plan nodes and capsule fallbacks with appropriate markdown escaping and truncation. The `markdown-formatter.test.ts` file provides good unit coverage for the formatter. The skill documentation in `references/retrieval.md` correctly documents the new command and its flags.

Three warnings and two informational findings were identified. No critical issues were found.

## Warnings

### WR-01: `--max-results` CLI option declared but never sent to API

**File:** `packages/cli/src/commands/load.ts:24`
**Issue:** The `--max-results` option is declared on line 24 and parsed into `flags.maxResults` (line 36), but it is never included in the request body (lines 70-76). The `graphPlanSearchQuerySchema` in `@trapmap/contracts` extends `planQuerySchema` with only `fallbackMode` and does not include a `maxResults` field. A user who passes `--max-results 20` will see no effect. For comparison, `retrieval.ts:253` correctly includes `maxResults: Number.parseInt(flags.maxResults, 10)` in its request body. This is either dead CLI surface or a missing server-side feature.

**Fix:** Remove the `--max-results` option from the load command definition, or add a `maxResults` field to the `graphPlanSearchQuerySchema` if the server should support it.

### WR-02: Test mock uses incorrect field name `recallChannels` instead of `channelsUsed`

**File:** `packages/cli/src/commands/load.test.ts:46`
**Issue:** The mock `GraphPlanSearchResponse` in the load test uses `recallChannels: ['semantic']` in its `routingTrace`, but the `graphPlanRoutingTraceSchema` in `@trapmap/contracts` defines the field as `channelsUsed`. The test passes because `formatLoadContext` is mocked to return a fixed string (line 36), so the real formatter never sees this object. TypeScript does not flag this because extra properties on object literals are allowed in structural type checking. This creates a latent type drift: if the mock is later used to test the real formatter, `trace.channelsUsed` would be `undefined` and `formatRoutingTrace` would output `Channels: unknown`.

**Fix:**
```typescript
const mockTrace = {
  selectedMode: 'mix',
  routeFamily: 'graph-plan',
  routingReason: 'graph-plan-selected',
  channelsUsed: ['semantic'],   // was: recallChannels
  fallbackTarget: null,
  confidenceScore: 0.9,
  confidenceBucket: 'high',
};
```

### WR-03: No NaN guard on parsed CLI option values

**File:** `packages/cli/src/commands/load.ts:73-74`
**Issue:** `Number.parseInt()` returns `NaN` when the input is not a valid integer string. Commander does not enforce that `--skill-budget` or `--max-depth` contain valid integers. If a user passes `--skill-budget abc`, the request body will contain `skillBudget: NaN`, which `JSON.stringify` renders as `null`. The server-side Zod parse will reject the request with a confusing validation error rather than a clear CLI error message.

**Fix:** Add validation after parsing:
```typescript
const skillBudget = Number.parseInt(flags.skillBudget, 10);
const maxDepth = Number.parseInt(flags.maxDepth, 10);
if (Number.isNaN(skillBudget) || Number.isNaN(maxDepth)) {
  throw new Error('--skill-budget and --max-depth must be valid integers.');
}

const body = {
  seed: searchSeed,
  filters,
  skillBudget,
  maxDepth,
  fallbackMode: flags.fallback,
};
```

## Info

### IN-01: `formatLoadContext` test mock bypasses real formatter in `load.test.ts`

**File:** `packages/cli/src/commands/load.test.ts:35-37`
**Issue:** The test suite mocks `formatLoadContext` to return a simple string (`formatted: ${response.routingTrace.selectedMode}`). This means the load command tests never exercise the real markdown formatting logic from `markdown-formatter.ts`. The formatter has its own dedicated test file (`markdown-formatter.test.ts`) with good coverage, but the integration path (load command -> formatter -> console output) is untested. This is a test coverage gap, not a bug.

**Fix:** Consider adding one integration-style test that uses the real formatter to verify the end-to-end output shape.

### IN-02: Skill documentation lists `--max-results` as a `load` flag

**File:** `.claude/skills/trapmap-knowledge-workflow/references/retrieval.md:67`
**Issue:** The retrieval reference doc lists `--max-results` among the `load` flags. As noted in WR-01, this flag currently has no effect. If the CLI option is removed, the documentation should also be updated to avoid misleading agents that read the skill docs.

**Fix:** Update the documentation to remove or annotate `--max-results` if the CLI option is removed.

---

_Reviewed: 2026-05-06T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
