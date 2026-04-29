---
phase: 25-evaluation-contracts-and-golden-dataset-foundation
reviewed: 2026-04-21T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - evals/README.md
  - evals/retrieval/core.ts
  - evals/retrieval/datasets/core/v1-retrieval-core.ts
  - evals/retrieval/datasets/core/v2-retrieval-core.ts
  - evals/retrieval/datasets/retrieval-datasets.test.ts
  - evals/retrieval/datasets/smoke/v1-retrieval-smoke.ts
  - evals/retrieval/datasets/smoke/v2-retrieval-smoke.ts
  - evals/retrieval/README.md
  - evals/retrieval/run.ts
  - evals/retrieval/scenarios/core/retrieval-core-scenarios.ts
  - evals/retrieval/scenarios/smoke/retrieval-smoke-scenarios.ts
  - evals/retrieval/smoke.ts
  - packages/contracts/src/domain/evals/retrieval.ts
  - packages/contracts/src/index.test.ts
  - packages/contracts/src/index.ts
  - vitest.config.ts
findings:
  critical: 0
  warning: 0
  info: 4
  total: 4
status: clean
---

# Phase 25: Code Review Report

**Reviewed:** 2026-04-21T00:00:00Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** clean

## Summary

Phase 25 introduces evaluation contracts (`@trapmap/contracts`) and golden datasets for retrieval evaluation. All 16 files were read and analyzed at standard depth. No critical or warning-level issues were found. The implementation is well-structured with clear separation between governance and relevance concerns, explicit endpoint targeting, and comprehensive dataset coverage across both v1 and v2 endpoints and both smoke and core tiers.

Four informational items were identified for future consideration.

## Critical Issues

None.

## Warnings

None.

## Info

### IN-01: Misleading test name -- "no orphan scenarios exist" does not detect orphans

**File:** `evals/retrieval/datasets/retrieval-datasets.test.ts:237-245`
**Issue:** The test named "no orphan scenarios exist" only verifies that all *used* scenario IDs appear in the declared scenarios map. It does not check for *declared-but-unused* scenarios, which would be the actual orphans. The test name implies detection of unused declared scenarios, but the implementation checks the inverse (that used scenarios are declared).
**Fix:** Either rename to "all used scenarios are declared" for accuracy, or add a reverse check that no declared scenario goes unused:
```typescript
it('no orphan scenarios exist', () => {
  const usedScenarioIds = new Set(allCases.map((c) => c.scenarioId));
  const declaredScenarioIds = new Set(Object.keys(allScenariosMap));

  // Check for declared but unused (true orphans)
  const orphans = [...declaredScenarioIds].filter(id => !usedScenarioIds.has(id));
  expect(orphans).toEqual([]);
});
```

### IN-02: Fixture schemas use `z.unknown()` -- no type safety for fixture content

**File:** `packages/contracts/src/domain/evals/retrieval.ts:85-88`
**Issue:** The `fixtures` schema uses `z.array(z.unknown())` for both `knowledgeEntries` and `skillArtifacts`. While this provides runtime flexibility, it offers no compile-time type checking for fixture content. Scenario files include rich fixture objects with many properties (`id`, `teamId`, `scope`, `labels`, `shortcut`, `detail`, `requiredLevel`, `lifecycleState`, etc.) that pass through as `unknown`.
**Fix:** Consider defining typed fixture schemas in a future phase:
```typescript
knowledgeEntries: z.array(knowledgeEntryFixtureSchema).default([]),
skillArtifacts: z.array(skillArtifactFixtureSchema).default([]),
```

### IN-03: Inconsistent import paths across evals workspace

**File:** `evals/retrieval/datasets/smoke/v1-retrieval-smoke.ts:15`, `evals/retrieval/datasets/smoke/v2-retrieval-smoke.ts:15`, `evals/retrieval/datasets/core/v1-retrieval-core.ts:13`, `evals/retrieval/datasets/core/v2-retrieval-core.ts:13`, `evals/retrieval/scenarios/smoke/retrieval-smoke-scenarios.ts:19`, `evals/retrieval/scenarios/core/retrieval-core-scenarios.ts:20`, `evals/retrieval/smoke.ts:13`, `evals/retrieval/core.ts:13`, `evals/retrieval/run.ts:18`
**Issue:** Source files use deep relative imports (`../../../../packages/contracts/src/index.js`) while the test file uses the configured alias (`@trapmap/contracts`). The vitest config maps `@trapmap/contracts` for the evals project. The relative paths work but are fragile under directory restructuring and inconsistent with the README documentation which shows the alias form.
**Fix:** Migrate source file imports to use the `@trapmap/contracts` alias:
```typescript
import { retrievalEvalCaseSchema, type RetrievalEvalCase } from '@trapmap/contracts';
```

### IN-04: Closed governance reasons enum may require schema changes for extension

**File:** `packages/contracts/src/domain/evals/retrieval.ts:151-153`
**Issue:** `forbiddenReasons` uses a closed enum `z.enum(['cross-team', 'security-level', 'lifecycle'])`. If new governance dimensions emerge, this requires a schema change. This is a design trade-off: the closed enum provides strong type safety but limits extensibility.
**Fix:** This is acceptable for Phase 25. If the governance model grows, consider migrating to a branded string type or a union of a closed enum plus an extension mechanism.

---

_Reviewed: 2026-04-21T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
