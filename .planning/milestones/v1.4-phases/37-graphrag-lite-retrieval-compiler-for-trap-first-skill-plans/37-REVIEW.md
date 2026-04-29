---
phase: 37-graphrag-lite-retrieval-compiler-for-trap-first-skill-plans
reviewed: 2026-04-25T12:00:00Z
depth: quick
files_reviewed: 7
files_reviewed_list:
  - packages/contracts/src/domain/plans.ts
  - packages/contracts/src/domain/plans.test.ts
  - packages/contracts/src/index.ts
  - packages/server/src/lib/retrieval/plan-compiler.ts
  - packages/server/src/lib/retrieval/plan-compiler.test.ts
  - packages/server/src/routes/retrieval.ts
  - packages/server/src/lib/user-ops-log.ts
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 37: Code Review Report

**Reviewed:** 2026-04-25T12:00:00Z
**Depth:** quick
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed 7 files comprising the Phase 37 GraphRAG-lite plan compiler: contract schemas (Zod), the compiler implementation, route wiring, tests, and the user-ops log module. Quick-depth grep scans found no hardcoded secrets, dangerous function calls, debug artifacts, or empty catch blocks.

One warning and two info items were identified during full-file reads. The codebase is well-structured with thorough Zod validation, proper governance filtering (belt-and-suspenders pattern), and comprehensive test coverage including edge cases for governance, budgets, and depth bounding.

## Warnings

### WR-01: Untyped `as` assertions on graph edge attributes bypass type safety

**File:** `packages/server/src/lib/retrieval/plan-compiler.ts:432-433`
**Issue:** `buildPlanEdges` casts `attributes.relationType` and `attributes.strength` to PlanEdge union types via `as` without runtime validation. If the graphology graph ever contains an unexpected `relationType` value (e.g., `'co-occurs-with'`), the resulting plan edge would violate the Zod `planEdgeTypeSchema` contract and only fail later at the route-level `trapFirstPlanSchema.parse()` call, making the error source harder to trace.
**Fix:** Validate the values before pushing into the edges array, or use the existing `planEdgeTypeSchema` / `planEdgeStrengthSchema` to parse them:

```typescript
import { planEdgeTypeSchema, planEdgeStrengthSchema } from '@trapmap/contracts';

// Inside buildPlanEdges, before edges.push:
const parsedType = planEdgeTypeSchema.safeParse(attributes.relationType);
const parsedStrength = planEdgeStrengthSchema.safeParse(attributes.strength);
if (!parsedType.success || !parsedStrength.success) return;
```

## Info

### IN-01: `console.error` in production logging path

**File:** `packages/server/src/lib/user-ops-log.ts:95`
**Issue:** `console.error` is used as the error handler when log writing fails. This is acceptable for a fire-and-forget logging utility but could be noisy in production if the log directory becomes unwritable.
**Fix:** Consider using a structured error reporter or rate-limiting the error output if this becomes noisy in production.

### IN-02: Unused local constants `DEFAULT_SKILL_BUDGET` and `DEFAULT_MAX_DEPTH`

**File:** `packages/server/src/lib/retrieval/plan-compiler.ts:33-34`
**Issue:** Both constants are declared but never read. The `PlanQuery` schema already applies defaults (`.default(3)` and `.default(2)`), so the nullish coalescing on lines 103 and 125 (`?? DEFAULT_MAX_DEPTH`, `?? DEFAULT_SKILL_BUDGET`) is dead code -- the values will never be null/undefined after Zod parsing.
**Fix:** Remove the two unused constants and the redundant `??` fallbacks, or keep only if there is a future plan to call `compileTrapFirstPlan` with unvalidated input.

---

_Reviewed: 2026-04-25T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
