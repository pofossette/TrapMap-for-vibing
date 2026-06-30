# Label Alignment Eval Scaffold Report

## Scope

- Implemented first usable scaffold under `packages/contracts/src/domain/evals/label-alignment.ts`
- Implemented standalone eval suite under `evals/label-alignment/`
- Kept shared entrypoints untouched after detecting the brief/write-boundary conflict around local barrel exports

## What Was Added

### Contracts

- `packages/contracts/src/domain/evals/label-alignment.ts`
- `packages/contracts/src/domain/evals/label-alignment.test.ts`

Added schemas and types for:

- eval case
- eval fixture
- eval report
- golden annotations
- expected alignment groups
- recall-reason distribution

Covered required fields:

- `skillId`
- `variantId`
- `variantGroupId`
- `tier`
- `synonymGroupCount`
- `totalRawLabels`
- `totalCanonicalLabels`
- `catalogSeed`
- `embeddingEnabled`
- `goldenAnnotations`
- `expectedAlignment`
- `tags`

### Eval Suite

Added:

- `evals/label-alignment/README.md`
- `evals/label-alignment/run.ts`
- `evals/label-alignment/smoke.ts`
- `evals/label-alignment/core.ts`
- `evals/label-alignment/core.test.ts`
- `evals/label-alignment/fixtures/smoke.ts`
- `evals/label-alignment/lib/catalog-seed.ts`
- `evals/label-alignment/lib/recall-eval.ts`
- `evals/label-alignment/lib/decision-eval.ts`
- `evals/label-alignment/lib/metrics.ts`
- `evals/label-alignment/lib/report.ts`
- `evals/label-alignment/lib/format.ts`

Behavior delivered:

- validated smoke fixture loading
- deterministic dry-run execution
- live-mode scaffold with real `alignLabel` / repository / chat-provider interfaces when provided
- dry-run fallback when live interfaces are unavailable
- structured metrics for:
  - synonym elimination count/rate
  - missed merges
  - false merges
  - alignment accuracy
  - recall-reason distribution

## Fixture Coverage

Smoke fixtures currently include:

- `skill/react-hooks-trap`
- `skill/api-pagination-trap`

Coverage guarantees satisfied:

- every fixture has `skillId`
- each case has at least 3 raw labels
- synonym groups include 2+ members
- both `catalog-populated` and `catalog-empty` variants exist
- at least one variant enables embedding
- includes a near-match `should not merge` case

## TDD Evidence

### RED

1. Contracts RED:

```bash
rtk pnpm test:file -- packages/contracts/src/domain/evals/label-alignment.test.ts
```

Observed failure:

- `Cannot read properties of undefined (reading 'parse')`

Cause:

- new label-alignment eval schemas did not exist yet

2. Eval scaffold RED:

```bash
rtk pnpm test:file -- evals/label-alignment/core.test.ts
```

Observed failure:

- `Cannot find module './core.js'`

Cause:

- eval suite entrypoint did not exist yet

### GREEN

Focused tests after implementation:

```bash
rtk pnpm test:file -- packages/contracts/src/domain/evals/label-alignment.test.ts
rtk pnpm test:file -- evals/label-alignment/core.test.ts
```

Final result:

- contracts: `3 passed`
- eval scaffold: `2 passed`

## Notes On Design

- Dry-run intentionally uses deterministic grouping from golden annotations and seed shape so smoke runs do not depend on provider or database availability.
- Live mode is scaffolded, not wired into shared eval orchestration yet. It accepts real interfaces and falls back to dry-run semantics when interfaces are absent.
- I initially added a shared barrel export update because the brief asked for local barrel exports. That conflicted with the explicit write boundary and “do not modify shared entrypoints”. I reverted that change and kept eval imports local to stay compliant.

## Validation Run Summary

- `rtk pnpm test:file -- packages/contracts/src/domain/evals/label-alignment.test.ts`
- `rtk pnpm test:file -- evals/label-alignment/core.test.ts`

Both passed on the final run.

## Commit

Commit created after tests passed:

- `feat: add label alignment eval scaffold`

## Concerns

- The brief asked to update local barrel exports, but the user instruction prohibited modifying shared entrypoints. I chose boundary compliance and left shared wiring for the controller thread.
- The live path is interface-ready but not end-to-end exercised in focused tests because wiring real repository/provider setup is outside the allowed scope and not required for smoke dry-run success.
