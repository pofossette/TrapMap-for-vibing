# Phase 1 Report

## Scope delivered

Implemented the platform-neutral Phase 1 surface without changing suite-specific eval logic:

- Added platform contracts in `packages/contracts/src/domain/evals/platform.ts`
- Exported platform contracts from `packages/contracts/src/domain/evals/index.ts`
- Added platform adapter layer under `evals/lib/platform/`
- Wired aggregate eval entrypoints in `evals/scripts/eval-all.ts` and `scripts/run-eval.ts`
- Kept adapter failures warning-only and non-fatal
- Kept default behavior unchanged when no platform adapter is enabled
- Implemented local `json-archive` adapter writing mirrored event archives under `reports/` by default

## TDD record

### RED

Wrote tests first:

- `packages/contracts/src/domain/evals/platform.test.ts`
- `evals/lib/platform/adapter.test.ts`
- extended `scripts/__tests__/run-eval.test.ts`

Observed intended failures before implementation:

- missing `platform.ts` contracts module
- missing `evals/lib/platform/*` adapter modules
- unknown `--platform` option in `scripts/run-eval.ts`

### GREEN

Implemented the minimal production code needed to pass those tests:

- discriminated platform event schemas and run archive schema
- `EvalPlatformAdapter` interface and safe warning wrappers
- `noop` adapter
- `json-archive` adapter with per-run JSON archive output
- aggregate CLI flag pass-through for `--platform` and `--platform-output-dir`
- aggregate runner publish hooks for `EvalRunStarted` and `EvalRunFinished`

## Validation

### Required brief validations

1. `rtk pnpm --filter @trapmap/contracts test --run packages/contracts/src/domain/evals/platform.test.ts`
   - Not runnable as written for this package layout.
   - Reason: the `@trapmap/contracts` package Vitest config includes `src/**/*.test.ts`, so passing a repo-root path causes "No test files found".
   - Closest validation run instead:
   - `rtk pnpm test:file -- packages/contracts/src/domain/evals/platform.test.ts`
   - Result: pass

2. `rtk pnpm test:file -- evals/scripts/__tests__/eval-ci.test.ts`
   - Result: pass

3. `rtk pnpm eval -- agent-planning --tier smoke --dry-run`
   - Result: pass

4. `rtk pnpm typecheck`
   - Result: pass

### Additional targeted validation

- `rtk pnpm test:file -- evals/lib/platform/adapter.test.ts`
  - pass
- `rtk pnpm test:file -- scripts/__tests__/run-eval.test.ts`
  - pass
- `rtk pnpm eval -- all --tier smoke --dry-run --platform json-archive --platform-output-dir /tmp/trapmap-phase1-platform-events`
  - pass
  - confirmed archive files were emitted

## Behavior notes

- Platform adapter support is aggregate-only in Phase 1 wiring (`smoke`, `core`, `all` routes through `eval-all.ts`)
- No adapter enabled means no extra platform I/O and no change to existing eval exit behavior
- Adapter publish/close failures are downgraded to `console.warn(...)`

## Files changed

- `packages/contracts/src/domain/evals/platform.ts`
- `packages/contracts/src/domain/evals/platform.test.ts`
- `packages/contracts/src/domain/evals/index.ts`
- `evals/lib/platform/types.ts`
- `evals/lib/platform/adapter.ts`
- `evals/lib/platform/noop-adapter.ts`
- `evals/lib/platform/json-archive-adapter.ts`
- `evals/lib/platform/adapter.test.ts`
- `evals/scripts/eval-all.ts`
- `scripts/run-eval.ts`
- `scripts/__tests__/run-eval.test.ts`

## Review note

The `requesting-code-review` skill recommends subagent review before merge. No code-review subagent tool is exposed in this session, so I performed a manual diff review and tightened one follow-up issue: `eval-all.ts` now explicitly rejects invalid `--platform` values instead of silently ignoring them.

## Commit

Commit created after staging only the Phase 1 files listed above.
