# Agent Planning Eval Scaffold Report

## Status

DONE_WITH_CONCERNS

## Scope

Implemented the first usable `agent-planning` eval scaffold within:

- `packages/contracts/src/domain/evals/`
- `evals/agent-planning/`

Shared entrypoints were intentionally not modified per brief.

## What Changed

### Contracts

Added standalone agent-planning contracts in `packages/contracts/src/domain/evals/agent-planning.ts`:

- case schema
- scenario schema
- report schema
- deterministic precheck schema
- judge result schema
- group/slice summary schemas

Updated local barrel export in `packages/contracts/src/domain/evals/index.ts`.

Added focused contract tests in `packages/contracts/src/domain/evals/agent-planning.test.ts`.

### Eval Scaffold

Created `evals/agent-planning/` scaffold with:

- `README.md`
- `run.ts`
- `smoke.ts`
- `core.ts`
- `datasets/`
- `scenarios/`
- `lib/`

Implemented:

- validated smoke fixture loading
- deterministic dry-run actor path with fallback provider mode
- deterministic precheck for:
  - missing required steps
  - missing key actions
  - forbidden action hits
  - empty output
  - unparseable output
- structured fallback judge result
- case/group/slice report aggregation for:
  - task/group comparison
  - `taskType`
  - `taskComplexity`
  - `contextSetKind`
  - `interferenceLevel`

Added smoke data with:

- 2 task IDs
- paired `skill-set` and `plan-graph-set` variants
- one additional high-interference variant
- interference sources reusing existing repo fixtures

Added focused runner test in `evals/agent-planning/runner.test.ts`.

## TDD Evidence

### RED

1. Contracts test before implementation:

```bash
rtk pnpm test:file -- packages/contracts/src/domain/evals/agent-planning.test.ts
```

Result:

- failed 2/2 tests
- failure: `expected null not to be null`
- cause: `./agent-planning.js` did not exist yet

2. Runner test before implementation:

```bash
rtk pnpm test:file -- evals/agent-planning/runner.test.ts
```

Result:

- failed 2/2 tests
- failure: `expected null not to be null`
- cause: `./smoke.js`, `./run.js`, and `./lib/scoring.js` did not exist yet

### GREEN

1. Contracts focused test:

```bash
rtk pnpm test:file -- packages/contracts/src/domain/evals/agent-planning.test.ts
```

Result:

- passed 2/2 tests

2. Runner focused test:

```bash
rtk pnpm test:file -- evals/agent-planning/runner.test.ts
```

Result:

- passed 2/2 tests

## Validation Summary

- contracts schema validation: green
- smoke load and dry-run execution: green
- deterministic precheck behavior: green
- report aggregation basics: green

## Parallel-Change Handling

Observed concurrent work in the same local barrel:

- `packages/contracts/src/domain/evals/index.ts` already contained another in-flight export for `label-alignment`

I did not revert that parallel change. Commit staging should preserve current worktree state and only include this task’s intended addition where possible.

## Concerns

1. `core` tier is scaffolded but intentionally empty in this first pass.
2. Live provider execution remains interface-compatible but still falls back to deterministic behavior when no provider wiring is present.
3. Shared entrypoints and root scripts are intentionally not wired here because the brief explicitly reserved that integration for the controller.
